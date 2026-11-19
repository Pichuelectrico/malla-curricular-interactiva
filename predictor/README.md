# Course demand predictor — model `enrollment-proxy-v4`

Estimates, per course, the **demand for the target period** (e.g. `202620`) as a range (floor / central / ceiling)
and compares it with the **published capacity** (sum of `total` over Teoría NRCs) to classify coverage
(`deficit_critico`, `deficit_leve`, `equilibrado`, `exceso`, `sin_base_historica`, `sin_capacidad`) and suggest actions.

> The previous model (hybrid formula + transition calibration + GBR) used the NRC **capacity** (`total`) as if it were
> demand. It was circular, the GBR trained on its own pseudo-labels and lost to a naive baseline. It was retired on
> 2026-11-17; the old formula only survives in the live in-browser estimator (labelled *legacy* in the dashboard).

## Setup

```bash
cd predictor
python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt
```

`.env`: `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (a real `service_role`; the anon key cannot read other users'
`user_progress` under RLS). The service role needs `SELECT` on the exported tables (see migration `20260708000002`).

## Usage

```bash
# Export Supabase → transition rates → backtest → coverage → predictions + dashboard JSON
.venv/bin/python train.py

# Reuse existing exports (offline)
.venv/bin/python train.py --skip-export

# Regenerate predictions + dashboard only (no backtest, no re-calibration)
.venv/bin/python predict.py --skip-export

# Coverage report only (reads predictor/output/*.json)
.venv/bin/python coverage.py --skip-model-eval

# Unit tests of the pure helpers
.venv/bin/python -m unittest discover -s tests
```

Flags: `train.py --skip-export --skip-backtest --skip-calibration` · `predict.py --skip-export --recalibrate`.
`--faculty` was removed in v4.

## Method

1. **Demand proxy** = `total − available` per Teoría NRC (enrolled seats). Rows without `available` are skipped.
   Full sections (`available ≤ 0`) are censored: true demand ≥ capacity, so the ceiling adds 25 % of their capacity.
2. **Core estimator** = 75 % same-season enrollment (`202520` for target `202620`) + 25 % previous semester (`202610`).
   Older periods only widen the floor/ceiling. Seasonality dominates: same-season MAE ≈ 10.0 vs previous-semester 15.2.
3. **Signals** (light adjustment, weight `n/(n+5)`): `planned_courses` counts as demand for the target period only when
   `user_progress.planned_period_code` equals it (legacy NULL rows are counted but reported separately; other periods
   are ignored) and `in_progress_courses` propagate one hop to successors through the prerequisite graph. The user
   sample is small and self-selected: signals adjust, they do not lead.
4. **Live enrollment**: when ≥ 50 % of a course's Teoría sections already report `available`, the observed
   `total − available` becomes a hard floor of the estimate.
5. **Code normalization**: a trailing `E` (CMP-5006E) is merged with the base code everywhere (`canonical_course_code`);
   original spellings are kept as aliases.
6. **Obsolete NRCs** (not carrying the latest scrape `last_updated`) are excluded from capacity, with the same guards as
   the cron (latest batch > 0 and ≥ 90 % of rows).
7. **Calibration and GBR are not used** by the estimator (transition rates are still exported for the legacy UI).

## Honest metrics (backtest on 202510 / 202520 / 202610, truth = enrollment proxy)

| Predictor | Mean MAE (students/course) |
|---|---|
| Production model (75 % season + 25 % previous) | ≈ 10.2 |
| Previous-semester baseline | ≈ 15.2 |
| Published capacity of the period used as prediction | ≈ 8.6 |

Published capacity predicts enrollment *better* than the model because faculties already know their demand: the model
is a counterweight to spot deviations, not an oracle. The backtest does not validate the signal adjustment.

## Outputs

- `predictor/output/coverage_202620.json` and `coverage_202620_resumen.md` — per-course report
- `predictor/output/predictions.json`, `backtest_report.json`, `transition_rates.json`, exports (`user_progress.json` is private)
- `frontend/public/data/predictor-dashboard.json` (**version 4**, adds `demand_low/central/high`, `published_capacity`,
  `coverage_class`, `recommendation`, `enrolled_so_far`, `model_meta`; old v3 fields kept with new meaning)
- `frontend/public/data/transition_rates.json`

`predictor/output/` is git-ignored. Export pagination uses a stable `ORDER BY` and verifies the row count against the server.
