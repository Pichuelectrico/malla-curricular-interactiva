"""
USFQ Course Offer Scraper  –  local runner
==========================================
Uses **Selenium + Chrome persistent profile** so Microsoft SSO sessions survive ~30 h.

Usage
-----
  # First run / session expired: open a visible browser and log in manually
  python scrape.py login

  # Every subsequent run while session is alive (headless)
  python scrape.py scrape

  # Explicit period
  python scrape.py scrape --period-code 202610 --period "Primer Semestre 2026/2027"

  # Backfill historical periods into course_offer_history only
  python scrape.py backfill --only 202510,202420

  # Rollover to a new period (dry-run, then --yes to execute)
  python scrape.py rollover --period-code 202520 --period "Segundo Semestre 2025/2026" --yes

  # List available period codes from catalog
  python scrape.py list-periods

Environment variables (see .env.example)
-----------------------------------------
  SUPABASE_URL        – Supabase project URL
  SUPABASE_KEY        – anon or service-role key
  PERIOD              – Human-readable label  (default: "Primer Semestre 2026/2027")
  PERIOD_CODE         – Numeric code          (default: 202610)

  # Only needed when using --auto-login (auto-fills credentials)
  USFQ_USERNAME       – USFQ student email
  USFQ_PASSWORD       – USFQ portal password

Notes
-----
- The browser profile lives in offer-scraper/.browser_profile/ (gitignored).
- Credentials are NEVER sent to Supabase or any server. They stay on your machine.
- No Edge Function / on-demand refresh: students read from the Supabase table
  which you update locally whenever you run this script.
"""

import argparse
import json
import logging
import os
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Optional

import requests
from dotenv import load_dotenv

from browser import BrowserSession

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("offer-scraper")

# Columns that exist in the course_offer table
DB_FIELDS = [
    "nrc", "course_code", "title", "type", "group_letters", "paralelo",
    "days", "start_time", "end_time", "teacher", "credits", "college",
    "available", "total", "period", "period_code", "last_updated",
]

HISTORY_FIELDS = [f for f in DB_FIELDS if f != "last_updated"] + ["scraped_at"]


def _supa_key() -> str:
    return os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY", "")


def _usfq_creds() -> tuple[str, str]:
    return os.environ.get("USFQ_USERNAME", ""), os.environ.get("USFQ_PASSWORD", "")


@dataclass
class CourseRow:
    nrc: str
    course_code: str
    title: str
    type: str
    group_letters: list
    paralelo: Optional[str]
    days: list
    start_time: Optional[str]
    end_time: Optional[str]
    teacher: Optional[str]
    credits: Optional[int]
    college: Optional[str]
    available: Optional[int]
    total: Optional[int]
    period: str
    period_code: str = ""


# ─── browser (Selenium) ─────────────────────────────────────────────────────

def cmd_login(args) -> None:
    username, password = _usfq_creds()
    session = BrowserSession(headed=True)
    try:
        session.cmd_login(username, password)
    finally:
        session.close()


def _supabase_headers(supa_key: str, *, upsert: bool = False, on_conflict: str = "") -> dict:
    prefer = "return=minimal"
    if upsert:
        prefer = f"resolution=merge-duplicates,{prefer}"
    headers = {
        "apikey":        supa_key,
        "Authorization": f"Bearer {supa_key}",
        "Content-Type":  "application/json",
        "Prefer":        prefer,
    }
    return headers


def _course_records(
    courses: list[CourseRow],
    *,
    include_last_updated: bool = False,
    scraped_at: Optional[str] = None,
) -> list[dict]:
    now_iso = datetime.now(timezone.utc).isoformat()
    records = []
    for c in courses:
        d = asdict(c)
        if include_last_updated:
            d["last_updated"] = now_iso
        if scraped_at:
            d["scraped_at"] = scraped_at
        fields = DB_FIELDS if include_last_updated else HISTORY_FIELDS
        records.append({k: d.get(k) for k in fields if k in d or k == "scraped_at"})
    return records


def _batch_post(
    url: str,
    records: list[dict],
    headers: dict,
    *,
    on_conflict: str = "",
) -> tuple[int, int]:
    batch_size = 100
    upserted = 0
    errors = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        post_url = url
        if on_conflict:
            post_url = f"{url}?on_conflict={on_conflict}"
        resp = requests.post(post_url, headers=headers, json=batch, timeout=30)
        if resp.status_code in (200, 201, 204):
            upserted += len(batch)
        else:
            errors += 1
            log.error("  Batch %d failed: %s %s", i // batch_size + 1,
                      resp.status_code, resp.text[:200])
            if errors > 3:
                break
    return upserted, errors


