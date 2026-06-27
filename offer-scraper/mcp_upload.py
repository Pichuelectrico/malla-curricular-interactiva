#!/usr/bin/env python3
"""Upload JSON scraped via MCP Playwright to Supabase."""

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv

# Reuse upload helpers from scrape.py
from scrape import (
    CourseRow,
    archive_current_offer_to_history,
    clear_course_offer,
    update_offer_metadata,
    upload_to_history,
    upload_to_supabase,
)

load_dotenv()


def load_json(path: str, period: str, period_code: str) -> list[CourseRow]:
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    rows: list[CourseRow] = []
    for r in raw:
        teacher = (r.get("teacher") or "").replace("\n", " ").strip() or None
        rows.append(CourseRow(
            nrc=str(r.get("nrc", "")).strip(),
            course_code=r.get("course_code", "").strip(),
            title=r.get("title", "").strip(),
            type=r.get("type", "Teoría"),
            group_letters=r.get("group_letters", []),
            paralelo=r.get("paralelo"),
            days=r.get("days", []),
            start_time=r.get("start_time"),
            end_time=r.get("end_time"),
            teacher=teacher,
            credits=r.get("credits"),
            college=r.get("college"),
            available=r.get("available"),
            total=r.get("total"),
            period=period,
            period_code=period_code,
        ))
    return rows


def main() -> None:
    p = argparse.ArgumentParser(description="Upload MCP-scraped JSON to Supabase")
    p.add_argument("json_file", help="Path to scraped JSON file")
    p.add_argument("--period", required=True)
    p.add_argument("--period-code", required=True)
    p.add_argument(
        "--target",
        choices=["history", "current", "rollover"],
        default="history",
        help="history = course_offer_history; current = course_offer; rollover = archive+clear+current",
    )
    args = p.parse_args()

    supa_url = os.environ.get("SUPABASE_URL", "")
    supa_key = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not supa_url or not supa_key:
        print("SUPABASE_URL and SUPABASE_KEY required in .env", file=sys.stderr)
        sys.exit(1)

    courses = load_json(args.json_file, args.period, args.period_code)
    if not courses:
        print("No courses in JSON — aborting.", file=sys.stderr)
        sys.exit(1)

    print(f"Loaded {len(courses)} courses from {args.json_file}")

    if args.target == "history":
        upload_to_history(courses, supa_url, supa_key)
    elif args.target == "current":
        upload_to_supabase(courses, supa_url, supa_key)
        update_offer_metadata(
            supa_url, supa_key,
            period_code=args.period_code,
            period_label=args.period,
        )
    elif args.target == "rollover":
        archive_current_offer_to_history(supa_url, supa_key)
        clear_course_offer(supa_url, supa_key)
        upload_to_supabase(courses, supa_url, supa_key)
        now_iso = datetime.now(timezone.utc).isoformat()
        update_offer_metadata(
            supa_url, supa_key,
            period_code=args.period_code,
            period_label=args.period,
            last_scraped_at=now_iso,
            last_rollover_at=now_iso,
        )

    print("Done.")


if __name__ == "__main__":
    main()
