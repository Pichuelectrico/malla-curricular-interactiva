import { supabase } from './supabaseClient';

export interface UserSettings {
  bypassCourses: string[];
}

export function normalizeCourseCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

export async function loadUserSettings(userId: string): Promise<UserSettings> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('bypass_courses')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error loading user settings:', error.message);
    throw error;
  }

  return {
    bypassCourses: (data?.bypass_courses as string[]) ?? [],
  };
}

export async function saveBypassCourses(
  userId: string,
  bypassCourses: string[],
): Promise<void> {
  const { error } = await supabase
    .from('user_settings')
    .upsert(
      {
        user_id: userId,
        bypass_courses: bypassCourses,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    console.error('Error saving bypass courses:', error.message, error);
    throw new Error(error.message);
  }
}
