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