# ─── Supabase upload via REST API (no SDK needed) ────────────────────────────

def upload_to_supabase(
    courses: list[CourseRow],
    supa_url: str,
    supa_key: str,
) -> None:
    if not courses:
        log.warning("No courses to upload.")
        return

    headers = _supabase_headers(supa_key, upsert=True)
    records = _course_records(courses, include_last_updated=True)
    total_upserted, _ = _batch_post(
        f"{supa_url}/rest/v1/course_offer", records, headers,
    )
    log.info("Upload complete: %d / %d courses.", total_upserted, len(records))


def delete_history_period(supa_url: str, supa_key: str, period_code: str) -> None:
    headers = _supabase_headers(supa_key)
    resp = requests.delete(
        f"{supa_url}/rest/v1/course_offer_history?period_code=eq.{period_code}",
        headers=headers,
        timeout=60,
    )
    if resp.status_code not in (200, 204):
        log.warning("delete history %s: %s %s", period_code, resp.status_code, resp.text[:200])
    else:
        log.info("Cleared history rows for period %s.", period_code)


def upload_to_history(
    courses: list[CourseRow],
    supa_url: str,
    supa_key: str,
) -> None:
    """Replace scraped rows for a period in course_offer_history."""
    if not courses:
        return

    period_code = courses[0].period_code
    if period_code:
        delete_history_period(supa_url, supa_key, period_code)

    now_iso = datetime.now(timezone.utc).isoformat()
    headers = _supabase_headers(supa_key)
    records = _course_records(courses, scraped_at=now_iso)
    upserted, _ = _batch_post(
        f"{supa_url}/rest/v1/course_offer_history",
        records,
        headers,
    )
    log.info("History insert: %d / %d rows.", upserted, len(records))


def archive_to_history(
    courses: list[CourseRow],
    supa_url: str,
    supa_key: str,
) -> None:
    """Legacy: insert scraped rows into history (prefer upload_to_history)."""
    upload_to_history(courses, supa_url, supa_key)


def fetch_offer_metadata(supa_url: str, supa_key: str) -> dict:
    headers = _supabase_headers(supa_key)
    resp = requests.get(
        f"{supa_url}/rest/v1/offer_metadata?id=eq.1",
        headers=headers,
        timeout=15,
    )
    if resp.status_code != 200:
        return {}
    rows = resp.json()
    return rows[0] if rows else {}


def update_offer_metadata(
    supa_url: str,
    supa_key: str,
    *,
    period_code: str,
    period_label: str,
    last_scraped_at: Optional[str] = None,
    last_rollover_at: Optional[str] = None,
) -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "id":                   1,
        "current_period_code":  period_code,
        "current_period_label": period_label,
        "last_scraped_at":      last_scraped_at or now_iso,
        "updated_at":           now_iso,
    }
    if last_rollover_at:
        payload["last_rollover_at"] = last_rollover_at

    headers = _supabase_headers(supa_key, upsert=True)
    resp = requests.post(
        f"{supa_url}/rest/v1/offer_metadata?on_conflict=id",
        headers=headers,
        json=payload,
        timeout=15,
    )
    if resp.status_code not in (200, 201, 204):
        log.warning("Failed to update offer_metadata: %s %s",
                    resp.status_code, resp.text[:200])


def fetch_current_offer(supa_url: str, supa_key: str) -> list[dict]:
    headers = _supabase_headers(supa_key)
    resp = requests.get(
        f"{supa_url}/rest/v1/course_offer?select=*",
        headers=headers,
        timeout=60,
    )
    if resp.status_code != 200:
        log.error("Failed to fetch course_offer: %s", resp.text[:200])
        return []
    return resp.json()


def archive_current_offer_to_history(supa_url: str, supa_key: str) -> int:
    """Copy current course_offer snapshot into course_offer_history."""
    rows = fetch_current_offer(supa_url, supa_key)
    if not rows:
        log.info("course_offer is empty — nothing to archive.")
        return 0

    now_iso = datetime.now(timezone.utc).isoformat()
    headers = _supabase_headers(supa_key)
    history_rows = []
    for r in rows:
        history_rows.append({
            "nrc":            r.get("nrc"),
            "course_code":    r.get("course_code"),
            "title":          r.get("title"),
            "type":           r.get("type"),
            "group_letters":  r.get("group_letters", []),
            "paralelo":       r.get("paralelo"),
            "days":           r.get("days", []),
            "start_time":     r.get("start_time"),
            "end_time":       r.get("end_time"),
            "teacher":        r.get("teacher"),
            "credits":        r.get("credits"),
            "college":        r.get("college"),
            "available":      r.get("available"),
            "total":          r.get("total"),
            "period":         r.get("period"),
            "period_code":    r.get("period_code"),
            "scraped_at":     now_iso,
        })

    upserted, _ = _batch_post(
        f"{supa_url}/rest/v1/course_offer_history",
        history_rows,
        headers,
    )
    log.info("Archived %d rows from course_offer to history.", upserted)
    return upserted


