import { supabase } from './supabaseClient';
import { normalizeOfferCourseCode } from './offerMatching';

export interface PeriodOfferStats {
  periodCode: string;
  periodLabel: string;
  sections: number;
  totalStudents: number;
  isSummer: boolean;
}

export interface CourseHistoryStats {
  courseCode: string;
  periods: PeriodOfferStats[];
  avgSections: number;
  avgStudents: number;
  maxSections: number;
  numPeriods: number;
  estimatedNextStudents: number;
  estimatedNextSections: number;
  /** Cupo total del último semestre regular (cohorte que avanzará por la malla). */
  lastRegularStudents: number;
}

interface HistoryRow {
  course_code: string;
  total: number | null;
  period: string;
  period_code: string | null;
}

const PAGE_SIZE = 1000;
const IN_BATCH = 50;

function isSummerPeriod(periodCode: string): boolean {
  return periodCode.endsWith('30');
}

function aggregateRows(rows: HistoryRow[]): Map<string, CourseHistoryStats> {
  const perCoursePeriod = new Map<string, Map<string, { label: string; sections: number; students: number }>>();

  for (const row of rows) {
    const code = normalizeOfferCourseCode(row.course_code);
    const periodCode = row.period_code ?? row.period;
    const periodLabel = row.period ?? periodCode;
    if (!perCoursePeriod.has(code)) perCoursePeriod.set(code, new Map());
    const byPeriod = perCoursePeriod.get(code)!;
    const current = byPeriod.get(periodCode) ?? { label: periodLabel, sections: 0, students: 0 };
    current.sections += 1;
    current.students += row.total ?? 0;
    byPeriod.set(periodCode, current);
  }

  const result = new Map<string, CourseHistoryStats>();

  for (const [courseCode, byPeriod] of perCoursePeriod) {
    const periods: PeriodOfferStats[] = [...byPeriod.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodCode, stats]) => ({
        periodCode,
        periodLabel: stats.label,
        sections: stats.sections,
        totalStudents: stats.students,
        isSummer: isSummerPeriod(periodCode),
      }));

    const regular = periods.filter((p) => !p.isSummer);
    const basis = regular.length > 0 ? regular : periods;
    const avgSections = basis.reduce((s, p) => s + p.sections, 0) / basis.length;
    const avgStudents = basis.reduce((s, p) => s + p.totalStudents, 0) / basis.length;
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
    const lastRegular = regular.length > 0 ? regular[regular.length - 1] : periods[periods.length - 1];
    const lastRegularStudents = lastRegular?.totalStudents ?? 0;

    result.set(courseCode, {
      courseCode,
      periods,
      avgSections,
      avgStudents,
      maxSections,
      numPeriods: periods.length,
      estimatedNextStudents,
      estimatedNextSections,
      lastRegularStudents,
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
      .select('course_code, total, period, period_code')
      .in('course_code', offerCodes)
      .eq('type', 'Teoría')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const batch = (data ?? []) as HistoryRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

export async function fetchOfferHistoryForCourses(
  offerCodes: string[],
): Promise<Map<string, CourseHistoryStats>> {
  if (offerCodes.length === 0) return new Map();

  const allRows: HistoryRow[] = [];
  for (let i = 0; i < offerCodes.length; i += IN_BATCH) {
    const batch = offerCodes.slice(i, i + IN_BATCH);
    const rows = await fetchHistoryBatch(batch);
    allRows.push(...rows);
  }

  return aggregateRows(allRows);
}
