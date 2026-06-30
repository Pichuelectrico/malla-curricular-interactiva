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
  /** Legacy field from Encore backend — ignored in Supabase storage */
  selectedCourses?: string[];
}

const BASE_COLUMNS =
  'completed_courses, in_progress_courses, planned_courses, has_writing_intensive, updated_at';

function isMissingBucketColumnError(message: string): boolean {
  return /bucket_fulfillments/i.test(message);
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
    lastUpdated: (row.updated_at as string) ?? new Date().toISOString(),
  };
}

async function fetchProgressRow(
  curriculumId: string,
  userId: string,
  includeBucketColumn: boolean,
) {
  const columns = includeBucketColumn
    ? `${BASE_COLUMNS}, bucket_fulfillments`
    : BASE_COLUMNS;

  return supabase
    .from('user_progress')
    .select(columns)
    .eq('user_id', userId)
    .eq('curriculum_id', curriculumId)
    .maybeSingle();
}

export async function loadProgressFromSupabase(
  curriculumId: string,
  userId: string
): Promise<ProgressData> {
  let { data, error } = await fetchProgressRow(curriculumId, userId, true);

  if (error && isMissingBucketColumnError(error.message)) {
    ({ data, error } = await fetchProgressRow(curriculumId, userId, false));
  }

  if (error) {
    console.error('Error loading progress from Supabase:', error.message);
    throw error;
  }

  if (!data) return emptyProgress(curriculumId);

  return mapProgressRow(curriculumId, data as Record<string, unknown>);
}

export async function saveProgressToSupabase(
  params: ProgressData,
  userId: string
): Promise<void> {
  const basePayload = {
    user_id: userId,
    curriculum_id: params.curriculumId,
    completed_courses: params.completedCourses,
    in_progress_courses: params.inProgressCourses ?? [],
    planned_courses: params.plannedCourses ?? [],
    has_writing_intensive: params.hasWritingIntensive ?? false,
    updated_at: new Date().toISOString(),
  };

  let { error } = await supabase
    .from('user_progress')
    .upsert(
      {
        ...basePayload,
        bucket_fulfillments: params.bucketFulfillments ?? {},
      },
      { onConflict: 'user_id,curriculum_id' },
    );

  if (error && isMissingBucketColumnError(error.message)) {
    ({ error } = await supabase
      .from('user_progress')
      .upsert(basePayload, { onConflict: 'user_id,curriculum_id' }));
  }

  if (error) {
    console.error('Error saving progress to Supabase:', error.message);
    throw error;
  }
}

export async function loadAllUserProgress(userId: string): Promise<ProgressData[]> {
  let { data, error } = await supabase
    .from('user_progress')
    .select(`${BASE_COLUMNS}, bucket_fulfillments`)
    .eq('user_id', userId);

  if (error && isMissingBucketColumnError(error.message)) {
    ({ data, error } = await supabase
      .from('user_progress')
      .select(BASE_COLUMNS)
      .eq('user_id', userId));
  }

  if (error) {
    console.error('Error loading all progress from Supabase:', error.message);
    throw error;
  }

  return (data ?? []).map((row) =>
    mapProgressRow(row.curriculum_id as string, row as Record<string, unknown>),
  );
}
