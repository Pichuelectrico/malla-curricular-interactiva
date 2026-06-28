import { normalizeOfferCourseCode } from './offerMatching';
import type { DemandTrend } from './demandPrediction';

export interface PythonPredictionEntry {
  offer_code: string;
  course_id: string;
  title: string;
  faculty: string;
  estimated_students: number;
  suggested_sections: number;
  gbr_estimated_students?: number | null;
  gbr_suggested_sections?: number | null;
  gbr_available?: boolean;
  primary_students?: number;
  primary_sections?: number;
  trend: DemandTrend;
  inflow_from_history: number;
  inflow_from_cursando: number;
  planned_count: number;
  in_progress_count: number;
  model: string;
}

export interface PythonPredictionsIndex {
  generated_at: string;
  version: number;
  target_period_code?: string;
  target_period_label?: string;
  current_period_code?: string;
  by_offer_code: Record<string, PythonPredictionEntry>;
  by_faculty: Record<string, string[]>;
}

const DASHBOARD_JSON = 'data/predictor-dashboard.json';

function dashboardUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${DASHBOARD_JSON}`;
}

let cached: PythonPredictionsIndex | null = null;

export function clearPythonPredictionsCache(): void {
  cached = null;
}

export async function loadPythonPredictions(): Promise<PythonPredictionsIndex | null> {
  if (cached) return cached;
  try {
    const res = await fetch(dashboardUrl(), { cache: 'no-cache' });
    if (!res.ok) return null;
    cached = (await res.json()) as PythonPredictionsIndex;
    return cached;
  } catch {
    return null;
  }
}

export function getPythonPredictionsUrl(): string {
  return dashboardUrl();
}

export function lookupPythonPrediction(
  index: PythonPredictionsIndex | null,
  offerCode: string,
): PythonPredictionEntry | undefined {
  if (!index) return undefined;
  const key = normalizeOfferCourseCode(offerCode);
  return index.by_offer_code[key];
}

export function formatGeneratedAt(iso: string | undefined): string {
  if (!iso) return 'desconocida';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
