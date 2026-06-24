import { useState, useCallback } from 'react';
import { supabase } from './supabaseClient';

export interface CourseOfferRow {
  nrc: string;
  course_code: string;
  title: string;
  /** 'Teoría' | 'Ejercicios' | 'Laboratorio' */
  type: string;
  /** Letters that link theory ↔ EJ/LAB sections, e.g. ['AG', 'AH'] */
  group_letters: string[];
  paralelo: string | null;
  days: string[];
  start_time: string | null;
  end_time: string | null;
  teacher: string | null;
  credits: number | null;
  college: string | null;
  available: number | null;
  total: number | null;
  period: string;
  last_updated: string;
}

interface UseOfferResult {
  offerMap: Map<string, CourseOfferRow>;
  isLoading: boolean;
  lastRefreshed: Date | null;
  error: string | null;
  loadFromCache: () => Promise<void>;
}

export function useCourseOffer(): UseOfferResult {
  const [offerMap, setOfferMap] = useState<Map<string, CourseOfferRow>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFromCache = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from('course_offer')
        .select('*')
        .order('course_code');

      if (dbError) throw new Error(dbError.message);

      const map = new Map<string, CourseOfferRow>();
      (data ?? []).forEach((row: CourseOfferRow) => {
        map.set(row.nrc, row);
      });
      setOfferMap(map);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la oferta');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { offerMap, isLoading, lastRefreshed, error, loadFromCache };
}
