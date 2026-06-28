"""Hybrid demand formula — mirrors frontend/lib/demandPrediction.ts."""

from __future__ import annotations

from typing import Literal

from config import (
    MIN_STABLE_ENROLLMENT,
    STUDENTS_PER_SECTION,
    W_AVG_STUDENTS,
    W_EST_NEXT,
    W_INFLOW_CURS,
    W_INFLOW_HIST,
    W_PLANNED,
    W_SEC_AVG,
    W_SEC_EST,
    W_SEC_FROM_EST,
    W_SEC_INFLOW_CURS,
    W_SEC_INFLOW_HIST,
)
from features.history_stats import CourseHistoryStats
from features.period_calendar import is_regular


def _is_usable_for_regular_avg(kind: str) -> bool:
    return is_regular(kind)  # type: ignore[arg-type]

DemandTrend = Literal["up", "down", "stable", "new"]


def is_stable_offering(history: CourseHistoryStats, trend: DemandTrend) -> bool:
    if trend in ("down", "new"):
        return False
    regular = [p for p in history.periods if _is_usable_for_regular_avg(p.period_kind)]
    if len(regular) < 2:
        return False
    last = regular[-1].total_students
    prev = regular[-2].total_students
    return last >= MIN_STABLE_ENROLLMENT and prev >= MIN_STABLE_ENROLLMENT


def _compute_trend(
    history: CourseHistoryStats,
    estimate: int,
    dag_inflow: float,
) -> DemandTrend:
    regular = [p for p in history.periods if _is_usable_for_regular_avg(p.period_kind)]
    if len(regular) < 2 and dag_inflow <= 0:
        return "stable"

    last = regular[-1].total_students if regular else 0
    prev = regular[-2].total_students if len(regular) >= 2 else last
    baseline = last / prev if prev > 0 else 1.0

    reference = max(last, dag_inflow, estimate)
    projected = estimate / reference if reference > 0 else 1.0
    ratio = projected * 0.55 + baseline * 0.45

    if ratio > 1.08:
        return "up"
    if ratio < 0.92:
        return "down"
    return "stable"


def compute_demand_prediction(
    planned_next: float,
    inflow_from_history: float,
    inflow_from_cursando: float,
    history: CourseHistoryStats | None,
) -> tuple[int, int, DemandTrend]:
    if not history or history.num_periods == 0:
        estimated = round(planned_next + inflow_from_history + inflow_from_cursando)
        sections = max(1, round(estimated / STUDENTS_PER_SECTION))
        trend: DemandTrend = "up" if estimated > 0 else "new"
        return estimated, sections, trend

    estimated = round(
        history.estimated_next_students * W_EST_NEXT
        + history.avg_students * W_AVG_STUDENTS
        + inflow_from_history * W_INFLOW_HIST
        + inflow_from_cursando * W_INFLOW_CURS
        + planned_next * W_PLANNED
    )

    trend = _compute_trend(
        history,
        estimated,
        inflow_from_history + inflow_from_cursando,
    )

    if is_stable_offering(history, trend):
        estimated = max(estimated, MIN_STABLE_ENROLLMENT)

    sections = max(
        1,
        round(
            history.estimated_next_sections * W_SEC_EST
            + history.avg_sections * W_SEC_AVG
            + (estimated / STUDENTS_PER_SECTION) * W_SEC_FROM_EST
            + (inflow_from_history / STUDENTS_PER_SECTION) * W_SEC_INFLOW_HIST
            + (inflow_from_cursando / STUDENTS_PER_SECTION) * W_SEC_INFLOW_CURS
        ),
    )

    return estimated, sections, trend
