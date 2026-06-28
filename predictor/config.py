"""Shared configuration for the demand predictor."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent
CURRICULA_DIR = REPO_ROOT / "frontend" / "src" / "data"
OUTPUT_DIR = ROOT / "output"
PUBLIC_DASHBOARD_JSON = REPO_ROOT / "frontend" / "public" / "data" / "predictor-dashboard.json"
OUTPUT_DIR.mkdir(exist_ok=True)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", os.environ.get("SUPABASE_SERVICE_KEY", ""))

# Aligned with frontend/lib/demandPrediction.ts and curriculumGraph.ts
STUDENTS_PER_SECTION = 25
MIN_STABLE_ENROLLMENT = 8
P_SEQUENTIAL = 0.8
P_SAME_AREA = 0.5
P_OTHER = 0.25
MAX_DAG_HOPS = 5
MIN_DAG_FLOW = 0.25

# Hybrid formula weights (students)
W_EST_NEXT = 0.45
W_AVG_STUDENTS = 0.15
W_INFLOW_HIST = 0.25
W_INFLOW_CURS = 0.10
W_PLANNED = 0.05

# Hybrid formula weights (sections)
W_SEC_EST = 0.35
W_SEC_AVG = 0.25
W_SEC_FROM_EST = 0.25
W_SEC_INFLOW_HIST = 0.10
W_SEC_INFLOW_CURS = 0.05

# Legacy baseline (kept for reference)
HIST_WEIGHT = 0.6
PLANNED_WEIGHT = 0.4
