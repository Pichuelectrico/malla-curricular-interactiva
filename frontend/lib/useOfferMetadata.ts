import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

export interface OfferMetadata {
  current_period_code: string | null;
  current_period_label: string | null;
  last_scraped_at: string | null;
  last_rollover_at: string | null;
  updated_at: string | null;
}

export function useOfferMetadata() {
  const [metadata, setMetadata] = useState<OfferMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from('offer_metadata')
        .select('current_period_code, current_period_label, last_scraped_at, last_rollover_at, updated_at')
        .eq('id', 1)
        .maybeSingle();

      if (dbError) throw new Error(dbError.message);
      setMetadata(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar metadata');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { metadata, isLoading, error, reload: load };
}
