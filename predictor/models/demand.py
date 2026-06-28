"""Demand prediction models (hybrid formula + optional sklearn GBR)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split

from config import OUTPUT_DIR, PUBLIC_DASHBOARD_JSON


def train_demand_model(features: pd.DataFrame) -> GradientBoostingRegressor | None:
    """
    Optional GBR refinement on estimated_students when enough labeled history exists.
    Primary output remains the hybrid formula (model='hybrid').
    """
    labeled = features[features["num_periods"] > 0].copy()
    if len(labeled) < 20:
        return None

    feature_cols = [
        "planned_count",
        "in_progress_count",
        "inflow_from_history",
        "inflow_from_cursando",
        "estimated_next_students",
        "avg_students",
        "in_degree",
        "out_degree",
        "semester",
        "credits",
        "num_periods",
    ]
    X = labeled[feature_cols].fillna(0)
    y = labeled["estimated_students"].fillna(0)

    if y.nunique() < 2:
        return None

    X_train, _, y_train, _ = train_test_split(X, y, test_size=0.2, random_state=42)
    model = GradientBoostingRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    return model


def apply_model(
    features: pd.DataFrame,
    model: GradientBoostingRegressor | None,
) -> pd.DataFrame:
    out = features.copy()
    out["model"] = "hybrid"
    out["predicted_seats"] = out["estimated_students"]
    out["predicted_sections"] = out["suggested_sections"]

    if model is None:
        return out

    has_history = out["num_periods"].fillna(0) > 0
    if not has_history.any():
        return out

    feature_cols = [
        "planned_count",
        "in_progress_count",
        "inflow_from_history",
        "inflow_from_cursando",
        "estimated_next_students",
        "avg_students",
        "in_degree",
        "out_degree",
        "semester",
        "credits",
        "num_periods",
    ]
    X = out.loc[has_history, feature_cols].fillna(0)
    preds = np.clip(model.predict(X), 1, None)
    out.loc[has_history, "gbr_estimated_students"] = np.round(preds).astype(int)
    out.loc[has_history, "gbr_suggested_sections"] = np.maximum(
        1, np.round(out.loc[has_history, "gbr_estimated_students"] / 25).astype(int)
    )
    out.loc[has_history, "model"] = "hybrid+gbr"

    return out


def save_predictions(df: pd.DataFrame, path: Path | None = None) -> Path:
    dest = path or OUTPUT_DIR / "predictions.json"
    records = df.to_dict(orient="records")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, default=str)
    return dest


def save_dashboard_index(df: pd.DataFrame, path: Path | None = None) -> Path:
    """Compact index for the webapp Python model tab."""
    dest = path or PUBLIC_DASHBOARD_JSON
    dest.parent.mkdir(parents=True, exist_ok=True)

    by_offer: dict[str, dict] = {}
    by_faculty: dict[str, list[str]] = {}

    for row in df.to_dict(orient="records"):
        offer = str(row.get("offer_code", ""))
        fac = str(row.get("faculty") or "")
        use_gbr = (
            row.get("model") == "hybrid+gbr"
            and row.get("gbr_estimated_students") is not None
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
            "trend": row.get("trend", "stable"),
            "inflow_from_history": float(row.get("inflow_from_history") or 0),
            "inflow_from_cursando": float(row.get("inflow_from_cursando") or 0),
            "planned_count": int(row.get("planned_count") or 0),
            "in_progress_count": int(row.get("in_progress_count") or 0),
            "model": "hybrid",
            "gbr_available": use_gbr,
        }
        by_offer[offer] = entry
        if fac:
            by_faculty.setdefault(fac, []).append(offer)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "version": 2,
        "by_offer_code": by_offer,
        "by_faculty": by_faculty,
    }

    with open(dest, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, default=str)

    return dest
