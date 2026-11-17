import React, { useEffect, useMemo, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TrendChart } from './DemandTrendChart';
import type { CourseHistoryStats } from '../lib/offerHistory';
import { COVERAGE_LABELS, formatGeneratedAt, type CoverageClass } from '../lib/pythonPredictions';
import {
  REPORT_CHUNK_SIZE,
  shortRecommendation,
  sortForReport,
  summarizeReport,
  type ReportRowBase,
} from '../lib/printReport';

export interface PrintReportRow extends ReportRowBase {
  trend: string;
  planned_next: number;
  in_progress_count: number;
  published_sections?: number;
  utilization_central?: number | null;
  confidence?: string | null;
  recommendation?: string;
  possibly_partial_offer?: boolean;
  has_history?: boolean;
  history?: CourseHistoryStats;
}

interface Props {
  rows: PrintReportRow[];
  faculty: string;
  targetPeriodLabel?: string;
  targetPeriodCode?: string;
  modelName?: string;
  generatedAt?: string;
  scopeLabel: string;
  onClose: () => void;
}

// Siempre colores claros: el reporte se imprime en papel aunque la app esté en modo oscuro.
const BADGE: Record<CoverageClass, string> = {
  deficit_critico: 'bg-red-100 text-red-700 border-red-300',
  deficit_leve: 'bg-amber-100 text-amber-700 border-amber-300',
  equilibrado: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  exceso: 'bg-sky-100 text-sky-700 border-sky-300',
  sin_base_historica: 'bg-gray-100 text-gray-600 border-gray-300',
  sin_capacidad: 'bg-gray-100 text-gray-600 border-gray-300',
};