def clear_course_offer(supa_url: str, supa_key: str) -> None:
    headers = _supabase_headers(supa_key)
    resp = requests.delete(
        f"{supa_url}/rest/v1/course_offer?course_code=not.is.null",
        headers=headers,
        timeout=30,
    )
    if resp.status_code not in (200, 204):
        log.warning("clear course_offer: %s %s", resp.status_code, resp.text[:200])
    else:
        log.info("course_offer table cleared.")


def load_periods_config(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return [{"code": str(p["code"]), "label": p["label"]} for p in data]


# ─── main ─────────────────────────────────────────────────────────────────────

def cmd_scrape(args) -> None:
    supa_url = os.environ.get("SUPABASE_URL", "")
    supa_key = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY", "")
    period      = args.period
    period_code = args.period_code

    if not supa_url or not supa_key:
        log.error("SUPABASE_URL and SUPABASE_KEY must be set in .env")
        sys.exit(1)

    headed = args.headed
    username, password = _usfq_creds()
    session = BrowserSession(headed=headed)

    try:
        if not session.ensure_logged_in(username, password):
            log.error(
                "\n\n  ⚠  Session expired!\n"
                "  Run:  python scrape.py login\n"
                "  Then re-run:  python scrape.py scrape\n"
            )
            sys.exit(2)

        courses = session.scrape_all(period, period_code, CourseRow)
    finally:
        session.close()

    if not courses:
        log.error("No courses scraped — aborting upload to avoid wiping the table.")
        sys.exit(1)

    if args.archive:
        upload_to_history(courses, supa_url, supa_key)

    upload_to_supabase(courses, supa_url, supa_key)
    update_offer_metadata(
        supa_url, supa_key,
        period_code=period_code,
        period_label=period,
    )
    log.info(
        "Done. %d courses saved for %s (%s).",
        len(courses), period, period_code,
    )


def cmd_backfill(args) -> None:
    supa_url = os.environ.get("SUPABASE_URL", "")
    supa_key = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not supa_url or not supa_key:
        log.error("SUPABASE_URL and SUPABASE_KEY must be set in .env")
        sys.exit(1)

    periods_path = args.periods or os.path.join(os.path.dirname(__file__), "periods.json")
    all_periods = load_periods_config(periods_path)

    if args.only:
        only_codes = {c.strip() for c in args.only.split(",")}
        all_periods = [p for p in all_periods if p["code"] in only_codes]
        if not all_periods:
            log.error("No matching periods for --only %s", args.only)
            sys.exit(1)

    headed = args.headed
    username, password = _usfq_creds()
    session = BrowserSession(headed=headed)

    try:
        if not session.ensure_logged_in(username, password):
            log.error("Session expired — run: python scrape.py login")
            sys.exit(2)

        if args.validate:
            available = session.list_periods()
            avail_codes = {p["code"] for p in available}
            for p in all_periods:
                if p["code"] not in avail_codes:
                    log.warning("Period %s not in catalog dropdown", p["code"])

        for entry in all_periods:
            code, label = entry["code"], entry["label"]
            log.info("=== Backfill %s (%s) ===", label, code)
            courses = session.scrape_all(label, code, CourseRow)
            if not courses:
                log.warning("No courses for %s — skipping.", code)
                continue
            upload_to_history(courses, supa_url, supa_key)
            log.info("Backfilled %d courses for %s.", len(courses), code)
    finally:
        session.close()

    log.info("Backfill complete.")


def cmd_rollover(args) -> None:
    supa_url = os.environ.get("SUPABASE_URL", "")
    supa_key = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY", "")
    period      = args.period
    period_code = args.period_code

    if not supa_url or not supa_key:
        log.error("SUPABASE_URL and SUPABASE_KEY must be set in .env")
        sys.exit(1)

    meta = fetch_offer_metadata(supa_url, supa_key)
    current_code = meta.get("current_period_code")
    if current_code and current_code == period_code:
        log.info(
            "No-op: current period is already %s (%s).",
            meta.get("current_period_label"), period_code,
        )
        return

    current_rows = fetch_current_offer(supa_url, supa_key)
    log.info(
        "Rollover plan: archive %d rows → scrape %s (%s) → replace course_offer",
        len(current_rows), period, period_code,
    )

    if not args.yes:
        log.info("Dry-run only. Re-run with --yes to execute.")
        return

    headed = args.headed
    username, password = _usfq_creds()
    session = BrowserSession(headed=headed)

    try:
        if not session.ensure_logged_in(username, password):
            log.error("Session expired — run: python scrape.py login")
            sys.exit(2)

        courses = session.scrape_all(period, period_code, CourseRow)
    finally:
        session.close()

    if not courses:
        log.error("Scrape returned 0 courses — aborting rollover (course_offer unchanged).")
        sys.exit(1)

    if current_rows:
        archive_current_offer_to_history(supa_url, supa_key)

    clear_course_offer(supa_url, supa_key)
    upload_to_supabase(courses, supa_url, supa_key)
    now_iso = datetime.now(timezone.utc).isoformat()
    update_offer_metadata(
        supa_url, supa_key,
        period_code=period_code,
        period_label=period,
        last_scraped_at=now_iso,
        last_rollover_at=now_iso,
    )
    log.info("Rollover complete: %d courses for %s (%s).", len(courses), period, period_code)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="USFQ course offer scraper – local runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = p.add_subparsers(dest="cmd")

    # ── scrape (default) ──────────────────────────────────────────────────────
    sc = sub.add_parser("scrape", help="Scrape and upload (default action)")
    sc.add_argument(
        "--period-code", default=os.environ.get("PERIOD_CODE", "202610"),
        help="Numeric period code, e.g. 202610",
    )
    sc.add_argument(
        "--period", default=os.environ.get("PERIOD", "Primer Semestre 2026/2027"),
        help='Human-readable label, e.g. "Primer Semestre 2026/2027"',
    )
    sc.add_argument(
        "--headed", action="store_true",
        help="Show browser window (useful for debugging)",
    )
    sc.add_argument(
        "--archive", action="store_true",
        help="Also upsert into course_offer_history",
    )

    # ── backfill ──────────────────────────────────────────────────────────────
    bf = sub.add_parser("backfill", help="Scrape historical periods into history only")
    bf.add_argument(
        "--periods",
        help="Path to periods.json (default: offer-scraper/periods.json)",
    )
    bf.add_argument(
        "--only",
        help="Comma-separated period codes to backfill, e.g. 202510,202420",
    )
    bf.add_argument("--headed", action="store_true")
    bf.add_argument(
        "--validate", action="store_true",
        help="Warn if period codes are missing from catalog dropdown",
    )

    # ── rollover ──────────────────────────────────────────────────────────────
    ro = sub.add_parser("rollover", help="Archive current offer and scrape new period")
    ro.add_argument(
        "--period-code", required=True,
        help="New period code, e.g. 202520",
    )
    ro.add_argument(
        "--period", required=True,
        help='New period label, e.g. "Segundo Semestre 2025/2026"',
    )
    ro.add_argument("--headed", action="store_true")
    ro.add_argument(
        "--yes", action="store_true",
        help="Execute rollover (default is dry-run)",
    )

    # ── list-periods ──────────────────────────────────────────────────────────
    sub.add_parser("list-periods", help="Print available period codes from catalog")

    # ── login ─────────────────────────────────────────────────────────────────
    sub.add_parser(
        "login",
        help=(
            "Open a headed browser so you can log in manually. "
            "If USFQ_USERNAME/PASSWORD are in .env, credentials are auto-filled."
        ),
    )

    return p


def main() -> None:
    parser = build_parser()

    # Allow bare `python scrape.py` or `python scrape.py --headed` etc.
    # by treating the first non-subcommand argument as "scrape"
    raw = sys.argv[1:]
    if raw and raw[0] in ("--login",):
        raw = ["login"] + raw[1:]
    elif not raw or raw[0].startswith("-"):
        raw = ["scrape"] + raw

    args = parser.parse_args(raw)

    if args.cmd == "login":
        cmd_login(args)
    elif args.cmd == "backfill":
        cmd_backfill(args)
    elif args.cmd == "rollover":
        cmd_rollover(args)
    elif args.cmd == "list-periods":
        username, password = _usfq_creds()
        session = BrowserSession(headed=True)
        try:
            if not session.ensure_logged_in(username, password):
                log.error("Session expired — run: python scrape.py login")
                sys.exit(2)
            for p in session.list_periods():
                print(f"{p['code']}\t{p['label']}")
        finally:
            session.close()
    else:
        cmd_scrape(args)


if __name__ == "__main__":
    main()
