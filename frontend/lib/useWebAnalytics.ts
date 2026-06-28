import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export interface AnalyticsDayRow {
  date: string;
  views: number;
  visitors: number;
}

export interface AnalyticsCountRow {
  view_name?: string;
  referrer?: string;
  device_type?: string;
  browser?: string;
  count: number;
}

export interface WebAnalyticsSummary {
  total_page_views: number;
  unique_visitors: number;
  by_day: AnalyticsDayRow[];
  top_views: AnalyticsCountRow[];
  top_referrers: AnalyticsCountRow[];
  by_device: AnalyticsCountRow[];
  by_browser: AnalyticsCountRow[];
}

export function useWebAnalytics(days = 30) {
  const [data, setData] = useState<WebAnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: raw, error: rpcError } = await supabase.rpc('get_web_analytics_summary', {
        p_days: days,
      });
      if (rpcError) throw new Error(rpcError.message);
      setData(raw as WebAnalyticsSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar analytics');
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, isLoading, error, reload };
}
