#!/usr/bin/env python3
"""Generate demand predictions JSON (hybrid formula + optional GBR)."""

import argparse
import pickle

from config import OUTPUT_DIR
from data.export import export_all
from features.build import build_feature_frame
from features.transition_calibration import calibrate_transitions, load_transition_rates, save_transition_rates
from models.demand import apply_model, save_dashboard_index, save_predictions


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict course demand")
    parser.add_argument("--faculty", help="Filter by faculty code, e.g. CMP")
    parser.add_argument("--skip-export", action="store_true")
    parser.add_argument("--recalibrate", action="store_true", help="Re-run transition calibration")
    args = parser.parse_args()

    if not args.skip_export:
        export_all()

    rates = load_transition_rates()
    if args.recalibrate or rates is None:
        rates = calibrate_transitions()
        save_transition_rates(rates)

    features = build_feature_frame(faculty=args.faculty, rates=rates)

    model = None
    model_path = OUTPUT_DIR / "model.pkl"
    if model_path.exists():
        with open(model_path, "rb") as f:
            model = pickle.load(f)

    result = apply_model(features, model, prefer_gbr=True)
    out = save_predictions(result)
    dash = save_dashboard_index(result)
    print(f"Wrote {len(result)} predictions → {out}")
    print(f"Dashboard index → {dash}")
    print(f"Target: {features.attrs.get('target_period_label', '?')}")


if __name__ == "__main__":
    main()
