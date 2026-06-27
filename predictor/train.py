#!/usr/bin/env python3
"""Train demand model and save artifact."""

import argparse
import pickle

from config import OUTPUT_DIR
from data.export import export_all
from features.build import build_feature_frame, load_history_agg
from models.demand import apply_model, train_demand_model


def main() -> None:
    parser = argparse.ArgumentParser(description="Train course demand predictor")
    parser.add_argument("--faculty", help="Filter by faculty code, e.g. CMP")
    parser.add_argument("--skip-export", action="store_true")
    args = parser.parse_args()

    if not args.skip_export:
        export_all()

    features = build_feature_frame(faculty=args.faculty)
    history = load_history_agg()
    model = train_demand_model(features, history)

    result = apply_model(features, model)
    model_path = OUTPUT_DIR / "model.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(model, f)

    from models.demand import save_predictions
    out = save_predictions(result)
    print(f"Saved {len(result)} predictions → {out}")
    print(f"Model artifact → {model_path} ({'trained' if model else 'baseline only'})")


if __name__ == "__main__":
    main()
