"""Export Supabase tables for offline training."""

from __future__ import annotations

import json
from pathlib import Path

import requests

from config import OUTPUT_DIR, SUPABASE_KEY, SUPABASE_URL


def _headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }


def fetch_table(table: str, select: str = "*") -> list[dict]:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set")
    rows: list[dict] = []
    offset = 0
    page_size = 1000
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=_headers(),
            params={"select": select, "offset": offset, "limit": page_size},
            timeout=60,
        )
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def fetch_offer_metadata() -> dict:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {}
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/offer_metadata",
        headers=_headers(),
        params={"select": "*", "id": "eq.1"},
        timeout=30,
    )
    resp.raise_for_status()
    rows = resp.json()
    return rows[0] if rows else {}


def export_all(out_dir: Path | None = None) -> dict[str, Path]:
    dest = out_dir or OUTPUT_DIR
    dest.mkdir(exist_ok=True)

    paths = {}
    for table in ("user_progress", "course_offer_history", "course_offer"):
        data = fetch_table(table)
        path = dest / f"{table}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)
        paths[table] = path
        print(f"Exported {len(data)} rows → {path}")

    meta = fetch_offer_metadata()
    meta_path = dest / "offer_metadata.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, default=str)
    paths["offer_metadata"] = meta_path
    print(f"Exported offer_metadata → {meta_path}")

    return paths


def load_offer_metadata(path: Path | None = None) -> dict:
    p = path or OUTPUT_DIR / "offer_metadata.json"
    if not p.exists():
        return {}
    with open(p, encoding="utf-8") as f:
        return json.load(f)


if __name__ == "__main__":
    export_all()
