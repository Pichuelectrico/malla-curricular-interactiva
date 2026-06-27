"""Shared configuration for the demand predictor."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent
CURRICULA_DIR = REPO_ROOT / "frontend" / "src" / "data"
OUTPUT_DIR = ROOT / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", os.environ.get("SUPABASE_SERVICE_KEY", ""))

# Heuristic from TeacherDashboard.tsx
HIST_WEIGHT = 0.6
PLANNED_WEIGHT = 0.4
STUDENTS_PER_SECTION = 15
