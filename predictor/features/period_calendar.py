"""USFQ academic period calendar — shared logic for calibration and prediction."""

from __future__ import annotations

import json
from enum import Enum
from pathlib import Path
from typing import Literal

from config import REPO_ROOT

PeriodKind = Literal["regular_10", "regular_20", "summer", "medical_year", "unknown"]


class PeriodInfo:
    __slots__ = ("code", "label", "kind", "year", "suffix")

    def __init__(self, code: str, label: str = "") -> None:
        self.code = str(code)
        self.label = label or self.code
        self.suffix = self.code[-2:] if len(self.code) >= 2 else ""
        self.year = int(self.code[:4]) if len(self.code) >= 4 and self.code[:4].isdigit() else 0
        self.kind = classify_period_kind(self.code)

    def __repr__(self) -> str:
        return f"PeriodInfo({self.code!r}, {self.kind})"


def classify_period_kind(period_code: str) -> PeriodKind:
    code = str(period_code)
    if len(code) < 2:
        return "unknown"
    suffix = code[-2:]
    if suffix == "30":
        return "summer"
    if suffix in ("10", "20"):
        return "regular_10" if suffix == "10" else "regular_20"
    if suffix in ("08", "13", "23", "03"):
        return "medical_year"
    return "unknown"


def is_regular(kind: PeriodKind) -> bool:
    return kind in ("regular_10", "regular_20")


def is_summer_period(period_code: str) -> bool:
    return classify_period_kind(period_code) == "summer"


def is_medical_period(period_code: str) -> bool:
    return classify_period_kind(period_code) == "medical_year"


def _default_periods_path() -> Path:
    return REPO_ROOT / "offer-scraper" / "periods.json"


def load_period_catalog(path: Path | None = None) -> list[PeriodInfo]:
    p = path or _default_periods_path()
    if not p.exists():
        return []
    with open(p, encoding="utf-8") as f:
        raw = json.load(f)
    return [PeriodInfo(row["code"], row.get("label", "")) for row in raw]


def build_calendar(catalog: list[PeriodInfo] | None = None) -> "AcademicCalendar":
    return AcademicCalendar(catalog or load_period_catalog())


class AcademicCalendar:
    """Ordered USFQ periods (newest first in catalog file)."""

    def __init__(self, catalog: list[PeriodInfo]) -> None:
        self._by_code: dict[str, PeriodInfo] = {p.code: p for p in catalog}
        # Chronological order (oldest → newest)
        self._chrono: list[PeriodInfo] = sorted(catalog, key=lambda p: p.code)
        self._regular: list[PeriodInfo] = [p for p in self._chrono if is_regular(p.kind)]
        self._summers: list[PeriodInfo] = [p for p in self._chrono if p.kind == "summer"]

    def get(self, code: str) -> PeriodInfo | None:
        return self._by_code.get(code)

    def all_codes(self) -> list[str]:
        return [p.code for p in self._chrono]

    def regular_codes(self) -> list[str]:
        return [p.code for p in self._regular]

    def codes_before(self, target_code: str, *, include_target: bool = False) -> list[str]:
        codes = self.all_codes()
        if target_code not in self._by_code:
            return codes
        idx = codes.index(target_code)
        end = idx + 1 if include_target else idx
        return codes[:end]

    def next_regular(self, from_code: str) -> str | None:
        """Next regular semester after from_code (skips summer/medical)."""
        codes = self.all_codes()
        if from_code not in self._by_code:
            return self._regular[-1].code if self._regular else None
        start = codes.index(from_code) + 1
        for code in codes[start:]:
            if is_regular(self._by_code[code].kind):
                return code
        return None

    def advance_regular(self, from_code: str, semester_delta: int) -> str | None:
        """
        Advance `semester_delta` regular semesters from `from_code`.
        semester_delta=1 → next regular (e.g. 202410→202420 or 202420→202510).
        semester_delta=2 → skip one regular (e.g. 202410→202510).
        """
        if semester_delta <= 0:
            return from_code if from_code in self._by_code else None
        current = from_code
        for _ in range(semester_delta):
            nxt = self.next_regular(current)
            if not nxt:
                return None
            current = nxt
        return current

    def summer_before_regular(self, regular_code: str) -> str | None:
        """Summer period immediately before a regular_10 (e.g. 202430 before 202510)."""
        codes = self.all_codes()
        if regular_code not in self._by_code:
            return None
        info = self._by_code[regular_code]
        if info.kind != "regular_10":
            return None
        idx = codes.index(regular_code)
        for i in range(idx - 1, -1, -1):
            if self._by_code[codes[i]].kind == "summer":
                return codes[i]
        return None

    def infer_target_period(self, current_period_code: str | None) -> tuple[str, str]:
        """
        Returns (target_period_code, target_period_label).
        If current is regular → next regular; if summer → next regular_10; else next regular after current.
        """
        if not self._chrono:
            return ("", "")
        if not current_period_code or current_period_code not in self._by_code:
            last_reg = self._regular[-1] if self._regular else self._chrono[-1]
            nxt = self.next_regular(last_reg.code) or last_reg.code
            tgt = self._by_code.get(nxt)
            return (nxt, tgt.label if tgt else nxt)

        kind = self._by_code[current_period_code].kind
        if kind == "summer":
            nxt = self.next_regular(current_period_code)
        elif is_regular(kind):
            nxt = self.next_regular(current_period_code)
        else:
            nxt = self.next_regular(current_period_code)

        if not nxt:
            nxt = self._regular[-1].code if self._regular else current_period_code
        tgt = self._by_code.get(nxt)
        return (nxt, tgt.label if tgt else nxt)

    def seed_period_for_target(self, target_code: str) -> str | None:
        """Period whose enrollment seeds prediction for target_code."""
        if target_code not in self._by_code:
            return self._regular[-1].code if self._regular else None
        codes = self.all_codes()
        idx = codes.index(target_code)
        if idx == 0:
            return None
        return codes[idx - 1]
