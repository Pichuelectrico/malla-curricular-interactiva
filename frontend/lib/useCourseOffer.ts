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
  period_code?: string | null;
  last_updated: string;
}

interface UseOfferResult {
  offerMap: Map<string, CourseOfferRow>;
  isLoading: boolean;
  lastRefreshed: Date | null;
  period: string | null;
  periodCode: string | null;
  lastUpdated: string | null;
  error: string | null;
  loadFromCache: () => Promise<void>;
}

export function useCourseOffer(): UseOfferResult {
  const [offerMap, setOfferMap] = useState<Map<string, CourseOfferRow>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [period, setPeriod] = useState<string | null>(null);
  const [periodCode, setPeriodCode] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFromCache = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const PAGE_SIZE = 1000;
      const allRows: CourseOfferRow[] = [];
      let from = 0;

      while (true) {
        const { data, error: dbError } = await supabase
          .from('course_offer')
          .select('*')
          .order('course_code')
          .range(from, from + PAGE_SIZE - 1);

        if (dbError) throw new Error(dbError.message);
        if (!data?.length) break;

        allRows.push(...(data as CourseOfferRow[]));
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      const map = new Map<string, CourseOfferRow>();
      allRows.forEach((row) => {
        map.set(row.nrc, row);
      });
      setOfferMap(map);
      const first = allRows[0];
      setPeriod(first?.period ?? null);
      setPeriodCode(first?.period_code ?? null);
      setLastUpdated(first?.last_updated ?? null);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la oferta');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { offerMap, isLoading, lastRefreshed, period, periodCode, lastUpdated, error, loadFromCache };
}
