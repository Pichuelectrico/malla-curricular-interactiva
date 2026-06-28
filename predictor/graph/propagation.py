"""DAG demand propagation — mirrors frontend/lib/curriculumGraph.ts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from config import MAX_DAG_HOPS, MIN_DAG_FLOW, P_OTHER, P_SAME_AREA, P_SEQUENTIAL
from features.codes import normalize_course_code
from graph.curriculum import parse_prereq_group

if TYPE_CHECKING:
    from features.transition_calibration import TransitionRateTable


@dataclass
class CurriculumGraph:
    nodes: dict[str, dict]
    successors: dict[str, list[str]] = field(default_factory=dict)
    prerequisites: dict[str, list[str]] = field(default_factory=dict)


def build_curriculum_graph(courses: list[dict]) -> CurriculumGraph:
    ids = {c["id"] for c in courses}
    nodes = {c["id"]: c for c in courses}
    successors: dict[str, list[str]] = {cid: [] for cid in ids}
    prerequisites: dict[str, list[str]] = {}

    for course in courses:
        cid = course["id"]
        prereq_exprs = course.get("prerequisites") or []
        prerequisites[cid] = list(prereq_exprs)
        for expr in prereq_exprs:
            for prereq in parse_prereq_group(expr):
                if prereq not in ids:
                    continue
                successors.setdefault(prereq, []).append(cid)

    return CurriculumGraph(nodes=nodes, successors=successors, prerequisites=prerequisites)


def _is_direct_prerequisite(graph: CurriculumGraph, from_id: str, to_id: str) -> bool:
    for expr in graph.prerequisites.get(to_id, []):
        if from_id in parse_prereq_group(expr):
            return True
    return False


def _is_primary_successor(graph: CurriculumGraph, from_id: str, to_id: str) -> bool:
    from_c = graph.nodes.get(from_id)
    to_c = graph.nodes.get(to_id)
    if not from_c or not to_c:
        return False
    if from_c.get("area") != to_c.get("area"):
        return False
    if to_c.get("semester", 0) != from_c.get("semester", 0) + 1:
        return False

    same_area_next = [
        sid
        for sid in graph.successors.get(from_id, [])
        if (n := graph.nodes.get(sid))
        and n.get("area") == from_c.get("area")
        and n.get("semester", 0) == from_c.get("semester", 0) + 1
    ]
    if len(same_area_next) == 1:
        return same_area_next[0] == to_id
    return to_id in same_area_next


def default_transition_probability(graph: CurriculumGraph, from_id: str, to_id: str) -> float:
    """Fixed priors (80/50/25) — fallback when no calibration data."""
    if from_id not in graph.nodes or to_id not in graph.nodes:
        return P_OTHER
    if _is_primary_successor(graph, from_id, to_id):
        return P_SEQUENTIAL
    if _is_direct_prerequisite(graph, from_id, to_id):
        return P_SAME_AREA
    from_c = graph.nodes[from_id]
    to_c = graph.nodes[to_id]
    if from_c.get("area") == to_c.get("area"):
        return P_SAME_AREA
    return P_OTHER


def transition_probability(
    graph: CurriculumGraph,
    from_id: str,
    to_id: str,
    rates: TransitionRateTable | None = None,
) -> float:
    if rates is not None:
        from features.transition_calibration import classify_edge_type

        et = classify_edge_type(graph, from_id, to_id)
        calibrated = rates.lookup(from_id, to_id, et)
        if calibrated is not None:
            return calibrated
    return default_transition_probability(graph, from_id, to_id)


def _propagate_inflow(
    graph: CurriculumGraph,
    seeds_by_course_id: dict[str, float],
    max_hops: int = MAX_DAG_HOPS,
    rates: TransitionRateTable | None = None,
) -> dict[str, float]:
    inflow: dict[str, float] = {}
    queue: list[tuple[str, float, int]] = []

    for course_id, course in graph.nodes.items():
        prereq_exprs = graph.prerequisites.get(course_id, [])
        if not prereq_exprs:
            continue

        direct_total = 0.0
        for expr in prereq_exprs:
            group = parse_prereq_group(expr)
            group_max = 0.0
            for prereq_id in group:
                seed = seeds_by_course_id.get(prereq_id, 0.0)
                if seed <= 0:
                    continue
                transferred = seed * transition_probability(graph, prereq_id, course_id, rates)
                group_max = max(group_max, transferred)
            direct_total += group_max

        if direct_total < MIN_DAG_FLOW:
            continue
        inflow[course_id] = inflow.get(course_id, 0.0) + direct_total
        queue.append((course_id, direct_total, 1))

    while queue:
        node_id, students, depth = queue.pop(0)
        if depth >= max_hops:
            continue
        for succ_id in graph.successors.get(node_id, []):
            transferred = students * transition_probability(graph, node_id, succ_id, rates)
            if transferred < MIN_DAG_FLOW:
                continue
            inflow[succ_id] = inflow.get(succ_id, 0.0) + transferred
            queue.append((succ_id, transferred, depth + 1))

    return inflow


def build_historical_seeds(
    courses: list[dict],
    history_by_offer: dict,
) -> dict[str, float]:
    seeds: dict[str, float] = {}
    for course in courses:
        offer = normalize_course_code(course["id"])
        hist = history_by_offer.get(offer)
        if hist and hist.last_regular_students > 0:
            seeds[course["id"]] = float(hist.last_regular_students)
    return seeds


def propagate_demand_from_sources(
    graph: CurriculumGraph,
    history_seeds: dict[str, float],
    cursando_seeds: dict[str, float],
    max_hops: int = MAX_DAG_HOPS,
    rates: TransitionRateTable | None = None,
) -> tuple[dict[str, float], dict[str, float], dict[str, float]]:
    inflow_hist = _propagate_inflow(graph, history_seeds, max_hops, rates)
    inflow_curs = _propagate_inflow(graph, cursando_seeds, max_hops, rates)
    total: dict[str, float] = {}
    for key in set(inflow_hist) | set(inflow_curs):
        total[key] = inflow_hist.get(key, 0.0) + inflow_curs.get(key, 0.0)
    return inflow_hist, inflow_curs, total
