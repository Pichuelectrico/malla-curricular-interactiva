import type { CourseHistoryStats } from './offerHistory';

export const STUDENTS_PER_SECTION = 25;
/** USFQ minimum enrollment to open a section in stable offerings. */
export const MIN_STABLE_ENROLLMENT = 8;

export type DemandTrend = 'up' | 'down' | 'stable' | 'new';

export interface PredictionInput {
  plannedNextSemester: number;
  inflowFromHistory: number;
  inflowFromCursando: number;
  history: CourseHistoryStats | undefined;
}

export interface PredictionResult {
  suggestedSections: number;
  estimatedStudents: number;
  trend: DemandTrend;
}

export function isStableOffering(
  history: CourseHistoryStats,
  trend: DemandTrend,
): boolean {
  if (trend === 'down' || trend === 'new') return false;
  const regular = history.periods.filter((p) => !p.isSummer);
  if (regular.length < 2) return false;
  const last = regular[regular.length - 1].totalStudents;
  const prev = regular[regular.length - 2].totalStudents;
  return last >= MIN_STABLE_ENROLLMENT && prev >= MIN_STABLE_ENROLLMENT;
}

export function computeDemandPrediction(input: PredictionInput): PredictionResult {
  const { plannedNextSemester, inflowFromHistory, inflowFromCursando, history } = input;

  if (!history || history.numPeriods === 0) {
    const estimatedStudents = Math.round(plannedNextSemester + inflowFromHistory + inflowFromCursando);
    const sections = Math.max(1, Math.round(estimatedStudents / STUDENTS_PER_SECTION));
    return {
      suggestedSections: sections,
      estimatedStudents,
      trend: estimatedStudents > 0 ? 'up' : 'new',
    };
  }

  let estimatedStudents = Math.round(
    history.estimatedNextStudents * 0.45 +
      history.avgStudents * 0.15 +
      inflowFromHistory * 0.25 +
      inflowFromCursando * 0.1 +
      plannedNextSemester * 0.05,
  );

  let trend = computeTrend(history, estimatedStudents, inflowFromHistory + inflowFromCursando);

  if (isStableOffering(history, trend)) {
    estimatedStudents = Math.max(estimatedStudents, MIN_STABLE_ENROLLMENT);
  }

  const suggestedSections = Math.max(
    1,
    Math.round(
      history.estimatedNextSections * 0.35 +
        history.avgSections * 0.25 +
        estimatedStudents / STUDENTS_PER_SECTION * 0.25 +
        inflowFromHistory / STUDENTS_PER_SECTION * 0.1 +
        inflowFromCursando / STUDENTS_PER_SECTION * 0.05,
    ),
  );

  return { suggestedSections, estimatedStudents, trend };
}

function computeTrend(
  history: CourseHistoryStats,
  estimate: number,
  dagInflow: number,
): DemandTrend {
  const regular = history.periods.filter((p) => !p.isSummer);
  if (regular.length < 2 && dagInflow <= 0) return 'stable';

  const last = regular[regular.length - 1]?.totalStudents ?? 0;
  const prev = regular[regular.length - 2]?.totalStudents ?? last;
  const baseline = prev > 0 ? last / prev : 1;

  const reference = Math.max(last, dagInflow, estimate);
  const projected = reference > 0 ? estimate / reference : 1;

  const ratio = projected * 0.55 + baseline * 0.45;
  if (ratio > 1.08) return 'up';
  if (ratio < 0.92) return 'down';
  return 'stable';
}
