"""Feature engineering for course demand prediction."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import pandas as pd

from config import HIST_WEIGHT, OUTPUT_DIR, PLANNED_WEIGHT, STUDENTS_PER_SECTION
from graph.curriculum import build_graph, faculty_from_curriculum_id, graph_features, iter_curricula


def baseline_prediction(planned_count: float, avg_historical: float) -> int:
    """Replicate TeacherDashboard heuristic."""
    demand_sections = planned_count / STUDENTS_PER_SECTION
    predicted = avg_historical * HIST_WEIGHT + demand_sections * PLANNED_WEIGHT
    return max(1, round(predicted))


def load_planned_counts(progress_path: Path | None = None) -> dict[str, int]:
    path = progress_path or OUTPUT_DIR / "user_progress.json"
    if not path.exists():
        return {}

    with open(path, encoding="utf-8") as f:
        rows = json.load(f)

    counts: dict[str, int] = defaultdict(int)
    for row in rows:
        for cid in row.get("planned_courses") or []:
            counts[str(cid)] += 1
    return dict(counts)


def load_history_agg(history_path: Path | None = None) -> pd.DataFrame:
    path = history_path or OUTPUT_DIR / "course_offer_history.json"
    if not path.exists():
        return pd.DataFrame(columns=["course_code", "period_code", "avg_total", "max_total"])

    with open(path, encoding="utf-8") as f:
        rows = json.load(f)

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    theory = df[df["type"] == "Teoría"].copy()
    agg = (
        theory.groupby(["course_code", "period_code"], as_index=False)
        .agg(max_total=("total", "max"))
    )
    summary = (
        agg.groupby("course_code", as_index=False)
        .agg(
            avg_total=("max_total", "mean"),
            max_total=("max_total", "max"),
            num_periods=("period_code", "nunique"),
        )
    )
    return summary


def build_feature_frame(faculty: str | None = None) -> pd.DataFrame:
    """Combine curriculum graph features, planned demand, and history."""
    planned = load_planned_counts()
    history = load_history_agg()

    records = []
    for curriculum_id, data in iter_curricula():
        fac = faculty_from_curriculum_id(curriculum_id)
        if faculty and fac != faculty:
            continue

        g = build_graph(data.get("courses", []))
        feats = graph_features(g)

        for course_id, meta in feats.items():
            if faculty and not course_id.startswith(faculty):
                continue

            hist_row = history[history["course_code"] == course_id]
            avg_hist = float(hist_row["avg_total"].iloc[0]) if len(hist_row) else 0.0
            max_hist = float(hist_row["max_total"].iloc[0]) if len(hist_row) else 0.0
            num_periods = int(hist_row["num_periods"].iloc[0]) if len(hist_row) else 0
            planned_count = planned.get(course_id, 0)

            records.append({
                "course_id": course_id,
                "faculty": fac,
                "curriculum_id": curriculum_id,
                "planned_count": planned_count,
                "avg_historical": avg_hist,
                "max_historical": max_hist,
                "num_periods": num_periods,
                "predicted_sections": baseline_prediction(planned_count, avg_hist),
                **meta,
            })

    return pd.DataFrame(records)
