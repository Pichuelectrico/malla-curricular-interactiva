"""Demand prediction models (baseline + optional sklearn regression)."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split

from config import OUTPUT_DIR
from features.build import baseline_prediction, load_history_agg


def train_demand_model(
    features: pd.DataFrame,
    history: pd.DataFrame,
) -> GradientBoostingRegressor | None:
    """
    Train on historical section counts when enough data exists.
    Target: max_total per course_code from history summary.
    """
    if history.empty or len(history) < 20:
        return None

    merged = features.merge(
        history[["course_code", "avg_total"]],
        left_on="course_id",
        right_on="course_code",
        how="inner",
    )
    if len(merged) < 20:
        return None

    X = merged[["planned_count", "in_degree", "out_degree", "semester", "credits", "num_periods"]].fillna(0)
    y = merged["avg_total"].fillna(0)

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
    if model is None:
        out["predicted_seats"] = out.apply(
            lambda r: baseline_prediction(r["planned_count"], r["avg_historical"]),
            axis=1,
        )
        out["model"] = "baseline"
        return out

    X = out[["planned_count", "in_degree", "out_degree", "semester", "credits", "num_periods"]].fillna(0)
    out["predicted_seats"] = model.predict(X).clip(lower=1).round().astype(int)
    out["model"] = "gbr"
    return out


def save_predictions(df: pd.DataFrame, path: Path | None = None) -> Path:
    dest = path or OUTPUT_DIR / "predictions.json"
    records = df.to_dict(orient="records")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, default=str)
    return dest
