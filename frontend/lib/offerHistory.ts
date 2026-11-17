import { supabase } from './supabaseClient';
import { canonicalOfferCourseCode, offerCodeVariants } from './offerCodes';
import {
  AcademicCalendar,
  classifyPeriodKind,
  isMedicalPeriodCode,
  isRegularKind,
  isSummerPeriodCode,
  isVeranoBlockCourse,
  loadAcademicCalendar,
  type PeriodKind,
} from './periodCalendar';

export interface PeriodOfferStats {
  periodCode: string;
  periodLabel: string;
  sections: number;
  /** Matriculados (demanda observada) = Σ(cupo − disponibles) por NRC de Teoría. NO es el cupo. */
  totalStudents: number;
  /** Cupo ofertado = Σ total por NRC de Teoría en el período. */
  capacity: number;
  /** Secciones con cupo y disponibles conocidos (base de `totalStudents`). */
  measuredSections: number;
  isSummer: boolean;
  periodKind: PeriodKind;
}

export interface CourseHistoryStats {
  courseCode: string;
  periods: PeriodOfferStats[];
  avgSections: number;
  /** Promedio de matriculados por período regular (demanda observada). */
  avgStudents: number;
  /** Promedio de cupo ofertado por período regular. */
  avgCapacity: number;
  maxSections: number;
  numPeriods: number;
  estimatedNextStudents: number;
  estimatedNextSections: number;
  /** Cupo del período semilla anclado al target (cohorte que avanzará por la malla). */
  lastRegularStudents: number;
  isVeranoCourse?: boolean;
  summerToRegularRate?: number;
}

export interface HistoryRow {
  id?: string | number;
  nrc?: string | null;
  course_code: string;
  total: number | null;
  available?: number | null;
  period: string;
  period_code: string | null;
}

const PAGE_SIZE = 1000;
/** Each canonical code is queried with its base and "E" spellings (2 values per course). */
const IN_BATCH = 25;

function isUsableForRegularAvg(kind: PeriodKind): boolean {
  return isRegularKind(kind);
}

function computeSeedStudents(
  periods: PeriodOfferStats[],
  targetPeriodCode: string | undefined,
  cal: AcademicCalendar,
  isVeranoCourse: boolean,
): number {
  const byCode = new Map(periods.map((p) => [p.periodCode, p.totalStudents]));

  if (isVeranoCourse) {
    const summers = periods.filter((p) => p.periodKind === 'summer');
    return summers.length > 0 ? summers[summers.length - 1].totalStudents : 0;
  }

  if (targetPeriodCode) {
    const seedPeriod = cal.seedPeriodForTarget(targetPeriodCode);
    if (seedPeriod && byCode.has(seedPeriod)) {
      const base = byCode.get(seedPeriod)!;
      const tgt = cal.get(targetPeriodCode);
      if (tgt?.kind === 'regular_10') {
        const summerCode = cal.summerBeforeRegular(targetPeriodCode);
        if (summerCode && byCode.has(summerCode)) {
          const summerCupo = byCode.get(summerCode)!;
          const rate = base > 0 ? Math.min(0.6, Math.max(0.1, summerCupo / base)) : 0.35;
          return Math.round(base + summerCupo * rate * 0.5);
        }
      }
      return base;
    }
  }

  const regular = periods.filter((p) => isUsableForRegularAvg(p.periodKind));
  if (regular.length > 0) return regular[regular.length - 1].totalStudents;
  return periods.length > 0 ? periods[periods.length - 1].totalStudents : 0;
}

function computeSummerRate(periods: PeriodOfferStats[]): number {
  const summers = periods.filter((p) => p.periodKind === 'summer');
  const regular = periods.filter((p) => isUsableForRegularAvg(p.periodKind));
  if (summers.length === 0 || regular.length === 0) return 0;
  const lastSummer = summers[summers.length - 1].totalStudents;
  const regAfter = regular.filter((p) => p.periodCode > summers[summers.length - 1].periodCode);
  const ref = regAfter.length > 0 ? regAfter[0].totalStudents : regular[regular.length - 1].totalStudents;
  if (ref <= 0) return 0;
  return Math.min(0.95, Math.max(0.05, lastSummer / ref));
}

export interface AggregateHistoryOptions {
  targetPeriodCode?: string;
  calendar?: AcademicCalendar;
  veranoCourseCodes?: Set<string>;
}

/**
 * Paginated reads without a stable ORDER BY can return the same row on two pages and skip others
 * (observed: 536 duplicated ids → CMP-4005 showed 80 cupos instead of 40). Dedupe defensively.
 */
