import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  BarChart3, BookOpen, TrendingUp, Users, RefreshCw,
  GraduationCap, ChevronUp, ChevronDown, Minus, AlertCircle, Info, Printer,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '../lib/supabaseClient';
import { loadFacultyCurriculum } from '../lib/facultyCurriculum';
import { fetchFacultySupervisedCourses } from '../lib/facultySupervisedCourses';
import {
  buildCurriculumGraph,
  buildHistoricalSeeds,
  collectDagHistoryOfferCodes,
  propagateDemandFromSources,
} from '../lib/curriculumGraph';
import { computeDemandPrediction, type DemandTrend } from '../lib/demandPrediction';
import {
  fetchOfferHistoryForCourses,
  fetchOfferMetadata,
  veranoOfferCodesFromCourses,
  type CourseHistoryStats,
} from '../lib/offerHistory';
import { loadAcademicCalendar } from '../lib/periodCalendar';
import {
  COVERAGE_LABELS,
  COVERAGE_SEVERITY,
  formatGeneratedAt,
  clearPythonPredictionsCache,
  getPythonPredictionsUrl,
  loadPythonPredictions,
  lookupPythonPrediction,
  type CoverageClass,
  type PythonPredictionsIndex,
} from '../lib/pythonPredictions';
import { loadTransitionRates, type TransitionRateTable } from '../lib/transitionRates';
import type { ProfessorContext } from '../lib/useUserRole';
import CourseDemandDetailDialog from './CourseDemandDetailDialog';
import type { PrintReportRow } from './PredictionPrintReport';

const PredictionPrintReport = lazy(() => import('./PredictionPrintReport'));
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { selectReportRows, type ReportScope } from '../lib/printReport';

type EstimatorMode = 'live' | 'python';

interface PredictionRow {
  course_id: string;
  offer_code: string;
  title: string;
  in_progress_count: number;
  planned_next: number;
  inflow_from_history: number;
  inflow_from_cursando: number;
  propagated_students: number;
  avg_sections: number;
  avg_students: number;
  avg_capacity: number;
  num_periods: number;
  predicted_sections: number;
  estimated_students: number;
  trend: DemandTrend;
  model_label?: string;
  // v4 (solo vista Modelo): demanda estimada con rango vs cupo publicado
  demand_low?: number | null;
  demand_high?: number | null;
  published_capacity?: number;
  published_sections?: number;
  coverage_class?: CoverageClass;
  utilization_central?: number | null;
  confidence?: string | null;
  recommendation?: string;
  possibly_partial_offer?: boolean;
  has_history?: boolean;
}

