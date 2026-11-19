import { supabase } from './supabaseClient';
import type { BucketFulfillmentsMap } from './bucketFulfillment';

export interface ProgressData {
  curriculumId: string;
  completedCourses: string[];
  inProgressCourses: string[];
  plannedCourses: string[];
  hasWritingIntensive: boolean;
  lastUpdated: string;
  bucketFulfillments?: BucketFulfillmentsMap;
  /** Período objetivo para el que se editó por última vez `plannedCourses` (p. ej. '202620'). */
  plannedPeriodCode?: string | null;
  /** Legacy field from Encore backend — ignored in Supabase storage */
  selectedCourses?: string[];
}

const BASE_COLUMNS =
  'curriculum_id, completed_courses, in_progress_courses, planned_courses, has_writing_intensive, updated_at';

/** Columnas añadidas por migraciones posteriores: si la BD aún no las tiene, se reintenta sin ellas. */
const OPTIONAL_COLUMNS = ['bucket_fulfillments', 'planned_period_code'] as const;

function missingOptionalColumn(message: string): (typeof OPTIONAL_COLUMNS)[number] | null {
  return OPTIONAL_COLUMNS.find((c) => message.toLowerCase().includes(c)) ?? null;
}

function emptyProgress(curriculumId: string): ProgressData {
  return {
    curriculumId,
    completedCourses: [],
    inProgressCourses: [],
    plannedCourses: [],
    hasWritingIntensive: false,
    lastUpdated: new Date().toISOString(),
  };
}

function mapProgressRow(
  curriculumId: string,
  row: Record<string, unknown>,
): ProgressData {
  return {
    curriculumId,
    completedCourses: (row.completed_courses as string[]) ?? [],
    inProgressCourses: (row.in_progress_courses as string[]) ?? [],
    plannedCourses: (row.planned_courses as string[]) ?? [],
    hasWritingIntensive: (row.has_writing_intensive as boolean) ?? false,
    bucketFulfillments: (row.bucket_fulfillments as BucketFulfillmentsMap) ?? {},
    plannedPeriodCode: (row.planned_period_code as string | null | undefined) ?? null,
    lastUpdated: (row.updated_at as string) ?? new Date().toISOString(),
  };
}

function selectColumns(skipped: ReadonlySet<string>): string {
  return [BASE_COLUMNS, ...OPTIONAL_COLUMNS.filter((c) => !skipped.has(c))].join(', ');
}

export async function loadProgressFromSupabase(
  curriculumId: string,
  userId: string
): Promise<ProgressData> {
  const skipped = new Set<string>();
  for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt++) {
    const { data, error } = await supabase
      .from('user_progress')
      .select(selectColumns(skipped))
      .eq('user_id', userId)
      .eq('curriculum_id', curriculumId)
      .maybeSingle();

    const missing = error ? missingOptionalColumn(error.message) : null;
    if (error && missing && !skipped.has(missing)) {
      skipped.add(missing);
      continue;
    }
    if (error) {
      console.error('Error loading progress from Supabase:', error.message);
      throw error;
    }
    if (!data) return emptyProgress(curriculumId);
    return mapProgressRow(curriculumId, data as unknown as Record<string, unknown>);
  }
  throw new Error('No se pudo cargar el progreso');
}

export async function saveProgressToSupabase(
  params: ProgressData,
  userId: string
): Promise<void> {
  const full: Record<string, unknown> = {
    user_id: userId,
    curriculum_id: params.curriculumId,
    completed_courses: params.completedCourses,
    in_progress_courses: params.inProgressCourses ?? [],
    planned_courses: params.plannedCourses ?? [],
    has_writing_intensive: params.hasWritingIntensive ?? false,
    updated_at: new Date().toISOString(),
    bucket_fulfillments: params.bucketFulfillments ?? {},
    planned_period_code: params.plannedPeriodCode ?? null,
  };

  const skipped = new Set<string>();
  for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt++) {
    const payload = Object.fromEntries(Object.entries(full).filter(([k]) => !skipped.has(k)));
    const { error } = await supabase
      .from('user_progress')
      .upsert(payload, { onConflict: 'user_id,curriculum_id' });

    const missing = error ? missingOptionalColumn(error.message) : null;
    if (error && missing && !skipped.has(missing)) {
      skipped.add(missing);
      continue;
    }
    if (error) {
      console.error('Error saving progress to Supabase:', error.message);
      throw error;
    }
    return;
  }
}

export async function loadAllUserProgress(userId: string): Promise<ProgressData[]> {
  const skipped = new Set<string>();
  for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt++) {
    const { data, error } = await supabase
      .from('user_progress')
      .select(selectColumns(skipped))
      .eq('user_id', userId);

    const missing = error ? missingOptionalColumn(error.message) : null;
    if (error && missing && !skipped.has(missing)) {
      skipped.add(missing);
      continue;
    }
    if (error) {
      console.error('Error loading all progress from Supabase:', error.message);
      throw error;
    }
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) =>
      mapProgressRow(row.curriculum_id as string, row),
    );
  }
  return [];
}

export async function deleteProgressForCurriculum(
  userId: string,
  curriculumId: string,
): Promise<void> {
  const { error } = await supabase
    .from('user_progress')
    .delete()
    .eq('user_id', userId)
    .eq('curriculum_id', curriculumId);

  if (error) {
    console.error('Error deleting curriculum progress:', error.message);
    throw error;
  }
}

/** Borra TODAS las filas de progreso del usuario (todas las mallas) en una sola llamada. */
export async function deleteAllProgressForUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('user_progress')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting all progress:', error.message);
    throw error;
  }
}
