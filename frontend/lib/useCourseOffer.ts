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
      // Paginar con ORDER BY único (nrc): con empates (course_code) las páginas pueden repetir/saltar filas.
      const fetchAll = async () => {
        const rows: CourseOfferRow[] = [];
        let expected: number | null = null;
        let from = 0;
        while (true) {
          const { data, error: dbError, count } = await supabase
            .from('course_offer')
            .select('*', { count: 'exact' })
            .order('nrc', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);

          if (dbError) throw new Error(dbError.message);
          if (expected === null && typeof count === 'number') expected = count;
          if (!data?.length) break;

          rows.push(...(data as CourseOfferRow[]));
          if (data.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }
        return { rows, expected };
      };

      let { rows: allRows, expected } = await fetchAll();
      const distinct = (rows: CourseOfferRow[]) => new Set(rows.map((r) => r.nrc)).size;
      if (expected !== null && distinct(allRows) < expected) {
        // La oferta cambió entre páginas (scrape en curso) o hubo una lectura incompleta: un reintento.
        ({ rows: allRows, expected } = await fetchAll());
      }
      if (expected !== null && distinct(allRows) < expected) {
        console.warn(`Oferta incompleta: ${distinct(allRows)} de ${expected} NRC`);
        setError(`La oferta se cargó incompleta (${distinct(allRows)} de ${expected} NRC). Actualiza la página.`);
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
