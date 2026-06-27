import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export interface AdminProfile {
  id: string;
  email: string;
  name: string | null;
}

export function useAdminProfile(email: string | null) {
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!email) {
      setAdminProfile(null);
      return;
    }

    setIsLoading(true);
    supabase
      .from('admin_profiles')
      .select('id, email, name')
      .eq('email', email)
      .maybeSingle()
      .then(({ data }) => {
        setAdminProfile(data ?? null);
        setIsLoading(false);
      })
      .catch(() => {
        setAdminProfile(null);
        setIsLoading(false);
      });
  }, [email]);

  return { adminProfile, isLoading };
}
