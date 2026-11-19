"""Classify entries of the cron log (runs_<period>.jsonl) and alert on repeated REAL failures.

The cron marks a run 'fallo' when the DB row count differs from the scraped total, but that is the
expected state while obsolete NRCs (rows from an older scrape batch) are waiting to be cleaned. This
module separates those benign runs from real failures:

  * 'ok'                       – clean run.
  * 'ok_obsoletos_pendientes'  – extra DB rows are exactly the rows from older batches (last_updated_counts).
  * 'fallo'                    – error, wrong period, fewer rows than scraped, or unexplained extra rows.

Usage: python run_log_check.py [runs_202620.jsonl] [--threshold 2]
Exit code 1 when the last `threshold` runs are all real failures (hook this to the notification).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def classify_run(run: dict) -> str:
    if run.get("error"):
        return "fallo"
    scraped = run.get("filas_scrapeadas") or 0
    after = run.get("conteo_bd_despues") or 0
    if scraped <= 0 or after < scraped:
        return "fallo"
    if after == scraped and run.get("resultado") != "fallo":
        return "ok"
    extra = after - scraped
    if extra == 0:
        return "ok"
    counts = run.get("last_updated_counts") or {}
    if counts:
        newest = max(counts)
        older = sum(v for k, v in counts.items() if k != newest)
        if older == extra:
            return "ok_obsoletos_pendientes"
    return "fallo"


def real_failure_streak(runs: list[dict]) -> int:
    streak = 0
    for run in reversed(runs):
        if classify_run(run) != "fallo":
            break
        streak += 1
    return streak


def should_alert(runs: list[dict], threshold: int = 2) -> bool:
    return real_failure_streak(runs) >= threshold


def load_runs(path: Path) -> list[dict]:
    runs = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            runs.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return runs


def main(argv: list[str]) -> int:
    threshold = 2
    args = [a for a in argv if not a.startswith("--")]
    if "--threshold" in argv:
        threshold = int(argv[argv.index("--threshold") + 1])
        args = [a for a in args if a != str(threshold)]
    path = Path(args[0]) if args else Path(__file__).parent / "runs_202620.jsonl"
    runs = load_runs(path)
    for run in runs[-5:]:
        print(f"{run.get('timestamp')}  logged={run.get('resultado')}  classified={classify_run(run)}")
    if should_alert(runs, threshold):
        print(f"ALERTA: {real_failure_streak(runs)} corridas seguidas con fallo real (umbral {threshold}).")
        return 1
    print("Sin alerta.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
