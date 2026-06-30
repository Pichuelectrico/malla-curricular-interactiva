import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth } from './auth';
import {
  loadUserSettings,
  saveBypassCourses,
  normalizeCourseCode,
} from './supabaseUserSettings';

const QUERY_KEY = 'userSettings';

export function useUserBypassCourses() {
  const { isSignedIn, user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: [QUERY_KEY, userId],
    queryFn: () => loadUserSettings(userId!),
    enabled: isSignedIn && !!userId,
    staleTime: 30_000,
  });

  const bypassCourses = useMemo(
    () => new Set(data?.bypassCourses ?? []),
    [data?.bypassCourses],
  );

  const mutation = useMutation({
    mutationFn: (codes: string[]) => saveBypassCourses(userId!, codes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] });
    },
  });

  const addBypassCourse = async (rawCode: string) => {
    if (!userId) return;
    const code = normalizeCourseCode(rawCode);
    if (!code) return;
    const current = data?.bypassCourses ?? [];
    if (current.includes(code)) return;
    await mutation.mutateAsync([...current, code]);
  };

  const removeBypassCourse = async (code: string) => {
    if (!userId) return;
    const current = data?.bypassCourses ?? [];
    await mutation.mutateAsync(current.filter((c) => c !== code));
  };

  return {
    bypassCourses,
    bypassCourseList: data?.bypassCourses ?? [],
    isLoading: isSignedIn && isLoading,
    isSaving: mutation.isPending,
    addBypassCourse,
    removeBypassCourse,
    normalizeCourseCode,
  };
}
