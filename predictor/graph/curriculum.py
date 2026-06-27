"""Load curriculum JSON files and build prerequisite graphs."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Iterator

import networkx as nx

from config import CURRICULA_DIR


def iter_curricula(directory: Path | None = None) -> Iterator[tuple[str, dict]]:
    base = directory or CURRICULA_DIR
    for path in sorted(base.glob("Malla-*.json")):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        curriculum_id = data.get("source_file") or path.stem
        yield curriculum_id, data


def parse_prereq_group(expr: str) -> list[str]:
    """Split 'MAT1201 || MAT1301' into course IDs."""
    return [p.strip() for p in expr.split("||") if p.strip()]


def build_graph(courses: list[dict]) -> nx.DiGraph:
    """
    Build a directed graph: edge prereq -> course.
    OR groups become edges from each alternative prerequisite.
    """
    g = nx.DiGraph()
    course_ids = {c["id"] for c in courses}

    for course in courses:
        cid = course["id"]
        g.add_node(cid, **{
            "code": course.get("code", cid),
            "credits": course.get("credits", 0),
            "semester": course.get("semester", 0),
            "type": course.get("type", ""),
            "area": course.get("area", cid[:3]),
        })
        for prereq_expr in course.get("prerequisites", []):
            for prereq in parse_prereq_group(prereq_expr):
                if prereq in course_ids:
                    g.add_edge(prereq, cid)

    return g


def graph_features(g: nx.DiGraph) -> dict[str, dict]:
    """Per-course graph metrics."""
    features: dict[str, dict] = {}
    for node in g.nodes:
        features[node] = {
            "in_degree": g.in_degree(node),
            "out_degree": g.out_degree(node),
            "semester": g.nodes[node].get("semester", 0),
            "credits": g.nodes[node].get("credits", 0),
            "unlocks_count": g.out_degree(node),
        }
    return features


def faculty_from_curriculum_id(curriculum_id: str) -> str | None:
    match = re.search(r"Malla-(?:academica-)?([A-Z]{3})", curriculum_id, re.I)
    return match.group(1).upper() if match else None