const COVERAGE_BADGE: Record<CoverageClass, string> = {
  deficit_critico: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  deficit_leve: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  equilibrado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  exceso: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  sin_base_historica: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  sin_capacidad: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

function CoverageBadge({ value }: { value?: CoverageClass }) {
  if (!value) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${COVERAGE_BADGE[value]}`}>
      {COVERAGE_LABELS[value]}
    </span>
  );
}

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

function TrendIcon({ t }: { t: DemandTrend }) {
  if (t === 'up') return <ChevronUp className="w-4 h-4 text-green-500" />;
  if (t === 'down') return <ChevronDown className="w-4 h-4 text-red-400" />;
  if (t === 'new') return <span className="text-xs font-semibold text-blue-500 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 rounded">Nuevo</span>;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

function DemandBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 w-full min-w-[80px]">
      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
        <div
          className="h-2 rounded-full bg-blue-500 dark:bg-blue-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300 w-8 text-right">
        {Math.round(value)}
      </span>
    </div>
  );
}

interface TeacherDashboardProps {
  profile: ProfessorContext;
  facultyOptions?: string[];
  title?: string;
}

export default function TeacherDashboard({
  profile,
  facultyOptions,
  title = 'Dashboard Docente',
}: TeacherDashboardProps) {
  const selectableFaculties = facultyOptions ?? profile.faculties;
  const [faculty, setFaculty] = useState(profile.faculty);
  const showFacultyPicker = selectableFaculties.length > 1 || Boolean(facultyOptions);

  useEffect(() => {
    setFaculty(profile.faculty);
  }, [profile.faculty]);

  useEffect(() => {
    setSelectedCodes(new Set());
    setReportRows(null);
  }, [faculty]);

  const [historyMap, setHistoryMap] = useState<Map<string, CourseHistoryStats>>(new Map());
  const [livePredictions, setLivePredictions] = useState<PredictionRow[]>([]);
  const [pythonIndex, setPythonIndex] = useState<PythonPredictionsIndex | null>(null);
  const [estimatorMode, setEstimatorMode] = useState<EstimatorMode>('python');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const [sortBy, setSortBy] = useState<'coverage' | 'planned' | 'predicted' | 'trend'>('coverage');
  const [selected, setSelected] = useState<PredictionRow | null>(null);
  const [targetPeriodCode, setTargetPeriodCode] = useState('');
  const [targetPeriodLabel, setTargetPeriodLabel] = useState('');
  const [transitionRates, setTransitionRates] = useState<TransitionRateTable | null>(null);
  // Reporte imprimible: selección múltiple por checkbox + diálogo de alcance
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printScope, setPrintScope] = useState<ReportScope>('faculty');
  const [reportRows, setReportRows] = useState<PrintReportRow[] | null>(null);
  const [reportScopeLabel, setReportScopeLabel] = useState('');

  // Token de petición: si cambia la facultad (o se pulsa Actualizar) mientras hay una carga en vuelo,
  // la respuesta vieja se descarta en vez de pisar la nueva.
  const loadSeq = useRef(0);

  const load = async () => {
    const seq = ++loadSeq.current;
    const stale = () => seq !== loadSeq.current;
    setIsLoading(true);
    setError(null);
    try {
      const supervised = await fetchFacultySupervisedCourses(faculty);
      const offerCodes = supervised.map((c) => c.offerCode);
      const courseIds = supervised.map((c) => c.courseId);

      const { data: demandData, error: demandErr } = await supabase.rpc('get_malla_course_demand', {
        p_course_ids: courseIds,
      });
      if (demandErr) throw new Error(demandErr.message);

      const cursandoByCourseId = new Map<string, number>();
      const plannedNextByCourseId = new Map<string, number>();
      (demandData ?? []).forEach((r: {
        course_id: string;
        in_progress_count: number;
        planned_count: number;
      }) => {
        cursandoByCourseId.set(r.course_id, Number(r.in_progress_count));
        plannedNextByCourseId.set(r.course_id, Number(r.planned_count));
      });

      // Full career malla still powers prerequisite graph for DAG propagation
      let mallaCourses = supervised.map((c) => ({
        id: c.courseId,
        code: c.offerCode,
        title: c.title,
        description: '',
        credits: 0,
        semester: 0,
        block: '',
        area: faculty,
        type: '',
        prerequisites: [] as string[],
        alternatives: [] as string[],
      }));
      try {
        mallaCourses = await loadFacultyCurriculum(faculty);
      } catch {
        // fallback: supervised list only
      }

      const graph = buildCurriculumGraph(mallaCourses);
      const dagHistoryCodes = collectDagHistoryOfferCodes(mallaCourses);
      const historyFetchCodes = [...new Set([...offerCodes, ...dagHistoryCodes])];

      const [calendar, rates, metadata] = await Promise.all([
        loadAcademicCalendar(),
        loadTransitionRates(),
        fetchOfferMetadata(),
      ]);
      if (stale()) return;
      setTransitionRates(rates);

      const { targetPeriodCode: tgtCode, targetPeriodLabel: tgtLabel } = calendar.inferTargetPeriod(
        metadata.currentPeriodCode || undefined,
      );
      setTargetPeriodCode(tgtCode);
      setTargetPeriodLabel(tgtLabel);

      const veranoCodes = veranoOfferCodesFromCourses(mallaCourses);
      const histMap = historyFetchCodes.length > 0
        ? await fetchOfferHistoryForCourses(historyFetchCodes, {
            targetPeriodCode: tgtCode,
            calendar,
            veranoCourseCodes: veranoCodes,
          })
        : new Map<string, CourseHistoryStats>();

      const historySeeds = buildHistoricalSeeds(mallaCourses, histMap);
      const { totalInflow, inflowFromHistory, inflowFromCursando } = propagateDemandFromSources(
        graph,
        historySeeds,
        cursandoByCourseId,
        5,
        rates,
      );

      const preds: PredictionRow[] = supervised.map((course) => {
        const cursando = cursandoByCourseId.get(course.courseId) ?? 0;
        const plannedNext = plannedNextByCourseId.get(course.courseId) ?? 0;
        const histInflow = inflowFromHistory.get(course.courseId) ?? 0;
        const cursandoInflow = inflowFromCursando.get(course.courseId) ?? 0;
        const hist = histMap.get(course.offerCode);
        const result = computeDemandPrediction({
          plannedNextSemester: plannedNext,
          inflowFromHistory: histInflow,
          inflowFromCursando: cursandoInflow,
          history: hist,
        });

        return {
          course_id: course.courseId,
          offer_code: course.offerCode,
          title: course.title,
          in_progress_count: cursando,
          planned_next: plannedNext,
          inflow_from_history: histInflow,
          inflow_from_cursando: cursandoInflow,
          propagated_students: totalInflow.get(course.courseId) ?? 0,
          avg_sections: hist?.avgSections ?? 0,
          avg_students: hist?.avgStudents ?? 0,
          avg_capacity: hist?.avgCapacity ?? 0,
          num_periods: hist?.numPeriods ?? 0,
          predicted_sections: result.suggestedSections,
          estimated_students: result.estimatedStudents,
          trend: result.trend,
        };
      });

      if (stale()) return;
      setHistoryMap(histMap);
      setLivePredictions(preds);

      clearPythonPredictionsCache();
      const pyIndex = await loadPythonPredictions();
      if (stale()) return;
      setPythonIndex(pyIndex);
      if (pyIndex?.target_period_code) {
        setTargetPeriodCode(pyIndex.target_period_code);
        setTargetPeriodLabel(pyIndex.target_period_label ?? pyIndex.target_period_code);
      }
      setLastLoaded(new Date());
    } catch (err) {
      if (!stale()) setError(err instanceof Error ? err.message : 'Error al cargar los datos');
    } finally {
      if (!stale()) setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [faculty]); // eslint-disable-line react-hooks/exhaustive-deps

  const pythonPredictions: PredictionRow[] = livePredictions.map((row) => {
    const py = lookupPythonPrediction(pythonIndex, row.offer_code);
    if (!py) {
      return {
        ...row,
        predicted_sections: 0,
        estimated_students: 0,
        trend: 'new' as DemandTrend,
        model_label: 'sin datos',
      };
    }
    return {
      ...row,
      in_progress_count: py.in_progress_count,
      planned_next: py.planned_count,
      inflow_from_history: py.inflow_from_history,
      inflow_from_cursando: py.inflow_from_cursando,
      propagated_students: py.inflow_from_history + py.inflow_from_cursando,
      predicted_sections: py.suggested_sections,
      estimated_students: py.estimated_students,
      trend: py.trend,
      model_label: py.model,
      demand_low: py.demand_low,
      demand_high: py.demand_high,
      published_capacity: py.published_capacity,
      published_sections: py.published_sections,
      coverage_class: py.coverage_class,
      utilization_central: py.utilization_central,
      confidence: py.confidence,
      recommendation: py.recommendation,
      possibly_partial_offer: py.possibly_partial_offer,
      has_history: py.has_history,
    };
  });

  const pythonAvailable = Boolean(pythonIndex?.by_offer_code && Object.keys(pythonIndex.by_offer_code).length > 0);
  // Sin índice del modelo se cae al estimador en vivo (el botón del modelo queda deshabilitado).
  const mode: EstimatorMode = estimatorMode === 'python' && !pythonAvailable && !isLoading ? 'live' : estimatorMode;
  const predictions = mode === 'live' ? livePredictions : pythonPredictions;
  const modelMeta = pythonIndex?.model_meta;

  const shortfall = (p: PredictionRow) =>
    (p.estimated_students ?? 0) - (p.published_capacity ?? 0);
  const sortedPredictions = [...predictions].sort((a, b) => {
    if (sortBy === 'coverage' && mode === 'python') {
      const sev = (COVERAGE_SEVERITY[b.coverage_class ?? 'sin_base_historica'] ?? 0) -
        (COVERAGE_SEVERITY[a.coverage_class ?? 'sin_base_historica'] ?? 0);
      return sev !== 0 ? sev : shortfall(b) - shortfall(a);
    }
    if (sortBy === 'planned') return b.planned_next - a.planned_next;
    if (sortBy === 'predicted' || sortBy === 'coverage') return b.predicted_sections - a.predicted_sections;
    const order = { up: 3, stable: 2, new: 1, down: 0 };
    return order[b.trend] - order[a.trend];
  });

  const coverageCounts = predictions.reduce<Record<string, number>>((acc, p) => {
    if (p.coverage_class) acc[p.coverage_class] = (acc[p.coverage_class] ?? 0) + 1;
    return acc;
  }, {});
  const totalCapacity = predictions.reduce((s, p) => s + (p.published_capacity ?? 0), 0);
  const totalDemand = predictions.reduce((s, p) => s + (p.estimated_students ?? 0), 0);

  const toggleSelected = (code: string) =>
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  const allSelected = sortedPredictions.length > 0 && sortedPredictions.every((p) => selectedCodes.has(p.offer_code));
  const toggleAll = () =>
    setSelectedCodes(allSelected ? new Set() : new Set(sortedPredictions.map((p) => p.offer_code)));
  const selectedCount = predictions.filter((p) => selectedCodes.has(p.offer_code)).length;

  const openPrintDialog = () => {
    setPrintScope(selectedCount > 0 ? 'selected' : 'faculty');
    setPrintDialogOpen(true);
  };
  const generateReport = () => {
    const rows = selectReportRows(pythonPredictions, printScope, selectedCodes).map<PrintReportRow>((r) => ({
      ...r,
      history: historyMap.get(r.offer_code),
    }));
    setReportScopeLabel(printScope === 'faculty' ? `Toda la facultad ${faculty}` : 'Materias seleccionadas');
    setReportRows(rows);
    setPrintDialogOpen(false);
  };

  const maxDemand = Math.max(
    ...predictions.map((p) => Math.max(p.inflow_from_history, p.inflow_from_cursando)),
    1,
  );
  const totalCursando = predictions.reduce((s, p) => s + p.in_progress_count, 0);
  const totalPlannedNext = predictions.reduce((s, p) => s + p.planned_next, 0);
  const withHistory = predictions.filter((p) => p.num_periods > 0).length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {profile.name && <span className="font-medium text-gray-700 dark:text-gray-300">{profile.name} · </span>}
            {showFacultyPicker ? (
              <span className="inline-flex items-center gap-2">
                Facultad
                <select
                  value={faculty}
                  onChange={(e) => setFaculty(e.target.value)}
                  className="text-sm font-semibold text-blue-600 dark:text-blue-400 bg-transparent border border-gray-300 dark:border-gray-600 rounded-md px-2 py-0.5"
                >
                  {selectableFaculties.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </span>
            ) : (
              <>Facultad <span className="font-semibold text-blue-600 dark:text-blue-400">{faculty}</span></>
            )}
          </p>
          {lastLoaded && (
            <p className="text-xs text-gray-400">Actualizado: {lastLoaded.toLocaleTimeString()}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            onClick={load}
            disabled={isLoading}
            className="gap-2 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          {mode === 'python' && !isLoading && pythonPredictions.length > 0 && (
            <Button
              variant="outline"
              onClick={openPrintDialog}
              className="gap-2 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              <Printer className="w-4 h-4" />
              Imprimir reporte{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 p-0.5 bg-gray-50 dark:bg-gray-800/80">
          <button
            type="button"
            onClick={() => setEstimatorMode('python')}
            disabled={!pythonAvailable}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'python'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            Cobertura (modelo v4)
          </button>
          <button
            type="button"
            onClick={() => setEstimatorMode('live')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'live'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Estimador en vivo (legado)
          </button>
        </div>
        {mode === 'python' && pythonIndex && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Modelo <strong>{modelMeta?.name ?? `v${pythonIndex.version}`}</strong>
            {' '}· generado {formatGeneratedAt(modelMeta?.generated_at ?? pythonIndex.generated_at)}
            {(pythonIndex.target_period_label || targetPeriodLabel) && (
              <> · Predicción para <strong>{pythonIndex.target_period_label ?? targetPeriodLabel}</strong>
                {(pythonIndex.target_period_code || targetPeriodCode) ? ` (${pythonIndex.target_period_code ?? targetPeriodCode})` : ''}
              </>
            )}
          </p>
        )}
        {mode === 'live' && targetPeriodLabel && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Predicción para <strong>{targetPeriodLabel}</strong>
            {targetPeriodCode ? ` (${targetPeriodCode})` : ''}
            {transitionRates ? ' · tasas DAG calibradas' : ' · tasas DAG por defecto (80/50/25)'}
          </p>
        )}
      </div>

      {!pythonAvailable && !isLoading && (
        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          No se encontró el índice del modelo en{' '}
          <code className="text-amber-900 dark:text-amber-200">{getPythonPredictionsUrl()}</code>.
          Genera el archivo con{' '}
          <code className="text-amber-900 dark:text-amber-200">python train.py --skip-export</code>{' '}
          en <code className="text-amber-900 dark:text-amber-200">predictor/</code>
          (escribe en <code className="text-amber-900 dark:text-amber-200">frontend/public/data/predictor-dashboard.json</code>).
          Si despliegas en GitHub Pages, incluye ese archivo en el build o en el repositorio.
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error al cargar datos</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {!isLoading && predictions.length > 0 && (
        <Card className="p-4 dark:bg-gray-800 border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
              <p className="font-medium text-gray-900 dark:text-white">¿Cómo leer esta tabla?</p>
              {mode === 'python' ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Vista <strong>Cobertura (modelo v4)</strong>: compara la <strong>demanda estimada</strong> (matrícula esperada,
                  con rango piso–central–techo) contra el <strong>cupo publicado</strong> del período objetivo.
                  {modelMeta?.method ? ` ${modelMeta.method}` : ''}
                </p>
              ) : (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Vista <strong>Estimador en vivo (legado)</strong>: fórmula híbrida calculada en el navegador con la
                  matrícula histórica del catálogo y propagación DAG. Se conserva para comparar; la vista de cobertura es la referencia.
                </p>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Se listan las materias bajo supervisión de la facultad <strong>{faculty}</strong>
                (p. ej. <strong>{faculty}-*</strong> en el catálogo; Economía usa <strong>ECN-*</strong>).
                Las variantes con sufijo E (p. ej. CMP-5006E) se agrupan con su código base.
              </p>
              <ul className="list-disc list-inside text-xs space-y-1 text-gray-600 dark:text-gray-400">
                <li><strong>Cupo ofertado / publicado:</strong> asientos abiertos por la universidad (suma de NRC de Teoría). No es demanda.</li>
                <li><strong>Matriculados:</strong> estudiantes inscritos = cupo − disponibles al cierre del período (se subestima donde la sección se llenó).</li>
                <li><strong>Demanda estimada:</strong> proyección de matriculados para el período objetivo; la oferta aún no tiene matrícula (disponibles vacío ≠ agotado).</li>
                <li><strong>Cursando / Planeada:</strong> señales de la muestra de usuarios de la app (pequeña y no representativa); solo ajustan la estimación.</li>
                {mode === 'live' && (
                  <li><strong>DAG hist. / DAG curs.:</strong> demanda propagada por prerrequisitos desde el histórico y desde quienes cursan ahora.</li>
                )}
                <li><strong>Clic en una fila</strong> abre el detalle por período.</li>
              </ul>
            </div>
          </div>
        </Card>
      )}

      {!isLoading && predictions.length > 0 && (
        mode === 'python' ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Déficit crítico" value={coverageCounts.deficit_critico ?? 0} icon={<AlertCircle className="w-5 h-5" />} />
            <StatCard label="Déficit leve" value={coverageCounts.deficit_leve ?? 0} icon={<TrendingUp className="w-5 h-5" />} />
            <StatCard label="Exceso de cupo" value={coverageCounts.exceso ?? 0} icon={<BarChart3 className="w-5 h-5" />} />
            <StatCard
              label="Demanda central / cupo publicado"
              value={`${Math.round(totalDemand)} / ${totalCapacity}`}
              icon={<Users className="w-5 h-5" />}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Materias supervisadas" value={predictions.length} icon={<BookOpen className="w-5 h-5" />} />
            <StatCard label="Con histórico" value={withHistory} icon={<BarChart3 className="w-5 h-5" />} />
            <StatCard label="Cursando (este sem.)" value={totalCursando} icon={<Users className="w-5 h-5" />} />
            <StatCard label="Planean próximo sem." value={totalPlannedNext} icon={<TrendingUp className="w-5 h-5" />} />
          </div>
        )
      )}

      <Card className="dark:bg-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-wrap gap-2">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {mode === 'python' ? 'Cobertura de oferta vs demanda' : 'Predicción de demanda'} — {faculty}
            {mode === 'python' && (
              <span className="ml-2 text-xs font-normal text-emerald-600 dark:text-emerald-400">({modelMeta?.name ?? 'modelo v4'})</span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Ordenar:</span>
            {(mode === 'python'
              ? (['coverage', 'predicted', 'planned', 'trend'] as const)
              : (['predicted', 'planned', 'trend'] as const)
            ).map((opt) => (
              <button
                key={opt}
                onClick={() => setSortBy(opt)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  (sortBy === opt || (opt === 'predicted' && sortBy === 'coverage' && mode === 'live'))
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {opt === 'coverage' ? 'Cobertura' : opt === 'planned' ? 'Planeadas' : opt === 'predicted' ? 'Secciones' : 'Tendencia'}
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
            <p>No hay materias con código {faculty}-* en el histórico del catálogo.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                  {mode === 'python' && (
                    <th className="pl-4 pr-1 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Seleccionar todas las materias de la tabla"
                        title="Seleccionar todas para el reporte"
                        className="rounded border-gray-300 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Código</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Materia</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-20 text-center" title="Estudiantes cursando esta materia este semestre (muestra de la app)">Cursando</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-20 text-center" title="Estudiantes que la planean para el próximo semestre (muestra de la app)">Planeada</th>
                  {mode === 'python' ? (
                    <>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-40 text-center" title="Matrícula esperada: piso – central – techo">Demanda estimada</th>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-28 text-center" title="Cupo publicado = suma de cupos de Teoría del período objetivo">Cupo publicado</th>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-36 text-center">Cobertura</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-24 text-center" title="Demanda propagada desde la matrícula histórica del catálogo">DAG hist.</th>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-24 text-center" title="Demanda propagada desde quienes cursan prerrequisitos ahora">DAG curs.</th>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-32 text-center" title="Matriculados y cupo ofertado promedio por período regular">Histórico</th>
                      <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-28 text-center">Secciones</th>
                    </>
                  )}
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-20 text-center">Tend.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {sortedPredictions.map((row) => (
                  <tr
                    key={row.offer_code}
                    onClick={() => setSelected(row)}
                    className="hover:bg-blue-50/60 dark:hover:bg-blue-900/20 transition-colors cursor-pointer"
                  >
                    {mode === 'python' && (
                      <td className="pl-4 pr-1 py-3 w-8" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedCodes.has(row.offer_code)}
                          onChange={() => toggleSelected(row.offer_code)}
                          aria-label={`Incluir ${row.offer_code} en el reporte`}
                          className="rounded border-gray-300 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
                        {row.offer_code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-[200px] truncate" title={row.title}>
                      {row.title}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">
                      {row.in_progress_count}
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-blue-700 dark:text-blue-400">
                      {row.planned_next}
                    </td>
                    {mode === 'python' ? (
                      <>
                        <td className="px-4 py-3 text-center">
                          {row.demand_low != null && row.has_history ? (
                            <div>
                              <div className="font-semibold text-gray-800 dark:text-gray-200">{row.estimated_students}</div>
                              <div className="text-[11px] text-gray-400">{row.demand_low} – {row.demand_high}</div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Sin base histórica</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="font-semibold text-gray-800 dark:text-gray-200">{row.published_capacity ?? 0}</div>
                          <div className="text-[11px] text-gray-400">{row.published_sections ?? 0} secc.</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <CoverageBadge value={row.coverage_class} />
                          {row.possibly_partial_offer && (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5" title="El cupo publicado es menos del 60% del de la misma estación del año anterior: ¿oferta parcial?">¿oferta parcial?</div>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          <DemandBar value={row.inflow_from_history} max={maxDemand} />
                        </td>
                        <td className="px-4 py-3">
                          <DemandBar value={row.inflow_from_cursando} max={maxDemand} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.num_periods > 0 ? (
                            <div>
                              <div className="font-medium text-gray-800 dark:text-gray-200">
                                ~{Math.round(row.avg_students)} matric.
                              </div>
                              <div className="text-xs text-gray-400">
                                {Math.round(row.avg_sections)} secc. · ~{Math.round(row.avg_capacity)} cupos · {row.num_periods} per.
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Sin datos</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`text-lg font-bold ${
                              row.predicted_sections >= (row.avg_sections || 1)
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-orange-500 dark:text-orange-400'
                            }`}
                          >
                            {row.predicted_sections}
                          </span>
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3">
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
      </Card>

      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="sm:max-w-md dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-left dark:text-white">Imprimir reporte</DialogTitle>
            <DialogDescription className="text-left">
              Reporte con resumen y un gráfico por materia (cupo ofertado vs matriculados y estimación).
              Se imprime desde el navegador; elige «Guardar como PDF» para obtener un archivo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <label
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${
                selectedCount === 0 ? 'opacity-50 cursor-not-allowed' : ''
              } ${printScope === 'selected' ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-600'}`}
            >
              <input
                type="radio"
                name="print-scope"
                className="mt-1"
                checked={printScope === 'selected'}
                disabled={selectedCount === 0}
                onChange={() => setPrintScope('selected')}
              />
              <span>
                <strong>Materias seleccionadas</strong> ({selectedCount})
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  {selectedCount === 0
                    ? 'Marca materias con las casillas de la tabla para habilitar esta opción.'
                    : 'Solo las marcadas en la tabla.'}
                </span>
              </span>
            </label>
            <label
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${
                printScope === 'faculty' ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-600'
              }`}
            >
              <input
                type="radio"
                name="print-scope"
                className="mt-1"
                checked={printScope === 'faculty'}
                onChange={() => setPrintScope('faculty')}
              />
              <span>
                <strong>Toda la facultad {faculty}</strong> ({pythonPredictions.length})
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  Todas las materias supervisadas cargadas.
                  {pythonPredictions.length > 150 ? ' Es un reporte largo: se prepara por lotes antes de poder imprimir.' : ''}
                </span>
              </span>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={generateReport}
              disabled={printScope === 'selected' && selectedCount === 0}
              className="gap-2"
            >
              <Printer className="w-4 h-4" /> Generar reporte
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {reportRows && (
        <Suspense fallback={null}>
        <PredictionPrintReport
          rows={reportRows}
          faculty={faculty}
          targetPeriodLabel={pythonIndex?.target_period_label ?? targetPeriodLabel}
          targetPeriodCode={pythonIndex?.target_period_code ?? targetPeriodCode}
          modelName={modelMeta?.name}
          generatedAt={modelMeta?.generated_at ?? pythonIndex?.generated_at}
          scopeLabel={reportScopeLabel}
          onClose={() => setReportRows(null)}
        />
        </Suspense>
      )}

      {selected && (
        <CourseDemandDetailDialog
          open={Boolean(selected)}
          onOpenChange={(open) => { if (!open) setSelected(null); }}
          offerCode={selected.offer_code}
          title={selected.title}
          inProgressCount={selected.in_progress_count}
          plannedNext={selected.planned_next}
          inflowFromHistory={selected.inflow_from_history}
          inflowFromCursando={selected.inflow_from_cursando}
          propagatedStudents={selected.propagated_students}
          suggestedSections={selected.predicted_sections}
          estimatedStudents={selected.estimated_students}
          trend={selected.trend}
          history={historyMap.get(selected.offer_code)}
          targetPeriodLabel={targetPeriodLabel}
          targetPeriodCode={targetPeriodCode}
          modelLabel={mode === 'live' ? 'híbrido legado (en vivo)' : selected.model_label}
          modelGeneratedAt={mode === 'python' ? (modelMeta?.generated_at ?? pythonIndex?.generated_at) : undefined}
          coverage={mode === 'python' && selected.coverage_class ? {
            coverageClass: selected.coverage_class,
            demandLow: selected.demand_low ?? null,
            demandHigh: selected.demand_high ?? null,
            publishedCapacity: selected.published_capacity ?? 0,
            publishedSections: selected.published_sections ?? 0,
            utilization: selected.utilization_central ?? null,
            confidence: selected.confidence ?? null,
            recommendation: selected.recommendation ?? '',
            possiblyPartialOffer: Boolean(selected.possibly_partial_offer),
          } : undefined}
          prerequisiteRates={
            mode === 'live'
              ? transitionRates?.incomingEdges(
                  livePredictions.find((r) => r.offer_code === selected.offer_code)?.course_id ?? selected.course_id,
                ) ?? []
              : []
          }
        />
      )}
    </div>
  );
}
