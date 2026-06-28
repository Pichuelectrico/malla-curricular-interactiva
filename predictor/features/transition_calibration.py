"""Empirical DAG transition rate calibration from period-pair history."""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from config import (
    CURRICULA_DIR,
    OUTPUT_DIR,
    P_OTHER,
    P_SAME_AREA,
    P_SEQUENTIAL,
    PUBLIC_TRANSITION_RATES_JSON,
    TRANSITION_RATE_MAX,
    TRANSITION_RATE_MIN,
    TRANSITION_RATES_JSON,
    TRANSITION_SHRINKAGE_ALPHA,
)
from features.codes import normalize_course_code
from features.history_stats import aggregate_history_rows, load_history_rows
from features.period_calendar import AcademicCalendar, build_calendar, is_regular
from graph.curriculum import iter_curricula, parse_prereq_group
from graph.propagation import (
    CurriculumGraph,
    _is_direct_prerequisite,
    _is_primary_successor,
    build_curriculum_graph,
    default_transition_probability,
)

EdgeType = Literal["sequential", "cross_area_direct", "same_area", "other", "summer_to_regular"]

PRIOR_BY_TYPE: dict[EdgeType, float] = {
    "sequential": P_SEQUENTIAL,
    "cross_area_direct": P_SAME_AREA,
    "same_area": P_SAME_AREA,
    "other": P_OTHER,
    "summer_to_regular": P_SAME_AREA,
}


def classify_edge_type(graph: CurriculumGraph, from_id: str, to_id: str) -> EdgeType:
    if _is_primary_successor(graph, from_id, to_id):
        return "sequential"
    if _is_direct_prerequisite(graph, from_id, to_id):
        from_c = graph.nodes.get(from_id, {})
        to_c = graph.nodes.get(to_id, {})
        if from_c.get("area") != to_c.get("area"):
            return "cross_area_direct"
        return "same_area"
    from_c = graph.nodes.get(from_id, {})
    to_c = graph.nodes.get(to_id, {})
    if from_c.get("area") == to_c.get("area"):
        return "same_area"
    return "other"


def semester_delta(graph: CurriculumGraph, from_id: str, to_id: str) -> int:
    from_c = graph.nodes.get(from_id, {})
    to_c = graph.nodes.get(to_id, {})
    return max(1, int(to_c.get("semester", 0)) - int(from_c.get("semester", 0)))


@dataclass
class RateAccumulator:
    source_students: float = 0.0
    target_students: float = 0.0
    n_pairs: int = 0


def _shrink_rate(obs_target: float, obs_source: float, prior: float, alpha: float) -> float:
    if obs_source <= 0:
        return prior
    raw = obs_target / obs_source
    p = (obs_target + alpha * prior) / (obs_source + alpha)
    return max(TRANSITION_RATE_MIN, min(TRANSITION_RATE_MAX, p))


@dataclass
class TransitionRateEntry:
    from_id: str
    to_id: str
    edge_type: EdgeType
    p: float
    prior: float
    n_pairs: int
    source_students: float
    target_students: float
    curriculum_id: str = ""

    def to_dict(self) -> dict:
        return {
            "from_id": self.from_id,
            "to_id": self.to_id,
            "edge_type": self.edge_type,
            "p": round(self.p, 4),
            "prior": self.prior,
            "n_pairs": self.n_pairs,
            "source_students": round(self.source_students, 1),
            "target_students": round(self.target_students, 1),
            "curriculum_id": self.curriculum_id,
        }


