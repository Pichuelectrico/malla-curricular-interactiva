"""Historical offer stats — mirrors frontend/lib/offerHistory.ts."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from config import OUTPUT_DIR, STUDENTS_PER_SECTION
from features.codes import normalize_course_code
from features.period_calendar import (
    AcademicCalendar,
    build_calendar,
    classify_period_kind,
    is_regular,
    is_summer_period,
)


@dataclass
class PeriodOfferStats:
    period_code: str
    period_label: str
    sections: int
    total_students: int
    is_summer: bool
    period_kind: str = "unknown"


@dataclass
class CourseHistoryStats:
    course_code: str
    periods: list[PeriodOfferStats] = field(default_factory=list)
    avg_sections: float = 0.0
    avg_students: float = 0.0
    max_sections: int = 0
    num_periods: int = 0
    estimated_next_students: int = 0
    estimated_next_sections: int = 0
    last_regular_students: int = 0
    is_verano_course: bool = False
    summer_to_regular_rate: float = 0.0


def _is_summer(period_code: str) -> bool:
    return is_summer_period(period_code)


def _is_usable_for_regular_avg(kind: str) -> bool:
    return is_regular(kind)  # type: ignore[arg-type]


def load_history_rows(history_path: Path | None = None) -> list[dict]:
    path = history_path or OUTPUT_DIR / "course_offer_history.json"
    if not path.exists():
        return []
    import json

    with open(path, encoding="utf-8") as f:
        rows = json.load(f)
    return rows if rows else []


def aggregate_history_rows(
    rows: list[dict],
    *,
    target_period_code: str | None = None,
    calendar: AcademicCalendar | None = None,
    is_verano_course: bool = False,
) -> dict[str, CourseHistoryStats]:
    per_course_period: dict[str, dict[str, dict]] = {}

    for row in rows:
        if row.get("type") != "Teoría":
            continue
        code = normalize_course_code(str(row.get("course_code", "")))
        period_code = row.get("period_code") or row.get("period") or ""
        period_label = row.get("period") or period_code
        total = float(row.get("total") or 0)

        by_period = per_course_period.setdefault(code, {})
        current = by_period.setdefault(
            period_code,
            {"label": period_label, "sections": 0, "students": 0.0},
        )
        current["sections"] += 1
        current["students"] += total

    cal = calendar or build_calendar()
    result: dict[str, CourseHistoryStats] = {}

    for course_code, by_period in per_course_period.items():
        periods: list[PeriodOfferStats] = []
        for period_code in sorted(by_period.keys()):
            stats = by_period[period_code]
            kind = classify_period_kind(period_code)
            periods.append(
                PeriodOfferStats(
                    period_code=period_code,
                    period_label=stats["label"],
                    sections=stats["sections"],
                    total_students=int(stats["students"]),
                    is_summer=_is_summer(period_code),
                    period_kind=kind,
                )
            )

        if is_verano_course:
            basis = [p for p in periods if p.period_kind == "summer"]
            if not basis:
                basis = periods
        else:
            basis = [p for p in periods if _is_usable_for_regular_avg(p.period_kind)]
            if not basis:
                basis = [p for p in periods if p.period_kind != "medical_year"]
            if not basis:
                basis = periods

        regular = [p for p in periods if _is_usable_for_regular_avg(p.period_kind)]
        avg_sections = sum(p.sections for p in basis) / len(basis) if basis else 0.0
        avg_students = sum(p.total_students for p in basis) / len(basis) if basis else 0.0
        max_sections = max((p.sections for p in periods), default=0)

        recent = [p.total_students for p in basis[-3:]]
        if len(recent) >= 2:
            estimated_next_students = round(sum(recent) / len(recent))
        else:
            estimated_next_students = round(avg_students)

        estimated_next_sections = max(
            1,
            round(estimated_next_students / STUDENTS_PER_SECTION) or round(avg_sections),
        )

        last_regular_students = _compute_seed_students(
            periods, target_period_code, cal, is_verano_course
        )

        summer_rate = _compute_summer_rate(periods, cal)

        result[course_code] = CourseHistoryStats(
            course_code=course_code,
            periods=periods,
            avg_sections=avg_sections,
            avg_students=avg_students,
            max_sections=max_sections,
            num_periods=len(periods),
            estimated_next_students=estimated_next_students,
            estimated_next_sections=estimated_next_sections,
            last_regular_students=last_regular_students,
            is_verano_course=is_verano_course,
            summer_to_regular_rate=summer_rate,
        )

    return result


def _compute_seed_students(
    periods: list[PeriodOfferStats],
    target_period_code: str | None,
    cal: AcademicCalendar,
    is_verano_course: bool,
) -> int:
    by_code = {p.period_code: p.total_students for p in periods}

    if is_verano_course:
        summers = [p for p in periods if p.period_kind == "summer"]
        return summers[-1].total_students if summers else 0

    if target_period_code:
        seed_period = cal.seed_period_for_target(target_period_code)
        if seed_period and seed_period in by_code:
            base = by_code[seed_period]
            # Blend summer cohort into regular_10 target
            if cal.get(target_period_code) and cal.get(target_period_code).kind == "regular_10":  # type: ignore[union-attr]
                summer_code = cal.summer_before_regular(target_period_code)
                if summer_code and summer_code in by_code:
                    summer_cupo = by_code[summer_code]
                    rate = summer_cupo / max(base, 1) if base > 0 else 0.35
                    rate = min(0.6, max(0.1, rate))
                    return int(base + summer_cupo * rate * 0.5)
            return base

    regular = [p for p in periods if _is_usable_for_regular_avg(p.period_kind)]
    if regular:
        return regular[-1].total_students
    return periods[-1].total_students if periods else 0


def _compute_summer_rate(periods: list[PeriodOfferStats], cal: AcademicCalendar) -> float:
    summers = [p for p in periods if p.period_kind == "summer"]
    regular = [p for p in periods if _is_usable_for_regular_avg(p.period_kind)]
    if not summers or not regular:
        return 0.0
    last_summer = summers[-1].total_students
    # regular after that summer
    reg_after = [p for p in regular if p.period_code > summers[-1].period_code]
    ref = reg_after[0].total_students if reg_after else regular[-1].total_students
    if ref <= 0:
        return 0.0
    return min(0.95, max(0.05, last_summer / ref))


def load_history_stats(
    history_path=None,
    *,
    target_period_code: str | None = None,
    calendar: AcademicCalendar | None = None,
) -> dict[str, CourseHistoryStats]:
    path = Path(history_path) if history_path else OUTPUT_DIR / "course_offer_history.json"
    rows = load_history_rows(path)
    if not rows:
        return {}
    return aggregate_history_rows(rows, target_period_code=target_period_code, calendar=calendar)


def load_history_agg(history_path: Path | None = None) -> pd.DataFrame:
    """Backward-compatible summary for GBR training."""
    stats = load_history_stats(history_path)
    if not stats:
        return pd.DataFrame(columns=["course_code", "avg_total", "max_total", "avg_students", "num_periods"])

    rows = []
    for code, h in stats.items():
        rows.append(
            {
                "course_code": code,
                "avg_total": h.avg_sections,
                "max_total": h.max_sections,
                "avg_students": h.avg_students,
                "num_periods": h.num_periods,
            }
        )
    return pd.DataFrame(rows)
