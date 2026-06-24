import React, { useEffect, useState } from 'react';
import {
  BarChart3, BookOpen, TrendingUp, Users, RefreshCw,
  GraduationCap, ChevronUp, ChevronDown, Minus, AlertCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '../lib/supabaseClient';
import type { TeacherProfile } from '../lib/useTeacherProfile';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DemandRow {
  course_id: string;
  planned_count: number;
}

interface HistoryAgg {
  course_code: string;
  avg_total: number;
  max_total: number;
  num_periods: number;
}

interface PredictionRow {
  course_id: string;
  planned_count: number;
  avg_historical: number;
  max_historical: number;
  num_periods: number;
  predicted_sections: number;
  trend: 'up' | 'down' | 'stable' | 'new';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Simple prediction formula:
 *   predicted_sections = round( (avg_historical * 0.6) + (planned_count * scale * 0.4) )
 * scale = 1 section per ~15 planned students (heuristic, adjust as needed).
 */
function computePrediction(planned: number, avgHistorical: number): number {
  const demandSections = planned / 15;
  const predicted = avgHistorical * 0.6 + demandSections * 0.4;
  return Math.max(1, Math.round(predicted));
}

function trend(planned: number, avgHistorical: number): PredictionRow['trend'] {
  if (avgHistorical === 0) return 'new';
  const demandSections = planned / 15;
  const ratio = demandSections / avgHistorical;
  if (ratio > 1.15) return 'up';
  if (ratio < 0.85) return 'down';
  return 'stable';
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
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

function TrendIcon({ t }: { t: PredictionRow['trend'] }) {
  if (t === 'up') return <ChevronUp className="w-4 h-4 text-green-500" />;
  if (t === 'down') return <ChevronDown className="w-4 h-4 text-red-400" />;
  if (t === 'new') return <span className="text-xs font-semibold text-blue-500 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 rounded">Nuevo</span>;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

function DemandBar({ planned, maxPlanned }: { planned: number; maxPlanned: number }) {
  const pct = maxPlanned > 0 ? Math.round((planned / maxPlanned) * 100) : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
        <div
          className="h-2 rounded-full bg-blue-500 dark:bg-blue-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300 w-8 text-right">{planned}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TeacherDashboardProps {
  profile: TeacherProfile;
}

export default function TeacherDashboard({ profile }: TeacherDashboardProps) {
  const [demand, setDemand] = useState<DemandRow[]>([]);
  const [history, setHistory] = useState<Map<string, HistoryAgg>>(new Map());
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const [sortBy, setSortBy] = useState<'planned' | 'predicted' | 'trend'>('planned');

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Get planned course demand for this faculty via RPC
      const { data: demandData, error: demandErr } = await supabase.rpc('get_faculty_demand', {
        p_faculty: profile.faculty,
      });
      if (demandErr) throw new Error(demandErr.message);

      const demandRows: DemandRow[] = (demandData ?? []).map((r: { course_id: string; planned_count: number }) => ({
        course_id: r.course_id,
        planned_count: Number(r.planned_count),
      }));

      // 2. Get historical offer data for those course codes
      const courseCodes = demandRows.map(r => r.course_id);
      let histAgg: HistoryAgg[] = [];
      if (courseCodes.length > 0) {
        const { data: histData, error: histErr } = await supabase
          .from('course_offer_history')
          .select('course_code, total, period')
          .in('course_code', courseCodes)
          .eq('type', 'Teoría');

        if (histErr) throw new Error(histErr.message);

        // Aggregate per course_code per period (max total per period), then average across periods
        const perPeriod = new Map<string, Map<string, number>>();
        (histData ?? []).forEach((r: { course_code: string; total: number; period: string }) => {
          if (!perPeriod.has(r.course_code)) perPeriod.set(r.course_code, new Map());
          const byPeriod = perPeriod.get(r.course_code)!;
          byPeriod.set(r.period, Math.max(byPeriod.get(r.period) ?? 0, r.total ?? 0));
        });

        histAgg = [...perPeriod.entries()].map(([code, byPeriod]) => {
          const totals = [...byPeriod.values()];
          const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
          return {
            course_code: code,
            avg_total: avg,
            max_total: Math.max(...totals),
            num_periods: totals.length,
          };
        });
      }

      const histMap = new Map<string, HistoryAgg>(histAgg.map(h => [h.course_code, h]));

      // 3. Compute predictions
      const preds: PredictionRow[] = demandRows.map(row => {
        const hist = histMap.get(row.course_id);
        const avgHist = hist?.avg_total ?? 0;
        return {
          course_id: row.course_id,
          planned_count: row.planned_count,
          avg_historical: avgHist,
          max_historical: hist?.max_total ?? 0,
          num_periods: hist?.num_periods ?? 0,
          predicted_sections: computePrediction(row.planned_count, avgHist),
          trend: trend(row.planned_count, avgHist),
        };
      });

      setDemand(demandRows);
      setHistory(histMap);
      setPredictions(preds);
      setLastLoaded(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los datos');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedPredictions = [...predictions].sort((a, b) => {
    if (sortBy === 'planned') return b.planned_count - a.planned_count;
    if (sortBy === 'predicted') return b.predicted_sections - a.predicted_sections;
    // trend: up > stable > new > down
    const order = { up: 3, stable: 2, new: 1, down: 0 };
    return order[b.trend] - order[a.trend];
  });

  const maxPlanned = Math.max(...predictions.map(p => p.planned_count), 1);
  const totalPlanned = predictions.reduce((s, p) => s + p.planned_count, 0);
  const upTrend = predictions.filter(p => p.trend === 'up').length;
  const newCourses = predictions.filter(p => p.trend === 'new').length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Dashboard Docente
            </h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {profile.name && <span className="font-medium text-gray-700 dark:text-gray-300">{profile.name} · </span>}
            Facultad <span className="font-semibold text-blue-600 dark:text-blue-400">{profile.faculty}</span>
          </p>
          {lastLoaded && (
            <p className="text-xs text-gray-400">
              Actualizado: {lastLoaded.toLocaleTimeString()}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          onClick={load}
          disabled={isLoading}
          className="gap-2 dark:border-gray-600 dark:hover:bg-gray-700 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error al cargar datos</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Summary stats */}
      {!isLoading && predictions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Materias con demanda"
            value={predictions.length}
            icon={<BookOpen className="w-5 h-5" />}
          />
          <StatCard
            label="Estudiantes planeando"
            value={totalPlanned}
            icon={<Users className="w-5 h-5" />}
          />
          <StatCard
            label="Con tendencia al alza"
            value={upTrend}
            icon={<TrendingUp className="w-5 h-5" />}
          />
          <StatCard
            label="Materias nuevas (sin historial)"
            value={newCourses}
            icon={<BarChart3 className="w-5 h-5" />}
          />
        </div>
      )}

      {/* Main prediction table */}
      <Card className="dark:bg-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            Predicción de demanda — {profile.faculty}
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Ordenar por:</span>
            {(['planned', 'predicted', 'trend'] as const).map(opt => (
              <button
                key={opt}
                onClick={() => setSortBy(opt)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  sortBy === opt
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {opt === 'planned' ? 'Planeados' : opt === 'predicted' ? 'Predicción' : 'Tendencia'}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3" />
            Cargando datos de demanda…
          </div>
        ) : sortedPredictions.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
            <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Aún no hay estudiantes que hayan marcado materias de {profile.faculty} como planeadas.</p>
            <p className="text-sm mt-1">Los datos aparecerán aquí cuando los estudiantes usen la malla interactiva.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                  <th className="px-6 py-3 font-medium text-gray-600 dark:text-gray-400 w-36">Código</th>
                  <th className="px-6 py-3 font-medium text-gray-600 dark:text-gray-400">Demanda planeada</th>
                  <th className="px-6 py-3 font-medium text-gray-600 dark:text-gray-400 w-28 text-center">Historial</th>
                  <th className="px-6 py-3 font-medium text-gray-600 dark:text-gray-400 w-32 text-center">Secciones sugeridas</th>
                  <th className="px-6 py-3 font-medium text-gray-600 dark:text-gray-400 w-24 text-center">Tendencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {sortedPredictions.map(row => (
                  <tr
                    key={row.course_id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
                        {row.course_id}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <DemandBar planned={row.planned_count} maxPlanned={maxPlanned} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      {row.num_periods > 0 ? (
                        <div>
                          <div className="font-medium text-gray-800 dark:text-gray-200">{row.avg_historical.toFixed(1)} secc.</div>
                          <div className="text-xs text-gray-400">{row.num_periods} período{row.num_periods !== 1 ? 's' : ''}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Sin datos</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-lg font-bold ${
                        row.predicted_sections >= (row.avg_historical || 1)
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-orange-500 dark:text-orange-400'
                      }`}>
                        {row.predicted_sections}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <TrendIcon t={row.trend} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && sortedPredictions.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <strong>Metodología:</strong> Secciones sugeridas = (promedio histórico × 60%) + (estudiantes planeados ÷ 15 × 40%).
              Los datos de demanda provienen de los estudiantes que marcaron materias como "planeadas" en la malla interactiva.
            </p>
          </div>
        )}
      </Card>

      {/* Historical offer detail */}
      {!isLoading && history.size > 0 && (
        <Card className="dark:bg-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">Historial de oferta por período</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Datos históricos de secciones abiertas por materia, extraídos del catálogo de cursos.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                  <th className="px-6 py-3 font-medium text-gray-600 dark:text-gray-400">Código</th>
                  <th className="px-6 py-3 font-medium text-gray-600 dark:text-gray-400 text-center">Prom. secciones</th>
                  <th className="px-6 py-3 font-medium text-gray-600 dark:text-gray-400 text-center">Máx. secciones</th>
                  <th className="px-6 py-3 font-medium text-gray-600 dark:text-gray-400 text-center">Períodos con datos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {[...history.values()]
                  .sort((a, b) => b.avg_total - a.avg_total)
                  .map(h => (
                    <tr key={h.course_code} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-6 py-3">
                        <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">
                          {h.course_code}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-center font-medium text-gray-800 dark:text-gray-200">
                        {h.avg_total.toFixed(1)}
                      </td>
                      <td className="px-6 py-3 text-center text-gray-600 dark:text-gray-400">
                        {h.max_total}
                      </td>
                      <td className="px-6 py-3 text-center text-gray-500 dark:text-gray-400">
                        {h.num_periods}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