@dataclass
class TransitionRateTable:
    by_edge: dict[tuple[str, str], TransitionRateEntry] = field(default_factory=dict)
    by_type: dict[EdgeType, TransitionRateEntry] = field(default_factory=dict)
    summer_rates: dict[str, float] = field(default_factory=dict)
    generated_at: str = ""
    version: int = 1

    def lookup(self, from_id: str, to_id: str, edge_type: EdgeType | None = None) -> float | None:
        entry = self.by_edge.get((from_id, to_id))
        if entry and entry.n_pairs >= 1:
            return entry.p
        et = edge_type or "other"
        type_entry = self.by_type.get(et)
        if type_entry and type_entry.n_pairs >= 1:
            return type_entry.p
        return None

    def lookup_edge_info(self, from_id: str, to_id: str) -> TransitionRateEntry | None:
        return self.by_edge.get((from_id, to_id))

    def to_payload(self) -> dict:
        return {
            "generated_at": self.generated_at,
            "version": self.version,
            "by_edge": {
                f"{a}->{b}": e.to_dict() for (a, b), e in self.by_edge.items()
            },
            "by_type": {k: v.to_dict() for k, v in self.by_type.items()},
            "summer_rates": self.summer_rates,
        }

    @classmethod
    def from_json(cls, data: dict) -> TransitionRateTable:
        table = cls(
            generated_at=data.get("generated_at", ""),
            version=int(data.get("version", 1)),
            summer_rates=dict(data.get("summer_rates") or {}),
        )
        for _key, row in (data.get("by_edge") or {}).items():
            entry = TransitionRateEntry(
                from_id=row["from_id"],
                to_id=row["to_id"],
                edge_type=row["edge_type"],
                p=float(row["p"]),
                prior=float(row.get("prior", P_OTHER)),
                n_pairs=int(row.get("n_pairs", 0)),
                source_students=float(row.get("source_students", 0)),
                target_students=float(row.get("target_students", 0)),
                curriculum_id=row.get("curriculum_id", ""),
            )
            table.by_edge[(entry.from_id, entry.to_id)] = entry
        for et, row in (data.get("by_type") or {}).items():
            table.by_type[et] = TransitionRateEntry(
                from_id="",
                to_id="",
                edge_type=et,  # type: ignore[arg-type]
                p=float(row["p"]),
                prior=float(row.get("prior", PRIOR_BY_TYPE.get(et, P_OTHER))),  # type: ignore[arg-type]
                n_pairs=int(row.get("n_pairs", 0)),
                source_students=float(row.get("source_students", 0)),
                target_students=float(row.get("target_students", 0)),
            )
        return table


def load_transition_rates(path: Path | None = None) -> TransitionRateTable | None:
    p = path or TRANSITION_RATES_JSON
    if not p.exists():
        return None
    with open(p, encoding="utf-8") as f:
        return TransitionRateTable.from_json(json.load(f))


def _cupo_by_period(history_stats: dict, offer_code: str) -> dict[str, int]:
    hist = history_stats.get(offer_code)
    if not hist:
        return {}
    return {p.period_code: p.total_students for p in hist.periods}


