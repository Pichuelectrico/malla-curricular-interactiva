"""Historical offer stats — mirrors frontend/lib/offerHistory.ts."""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from config import STUDENTS_PER_SECTION
from features.codes import normalize_course_code


@dataclass
class PeriodOfferStats:
    period_code: str
    period_label: str
    sections: int
    total_students: int
    is_summer: bool


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


def _is_summer(period_code: str) -> bool:
    return str(period_code).endswith("30")


def aggregate_history_rows(rows: list[dict]) -> dict[str, CourseHistoryStats]:
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

    result: dict[str, CourseHistoryStats] = {}

    for course_code, by_period in per_course_period.items():
        periods: list[PeriodOfferStats] = []
        for period_code in sorted(by_period.keys()):
            stats = by_period[period_code]
            periods.append(
                PeriodOfferStats(
                    period_code=period_code,
                    period_label=stats["label"],
                    sections=stats["sections"],
                    total_students=int(stats["students"]),
                    is_summer=_is_summer(period_code),
                )
            )

        regular = [p for p in periods if not p.is_summer]
        basis = regular if regular else periods
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

        last_regular = regular[-1] if regular else (periods[-1] if periods else None)
        last_regular_students = last_regular.total_students if last_regular else 0

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
        )

    return result


def load_history_stats(history_path=None) -> dict[str, CourseHistoryStats]:
    from config import OUTPUT_DIR
    from pathlib import Path
    import json

    path = Path(history_path) if history_path else OUTPUT_DIR / "course_offer_history.json"
    if not path.exists():
        return {}

    with open(path, encoding="utf-8") as f:
        rows = json.load(f)
    if not rows:
        return {}
    return aggregate_history_rows(rows)
