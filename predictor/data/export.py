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


# Orden único por tabla: paginar sin ORDER BY (o con empates) puede repetir y saltar filas entre páginas.
TABLE_ORDER = {
    "user_progress": "id",
    "course_offer_history": "id",
    "course_offer": "nrc",
}


def _expected_count(table: str) -> int | None:
    """Total exacto de filas según PostgREST (Content-Range), para verificar la exportación."""
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers={**_headers(), "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"},
        params={"select": "id" if TABLE_ORDER.get(table) == "id" else "nrc"},
        timeout=60,
    )
    resp.raise_for_status()
    total = resp.headers.get("Content-Range", "").split("/")[-1]
    return int(total) if total.isdigit() else None


def _fetch_pages(table: str, select: str, order: str | None) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    page_size = 1000
    while True:
        params = {"select": select, "offset": offset, "limit": page_size}
        if order:
            params["order"] = order
        resp = requests.get(f"{SUPABASE_URL}/rest/v1/{table}", headers=_headers(), params=params, timeout=60)
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def fetch_table(table: str, select: str = "*") -> list[dict]:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set")
    order = TABLE_ORDER.get(table)
    expected = _expected_count(table) if order else None
    rows = _fetch_pages(table, select, order)
    if expected is not None and len(rows) != expected:
        # La tabla cambió entre páginas (scrape en curso) o hubo lectura incompleta: un reintento.
        rows = _fetch_pages(table, select, order)
        expected = _expected_count(table)
    if expected is not None and len(rows) != expected:
        raise RuntimeError(
            f"Export of {table} is inconsistent: got {len(rows)} rows, server reports {expected}. "
            "Re-run once the table is quiet (e.g. outside the scrape window)."
        )
    if order and order in (rows[0] if rows else {}) and len({r[order] for r in rows}) != len(rows):
        raise RuntimeError(f"Export of {table} has duplicate {order} values; refusing to use it.")
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
        if table == "user_progress" and len(data) == 0:
            print(
                "WARNING: user_progress is empty. "
                "Set SUPABASE_SERVICE_KEY (service_role) in .env and ensure "
                "GRANT SELECT ON user_progress TO service_role; "
                "otherwise planned_count / in_progress_count will be 0."
            )

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
