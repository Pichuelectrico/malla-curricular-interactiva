"""
USFQ Course Offer Scraper  –  local runner
==========================================
Uses a **persistent Chromium profile** (like a real browser) so Microsoft SSO
sessions survive for ~30 h without needing to re-enter credentials.

Usage
-----
  # First run / session expired: open a visible browser window and log in manually
  python scrape.py --login

  # Every subsequent run while session is alive (headless, no interaction needed)
  python scrape.py

  # To select a different period explicitly
  python scrape.py --period-code 202530 --period "Verano 2025/2026"

  # Force headed mode for debugging
  python scrape.py --headed

Environment variables (see .env.example)
-----------------------------------------
  SUPABASE_URL        – Supabase project URL
  SUPABASE_KEY        – anon or service-role key
  PERIOD              – Human-readable label  (default: "Verano 2025/2026")
  PERIOD_CODE         – Numeric code          (default: 202530)

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
import logging
import os
import re
import sys
import time
import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Optional

import requests
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, Page, TimeoutError as PWTimeoutError

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("offer-scraper")

CATALOG_URL   = "https://catalogodecursos.usfq.edu.ec/dashboard/home"
TENANT_ID     = "9f119962-8c62-431c-a8ef-e7e0a42d11fc"
PROFILE_DIR   = os.path.join(os.path.dirname(__file__), ".browser_profile")

# Columns that exist in the course_offer table
DB_FIELDS = [
    "nrc", "course_code", "title", "type", "group_letters", "paralelo",
    "days", "start_time", "end_time", "teacher", "credits", "college",
    "available", "total", "period", "last_updated",
]


# ─── JS injected into the page to extract rows ───────────────────────────────

EXTRACT_JS = """
() => {
  const rows = document.querySelectorAll('table tbody tr');
  const results = [];
  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 10) continue;

    const infoCell = cells[3];

    const badge = infoCell.querySelector('.badge');
    const title = badge ? badge.innerText.trim() : '';

    let courseType = 'Teoría';
    for (const p of infoCell.querySelectorAll('p')) {
      if (p.innerText.includes('Curso de:')) {
        const b = p.querySelector('b');
        if (b) courseType = b.innerText.trim();
        break;
      }
    }

    let groupLetters = [];
    for (const p of infoCell.querySelectorAll('p')) {
      if (p.innerText.includes('Agrupado con')) {
        const matches = p.innerText.match(/\\|\\s*([A-Z]{1,3})\\s*\\|/g) || [];
        groupLetters = matches.map(m => m.replace(/\\|/g, '').trim());
        break;
      }
    }

    const days = [];
    const horarioP = infoCell.querySelector('p.mb-2');
    if (horarioP) {
      for (const b of horarioP.querySelectorAll('b')) {
        const txt = b.innerText.trim();
        if (['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'].includes(txt))
          days.push(txt);
      }
    }

    let startTime = null, endTime = null;
    if (horarioP) {
      for (const b of Array.from(horarioP.querySelectorAll('b'))) {
        const m = b.innerText.match(/(\\d{4})\\s*-\\s*(\\d{4})/);
        if (m) {
          startTime = m[1].slice(0,2) + ':' + m[1].slice(2);
          endTime   = m[2].slice(0,2) + ':' + m[2].slice(2);
          break;
        }
      }
    }

    let paralelo = null;
    for (const p of infoCell.querySelectorAll('p')) {
      if (p.innerText.includes('Paralelo:')) {
        const b = p.querySelector('b');
        if (b) paralelo = b.innerText.trim();
        break;
      }
    }

    const totalSlots = parseInt(cells[8].innerText.trim()) || null;
    const enrolled   = parseInt(cells[9].innerText.trim()) || null;
    const available  = (totalSlots !== null && enrolled !== null)
                        ? totalSlots - enrolled : null;

    results.push({
      course_code:   cells[1].innerText.trim(),
      nrc:           cells[2].innerText.trim(),
      title,
      type:          courseType,
      group_letters: groupLetters,
      paralelo,
      days,
      start_time:    startTime,
      end_time:      endTime,
      teacher:       cells[5].innerText.trim() || null,
      credits:       parseInt(cells[6].innerText.trim()) || null,
      college:       cells[7].innerText.trim() || null,
      total:         totalSlots,
      available,
    });
  }
  return results;
}
"""


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


# ─── browser helpers ──────────────────────────────────────────────────────────

def _launch_context(headed: bool):
    """
    Launch a Playwright browser with a persistent profile directory.
    The profile stores cookies, localStorage (MSAL tokens), etc. so the
    Microsoft SSO session persists across script runs (~30 h).
    """
    pw = sync_playwright().start()
    os.makedirs(PROFILE_DIR, exist_ok=True)
    ctx = pw.chromium.launch_persistent_context(
        user_data_dir=PROFILE_DIR,
        headless=not headed,
        viewport={"width": 1280, "height": 900},
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        args=["--disable-blink-features=AutomationControlled"],
    )
    return pw, ctx


def cmd_login(args) -> None:
    """
    Open the catalog in a HEADED browser so the user can log in manually
    (or auto-fill if credentials are in .env).  Exits when the dashboard
    is reached — the session is persisted in .browser_profile/.
    """
    username = os.environ.get("USFQ_USERNAME", "")
    password = os.environ.get("USFQ_PASSWORD", "")
    auto     = bool(username and password)

    log.info("Opening browser%s…", " with auto-fill" if auto else " for manual login")
    log.info("Profile dir: %s", PROFILE_DIR)

    pw, ctx = _launch_context(headed=True)
    page = ctx.new_page()

    try:
        page.goto(CATALOG_URL, wait_until="domcontentloaded", timeout=60_000)
        log.info("Navigated to catalog. Current URL: %s", page.url)

        if auto:
            _auto_fill_credentials(page, username, password)

        log.info("Waiting for dashboard (up to 5 min)…")
        if not auto:
            log.info("  → Please log in manually in the browser window.")

        deadline = time.time() + 300   # 5 min for manual login
        dismissed = False
        while time.time() < deadline:
            time.sleep(0.8)
            url = page.url
            if "catalogodecursos.usfq.edu.ec/dashboard" in url:
                log.info("Dashboard reached. Session saved. You can close the browser now.")
                time.sleep(3)   # give MSAL a moment to finish writing tokens
                break
            # Auto-dismiss "Stay signed in?" during auto-fill flow
            if (auto and not dismissed
                    and f"{TENANT_ID}/login" in url
                    and "oauth2" not in url):
                try:
                    btn = page.locator("#idBtn_Back")
                    if btn.is_visible():
                        btn.click()
                        dismissed = True
                        log.info("Dismissed 'Stay signed in?'")
                except Exception:
                    pass
        else:
            log.error("Dashboard not reached within 5 minutes.")
            sys.exit(1)
    finally:
        ctx.close()
        pw.stop()


def _auto_fill_credentials(page: Page, username: str, password: str) -> None:
    """Fill email + password on the Microsoft login page (best-effort)."""
    try:
        email_field = page.locator(
            "input[type='email'], input[name='loginfmt'], input[placeholder*='mail']"
        )
        email_field.wait_for(state="visible", timeout=20_000)
        email_field.fill(username)
        page.keyboard.press("Enter")
        log.info("Email submitted.")

        pass_field = page.locator("input[type='password'], input[name='passwd']")
        pass_field.wait_for(state="visible", timeout=15_000)
        pass_field.fill(password)
        page.keyboard.press("Enter")
        log.info("Password submitted — waiting for redirect…")
    except PWTimeoutError:
        log.warning("Could not auto-fill credentials (page may already be past login).")


def _ensure_logged_in(page: Page) -> bool:
    """
    Navigate to the catalog.  Returns True if the dashboard loads (session
    alive), False if redirected to Microsoft login (session expired).
    """
    log.info("Opening catalog…")
    page.goto(CATALOG_URL, wait_until="domcontentloaded", timeout=60_000)

    deadline = time.time() + 60
    while time.time() < deadline:
        time.sleep(0.5)
        url = page.url
        if "catalogodecursos.usfq.edu.ec/dashboard" in url:
            page.wait_for_selector("select", state="visible", timeout=20_000)
            log.info("Session alive — dashboard loaded.")
            return True
        if "login.microsoftonline.com" in url:
            log.warning("Redirected to Microsoft login — session has expired.")
            return False

    log.warning("Timed out waiting for catalog/login redirect.")
    return False


# ─── period + scraping ────────────────────────────────────────────────────────

def load_period(page: Page, period_code: str) -> None:
    log.info("Selecting period %s…", period_code)
    selects = page.locator("select").all()
    selected = False
    for sel in selects:
        opts = sel.evaluate("el => Array.from(el.options).map(o => o.value)")
        if period_code in opts:
            sel.select_option(value=period_code)
            selected = True
            log.info("Period selected.")
            break
    if not selected:
        log.error("Period code %s not found in any <select>. Aborting.", period_code)
        sys.exit(1)

    update_btn = page.locator(
        "button:has-text('Actualizar'), button:has-text('Update Courses')"
    )
    update_btn.first.click()
    page.wait_for_selector("table tbody tr", timeout=20_000)
    log.info("Course table loaded.")

    # Set items-per-page to 100
    try:
        for sel in page.locator("select").all():
            opts = sel.evaluate("el => Array.from(el.options).map(o => o.value)")
            if "100" in opts:
                sel.select_option(value="100")
                time.sleep(1.5)
                log.info("Items per page set to 100.")
                break
    except Exception as exc:
        log.debug("Could not set items-per-page: %s", exc)


def scrape_all(page: Page, period: str, period_code: str) -> list[CourseRow]:
    load_period(page, period_code)

    all_rows: list[CourseRow] = []
    page_num = 1

    while True:
        log.info("Scraping page %d…", page_num)
        raw = page.evaluate(EXTRACT_JS)
        log.info("  → %d rows (total so far: %d)", len(raw), len(all_rows) + len(raw))

        for r in raw:
            nrc = r.get("nrc", "").strip()
            if not re.fullmatch(r"\d{4,6}", nrc):
                continue
            teacher_raw = (r.get("teacher") or "").replace("\n", " ").strip() or None
            all_rows.append(CourseRow(
                nrc=nrc,
                course_code=r.get("course_code", "").strip(),
                title=r.get("title", "").strip(),
                type=r.get("type", "Teoría"),
                group_letters=r.get("group_letters", []),
                paralelo=r.get("paralelo"),
                days=r.get("days", []),
                start_time=r.get("start_time"),
                end_time=r.get("end_time"),
                teacher=teacher_raw,
                credits=r.get("credits"),
                college=r.get("college"),
                available=r.get("available"),
                total=r.get("total"),
                period=period,
            ))

        next_btn = page.locator(
            "li.page-item:not(.disabled) a.page-link:has-text('Next')"
        )
        if next_btn.count() == 0:
            log.info("No more pages.")
            break

        last_nrc = all_rows[-1].nrc if all_rows else ""
        next_btn.first.click()
        try:
            page.wait_for_function(
                f"() => document.querySelector('table tbody tr td:nth-child(3)')"
                f"?.innerText?.trim() !== {json.dumps(last_nrc)}",
                timeout=15_000,
            )
        except PWTimeoutError:
            time.sleep(2)

        page_num += 1

    log.info("Total scraped: %d courses", len(all_rows))
    return all_rows


# ─── Supabase upload via REST API (no SDK needed) ────────────────────────────

def upload_to_supabase(
    courses: list[CourseRow],
    supa_url: str,
    supa_key: str,
) -> None:
    if not courses:
        log.warning("No courses to upload.")
        return

    now_iso  = datetime.now(timezone.utc).isoformat()
    headers  = {
        "apikey":        supa_key,
        "Authorization": f"Bearer {supa_key}",
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates,return=minimal",
    }

    records = []
    for c in courses:
        d = asdict(c)
        d["last_updated"] = now_iso
        # Keep only columns that exist in the DB
        records.append({k: d[k] for k in DB_FIELDS})

    batch_size    = 100
    total_upserted = 0
    errors         = 0

    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        resp  = requests.post(
            f"{supa_url}/rest/v1/course_offer",
            headers=headers,
            json=batch,
            timeout=30,
        )
        if resp.status_code in (200, 201, 204):
            total_upserted += len(batch)
            log.info("  Upserted %d / %d rows…", total_upserted, len(records))
        else:
            errors += 1
            log.error("  Batch %d failed: %s %s", i // batch_size + 1,
                      resp.status_code, resp.text[:200])
            if errors > 3:
                log.error("Too many errors — stopping.")
                break

    log.info("Upload complete: %d / %d courses.", total_upserted, len(records))


def archive_to_history(
    courses: list[CourseRow],
    supa_url: str,
    supa_key: str,
) -> None:
    """Insert current courses into course_offer_history for trend analysis."""
    now_iso = datetime.now(timezone.utc).isoformat()
    headers = {
        "apikey":        supa_key,
        "Authorization": f"Bearer {supa_key}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    }

    history_fields = [f for f in DB_FIELDS if f != "last_updated"] + ["scraped_at"]
    records = []
    for c in courses:
        d = asdict(c)
        d["scraped_at"] = now_iso
        records.append({k: d.get(k) for k in history_fields if k in d
                        or k == "scraped_at"})

    batch_size = 100
    for i in range(0, len(records), batch_size):
        resp = requests.post(
            f"{supa_url}/rest/v1/course_offer_history",
            headers=headers,
            json=records[i:i + batch_size],
            timeout=30,
        )
        if resp.status_code not in (200, 201, 204):
            log.warning("History batch %d: %s %s",
                        i // batch_size + 1, resp.status_code, resp.text[:200])

    log.info("Archived %d rows to course_offer_history.", len(records))


# ─── main ─────────────────────────────────────────────────────────────────────

def cmd_scrape(args) -> None:
    supa_url = os.environ.get("SUPABASE_URL", "")
    supa_key = os.environ.get("SUPABASE_KEY", "")
    period      = args.period
    period_code = args.period_code

    if not supa_url or not supa_key:
        log.error("SUPABASE_URL and SUPABASE_KEY must be set in .env")
        sys.exit(1)

    headed = args.headed
    pw, ctx = _launch_context(headed=headed)
    page = ctx.new_page()

    try:
        logged_in = _ensure_logged_in(page)
        if not logged_in:
            log.error(
                "\n\n  ⚠  Session expired!\n"
                "  Run:  python scrape.py --login\n"
                "  Then re-run:  python scrape.py\n"
            )
            sys.exit(2)

        courses = scrape_all(page, period, period_code)
    finally:
        ctx.close()
        pw.stop()

    if not courses:
        log.error("No courses scraped — aborting upload to avoid wiping the table.")
        sys.exit(1)

    if args.archive:
        archive_to_history(courses, supa_url, supa_key)

    upload_to_supabase(courses, supa_url, supa_key)
    log.info(
        "Done. %d courses saved for %s (%s).",
        len(courses), period, period_code,
    )


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="USFQ course offer scraper – local runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = p.add_subparsers(dest="cmd")

    # ── scrape (default) ──────────────────────────────────────────────────────
    sc = sub.add_parser("scrape", help="Scrape and upload (default action)")
    sc.add_argument(
        "--period-code", default=os.environ.get("PERIOD_CODE", "202530"),
        help="Numeric period code, e.g. 202530",
    )
    sc.add_argument(
        "--period", default=os.environ.get("PERIOD", "Verano 2025/2026"),
        help='Human-readable label, e.g. "Verano 2025/2026"',
    )
    sc.add_argument(
        "--headed", action="store_true",
        help="Show browser window (useful for debugging)",
    )
    sc.add_argument(
        "--archive", action="store_true",
        help="Also insert into course_offer_history before updating the main table",
    )

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
    else:
        cmd_scrape(args)


if __name__ == "__main__":
    main()
