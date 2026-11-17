import { normalizeOfferCourseCode } from './offerMatching';
import { canonicalOfferCourseCode } from './offerCodes';
import type { DemandTrend } from './demandPrediction';

export type CoverageClass =
  | 'deficit_critico'
  | 'deficit_leve'
  | 'equilibrado'
  | 'exceso'
  | 'sin_base_historica'
  | 'sin_capacidad';

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
  // ---- v4 (enrollment-proxy-v4); opcionales para datos v3 ----
  demand_low?: number | null;
  demand_central?: number | null;
  demand_high?: number | null;
  published_capacity?: number;
  published_sections?: number;
  coverage_class?: CoverageClass;
  utilization_central?: number | null;
  risk_above_high?: boolean | null;
  confidence?: string | null;
  has_history?: boolean;
  possibly_partial_offer?: boolean;
  recommendation?: string;
  aliases?: string[];
  alias_of?: string;
  nrc_without_total?: number;
}

export interface PythonModelMeta {
  name: string;
  generated_at: string;
  method: string;
  backtest_summary?: Record<string, number | string>;
  coverage_thresholds?: string;
  caveats?: string[];
  aggregate?: { n: number; capacidad: number; demanda_piso: number; demanda_central: number; demanda_techo: number };
  classification_counts?: Record<string, number>;
}

export interface PythonPredictionsIndex {
  generated_at: string;
  version: number;
  target_period_code?: string;
  target_period_label?: string;
  current_period_code?: string;
  model_meta?: PythonModelMeta;
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
  // Exacto primero (incluye alias E), luego código canónico sin E.
  return (
    index.by_offer_code[normalizeOfferCourseCode(offerCode)] ??
    index.by_offer_code[canonicalOfferCourseCode(offerCode)]
  );
}

export function formatGeneratedAt(iso: string | undefined): string {
  if (!iso) return 'desconocida';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export const COVERAGE_LABELS: Record<CoverageClass, string> = {
  deficit_critico: 'Déficit crítico',
  deficit_leve: 'Déficit leve',
  equilibrado: 'Equilibrado',
  exceso: 'Exceso de cupo',
  sin_base_historica: 'Sin base histórica',
  sin_capacidad: 'Sin cupo publicado',
};

/** Orden de severidad para ordenar por cobertura (mayor = más urgente). */
export const COVERAGE_SEVERITY: Record<CoverageClass, number> = {
  deficit_critico: 5,
  deficit_leve: 4,
  sin_capacidad: 3,
  exceso: 2,
  equilibrado: 1,
  sin_base_historica: 0,
};
