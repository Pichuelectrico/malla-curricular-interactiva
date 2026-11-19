import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { escapeLikePattern } from './progressSync';

export interface AdminProfile {
  id: string;
  email: string;
  name: string | null;
}

interface AdminState {
  /** Email para el que se resolvió este estado (evita mostrar el resultado de otra cuenta). */
  forEmail: string | null;
  profile: AdminProfile | null;
  error: string | null;
}

/**
 * Perfil de admin por email (insensible a mayúsculas). Un fallo de red/RLS NO se confunde con
 * «no es admin»: se expone `error` y `retry`.
 */
export function useAdminProfile(email: string | null) {
  const [state, setState] = useState<AdminState>({ forEmail: null, profile: null, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;

    supabase
      .from('admin_profiles')
      .select('id, email, name')
      .ilike('email', escapeLikePattern(email))
      .limit(1)
      .then(
      ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Error loading admin profile:', error.message);
          setState({ forEmail: email, profile: null, error: error.message });
          return;
        }
        setState({ forEmail: email, profile: (data?.[0] as AdminProfile | undefined) ?? null, error: null });
      },
      (err: unknown) => {
        if (cancelled) return;
        setState({ forEmail: email, profile: null, error: err instanceof Error ? err.message : 'Error de red' });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [email, nonce]);

  const resolved = Boolean(email) && state.forEmail === email;
  const retry = useCallback(() => {
    setState({ forEmail: null, profile: null, error: null });
    setNonce((n) => n + 1);
  }, []);

  return {
    adminProfile: resolved ? state.profile : null,
    isLoading: Boolean(email) && !resolved,
    error: resolved ? state.error : null,
    retry,
  };
}
