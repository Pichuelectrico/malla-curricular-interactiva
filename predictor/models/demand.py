"""Demand prediction models (hybrid formula + optional sklearn GBR)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor

from config import OUTPUT_DIR, PUBLIC_DASHBOARD_JSON, STUDENTS_PER_SECTION


FEATURE_COLS = [
    "planned_count",
    "in_progress_count",
    "inflow_from_history",
    "inflow_from_cursando",
    "estimated_next_students",
    "avg_students",
    "last_regular_students",
    "summer_to_regular_rate",
    "in_degree",
    "out_degree",
    "semester",
    "credits",
    "num_periods",
]


def train_demand_model(features: pd.DataFrame) -> GradientBoostingRegressor | None:
    """
    GBR on actual enrollment at target period when available.
    Falls back to hybrid estimate as pseudo-label when actual is missing.
    """
    labeled = features[features["num_periods"] > 0].copy()
    if len(labeled) < 20:
        return None

    if "actual_students_at_target" in labeled.columns:
        has_actual = labeled["actual_students_at_target"].fillna(0) > 0
        if has_actual.sum() >= 20:
            train_df = labeled[has_actual].copy()
            y = train_df["actual_students_at_target"].fillna(0)
        else:
            train_df = labeled
            y = labeled["estimated_students"].fillna(0)
    else:
        train_df = labeled
        y = labeled["estimated_students"].fillna(0)

    X = train_df[FEATURE_COLS].fillna(0)

    if y.nunique() < 2:
        return None

    # Temporal split: last 20% by target period when possible
    if "target_period_code" in train_df.columns and train_df["target_period_code"].nunique() > 1:
        sorted_df = train_df.sort_values("target_period_code")
        split_idx = max(1, int(len(sorted_df) * 0.8))
        X_train = X.iloc[:split_idx]
        y_train = y.iloc[:split_idx]
    else:
        X_train = X
        y_train = y

    model = GradientBoostingRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    return model


def apply_model(
    features: pd.DataFrame,
    model: GradientBoostingRegressor | None,
    *,
    prefer_gbr: bool = True,
) -> pd.DataFrame:
    out = features.copy()
    out["model"] = "hybrid"
    out["predicted_seats"] = out["estimated_students"]
    out["predicted_sections"] = out["suggested_sections"]
    out["gbr_available"] = False

    if model is None:
        return out

    has_history = out["num_periods"].fillna(0) > 0
    if not has_history.any():
        return out

    X = out.loc[has_history, FEATURE_COLS].fillna(0)
    preds = np.clip(model.predict(X), 1, None)
    out.loc[has_history, "gbr_estimated_students"] = np.round(preds).astype(int)
    out.loc[has_history, "gbr_suggested_sections"] = np.maximum(
        1,
        np.round(out.loc[has_history, "gbr_estimated_students"] / STUDENTS_PER_SECTION).astype(int),
    )
    out.loc[has_history, "gbr_available"] = True
    out.loc[has_history, "model"] = "hybrid+gbr"

    if prefer_gbr:
        mask = out["gbr_available"].fillna(False)
        out.loc[mask, "predicted_seats"] = out.loc[mask, "gbr_estimated_students"]
        out.loc[mask, "predicted_sections"] = out.loc[mask, "gbr_suggested_sections"]

    return out


def save_predictions(df: pd.DataFrame, path: Path | None = None) -> Path:
    dest = path or OUTPUT_DIR / "predictions.json"
    records = df.to_dict(orient="records")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, default=str)
    return dest


def save_dashboard_index(
    df: pd.DataFrame,
    path: Path | None = None,
    *,
    target_period_code: str = "",
    target_period_label: str = "",
    current_period_code: str = "",
) -> Path:
    """Compact index for the webapp Python model tab."""
    dest = path or PUBLIC_DASHBOARD_JSON
    dest.parent.mkdir(parents=True, exist_ok=True)

    target_period_code = target_period_code or df.attrs.get("target_period_code", "")
    target_period_label = target_period_label or df.attrs.get("target_period_label", "")
    current_period_code = current_period_code or df.attrs.get("current_period_code", "")

    by_offer: dict[str, dict] = {}
    by_faculty: dict[str, list[str]] = {}

    for row in df.to_dict(orient="records"):
        offer = str(row.get("offer_code", ""))
        fac = str(row.get("faculty") or "")
        use_gbr = bool(row.get("gbr_available")) and row.get("gbr_estimated_students") is not None

        primary_students = int(
            row.get("gbr_estimated_students") if use_gbr else row.get("estimated_students") or 0
        )
        primary_sections = int(
            row.get("gbr_suggested_sections") if use_gbr else row.get("suggested_sections") or 1
        )

        entry = {
            "offer_code": offer,
            "course_id": row.get("course_id"),
            "title": row.get("title", offer),
            "faculty": fac,
            "estimated_students": int(row.get("estimated_students") or 0),
            "suggested_sections": int(row.get("suggested_sections") or 1),
            "gbr_estimated_students": int(row.get("gbr_estimated_students") or 0) if use_gbr else None,
            "gbr_suggested_sections": int(row.get("gbr_suggested_sections") or 0) if use_gbr else None,
            "primary_students": primary_students,
            "primary_sections": primary_sections,
            "trend": row.get("trend", "stable"),
            "inflow_from_history": float(row.get("inflow_from_history") or 0),
            "inflow_from_cursando": float(row.get("inflow_from_cursando") or 0),
            "planned_count": int(row.get("planned_count") or 0),
            "in_progress_count": int(row.get("in_progress_count") or 0),
            "model": "hybrid+gbr" if use_gbr else "hybrid",
            "gbr_available": use_gbr,
        }
        by_offer[offer] = entry
        if fac:
            by_faculty.setdefault(fac, []).append(offer)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "version": 3,
        "target_period_code": target_period_code,
        "target_period_label": target_period_label,
        "current_period_code": current_period_code,
        "by_offer_code": by_offer,
        "by_faculty": by_faculty,
    }

    with open(dest, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, default=str)

    return dest
