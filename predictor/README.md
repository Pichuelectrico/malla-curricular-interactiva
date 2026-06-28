# Course demand predictor

Python tooling aligned with the webapp hybrid estimator (`demandPrediction.ts` + `curriculumGraph.ts`).

## Setup

```bash
cd predictor
pip install -r requirements.txt
```

Set `SUPABASE_URL` and `SUPABASE_KEY` in `.env`.

## Usage

```bash
# Export Supabase + train + write dashboard JSON for the webapp
python train.py

# Single faculty sample output
python train.py --faculty MAC --skip-export

# Predict only (uses saved model.pkl if present)
python predict.py --skip-export
```

Outputs:

- `predictor/output/predictions.json` — full batch
- `frontend/public/data/predictor-dashboard.json` — index for the «Modelo Python» tab

## Formula (matches TeacherDashboard)

Hybrid students estimate with DAG inflow, stable floor of 8, and optional GBR refinement when ≥20 courses have history.
