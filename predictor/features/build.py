"""Feature engineering for course demand prediction."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import pandas as pd

from config import CURRICULA_DIR, OUTPUT_DIR
from data.export import load_offer_metadata
from features.codes import normalize_course_code
from features.demand_formula import compute_demand_prediction
from features.history_stats import aggregate_history_rows, load_history_rows
from features.period_calendar import build_calendar
from features.transition_calibration import TransitionRateTable, load_transition_rates
from graph.curriculum import build_graph, faculty_from_curriculum_id, graph_features, iter_curricula
from graph.propagation import (
    build_curriculum_graph,
    build_historical_seeds,
    propagate_demand_from_sources,
)


def load_faculty_curriculum(faculty: str) -> list[dict]:
    for name in (f"Malla-{faculty.upper()}.json", f"Malla-academica-{faculty.upper()}.json"):
        path = CURRICULA_DIR / name
        if path.exists():
            with open(path, encoding="utf-8") as f:
                return json.load(f).get("courses", [])
    return []


def _is_verano_block(block: str | None) -> bool:
    return "verano" in (block or "").lower()


def load_platform_counts(
    progress_path: Path | None = None,
    *,
    curriculum_id: str | None = None,
) -> tuple[dict[str, int], dict[str, int]]:
    """Returns (cursando, planned_next) by normalized offer code."""
    path = progress_path or OUTPUT_DIR / "user_progress.json"
    if not path.exists():
        return {}, {}

    with open(path, encoding="utf-8") as f:
        rows = json.load(f)

    cursando: dict[str, int] = defaultdict(int)
    planned: dict[str, int] = defaultdict(int)
    for row in rows:
        if curriculum_id and row.get("curriculum_id") != curriculum_id:
            continue
        for cid in row.get("in_progress_courses") or []:
            cursando[normalize_course_code(str(cid))] += 1
        for cid in row.get("planned_courses") or []:
            planned[normalize_course_code(str(cid))] += 1
    return dict(cursando), dict(planned)


def _platform_by_course_id(
    courses: list[dict],
    cursando_offer: dict[str, int],
    planned_offer: dict[str, int],
) -> tuple[dict[str, int], dict[str, int]]:
    cursando: dict[str, int] = {}
    planned: dict[str, int] = {}
    for course in courses:
        cid = course["id"]
        keys = {
            normalize_course_code(cid),
            normalize_course_code(course.get("code", cid)),
        }
        c_sum = sum(cursando_offer.get(k, 0) for k in keys)
        p_sum = sum(planned_offer.get(k, 0) for k in keys)
        if c_sum:
            cursando[cid] = c_sum
        if p_sum:
            planned[cid] = p_sum
    return cursando, planned


def resolve_prediction_context(
    metadata: dict | None = None,
) -> tuple[str, str, str]:
    """Returns (current_period_code, target_period_code, target_period_label)."""
    meta = metadata if metadata is not None else load_offer_metadata()
    cal = build_calendar()
    current = meta.get("current_period_code") or ""
    target_code, target_label = cal.infer_target_period(current or None)
    return current, target_code, target_label


def build_feature_frame(
    faculty: str | None = None,
    *,
    rates: TransitionRateTable | None = None,
    use_calibrated_rates: bool = True,
    target_period_code: str | None = None,
    history_rows: list[dict] | None = None,
) -> pd.DataFrame:
    """Hybrid estimator aligned with TeacherDashboard + optional GBR features."""
    if rates is None and use_calibrated_rates:
        rates = load_transition_rates()

    meta = load_offer_metadata()
    current_period, inferred_target, target_label = resolve_prediction_context(meta)
    target = target_period_code or inferred_target

    cal = build_calendar()
    rows = history_rows if history_rows is not None else load_history_rows()

    records: list[dict] = []

    for curriculum_id, data in iter_curricula():
        fac = faculty_from_curriculum_id(curriculum_id)
        if faculty and fac != faculty:
            continue

        courses = data.get("courses", [])
        if not courses:
            continue

        cursando_offer, planned_offer = load_platform_counts(curriculum_id=curriculum_id)

        # Per-malla history with verano-block awareness
        verano_ids = {c["id"] for c in courses if _is_verano_block(c.get("block"))}
        history_stats: dict = {}
        for course in courses:
            offer = normalize_course_code(course["id"])
            is_verano = course["id"] in verano_ids
            partial = aggregate_history_rows(
                [r for r in rows if normalize_course_code(str(r.get("course_code", ""))) == offer],
                target_period_code=target,
                calendar=cal,
                is_verano_course=is_verano,
            )
            if offer in partial:
                history_stats[offer] = partial[offer]

        # Also include global stats for courses not in malla loop above
        global_stats = aggregate_history_rows(rows, target_period_code=target, calendar=cal)
        for code, stat in global_stats.items():
            history_stats.setdefault(code, stat)

        graph = build_curriculum_graph(courses)
        nx_graph = build_graph(courses)
        feats = graph_features(nx_graph)

        hist_seeds = build_historical_seeds(courses, history_stats)
        cursando_by_id, planned_by_id = _platform_by_course_id(
            courses, cursando_offer, planned_offer
        )
        inflow_hist, inflow_curs, total_inflow = propagate_demand_from_sources(
            graph,
            hist_seeds,
            {k: float(v) for k, v in cursando_by_id.items()},
            rates=rates,
        )

        for course in courses:
            course_id = course["id"]
            if faculty and not course_id.startswith(faculty):
                continue

            offer_code = normalize_course_code(course_id)
            hist = history_stats.get(offer_code)
            planned_count = planned_by_id.get(course_id, 0)
            h_inflow = inflow_hist.get(course_id, 0.0)
            c_inflow = inflow_curs.get(course_id, 0.0)

            estimated_students, suggested_sections, trend = compute_demand_prediction(
                float(planned_count),
                h_inflow,
                c_inflow,
                hist,
            )

            actual_at_target = 0
            if target and hist:
                for p in hist.periods:
                    if p.period_code == target:
                        actual_at_target = p.total_students
                        break

            meta_g = feats.get(course_id, {})
            records.append(
                {
                    "course_id": course_id,
                    "offer_code": offer_code,
                    "title": course.get("title", offer_code),
                    "faculty": fac,
                    "curriculum_id": curriculum_id,
                    "planned_count": planned_count,
                    "in_progress_count": cursando_by_id.get(course_id, 0),
                    "inflow_from_history": round(h_inflow, 2),
                    "inflow_from_cursando": round(c_inflow, 2),
                    "propagated_students": round(total_inflow.get(course_id, 0.0), 2),
                    "avg_historical": hist.avg_sections if hist else 0.0,
                    "avg_students": hist.avg_students if hist else 0.0,
                    "estimated_next_students": hist.estimated_next_students if hist else 0,
                    "max_historical": hist.max_sections if hist else 0,
                    "num_periods": hist.num_periods if hist else 0,
                    "last_regular_students": hist.last_regular_students if hist else 0,
                    "summer_to_regular_rate": hist.summer_to_regular_rate if hist else 0.0,
                    "estimated_students": estimated_students,
                    "suggested_sections": suggested_sections,
                    "actual_students_at_target": actual_at_target,
                    "target_period_code": target,
                    "current_period_code": current_period,
                    "trend": trend,
                    "in_degree": meta_g.get("in_degree", 0),
                    "out_degree": meta_g.get("out_degree", 0),
                    "semester": meta_g.get("semester", 0),
                    "credits": meta_g.get("credits", 0),
                    "unlocks_count": meta_g.get("unlocks_count", 0),
                }
            )

    df = pd.DataFrame(records)
    df.attrs["target_period_code"] = target
    df.attrs["target_period_label"] = target_label
    df.attrs["current_period_code"] = current_period
    return df


def load_planned_counts(progress_path: Path | None = None) -> dict[str, int]:
    _, planned = load_platform_counts(progress_path)
    return planned
