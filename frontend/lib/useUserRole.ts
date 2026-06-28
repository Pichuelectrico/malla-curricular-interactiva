import { useState, useEffect } from 'react';
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

export function useUserRole({
  userId,
  email,
  adminProfile,
  isAdminLoading,
}: UseUserRoleOptions) {
  const [professorContext, setProfessorContext] = useState<ProfessorContext | null>(null);
  const [isProfessorLoading, setIsProfessorLoading] = useState(false);

  const isAdmin = adminProfile !== null;
  const isProfessor = isProfessorEmail(email);

  useEffect(() => {
    if (!userId || !email || !isProfessor) {
      setProfessorContext(null);
      return;
    }

    setIsProfessorLoading(true);
    supabase
      .from('user_progress')
      .select('curriculum_id, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        const faculties = [
          ...new Set(
            (data ?? [])
              .map((r) => facultyFromCurriculumId(r.curriculum_id))
              .filter((f): f is string => Boolean(f)),
          ),
        ];

        const faculty = faculties[0] ?? 'CMP';
        setProfessorContext({
          email,
          name: null,
          faculty,
          faculties: faculties.length > 0 ? faculties : [faculty],
        });
        setIsProfessorLoading(false);
      })
      .catch(() => {
        setProfessorContext({
          email,
          name: null,
          faculty: 'CMP',
          faculties: ['CMP'],
        });
        setIsProfessorLoading(false);
      });
  }, [userId, email, isProfessor]);

  const isLoading = isAdminLoading || (isProfessor && isProfessorLoading);

  return {
    isAdmin,
    isProfessor,
    isStudent: Boolean(email) && !isAdmin && !isProfessor,
    professorContext,
    adminProfile,
    isLoading,
    allFaculties: [...ALL_FACULTIES],
  };
}
