import { COVERAGE_SEVERITY, type CoverageClass } from './pythonPredictions';

export type ReportScope = 'selected' | 'faculty';

/** Subconjunto de PredictionRow que necesita el reporte imprimible. */
export interface ReportRowBase {
  offer_code: string;
  title: string;
  coverage_class?: CoverageClass;
  estimated_students: number;
  demand_low?: number | null;
  demand_high?: number | null;
  published_capacity?: number;
}

/** Filas del alcance elegido, en el orden en que aparecen en la tabla. */
export function selectReportRows<T extends ReportRowBase>(
  rows: T[],
  scope: ReportScope,
  selected: ReadonlySet<string>,
): T[] {
  return scope === 'faculty' ? [...rows] : rows.filter((r) => selected.has(r.offer_code));
}

const shortfall = (r: ReportRowBase) => (r.estimated_students ?? 0) - (r.published_capacity ?? 0);

/** Más urgente primero: severidad de cobertura y luego mayor faltante de cupo. */
export function sortForReport<T extends ReportRowBase>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const sev =
      (COVERAGE_SEVERITY[b.coverage_class ?? 'sin_base_historica'] ?? 0) -
      (COVERAGE_SEVERITY[a.coverage_class ?? 'sin_base_historica'] ?? 0);
    if (sev !== 0) return sev;
    const gap = shortfall(b) - shortfall(a);
    return gap !== 0 ? gap : a.offer_code.localeCompare(b.offer_code);
  });
}

export interface ReportSummary {
  count: number;
  byClass: Partial<Record<CoverageClass, number>>;
  totalCapacity: number;
  totalDemandCentral: number;
}

export function summarizeReport(rows: ReportRowBase[]): ReportSummary {
  const byClass: Partial<Record<CoverageClass, number>> = {};
  let totalCapacity = 0;
  let totalDemandCentral = 0;
  for (const r of rows) {
    if (r.coverage_class) byClass[r.coverage_class] = (byClass[r.coverage_class] ?? 0) + 1;
    totalCapacity += r.published_capacity ?? 0;
    totalDemandCentral += r.estimated_students ?? 0;
  }
  return { count: rows.length, byClass, totalCapacity, totalDemandCentral };
}

/** Recomendación acortada para la tabla resumen (el detalle completo va en la hoja de cada materia). */
export function shortRecommendation(text: string | undefined, max = 90): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Tamaño de lote para renderizar el reporte sin bloquear la UI en facultades grandes. */
export const REPORT_CHUNK_SIZE = 15;
