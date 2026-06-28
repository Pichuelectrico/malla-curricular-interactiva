#!/usr/bin/env python3
"""Train demand model and save artifact."""

import argparse
import pickle

from config import OUTPUT_DIR
from data.export import export_all
from features.build import build_feature_frame
from models.demand import apply_model, save_dashboard_index, save_predictions, train_demand_model


def main() -> None:
    parser = argparse.ArgumentParser(description="Train course demand predictor")
    parser.add_argument("--faculty", help="Filter by faculty code, e.g. CMP")
    parser.add_argument("--skip-export", action="store_true")
    args = parser.parse_args()

    if not args.skip_export:
        export_all()

    features = build_feature_frame(faculty=args.faculty)
    model = train_demand_model(features)
    result = apply_model(features, model)

    model_path = OUTPUT_DIR / "model.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(model, f)

    out = save_predictions(result)
    dash = save_dashboard_index(result)

    print(f"Saved {len(result)} predictions → {out}")
    print(f"Dashboard index → {dash}")
    print(f"Model artifact → {model_path} ({'hybrid+gbr' if model else 'hybrid only'})")

    if args.faculty and len(result):
        sample = result.nlargest(5, "estimated_students")[
            ["offer_code", "estimated_students", "suggested_sections", "inflow_from_history", "trend", "model"]
        ]
        print(f"\nTop 5 {args.faculty} by estimated_students:\n{sample.to_string(index=False)}")


if __name__ == "__main__":
    main()
