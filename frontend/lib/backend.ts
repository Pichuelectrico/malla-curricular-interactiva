import { useMemo } from 'react';
import { useSupabaseAuth } from './auth';
import { loadProgressFromSupabase, saveProgressToSupabase } from './supabaseProgress';
import { mockBackendClient } from './localBackend';

/**
 * Returns a backend client whose progress methods save to Supabase when the
 * user is signed in, and fall back to localStorage when they are not.
 */
export function useBackend() {
  const { isSignedIn, user } = useSupabaseAuth();
  const userId = isSignedIn && user ? user.id : null;
  const email = user?.email ?? null;
  const avatarUrl = (user?.user_metadata?.avatar_url as string) ?? '';

  // Referencia estable por usuario: evita re-suscribir efectos que dependen de `backend` en cada render.
  return useMemo(() => {
    if (!userId) return mockBackendClient;
    return {
      progress: {
        loadProgress: (params: { curriculumId: string }) =>
          loadProgressFromSupabase(params.curriculumId, userId),
        saveProgress: (params: Parameters<typeof saveProgressToSupabase>[0]) =>
          saveProgressToSupabase(params, userId),
      },
      user: {
        getUserInfo: async () => ({ id: userId, email, imageUrl: avatarUrl }),
      },
    };
  }, [userId, email, avatarUrl]);
}
