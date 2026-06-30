import { supabase } from './supabaseClient';

export interface UserSettings {
  bypassCourses: string[];
  includeOtherMallas: boolean;
}

export function normalizeCourseCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

function isMissingIncludeOtherMallasColumn(message: string): boolean {
  return /include_other_mallas/i.test(message);
}

export async function loadUserSettings(userId: string): Promise<UserSettings> {
  let { data, error } = await supabase
    .from('user_settings')
    .select('bypass_courses, include_other_mallas')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && isMissingIncludeOtherMallasColumn(error.message)) {
    ({ data, error } = await supabase
      .from('user_settings')
      .select('bypass_courses')
      .eq('user_id', userId)
      .maybeSingle());
  }

  if (error) {
    console.error('Error loading user settings:', error.message);
    throw error;
  }

  return {
    bypassCourses: (data?.bypass_courses as string[]) ?? [],
    includeOtherMallas: (data?.include_other_mallas as boolean) ?? false,
  };
}

export async function saveBypassCourses(
  userId: string,
  bypassCourses: string[],
): Promise<void> {
  const { data: existing } = await supabase
    .from('user_settings')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('user_settings')
      .update({
        bypass_courses: bypassCourses,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (error) {
      console.error('Error saving bypass courses:', error.message, error);
      throw new Error(error.message);
    }
    return;
  }

  const { error } = await supabase.from('user_settings').insert({
    user_id: userId,
    bypass_courses: bypassCourses,
    include_other_mallas: false,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Error saving bypass courses:', error.message, error);
    throw new Error(error.message);
  }
}

export async function saveIncludeOtherMallas(
  userId: string,
  includeOtherMallas: boolean,
): Promise<void> {
  const { data: existing } = await supabase
    .from('user_settings')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    let { error } = await supabase
      .from('user_settings')
      .update({
        include_other_mallas: includeOtherMallas,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error && isMissingIncludeOtherMallasColumn(error.message)) {
      return;
    }
    if (error) {
      console.error('Error saving planner setting:', error.message, error);
      throw new Error(error.message);
    }
    return;
  }

  const { error } = await supabase.from('user_settings').insert({
    user_id: userId,
    bypass_courses: [],
    include_other_mallas: includeOtherMallas,
    updated_at: new Date().toISOString(),
  });

  if (error && isMissingIncludeOtherMallasColumn(error.message)) {
    return;
  }
  if (error) {
    console.error('Error saving planner setting:', error.message, error);
    throw new Error(error.message);
  }
}