function Badge({ value }: { value?: CoverageClass }) {
  if (!value) return <span className="text-gray-400">—</span>;
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${BADGE[value]}`}>
      {COVERAGE_LABELS[value]}
    </span>
  );
}

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      {sub ? <div className="text-[11px] text-gray-500">{sub}</div> : null}
    </div>
  );
}

const pct = (u?: number | null) => (u != null ? `${Math.round(u * 100)}%` : '—');

function CourseSection({ row, targetPeriodLabel }: { row: PrintReportRow; targetPeriodLabel?: string }) {
  const hasDemand = Boolean(row.has_history) && row.demand_low != null;
  return (
    <section className="report-course-page space-y-4">
      <header className="flex items-start justify-between gap-3 border-b border-gray-300 pb-2">
        <div>
          <div className="font-mono text-sm font-semibold text-blue-700">{row.offer_code}</div>
          <h3 className="text-lg font-bold text-gray-900">{row.title}</h3>
        </div>
        <Badge value={row.coverage_class} />
      </header>

      <div className="grid grid-cols-4 gap-3">
        <Metric
          label="Demanda estimada (central)"
          value={hasDemand ? row.estimated_students : '—'}
          sub={hasDemand ? `rango ${row.demand_low} – ${row.demand_high}` : 'Sin base histórica'}
        />
        <Metric
          label="Cupo publicado"
          value={row.published_capacity ?? 0}
          sub={`${row.published_sections ?? 0} secc. de Teoría`}
        />
        <Metric label="Demanda central / cupo" value={pct(row.utilization_central)} sub={`Confianza: ${row.confidence?.replace(/_/g, ' ') ?? '—'}`} />
        <Metric label="Señales (muestra app)" value={`${row.in_progress_count} / ${row.planned_next}`} sub="cursando / planeada" />
      </div>

      {row.history && row.history.periods.length > 0 ? (
        <div className="border border-gray-200 rounded-lg p-3">
          <TrendChart
            history={row.history}
            estimatedStudents={row.estimated_students}
            targetPeriodLabel={targetPeriodLabel}
            publishedCapacity={row.published_capacity}
            light
            compact
          />
        </div>
      ) : (
        <p className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg p-4 text-center">
          Sin histórico de matrícula en el catálogo para esta materia.
        </p>
      )}

      {row.possibly_partial_offer && (
        <p className="text-xs text-amber-700">
          El cupo publicado es menos del 60% del de la misma estación del año anterior: puede ser una oferta parcial.
        </p>
      )}
      <p className="text-sm text-gray-800">
        <span className="font-semibold">Recomendación:</span> {row.recommendation || 'Sin recomendación.'}
      </p>
      <p className="text-[11px] text-gray-500">
        Barra gris = cupo ofertado (Teoría). Barra de color = matriculados (cupo − disponibles; mínimo en secciones llenas).
        Última columna = demanda estimada y cupo publicado para {targetPeriodLabel ?? 'el período objetivo'}.
      </p>
    </section>
  );
}

export default function PredictionPrintReport({
  rows,
  faculty,
  targetPeriodLabel,
  targetPeriodCode,
  modelName,
  generatedAt,
  scopeLabel,
  onClose,
}: Props) {
  const sorted = useMemo(() => sortForReport(rows), [rows]);
  const summary = useMemo(() => summarizeReport(sorted), [sorted]);
  // Render por lotes: evita bloquear la UI con cientos de gráficos al abrir el reporte.
  const [visible, setVisible] = useState(Math.min(REPORT_CHUNK_SIZE, sorted.length));
  const ready = visible >= sorted.length;

  useEffect(() => {
    if (visible >= sorted.length) return;
    const id = window.setTimeout(
      () => setVisible((v) => Math.min(sorted.length, v + REPORT_CHUNK_SIZE)),
      0,
    );
    return () => window.clearTimeout(id);
  }, [visible, sorted.length]);

  // Con Ctrl+P antes de terminar el render por lotes, completar todo de forma síncrona.
  useEffect(() => {
    const before = () => flushSync(() => setVisible(sorted.length));
    window.addEventListener('beforeprint', before);
    return () => window.removeEventListener('beforeprint', before);
  }, [sorted.length]);

  // Oculta la app al imprimir (ver @media print en index.css) y restaura todo al cerrar.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.classList.add('print-report-open');
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('print-report-open');
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const generated = generatedAt ? formatGeneratedAt(generatedAt) : '—';

  return createPortal(
    <div id="print-report-root" className="fixed inset-0 z-[100] overflow-auto bg-gray-100 text-gray-900">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
        <div className="text-sm">
          <strong>Reporte imprimible</strong> · {scopeLabel} · {sorted.length} materia{sorted.length === 1 ? '' : 's'}
          {!ready && <span className="ml-2 text-gray-500">Preparando… {visible}/{sorted.length}</span>}
          <span className="ml-3 text-xs text-gray-500">En el diálogo de impresión elige «Guardar como PDF».</span>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => window.print()} disabled={!ready} className="gap-2">
            <Printer className="w-4 h-4" /> Imprimir
          </Button>
          <Button variant="outline" onClick={onClose} className="gap-2">
            <X className="w-4 h-4" /> Cerrar
          </Button>
        </div>
      </div>

      <div className="report-sheet mx-auto max-w-4xl bg-white my-6 print:my-0 px-8 py-8 space-y-8 shadow-sm print:shadow-none">
        <section className="space-y-4">
          <header className="border-b-2 border-gray-800 pb-3">
            <h1 className="text-2xl font-bold">Reporte de cobertura de oferta — {faculty}</h1>
            <p className="text-sm text-gray-600">
              Período objetivo: <strong>{targetPeriodLabel ?? '—'}{targetPeriodCode ? ` (${targetPeriodCode})` : ''}</strong>
              {' '}· Modelo: <strong>{modelName ?? '—'}</strong>
              {' '}· Generado: <strong>{generated}</strong>
              {' '}· Alcance: <strong>{scopeLabel}</strong> ({summary.count} materias)
            </p>
          </header>

          <div className="grid grid-cols-4 gap-3">
            <Metric label="Déficit crítico" value={summary.byClass.deficit_critico ?? 0} />
            <Metric label="Déficit leve" value={summary.byClass.deficit_leve ?? 0} />
            <Metric label="Exceso de cupo" value={summary.byClass.exceso ?? 0} />
            <Metric label="Demanda central / cupo" value={`${Math.round(summary.totalDemandCentral)} / ${summary.totalCapacity}`} />
          </div>

          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="border border-gray-300 px-2 py-1">Código</th>
                <th className="border border-gray-300 px-2 py-1">Materia</th>
                <th className="border border-gray-300 px-2 py-1">Cobertura</th>
                <th className="border border-gray-300 px-2 py-1 text-center">Demanda (piso–central–techo)</th>
                <th className="border border-gray-300 px-2 py-1 text-center">Cupo / secc.</th>
                <th className="border border-gray-300 px-2 py-1 text-center">Util.</th>
                <th className="border border-gray-300 px-2 py-1">Recomendación</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.offer_code} className="align-top break-inside-avoid">
                  <td className="border border-gray-300 px-2 py-1 font-mono">{r.offer_code}</td>
                  <td className="border border-gray-300 px-2 py-1">{r.title}</td>
                  <td className="border border-gray-300 px-2 py-1"><Badge value={r.coverage_class} /></td>
                  <td className="border border-gray-300 px-2 py-1 text-center">
                    {r.has_history && r.demand_low != null
                      ? `${r.demand_low} – ${r.estimated_students} – ${r.demand_high}`
                      : 'Sin base'}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-center">
                    {r.published_capacity ?? 0} / {r.published_sections ?? 0}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-center">{pct(r.utilization_central)}</td>
                  <td className="border border-gray-300 px-2 py-1">{shortRecommendation(r.recommendation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-500">
            Cupo publicado = suma de NRC de Teoría. Demanda = matrícula estimada (cupo − disponibles históricos); la oferta
            actual aún no tiene matrícula. Las señales de usuarios de la app son una muestra pequeña y solo ajustan la estimación.
          </p>
        </section>

        {sorted.slice(0, visible).map((row) => (
          <CourseSection key={row.offer_code} row={row} targetPeriodLabel={targetPeriodLabel} />
        ))}
        {!ready && (
          <p className="no-print text-center text-sm text-gray-500">Preparando materias… {visible}/{sorted.length}</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
