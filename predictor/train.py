#!/usr/bin/env python3
"""Production pipeline (model enrollment-proxy-v4): export → transition rates → backtest → coverage → dashboard.

Demand proxy = total - available per Teoría NRC (never `total` alone). Estimator core = 75% same-season
enrollment + 25% previous semester, lightly adjusted by planned/cursando signals. No transition calibration
in the estimator and no GBR in the output (legacy modules remain but are unused).
"""

import argparse
import json

import numpy as np

from config import OUTPUT_DIR, PUBLIC_DASHBOARD_JSON
from coverage import (
    MODEL_NAME, build_dashboard, enrollment_by_period, history_backtest, load, run_coverage, save_coverage,
)
from data.export import export_all
from features.transition_calibration import calibrate_transitions, save_transition_rates


def backtest_report(skip: bool) -> dict:
    path = OUTPUT_DIR / "backtest_report.json"
    if skip and path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    hb = history_backtest(enrollment_by_period(load("course_offer_history.json")))
    prod, naive = "mezcla_75estacion_25anterior", "naive_semestre_anterior"
    mean = lambda k: round(float(np.mean([r["models"][k]["mae"] for r in hb])), 2)  # noqa: E731
    report = {
        "model": MODEL_NAME, "truth": "matricula_proxy(total-available), Teoría, codigos unificados sufijo E",
        "holdout_periods": [r["target"] for r in hb], "results": hb,
        "summary": {
            "avg_mae_modelo_produccion": mean(prod), "avg_mae_baseline_semestre_anterior": mean(naive),
            "avg_mae_baseline_misma_estacion": mean("naive_misma_estacion"),
            "avg_mae_capacidad_publicada_como_prediccion": mean("capacidad_publicada_del_periodo"),
            "modelo": prod, "baseline": naive,
            "mejora_vs_baseline_pct": round((mean(naive) - mean(prod)) / mean(naive) * 100, 1),
        },
        "notas": ["La calibración de transiciones y el GBR fueron retirados del estimador (empeoraban / no aportaban vs baseline).",
                  "Backtest solo-historia: no evalúa el ajuste por señales (muestra de progreso sin etiquetas pasadas)."],
    }
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report


def run(skip_export: bool, skip_backtest: bool, skip_calibration: bool) -> None:
    if not skip_export:
        export_all()
    if not skip_calibration:
        cal, pub = save_transition_rates(calibrate_transitions())
        print(f"Transition rates (enrollment proxy) → {cal} (public: {pub})")
    bt = backtest_report(skip_backtest)
    print(f"Backtest summary: {json.dumps(bt.get('summary', {}))}")
    rep = run_coverage(skip_model_eval=True, hb=bt.get("results"))
    save_coverage(rep)
    flat = [{k: v for k, v in m.items() if k != "historia"} | {"historia": m.get("historia")} for m in rep["materias"]]
    (OUTPUT_DIR / "predictions.json").write_text(json.dumps(flat, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    dash = build_dashboard(rep, bt.get("summary"))
    PUBLIC_DASHBOARD_JSON.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_DASHBOARD_JSON.write_text(json.dumps(dash, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    print(f"Saved {len(flat)} canonical courses → predictions.json, coverage_202620.json; dashboard → {PUBLIC_DASHBOARD_JSON}"
          f" ({len(dash['by_offer_code'])} keys incl. E aliases)")
    print(f"Classes: {rep['agregado_materias_con_base']['por_clasificacion']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Train/run production demand model")
    parser.add_argument("--skip-export", action="store_true")
    parser.add_argument("--skip-backtest", action="store_true")
    parser.add_argument("--skip-calibration", action="store_true", help="Do not regenerate transition_rates.json")
    args = parser.parse_args()
    run(args.skip_export, args.skip_backtest, args.skip_calibration)


if __name__ == "__main__":
    main()