def calibrate_transitions(
    history_rows: list[dict] | None = None,
    calendar: AcademicCalendar | None = None,
    *,
    max_period: str | None = None,
    alpha: float = TRANSITION_SHRINKAGE_ALPHA,
) -> TransitionRateTable:
    """
    Calibrate edge transition rates from historical period pairs.
    If max_period is set, only pairs with target < max_period are used (for backtest).
    """
    cal = calendar or build_calendar()
    stats = aggregate_history_rows(history_rows or load_history_rows())
    history_by_offer = {code: s for code, s in stats.items()}

    edge_acc: dict[tuple[str, str, str, EdgeType], RateAccumulator] = defaultdict(RateAccumulator)
    type_acc: dict[EdgeType, RateAccumulator] = defaultdict(RateAccumulator)
    summer_acc: dict[str, RateAccumulator] = defaultdict(RateAccumulator)

    regular_codes = [c for c in cal.regular_codes() if not max_period or c < max_period]

    for curriculum_id, data in iter_curricula():
        courses = data.get("courses", [])
        if not courses:
            continue
        graph = build_curriculum_graph(courses)

        for course in courses:
            to_id = course["id"]
            to_offer = normalize_course_code(to_id)
            to_cupo = _cupo_by_period(history_by_offer, to_offer)

            for expr in course.get("prerequisites") or []:
                for from_id in parse_prereq_group(expr):
                    if from_id not in graph.nodes:
                        continue
                    from_offer = normalize_course_code(from_id)
                    from_cupo = _cupo_by_period(history_by_offer, from_offer)
                    et = classify_edge_type(graph, from_id, to_id)
                    delta = semester_delta(graph, from_id, to_id)

                    for src_period in regular_codes:
                        tgt_period = cal.advance_regular(src_period, delta)
                        if not tgt_period:
                            continue
                        if max_period and tgt_period >= max_period:
                            continue
                        src_students = from_cupo.get(src_period, 0)
                        tgt_students = to_cupo.get(tgt_period, 0)
                        if src_students <= 0:
                            continue

                        key = (from_id, to_id, curriculum_id, et)
                        edge_acc[key].source_students += src_students
                        edge_acc[key].target_students += tgt_students
                        edge_acc[key].n_pairs += 1
                        type_acc[et].source_students += src_students
                        type_acc[et].target_students += tgt_students
                        type_acc[et].n_pairs += 1

                    # Summer → next regular_10 for target course
                    for reg_code in regular_codes:
                        if cal.get(reg_code) and cal.get(reg_code).kind != "regular_10":  # type: ignore[union-attr]
                            continue
                        summer_code = cal.summer_before_regular(reg_code)
                        if not summer_code:
                            continue
                        if max_period and reg_code >= max_period:
                            continue
                        src_students = from_cupo.get(summer_code, 0)
                        tgt_students = to_cupo.get(reg_code, 0)
                        if src_students <= 0:
                            continue
                        summer_acc[from_offer].source_students += src_students
                        summer_acc[from_offer].target_students += tgt_students
                        summer_acc[from_offer].n_pairs += 1

    table = TransitionRateTable(
        generated_at=datetime.now(timezone.utc).isoformat(),
        version=1,
    )

    for (from_id, to_id, curriculum_id, et), acc in edge_acc.items():
        prior = PRIOR_BY_TYPE.get(et, P_OTHER)
        p = _shrink_rate(acc.target_students, acc.source_students, prior, alpha)
        table.by_edge[(from_id, to_id)] = TransitionRateEntry(
            from_id=from_id,
            to_id=to_id,
            edge_type=et,
            p=p,
            prior=prior,
            n_pairs=acc.n_pairs,
            source_students=acc.source_students,
            target_students=acc.target_students,
            curriculum_id=curriculum_id,
        )

    for et, acc in type_acc.items():
        prior = PRIOR_BY_TYPE.get(et, P_OTHER)
        p = _shrink_rate(acc.target_students, acc.source_students, prior, alpha)
        table.by_type[et] = TransitionRateEntry(
            from_id="*",
            to_id="*",
            edge_type=et,
            p=p,
            prior=prior,
            n_pairs=acc.n_pairs,
            source_students=acc.source_students,
            target_students=acc.target_students,
        )

    for offer, acc in summer_acc.items():
        if acc.source_students > 0:
            raw = acc.target_students / acc.source_students
            table.summer_rates[offer] = round(
                max(TRANSITION_RATE_MIN, min(TRANSITION_RATE_MAX, raw)), 4
            )

    return table


def save_transition_rates(
    table: TransitionRateTable,
    path: Path | None = None,
    public_path: Path | None = None,
) -> tuple[Path, Path]:
    dest = path or TRANSITION_RATES_JSON
    pub = public_path or PUBLIC_TRANSITION_RATES_JSON
    dest.parent.mkdir(parents=True, exist_ok=True)
    pub.parent.mkdir(parents=True, exist_ok=True)
    payload = table.to_payload()
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    with open(pub, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    return dest, pub


if __name__ == "__main__":
    table = calibrate_transitions()
    out, pub = save_transition_rates(table)
    print(f"Calibrated {len(table.by_edge)} edges, {len(table.by_type)} types → {out}")
    print(f"Public copy → {pub}")
