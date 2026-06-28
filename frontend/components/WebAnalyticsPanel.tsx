import React from 'react';
import {
  Activity, RefreshCw, AlertCircle, Users, Eye,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWebAnalytics, type AnalyticsCountRow, type AnalyticsDayRow } from '../lib/useWebAnalytics';

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Card className="p-4 dark:bg-gray-800 flex items-center gap-4">
      <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      </div>
    </Card>
  );
}

function DailyChart({ rows }: { rows: AnalyticsDayRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
        Sin datos en los últimos 30 días.
      </p>
    );
  }

  const maxViews = Math.max(...rows.map((r) => r.views), 1);
  const chartH = 140;

  return (
    <div className="flex items-end gap-1 sm:gap-2 h-44 pt-4">
      {rows.map((row) => {
        const h = Math.max(4, (row.views / maxViews) * chartH);
        const label = row.date.slice(5);
        return (
          <div
            key={row.date}
            className="flex-1 flex flex-col items-center gap-1 min-w-0"
            title={`${row.date}: ${row.views} visitas, ${row.visitors} visitantes`}
          >
            <div
              className="w-full max-w-8 bg-blue-500 dark:bg-blue-400 rounded-t-sm transition-all"
              style={{ height: h }}
            />
            <span className="text-[10px] text-gray-400 truncate w-full text-center">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function CountTable({
  title,
  rows,
  labelKey,
}: {
  title: string;
  rows: AnalyticsCountRow[];
  labelKey: 'view_name' | 'referrer' | 'device_type' | 'browser';
}) {
  return (
    <Card className="p-4 dark:bg-gray-800">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">Sin datos.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => {
              const label = row[labelKey] ?? '—';
              return (
                <tr key={`${labelKey}-${label}`} className="border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                  <td className="py-2 pr-2 text-gray-700 dark:text-gray-300 truncate max-w-[200px]" title={String(label)}>
                    {label}
                  </td>
                  <td className="py-2 text-right font-mono text-gray-900 dark:text-white">{row.count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

const VIEW_LABELS: Record<string, string> = {
  curriculum: 'Malla (estudiante)',
  teacher: 'Dashboard docente',
  unknown: 'Desconocido',
};

export default function WebAnalyticsPanel() {
  const { data, isLoading, error, reload } = useWebAnalytics(30);

  const avgPerDay =
    data && data.by_day.length > 0
      ? Math.round(data.total_page_views / data.by_day.length)
      : 0;

  const topViews = (data?.top_views ?? []).map((r) => ({
    ...r,
    view_name: VIEW_LABELS[r.view_name ?? ''] ?? r.view_name,
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Tráfico web</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Últimos 30 días · sesiones de admin excluidas del tracking
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {isLoading && !data && (
        <div className="text-center py-12 text-gray-500">Cargando métricas…</div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard
              label="Visitas totales"
              value={data.total_page_views}
              icon={<Eye className="w-5 h-5" />}
            />
            <StatCard
              label="Visitantes únicos"
              value={data.unique_visitors}
              icon={<Users className="w-5 h-5" />}
            />
            <StatCard
              label="Promedio / día"
              value={avgPerDay}
              icon={<Activity className="w-5 h-5" />}
            />
          </div>

          <Card className="p-5 dark:bg-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
              Visitas por día
            </h4>
            <DailyChart rows={data.by_day} />
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <CountTable title="Vistas más visitadas" rows={topViews} labelKey="view_name" />
            <CountTable title="Referrers" rows={data.top_referrers} labelKey="referrer" />
            <CountTable title="Dispositivos" rows={data.by_device} labelKey="device_type" />
            <CountTable title="Navegadores" rows={data.by_browser} labelKey="browser" />
          </div>
        </>
      )}
    </div>
  );
}
