import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import {
  ALL_FACULTIES,
  facultyFromCurriculumId,
  isProfessorEmail,
} from './userRoles';
import type { AdminProfile } from './useAdminProfile';

export interface ProfessorContext {
  email: string;
  name: string | null;
  /** Primary faculty derived from user_progress. */
  faculty: string;
  /** All faculties found in the user's saved curricula. */
  faculties: string[];
}

interface UseUserRoleOptions {
  userId: string | null;
  email: string | null;
  adminProfile: AdminProfile | null;
  isAdminLoading: boolean;
}

interface ProfessorState {
  forUserId: string | null;
  context: ProfessorContext | null;
  error: string | null;
}

export function useUserRole({
  userId,
  email,
  adminProfile,
  isAdminLoading,
}: UseUserRoleOptions) {
  const [state, setState] = useState<ProfessorState>({ forUserId: null, context: null, error: null });
  const [nonce, setNonce] = useState(0);

  const isAdmin = adminProfile !== null;
  const isProfessor = isProfessorEmail(email);
  const needsProfessorContext = Boolean(userId && email && isProfessor);

  useEffect(() => {
    if (!userId || !email || !isProfessor) return;
    let cancelled = false;

    supabase
      .from('user_progress')
      .select('curriculum_id, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .then(
      ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // No inventar 'CMP': un fallo es «rol desconocido», distinto de «sin progreso».
          console.error('Error loading professor context:', error.message);
          setState({ forUserId: userId, context: null, error: error.message });
          return;
        }
        const faculties = [
          ...new Set(
            (data ?? [])
              .map((r) => facultyFromCurriculumId(r.curriculum_id))
              .filter((f): f is string => Boolean(f)),
          ),
        ];
        const faculty = faculties[0] ?? 'CMP';
        setState({
          forUserId: userId,
          error: null,
          context: {
            email,
            name: null,
            faculty,
            faculties: faculties.length > 0 ? faculties : [faculty],
          },
        });
      },
      (err: unknown) => {
        if (cancelled) return;
        setState({ forUserId: userId, context: null, error: err instanceof Error ? err.message : 'Error de red' });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [userId, email, isProfessor, nonce]);

  // Derivado de forma síncrona: no hay un render «sin cargar» antes de que el efecto arranque.
  const professorResolved = !needsProfessorContext || state.forUserId === userId;
  const isProfessorLoading = needsProfessorContext && !professorResolved;
  const isLoading = isAdminLoading || isProfessorLoading;
  const roleError = needsProfessorContext && professorResolved ? state.error : null;
  const retryRole = useCallback(() => {
    setState({ forUserId: null, context: null, error: null });
    setNonce((n) => n + 1);
  }, []);

  return {
    isAdmin,
    isProfessor,
    isStudent: Boolean(email) && !isAdmin && !isProfessor,
    professorContext: needsProfessorContext && professorResolved ? state.context : null,
    adminProfile,
    isLoading,
    roleError,
    retryRole,
    allFaculties: [...ALL_FACULTIES],
  };
}
