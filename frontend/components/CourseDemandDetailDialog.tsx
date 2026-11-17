import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CourseHistoryStats } from '../lib/offerHistory';
import { TrendChart } from './DemandTrendChart';
import type { DemandTrend } from '../lib/demandPrediction';
import type { TransitionRateEntry } from '../lib/transitionRates';
import { normalizeOfferCourseCode } from '../lib/offerMatching';
import { COVERAGE_LABELS, type CoverageClass } from '../lib/pythonPredictions';
import { formatGeneratedAt } from '../lib/pythonPredictions';

export interface CourseCoverageDetail {
  coverageClass: CoverageClass;
  demandLow: number | null;
  demandHigh: number | null;
  publishedCapacity: number;
  publishedSections: number;
  utilization: number | null;
  confidence: string | null;
  recommendation: string;
  possiblyPartialOffer: boolean;
}

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
  targetPeriodLabel?: string;
  targetPeriodCode?: string;
  modelLabel?: string;
  modelGeneratedAt?: string;
  /** Campos del modelo v4 (cobertura); ausente en la vista legada. */
  coverage?: CourseCoverageDetail;
  prerequisiteRates?: TransitionRateEntry[];
}

function formatEdgeType(edgeType: string): string {
  switch (edgeType) {
    case 'sequential': return 'secuencial';
    case 'cross_area_direct': return 'cross-área';
    case 'same_area': return 'misma área';
    case 'summer_to_regular': return 'verano→regular';
    default: return edgeType;
  }
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
  targetPeriodLabel,
  targetPeriodCode,
  modelLabel,
  modelGeneratedAt,
  coverage,
  prerequisiteRates = [],
}: CourseDemandDetailProps) {
  const trendLabel =
    trend === 'up' ? 'Al alza' : trend === 'down' ? 'A la baja' : trend === 'new' ? 'Sin historial' : 'Estable';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg dark:bg-gray-800 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left dark:text-white">
            {offerCode} — {title}
          </DialogTitle>
          <DialogDescription className="text-left">
            {targetPeriodLabel ? (
              <>Estimación para <strong>{targetPeriodLabel}</strong>
                {targetPeriodCode ? ` (${targetPeriodCode})` : ''}.</>
            ) : (
              'Cupo ofertado y matriculados por período, y estimación para el próximo período.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">Secciones sugeridas</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{suggestedSections}</div>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">Demanda estimada (matriculados)</div>
            <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{estimatedStudents}</div>
            {coverage && coverage.demandLow != null && (
              <div className="text-[10px] text-gray-400 mt-1">
                rango {coverage.demandLow} – {coverage.demandHigh}
              </div>
            )}
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

        {coverage && (
          <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Cobertura de la oferta</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                {COVERAGE_LABELS[coverage.coverageClass]}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Cupo publicado:</span>{' '}
                <strong className="text-gray-800 dark:text-gray-200">
                  {coverage.publishedCapacity} ({coverage.publishedSections} secc. de Teoría)
                </strong>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Demanda central / cupo:</span>{' '}
                <strong className="text-gray-800 dark:text-gray-200">
                  {coverage.utilization != null ? `${Math.round(coverage.utilization * 100)}%` : '—'}
                </strong>
              </div>
              <div className="col-span-2">
                <span className="text-gray-500 dark:text-gray-400">Confianza:</span>{' '}
                <strong className="text-gray-800 dark:text-gray-200">{coverage.confidence?.replace(/_/g, ' ') ?? '—'}</strong>
              </div>
            </div>
            {coverage.possiblyPartialOffer && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                El cupo publicado es menos del 60% del de la misma estación del año anterior: puede ser una oferta parcial.
              </p>
            )}
            {coverage.recommendation && (
              <p className="text-xs text-gray-700 dark:text-gray-300">
                <span className="font-semibold">Recomendación:</span> {coverage.recommendation}
              </p>
            )}
          </div>
        )}

        {modelLabel && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Modelo: <strong>{modelLabel}</strong>
            {modelGeneratedAt ? <> · generado {formatGeneratedAt(modelGeneratedAt)}</> : null}
            {history?.summerToRegularRate ? (
              <> · tasa verano/regular: {Math.round((history.summerToRegularRate ?? 0) * 100)}%</>
            ) : null}
          </p>
        )}

        {!coverage && (
        <div className="grid grid-cols-2 gap-2 text-xs rounded-lg border border-gray-100 dark:border-gray-700 p-3">
          <div>
            <span className="text-gray-500 dark:text-gray-400">DAG desde histórico:</span>{' '}
            <strong className="text-gray-800 dark:text-gray-200">{Math.round(inflowFromHistory)}</strong>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">DAG desde cursando:</span>{' '}
            <strong className="text-gray-800 dark:text-gray-200">{Math.round(inflowFromCursando)}</strong>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500 dark:text-gray-400">Total vía malla:</span>{' '}
            <strong className="text-gray-800 dark:text-gray-200">{Math.round(propagatedStudents)}</strong>
          </div>
        </div>
        )}

        {prerequisiteRates.length > 0 && (
          <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-3 space-y-2">
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Tasas de transición (prerrequisitos → {normalizeOfferCourseCode(offerCode)})
            </div>
            <ul className="text-xs space-y-1.5">
              {prerequisiteRates.slice(0, 6).map((edge) => (
                <li key={`${edge.from_id}-${edge.to_id}`} className="flex justify-between gap-2">
                  <span className="text-gray-600 dark:text-gray-400 truncate">
                    {normalizeOfferCourseCode(edge.from_id)} → {normalizeOfferCourseCode(edge.to_id)}
                    <span className="text-gray-400 ml-1">({formatEdgeType(edge.edge_type)})</span>
                  </span>
                  <span className="font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">
                    {Math.round(edge.p * 100)}%
                    <span className="text-gray-400 font-normal ml-1">
                      ({edge.n_pairs} par{edge.n_pairs !== 1 ? 'es' : ''})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {history && history.periods.length > 0 ? (
          <TrendChart
            history={history}
            estimatedStudents={estimatedStudents}
            targetPeriodLabel={targetPeriodLabel}
            publishedCapacity={coverage?.publishedCapacity}
          />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
            Sin histórico en el catálogo. La sugerencia se basa en demanda de la plataforma y propagación por la malla.
          </p>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-3">
          Tendencia: <strong>{trendLabel}</strong>.
          {history && (
            <>
              {' '}Promedio histórico por período regular: {Math.round(history.avgSections)} secciones,{' '}
              {Math.round(history.avgCapacity)} cupos ofertados y {Math.round(history.avgStudents)} matriculados.
              {history.isVeranoCourse ? ' Curso de verano: promedios basados en períodos *30.' : null}
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
