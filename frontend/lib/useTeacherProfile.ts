import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export interface TeacherProfile {
  id: string;
  email: string;
  name: string | null;
  faculty: string;
}

export function useTeacherProfile(email: string | null) {
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!email) {
      setTeacherProfile(null);
      return;
    }

    setIsLoading(true);
    supabase
      .from('teacher_profiles')
      .select('id, email, name, faculty')
      .eq('email', email)
      .maybeSingle()
      .then(({ data }) => {
        setTeacherProfile(data ?? null);
        setIsLoading(false);
      })
      .catch(() => {
        setTeacherProfile(null);
        setIsLoading(false);
      });
  }, [email]);

  return { teacherProfile, isLoading };
}
