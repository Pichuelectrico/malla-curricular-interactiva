import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CourseHistoryStats } from '../lib/offerHistory';
import type { DemandTrend } from '../lib/demandPrediction';

export interface CourseDemandDetailProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offerCode: string;
  title: string;
  inProgressCount: number;
  plannedNext: number;
  inflowFromHistory: number;
  inflowFromCursando: number;
  propagatedStudents: number;
  suggestedSections: number;
  estimatedStudents: number;
  trend: DemandTrend;
  history: CourseHistoryStats | undefined;
}

function formatPeriodLabel(period: { periodLabel: string; periodCode: string }): string {
  const match = period.periodLabel.match(/(\d{4})\/(\d{4})/);
  if (match) {
    const start = match[1].slice(2);
    const end = match[2].slice(2);
    return `${start}-${end}`;
  }
  return period.periodCode;
}

function TrendChart({
  history,
  estimatedStudents,
}: {
  history: CourseHistoryStats;
  estimatedStudents: number;
}) {
  const points = [
    ...history.periods.map((p) => ({
      key: p.periodCode,
      label: formatPeriodLabel(p),
      students: p.totalStudents,
      sections: p.sections,
      isEstimate: false,
      isSummer: p.isSummer,
    })),
    {
      key: 'estimate',
      label: 'Próximo',
      students: estimatedStudents,
      sections: Math.max(1, Math.round(estimatedStudents / 25)),
      isEstimate: true,
      isSummer: false,
    },
  ];

  const maxStudents = Math.max(...points.map((p) => p.students), 1);
  const chartH = 160;
  const barW = Math.min(48, Math.max(28, 320 / points.length - 8));

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-center gap-2 h-[180px] px-2 border-b border-gray-200 dark:border-gray-600">
        {points.map((p) => {
          const h = Math.max(4, (p.students / maxStudents) * chartH);
          return (
            <div key={p.key} className="flex flex-col items-center gap-1" style={{ width: barW + 8 }}>
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                {p.students}
              </span>
              <div
                className={`w-full rounded-t transition-all ${
                  p.isEstimate
                    ? 'bg-emerald-500/80 border-2 border-dashed border-emerald-600'
                    : p.isSummer
                      ? 'bg-amber-400 dark:bg-amber-500'
                      : 'bg-blue-500 dark:bg-blue-400'
                }`}
                style={{ height: h, width: barW }}
                title={`${p.sections} sección(es)`}
              />
              <span className="text-[9px] text-gray-500 dark:text-gray-400 text-center leading-tight">
                {p.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500 dark:text-gray-400 justify-center">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Semestre regular
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Verano
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 border border-dashed border-emerald-700" /> Estimado
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
        Altura = cupo total ofertado (suma de cupos de todas las secciones de Teoría en ese período).
      </p>
    </div>
  );
}

export default function CourseDemandDetailDialog({
  open,
  onOpenChange,
  offerCode,
  title,
  inProgressCount,
  plannedNext,
  inflowFromHistory,
  inflowFromCursando,
  propagatedStudents,
  suggestedSections,
  estimatedStudents,
  trend,
  history,
}: CourseDemandDetailProps) {
  const trendLabel =
    trend === 'up' ? 'Al alza' : trend === 'down' ? 'A la baja' : trend === 'new' ? 'Sin historial' : 'Estable';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-left dark:text-white">
            {offerCode} — {title}
          </DialogTitle>
          <DialogDescription className="text-left">
            Tendencia histórica de cupo ofertado y estimación para el próximo período.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">Secciones sugeridas</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{suggestedSections}</div>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">Estudiantes estimados</div>
            <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{estimatedStudents}</div>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">Cursando (este semestre)</div>
            <div className="text-lg font-semibold">{inProgressCount}</div>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">Planeada (próximo sem.)</div>
            <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">{plannedNext}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs rounded-lg border border-gray-100 dark:border-gray-700 p-3">
          <div>
            <span className="text-gray-500 dark:text-gray-400">DAG desde histórico del catálogo:</span>{' '}
            <strong className="text-gray-800 dark:text-gray-200">{Math.round(inflowFromHistory)}</strong>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">DAG desde quienes cursan prerrequisitos:</span>{' '}
            <strong className="text-gray-800 dark:text-gray-200">{Math.round(inflowFromCursando)}</strong>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500 dark:text-gray-400">Total vía malla (hist. + cursando):</span>{' '}
            <strong className="text-gray-800 dark:text-gray-200">{Math.round(propagatedStudents)}</strong>
          </div>
        </div>

        {history && history.periods.length > 0 ? (
          <TrendChart history={history} estimatedStudents={estimatedStudents} />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
            Sin histórico en el catálogo. La sugerencia se basa solo en demanda de la plataforma y propagación por la malla.
          </p>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-3">
          Tendencia: <strong>{trendLabel}</strong>.
          {history && (
            <>
              {' '}Promedio histórico: {Math.round(history.avgSections)} secciones,{' '}
              {Math.round(history.avgStudents)} cupos por período regular.
              {trend === 'stable' || trend === 'up' ? (
                <> Piso mínimo de 8 estudiantes en materias estables.</>
              ) : null}
            </>
          )}
        </p>
      </DialogContent>
    </Dialog>
  );
}
