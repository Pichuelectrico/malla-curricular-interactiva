import { useSupabaseAuth } from './auth';
import { loadProgressFromSupabase, saveProgressToSupabase } from './supabaseProgress';
import { mockBackendClient } from './localBackend';

/**
 * Returns a backend client whose progress methods save to Supabase when the
 * user is signed in, and fall back to localStorage when they are not.
 */
export function useBackend() {
  const { isSignedIn, user } = useSupabaseAuth();

  if (isSignedIn && user) {
    const userId = user.id;
    return {
      progress: {
        loadProgress: (params: { curriculumId: string }) =>
          loadProgressFromSupabase(params.curriculumId, userId),
        saveProgress: (params: Parameters<typeof saveProgressToSupabase>[0]) =>
          saveProgressToSupabase(params, userId),
      },
      user: {
        getUserInfo: async () => ({
          id: user.id,
          email: user.email ?? null,
          imageUrl: (user.user_metadata?.avatar_url as string) ?? '',
        }),
      },
    };
  }

  return mockBackendClient;
}
