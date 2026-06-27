# Course demand predictor

Python tooling to forecast section/cupo needs using:

- Curriculum prerequisite graphs (`frontend/src/data/Malla-*.json`)
- Historical offer data (`course_offer_history`)
- Student planned courses (`user_progress`)

## Setup

```bash
cd predictor
pip install -r requirements.txt
```

Set `SUPABASE_URL` and `SUPABASE_KEY` (service role) in `.env` or environment.

## Usage

```bash
# Export data + train (uses baseline if insufficient history)
python train.py --faculty CMP

# Predict only (uses saved model if available)
python predict.py --faculty CMP
```

Output: `predictor/output/predictions.json`

## Baseline formula

Matches `TeacherDashboard.tsx`:

```
predicted_sections = round(avg_historical * 0.6 + (planned_count / 15) * 0.4)
```

When ≥20 courses have history, a GradientBoostingRegressor is trained on `avg_total`.
