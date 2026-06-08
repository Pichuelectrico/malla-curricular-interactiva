import { supabase } from './supabaseClient';

export interface ProgressData {
  curriculumId: string;
  completedCourses: string[];
  inProgressCourses: string[];
  plannedCourses: string[];
  hasWritingIntensive: boolean;
  lastUpdated: string;
  /** Legacy field from Encore backend — ignored in Supabase storage */
  selectedCourses?: string[];
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

export async function loadProgressFromSupabase(
  curriculumId: string,
  userId: string
): Promise<ProgressData> {
  const { data, error } = await supabase
    .from('user_progress')
    .select('completed_courses, in_progress_courses, planned_courses, has_writing_intensive, updated_at')
    .eq('user_id', userId)
    .eq('curriculum_id', curriculumId)
    .maybeSingle();

  if (error) {
    console.error('Error loading progress from Supabase:', error.message);
    throw error;
  }

  if (!data) return emptyProgress(curriculumId);

  return {
    curriculumId,
    completedCourses: (data.completed_courses as string[]) ?? [],
    inProgressCourses: (data.in_progress_courses as string[]) ?? [],
    plannedCourses: (data.planned_courses as string[]) ?? [],
    hasWritingIntensive: data.has_writing_intensive ?? false,
    lastUpdated: data.updated_at ?? new Date().toISOString(),
  };
}

export async function saveProgressToSupabase(
  params: ProgressData,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('user_progress')
    .upsert(
      {
        user_id: userId,
        curriculum_id: params.curriculumId,
        completed_courses: params.completedCourses,
        in_progress_courses: params.inProgressCourses ?? [],
        planned_courses: params.plannedCourses ?? [],
        has_writing_intensive: params.hasWritingIntensive ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,curriculum_id' }
    );

  if (error) {
    console.error('Error saving progress to Supabase:', error.message);
    throw error;
  }
}
