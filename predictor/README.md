# Course demand predictor

Python tooling aligned with the webapp hybrid estimator (`demandPrediction.ts` + `curriculumGraph.ts`), with **empirical DAG transition calibration** and optional GBR on real enrollment.

## Setup

```bash
cd predictor
pip install -r requirements.txt
```

Set `SUPABASE_URL` and `SUPABASE_KEY` in `.env`.

## Usage

```bash
# Export Supabase + calibrate transitions + backtest + train + dashboard JSON
python train.py

# Single faculty sample output
python train.py --faculty MAC --skip-export

# Predict only (recalibrates if transition_rates.json missing)
python predict.py --skip-export

# Calibrate transition rates only
python -m features.transition_calibration

# Backtest fixed (80/50/25) vs calibrated rates
python -m eval.backtest
```

Outputs:

- `predictor/output/predictions.json` — full batch
- `predictor/output/transition_rates.json` — calibrated MAT→MAC and edge rates
- `predictor/output/backtest_report.json` — MAE/MAPE by holdout period
- `frontend/public/data/predictor-dashboard.json` — index for «Modelo Python» tab
- `frontend/public/data/transition_rates.json` — rates consumed by live estimator

## Pipeline (v2)

1. **Period calendar** — USFQ period kinds (`regular_10/20`, `summer`, `medical_year`)
2. **Transition calibration** — empirical rates from period pairs (e.g. `202410→202510`) with Bayesian shrinkage toward 80/50/25 priors
3. **Target period** — anchored to `offer_metadata.current_period_code`
4. **Hybrid formula** — same weights as TeacherDashboard + calibrated DAG inflow
5. **GBR** — trained on `actual_students_at_target` when available (temporal split)
6. **Backtest** — compares fixed vs calibrated on holdout periods (`202510`, `202520`, …)

## Formula (matches TeacherDashboard)

Hybrid students estimate with DAG inflow, stable floor of 8, seasonal summer seeds, and optional GBR refinement when ≥20 courses have history.
