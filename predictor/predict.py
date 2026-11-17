#!/usr/bin/env python3
"""Regenerate predictions + dashboard with the production model (no re-backtest, no retraining)."""

import argparse

from train import run


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict course demand (enrollment-proxy-v4)")
    parser.add_argument("--skip-export", action="store_true")
    parser.add_argument("--recalibrate", action="store_true", help="Regenerate transition_rates.json")
    args = parser.parse_args()
    run(args.skip_export, skip_backtest=True, skip_calibration=not args.recalibrate)


if __name__ == "__main__":
    main()
