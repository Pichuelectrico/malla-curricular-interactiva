#!/usr/bin/env python3
"""Train demand model and save artifact."""

import argparse
import json
import pickle

from config import OUTPUT_DIR
from data.export import export_all
from eval.backtest import run_backtest, save_backtest_report
from features.build import build_feature_frame
from features.transition_calibration import calibrate_transitions, save_transition_rates
from models.demand import apply_model, save_dashboard_index, save_predictions, train_demand_model


def main() -> None:
    parser = argparse.ArgumentParser(description="Train course demand predictor")
    parser.add_argument("--faculty", help="Filter by faculty code, e.g. CMP")
    parser.add_argument("--skip-export", action="store_true")
    parser.add_argument("--skip-backtest", action="store_true")
    parser.add_argument("--skip-calibration", action="store_true")
    args = parser.parse_args()

    if not args.skip_export:
        export_all()

    if not args.skip_calibration:
        rates = calibrate_transitions()
        cal_path, pub_path = save_transition_rates(rates)
        print(f"Transition rates → {cal_path} (public: {pub_path})")
    else:
        rates = None

    if not args.skip_backtest:
        report = run_backtest()
        bt_path = save_backtest_report(report)
        print(f"Backtest summary: {json.dumps(report.get('summary', {}))}")
        print(f"Backtest report → {bt_path}")

    features = build_feature_frame(faculty=args.faculty, rates=rates)
    model = train_demand_model(features)
    result = apply_model(features, model, prefer_gbr=True)

    model_path = OUTPUT_DIR / "model.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(model, f)

    out = save_predictions(result)
    dash = save_dashboard_index(result)

    print(f"Saved {len(result)} predictions → {out}")
    print(f"Dashboard index → {dash}")
    print(f"Target period: {features.attrs.get('target_period_label', '?')}")
    print(f"Model artifact → {model_path} ({'hybrid+gbr' if model else 'hybrid only'})")

    if args.faculty and len(result):
        sample = result.nlargest(5, "estimated_students")[
            ["offer_code", "estimated_students", "suggested_sections", "inflow_from_history", "trend", "model"]
        ]
        print(f"\nTop 5 {args.faculty} by estimated_students:\n{sample.to_string(index=False)}")


if __name__ == "__main__":
    main()
