#!/usr/bin/env python3
"""Generate demand predictions JSON (hybrid formula + optional GBR)."""

import argparse
import pickle

from config import OUTPUT_DIR
from data.export import export_all
from features.build import build_feature_frame
from models.demand import apply_model, save_dashboard_index, save_predictions


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict course demand")
    parser.add_argument("--faculty", help="Filter by faculty code, e.g. CMP")
    parser.add_argument("--skip-export", action="store_true")
    args = parser.parse_args()

    if not args.skip_export:
        export_all()

    features = build_feature_frame(faculty=args.faculty)

    model = None
    model_path = OUTPUT_DIR / "model.pkl"
    if model_path.exists():
        with open(model_path, "rb") as f:
            model = pickle.load(f)

    result = apply_model(features, model)
    out = save_predictions(result)
    dash = save_dashboard_index(result)
    print(f"Wrote {len(result)} predictions → {out}")
    print(f"Dashboard index → {dash}")


if __name__ == "__main__":
    main()
