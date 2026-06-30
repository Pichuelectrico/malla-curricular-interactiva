import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabaseAuth } from './auth';
import {
  loadUserSettings,
  saveIncludeOtherMallas,
} from './supabaseUserSettings';

const QUERY_KEY = 'userSettings';

export function usePlannerSettings() {
  const { isSignedIn, user } = useSupabaseAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: [QUERY_KEY, userId],
    queryFn: () => loadUserSettings(userId!),
    enabled: isSignedIn && !!userId,
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (value: boolean) => saveIncludeOtherMallas(userId!, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] });
    },
  });

  const setIncludeOtherMallas = async (value: boolean) => {
    if (!userId) return;
    await mutation.mutateAsync(value);
  };

  return {
    includeOtherMallas: data?.includeOtherMallas ?? false,
    isLoading: isSignedIn && isLoading,
    isSaving: mutation.isPending,
    setIncludeOtherMallas,
  };
}