export function dedupeHistoryRows(rows: HistoryRow[]): HistoryRow[] {
  const seen = new Set<string>();
  const out: HistoryRow[] = [];
  for (const row of rows) {
    const key = row.id != null
      ? `id:${row.id}`
      : `${row.period_code ?? row.period}|${row.nrc ?? ''}|${row.course_code}`;
    if (row.id == null && row.nrc == null) {
      out.push(row);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function aggregateRows(
  rows: HistoryRow[],
  options: AggregateHistoryOptions = {},
): Map<string, CourseHistoryStats> {
  const { targetPeriodCode, calendar, veranoCourseCodes } = options;
  const perCoursePeriod = new Map<
    string,
    Map<string, { label: string; sections: number; students: number; capacity: number; measured: number }>
  >();

  for (const row of dedupeHistoryRows(rows)) {
    // CMP-5006E y CMP-5006 son la misma materia para demanda/cobertura.
    const code = canonicalOfferCourseCode(row.course_code);
    const periodCode = row.period_code ?? row.period;
    const periodLabel = row.period ?? periodCode;
    if (!perCoursePeriod.has(code)) perCoursePeriod.set(code, new Map());
    const byPeriod = perCoursePeriod.get(code)!;
    const current = byPeriod.get(periodCode) ??
      { label: periodLabel, sections: 0, students: 0, capacity: 0, measured: 0 };
    current.sections += 1;
    current.capacity += row.total ?? 0;
    // Demanda proxy = matriculados (cupo − disponibles); el cupo solo NO es demanda.
    if (row.total != null && row.available != null) {
      current.students += Math.max(0, row.total - row.available);
      current.measured += 1;
    }
    byPeriod.set(periodCode, current);
  }

  const result = new Map<string, CourseHistoryStats>();

  for (const [courseCode, byPeriod] of perCoursePeriod) {
    const isVeranoCourse = veranoCourseCodes?.has(courseCode) ?? false;
    const periods: PeriodOfferStats[] = [...byPeriod.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodCode, stats]) => {
        const kind = classifyPeriodKind(periodCode);
        return {
          periodCode,
          periodLabel: stats.label,
          sections: stats.sections,
          totalStudents: stats.students,
          capacity: stats.capacity,
          measuredSections: stats.measured,
          isSummer: kind === 'summer',
          periodKind: kind,
        };
      });

    let basis: PeriodOfferStats[];
    if (isVeranoCourse) {
      basis = periods.filter((p) => p.periodKind === 'summer');
      if (basis.length === 0) basis = periods;
    } else {
      basis = periods.filter((p) => isUsableForRegularAvg(p.periodKind));
      if (basis.length === 0) basis = periods.filter((p) => p.periodKind !== 'medical_year');
      if (basis.length === 0) basis = periods;
    }

    const avgSections = basis.reduce((s, p) => s + p.sections, 0) / basis.length;
    const avgStudents = basis.reduce((s, p) => s + p.totalStudents, 0) / basis.length;
    const avgCapacity = basis.reduce((s, p) => s + p.capacity, 0) / basis.length;
    const maxSections = Math.max(...periods.map((p) => p.sections), 0);

    const recent = basis.slice(-3).map((p) => p.totalStudents);
    const estimatedNextStudents =
      recent.length >= 2
        ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length)
        : Math.round(avgStudents);
    const estimatedNextSections = Math.max(
      1,
      Math.round(estimatedNextStudents / 25) || Math.round(avgSections),
    );

    const cal = calendar ?? AcademicCalendar.fromCatalogRows([]);
    const lastRegularStudents = computeSeedStudents(
      periods,
      targetPeriodCode,
      cal,
      isVeranoCourse,
    );

    result.set(courseCode, {
      courseCode,
      periods,
      avgSections,
      avgStudents,
      avgCapacity,
      maxSections,
      numPeriods: periods.length,
      estimatedNextStudents,
      estimatedNextSections,
      lastRegularStudents,
      isVeranoCourse,
      summerToRegularRate: computeSummerRate(periods),
    });
  }

  return result;
}

async function fetchHistoryBatch(offerCodes: string[]): Promise<HistoryRow[]> {
  const rows: HistoryRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('course_offer_history')
      .select('id, nrc, course_code, total, available, period, period_code')
      .in('course_code', offerCodes)
      .eq('type', 'Teoría')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const batch = (data ?? []) as HistoryRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

export async function fetchOfferMetadata(): Promise<{
  currentPeriodCode: string;
  currentPeriodLabel: string;
}> {
  const { data, error } = await supabase
    .from('offer_metadata')
    .select('current_period_code, current_period_label')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) {
    return { currentPeriodCode: '', currentPeriodLabel: '' };
  }
  return {
    currentPeriodCode: data.current_period_code ?? '',
    currentPeriodLabel: data.current_period_label ?? '',
  };
}

export async function fetchOfferHistoryForCourses(
  offerCodes: string[],
  options: AggregateHistoryOptions = {},
): Promise<Map<string, CourseHistoryStats>> {
  if (offerCodes.length === 0) return new Map();

  const calendar = options.calendar ?? await loadAcademicCalendar();

  // Pedir ambas grafías (base y E) de cada código canónico.
  const queryCodes = [...new Set(offerCodes.flatMap((code) => offerCodeVariants(code)))];

  const allRows: HistoryRow[] = [];
  for (let i = 0; i < queryCodes.length; i += IN_BATCH * 2) {
    const batch = queryCodes.slice(i, i + IN_BATCH * 2);
    const rows = await fetchHistoryBatch(batch);
    allRows.push(...rows);
  }

  return aggregateRows(allRows, { ...options, calendar });
}

/** Collect verano-block course offer codes from malla courses. */
export function veranoOfferCodesFromCourses(
  courses: { id: string; block?: string }[],
): Set<string> {
  const codes = new Set<string>();
  for (const c of courses) {
    if (isVeranoBlockCourse(c.block)) {
      codes.add(canonicalOfferCourseCode(c.id));
    }
  }
  return codes;
}

/** @deprecated use isSummerPeriodCode from periodCalendar */
export function isSummerPeriod(periodCode: string): boolean {
  return isSummerPeriodCode(periodCode);
}

export function isMedicalPeriod(periodCode: string): boolean {
  return isMedicalPeriodCode(periodCode);
}
