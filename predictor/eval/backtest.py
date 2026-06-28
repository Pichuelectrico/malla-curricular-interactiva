"""Backtest demand predictor: fixed vs calibrated transition rates."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from config import OUTPUT_DIR
from features.build import build_feature_frame
from features.history_stats import load_history_rows
from features.period_calendar import build_calendar
from features.transition_calibration import calibrate_transitions, save_transition_rates


def _mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    if len(y_true) == 0:
        return 0.0
    return float(np.mean(np.abs(y_true - y_pred)))


def _mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    mask = y_true > 0
    if not mask.any():
        return 0.0
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)


def _section_error(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    if len(y_true) == 0:
        return 0.0
    true_sec = np.maximum(1, np.round(y_true / 25))
    pred_sec = np.maximum(1, np.round(y_pred / 25))
    return float(np.mean(np.abs(true_sec - pred_sec)))


def run_backtest(
    holdout_periods: list[str] | None = None,
    history_path: Path | None = None,
) -> dict:
    cal = build_calendar()
    rows = load_history_rows(history_path)
    if not rows:
        return {"error": "no history", "periods": []}

    if holdout_periods is None:
        holdout_periods = [c for c in cal.regular_codes() if c >= "202510"]

    results: list[dict] = []

    for target in holdout_periods:
        train_rows = [
            r for r in rows
            if (r.get("period_code") or r.get("period") or "") < target
        ]

        rates = calibrate_transitions(train_rows, cal, max_period=target)

        fixed_df = build_feature_frame(
            use_calibrated_rates=False,
            target_period_code=target,
            history_rows=train_rows,
        )
        cal_df = build_feature_frame(
            rates=rates,
            target_period_code=target,
            history_rows=train_rows,
        )

        # Actuals at target from full history
        actual_map: dict[str, int] = {}
        for r in rows:
            if r.get("type") != "Teoría":
                continue
            pc = r.get("period_code") or r.get("period") or ""
            if pc != target:
                continue
            from features.codes import normalize_course_code

            code = normalize_course_code(str(r.get("course_code", "")))
            actual_map[code] = actual_map.get(code, 0) + int(float(r.get("total") or 0))

        if not actual_map:
            continue

        eval_codes = [c for c in actual_map if actual_map[c] > 0]
        y_true = np.array([actual_map[c] for c in eval_codes])

        fixed_preds = []
        cal_preds = []
        for code in eval_codes:
            fr = fixed_df[fixed_df["offer_code"] == code]
            cr = cal_df[cal_df["offer_code"] == code]
            fixed_preds.append(int(fr["estimated_students"].iloc[0]) if len(fr) else 0)
            cal_preds.append(int(cr["estimated_students"].iloc[0]) if len(cr) else 0)

        y_fixed = np.array(fixed_preds)
        y_cal = np.array(cal_preds)

        mac_mask = np.array([c.startswith("MAC") for c in eval_codes])
        result = {
            "target_period": target,
            "n_courses": len(eval_codes),
            "fixed": {
                "mae": round(_mae(y_true, y_fixed), 2),
                "mape": round(_mape(y_true, y_fixed), 2),
                "section_mae": round(_section_error(y_true, y_fixed), 2),
            },
            "calibrated": {
                "mae": round(_mae(y_true, y_cal), 2),
                "mape": round(_mape(y_true, y_cal), 2),
                "section_mae": round(_section_error(y_true, y_cal), 2),
            },
        }
        if mac_mask.any():
            result["mac_subset"] = {
                "n": int(mac_mask.sum()),
                "fixed_mae": round(_mae(y_true[mac_mask], y_fixed[mac_mask]), 2),
                "calibrated_mae": round(_mae(y_true[mac_mask], y_cal[mac_mask]), 2),
            }
        results.append(result)

    report = {
        "holdout_periods": holdout_periods,
        "results": results,
        "summary": _summarize(results),
    }
    return report


def _summarize(results: list[dict]) -> dict:
    if not results:
        return {}
    fixed_maes = [r["fixed"]["mae"] for r in results]
    cal_maes = [r["calibrated"]["mae"] for r in results]
    avg_fixed = sum(fixed_maes) / len(fixed_maes)
    avg_cal = sum(cal_maes) / len(cal_maes)
    improvement = (avg_fixed - avg_cal) / avg_fixed * 100 if avg_fixed > 0 else 0
    return {
        "avg_mae_fixed": round(avg_fixed, 2),
        "avg_mae_calibrated": round(avg_cal, 2),
        "mae_improvement_pct": round(improvement, 2),
    }


def save_backtest_report(report: dict, path: Path | None = None) -> Path:
    dest = path or OUTPUT_DIR / "backtest_report.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    return dest


if __name__ == "__main__":
    report = run_backtest()
    out = save_backtest_report(report)
    print(json.dumps(report.get("summary", {}), indent=2))
    print(f"Report → {out}")
