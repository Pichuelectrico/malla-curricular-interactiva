"""Course code normalization — aligned with frontend/lib/offerMatching.ts."""

from __future__ import annotations

import re

_COURSE_CODE_RE = re.compile(r"^([A-Z]{2,5})-?(\d.*)$")


def normalize_course_code(code: str) -> str:
    raw = code.strip().upper().replace(" ", "-")
    if re.match(r"^[A-Z]{2,5}-\d", raw):
        return raw
    bare = raw.replace("-", "")
    match = _COURSE_CODE_RE.match(bare)
    if match:
        return f"{match.group(1)}-{match.group(2)}"
    return raw


_E_SUFFIX = re.compile(r"(?<=\d)E$")


def canonical_course_code(code: str) -> str:
    """Normalized code without trailing 'E' (CMP-5006E == CMP-5006), for demand aggregation.

    Mirrors the frontend's matching (exact first, then base-without-E); aggregation keys use the base.
    """
    return _E_SUFFIX.sub("", normalize_course_code(code))
