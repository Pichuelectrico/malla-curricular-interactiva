#!/usr/bin/env python3
"""
Copy scraper JSON output into the frontend and regenerate availableCurricula.ts.

Usage:
  python join.py              # copy all from scraper/output + regenerate
  python join.py --dry-run    # preview only
  python join.py --code CMP   # only sync one career file
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRAPER_OUTPUT = REPO_ROOT / "scraper" / "output"
CAREERS_PATH = Path(__file__).resolve().parent / "careers.json"
AVAILABLE_CURRICULA_PATH = REPO_ROOT / "frontend" / "data" / "availableCurricula.ts"

COPY_TARGETS = [
    REPO_ROOT / "frontend" / "data",
    REPO_ROOT / "frontend" / "public" / "data",
    REPO_ROOT / "frontend" / "src" / "data",
    REPO_ROOT / "frontend" / "dist" / "data",
]


def load_careers() -> dict[str, str]:
    with CAREERS_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def code_from_filename(path: Path) -> str:
    stem = path.stem  # Malla-CMP
    if stem.startswith("Malla-"):
        return stem[len("Malla-") :]
    return stem


def slug_for_code(code: str) -> str:
    return f"malla-{code.lower()}"


def id_for_code(code: str) -> str:
    return f"{code.lower()}-usfq"


def year_from_json(data: dict) -> str:
    raw = data.get("Last-Modified") or data.get("last_modified") or ""
    if raw:
        try:
            return str(datetime.fromisoformat(raw.replace("Z", "+00:00")).year)
        except ValueError:
            pass
    return str(datetime.now().year)


def stats_from_json(data: dict) -> tuple[int, int, str]:
    courses = data.get("courses") or []
    credits = sum(int(c.get("credits") or 0) for c in courses)
    return len(courses), credits, year_from_json(data)


def discover_scraper_files(code_filter: str | None) -> list[Path]:
    if not SCRAPER_OUTPUT.is_dir():
        print(f"Scraper output not found: {SCRAPER_OUTPUT}", file=sys.stderr)
        sys.exit(1)

    files = sorted(SCRAPER_OUTPUT.glob("Malla-*.json"))
    if code_filter:
        target = f"Malla-{code_filter.upper()}.json"
        files = [p for p in files if p.name == target]
        if not files:
            print(f"No file matching {target} in {SCRAPER_OUTPUT}", file=sys.stderr)
            sys.exit(1)
    return files


def copy_json(path: Path, dry_run: bool) -> None:
    for dest_dir in COPY_TARGETS:
        if dest_dir.name == "dist" and not (REPO_ROOT / "frontend" / "dist").is_dir():
            continue
        if dest_dir.name == "src" and not (REPO_ROOT / "frontend" / "src").is_dir():
            continue

        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / path.name
        if dry_run:
            print(f"  would copy → {dest.relative_to(REPO_ROOT)}")
        else:
            shutil.copy2(path, dest)
            print(f"  copied → {dest.relative_to(REPO_ROOT)}")


def list_frontend_mallas() -> list[Path]:
    data_dir = REPO_ROOT / "frontend" / "data"
    return sorted(data_dir.glob("Malla-*.json"))


def build_curriculum_entry(path: Path, careers: dict[str, str]) -> dict:
    code = code_from_filename(path)
    with path.open(encoding="utf-8") as f:
        data = json.load(f)

    course_count, credits, year = stats_from_json(data)
    name = careers.get(code, data.get("name") or code)
    filename = path.name

    return {
        "id": id_for_code(code),
        "slug": slug_for_code(code),
        "name": name,
        "description": "Universidad San Francisco de Quito",
        "year": year,
        "credits": credits,
        "courses": course_count,
        "filename": filename,
    }


def render_available_curricula(entries: list[dict]) -> str:
    lines = [
        "export interface AvailableCurriculum {",
        "  id: string;",
        "  slug: string; // pretty URL path, e.g., 'malla-adm'",
        "  name: string;",
        "  description: string;",
        "  year: string;",
        "  credits: number;",
        "  courses: number;",
        "  dataLoader: () => Promise<any>;",
        "}",
        "",
        "export const availableCurricula: AvailableCurriculum[] = [",
    ]

    for entry in entries:
        err_msg = f"No se pudo cargar /data/{entry['filename']}"
        lines.extend(
            [
                "  {",
                f'    id: "{entry["id"]}",',
                f'    slug: "{entry["slug"]}",',
                f'    name: "{entry["name"]}",',
                f'    description: "{entry["description"]}",',
                f'    year: "{entry["year"]}",',
                f"    credits: {entry['credits']},",
                f"    courses: {entry['courses']},",
                "    dataLoader: async () => {",
                "      const base = (import.meta as any).env?.BASE_URL || '/';",
                f'      const res = await fetch(`${{base}}data/{entry["filename"]}`);',
                f"      if (!res.ok) throw new Error('{err_msg}');",
                "      return { default: await res.json() };",
                "    },",
                "  },",
            ]
        )

    lines.append("];")
    lines.append("")
    return "\n".join(lines)


def regenerate_available_curricula(careers: dict[str, str], dry_run: bool) -> int:
    mallas = list_frontend_mallas()
    if not mallas:
        print("No Malla-*.json files found in frontend/data/", file=sys.stderr)
        return 0

    entries = [build_curriculum_entry(path, careers) for path in mallas]
    entries.sort(key=lambda e: e["name"].lower())
    content = render_available_curricula(entries)

    if dry_run:
        print(f"  would write {AVAILABLE_CURRICULA_PATH.relative_to(REPO_ROOT)} ({len(entries)} careers)")
        return len(entries)

    AVAILABLE_CURRICULA_PATH.write_text(content, encoding="utf-8")
    print(f"  wrote {AVAILABLE_CURRICULA_PATH.relative_to(REPO_ROOT)} ({len(entries)} careers)")
    return len(entries)


def main() -> None:
    parser = argparse.ArgumentParser(description="Join scraper JSON into frontend")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes only")
    parser.add_argument("--code", help="Sync only one career code (e.g. CMP)")
    parser.add_argument(
        "--regenerate-only",
        action="store_true",
        help="Skip copy; only rebuild availableCurricula.ts from frontend/data",
    )
    args = parser.parse_args()

    careers = load_careers()

    if not args.regenerate_only:
        files = discover_scraper_files(args.code)
        print(f"Found {len(files)} file(s) in scraper/output/")
        for path in files:
            print(f"\n{path.name}")
            copy_json(path, args.dry_run)

    print("\nRegenerating availableCurricula.ts …")
    count = regenerate_available_curricula(careers, args.dry_run)

    if args.dry_run:
        print(f"\nDry run complete ({count} careers).")
    else:
        print(f"\nDone ({count} careers).")


if __name__ == "__main__":
    main()
