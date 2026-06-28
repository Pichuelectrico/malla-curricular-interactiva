import React, { useEffect, useState } from 'react';
import {
  BarChart3, BookOpen, TrendingUp, Users, RefreshCw,
  GraduationCap, ChevronUp, ChevronDown, Minus, AlertCircle, Info,
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
import { fetchOfferHistoryForCourses, type CourseHistoryStats } from '../lib/offerHistory';
import {
  formatGeneratedAt,
  clearPythonPredictionsCache,
  getPythonPredictionsUrl,
  loadPythonPredictions,
  lookupPythonPrediction,
  type PythonPredictionsIndex,
} from '../lib/pythonPredictions';
import type { ProfessorContext } from '../lib/useUserRole';
import CourseDemandDetailDialog from './CourseDemandDetailDialog';

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
  num_periods: number;
  predicted_sections: number;
  estimated_students: number;
  trend: DemandTrend;
  model_label?: string;
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

  const [historyMap, setHistoryMap] = useState<Map<string, CourseHistoryStats>>(new Map());
  const [livePredictions, setLivePredictions] = useState<PredictionRow[]>([]);
  const [pythonIndex, setPythonIndex] = useState<PythonPredictionsIndex | null>(null);
  const [estimatorMode, setEstimatorMode] = useState<EstimatorMode>('live');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const [sortBy, setSortBy] = useState<'planned' | 'predicted' | 'trend'>('predicted');
  const [selected, setSelected] = useState<PredictionRow | null>(null);

  const load = async () => {
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
      const histMap = historyFetchCodes.length > 0
        ? await fetchOfferHistoryForCourses(historyFetchCodes)
        : new Map<string, CourseHistoryStats>();

      const historySeeds = buildHistoricalSeeds(mallaCourses, histMap);
      const { totalInflow, inflowFromHistory, inflowFromCursando } = propagateDemandFromSources(
        graph,
        historySeeds,
        cursandoByCourseId,
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
          num_periods: hist?.numPeriods ?? 0,
          predicted_sections: result.suggestedSections,
          estimated_students: result.estimatedStudents,
          trend: result.trend,
        };
      });

      setHistoryMap(histMap);
      setLivePredictions(preds);

      clearPythonPredictionsCache();
      const pyIndex = await loadPythonPredictions();
      setPythonIndex(pyIndex);
      setLastLoaded(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los datos');
    } finally {
      setIsLoading(false);
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
    };
  });

  const predictions = estimatorMode === 'live' ? livePredictions : pythonPredictions;
  const pythonAvailable = Boolean(pythonIndex?.by_offer_code && Object.keys(pythonIndex.by_offer_code).length > 0);

  const sortedPredictions = [...predictions].sort((a, b) => {
    if (sortBy === 'planned') return b.planned_next - a.planned_next;
    if (sortBy === 'predicted') return b.predicted_sections - a.predicted_sections;
    const order = { up: 3, stable: 2, new: 1, down: 0 };
    return order[b.trend] - order[a.trend];
  });

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

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 p-0.5 bg-gray-50 dark:bg-gray-800/80">
          <button
            type="button"
            onClick={() => setEstimatorMode('live')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              estimatorMode === 'live'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Estimador actual
          </button>
          <button
            type="button"
            onClick={() => setEstimatorMode('python')}
            disabled={!pythonAvailable}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              estimatorMode === 'python'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            Modelo Python
          </button>
        </div>
        {estimatorMode === 'python' && pythonIndex && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Batch generado: {formatGeneratedAt(pythonIndex.generated_at)}
            {pythonIndex.version ? ` · v${pythonIndex.version}` : ''}
          </p>
        )}
        {estimatorMode === 'live' && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Cálculo en vivo con Supabase (misma fórmula híbrida + DAG).
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
              {estimatorMode === 'python' ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Vista <strong>Modelo Python</strong>: predicciones del batch offline (fórmula híbrida + DAG
                  {pythonIndex ? ', con GBR opcional si hubo entrenamiento' : ''}).
                  Los históricos del gráfico siguen viniendo del catálogo en vivo.
                </p>
              ) : (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Vista <strong>Estimador actual</strong>: cálculo en tiempo real en el navegador.
                </p>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Se listan las materias bajo supervisión de la facultad <strong>{faculty}</strong>
                (p. ej. <strong>{faculty}-*</strong> en el catálogo; Economía usa <strong>ECN-*</strong>).
                No es la malla completa de la carrera.
              </p>
              <ul className="list-disc list-inside text-xs space-y-1 text-gray-600 dark:text-gray-400">
                <li><strong>Cursando:</strong> estudiantes tomando la materia <em>este semestre</em> en la app.</li>
                <li><strong>Planeada:</strong> estudiantes que la marcaron para el <em>próximo semestre</em> (demanda directa).</li>
                <li><strong>DAG hist.:</strong> cohorte del catálogo del semestre pasado que avanza por la malla (ej. cupo en C++ → ~80% en C++ avanzado).</li>
                <li><strong>DAG cursando:</strong> quienes <em>cursan</em> un prerrequisito ahora y probablemente tomarán esta materia el próximo semestre.</li>
                <li><strong>Histórico / Secciones:</strong> oferta real pasada del catálogo USFQ + sugerencia combinada.</li>
                <li><strong>Clic en una fila</strong> abre el gráfico por período.</li>
              </ul>
            </div>
          </div>
        </Card>
      )}

      {!isLoading && predictions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Materias supervisadas" value={predictions.length} icon={<BookOpen className="w-5 h-5" />} />
          <StatCard label="Con histórico" value={withHistory} icon={<BarChart3 className="w-5 h-5" />} />
          <StatCard label="Cursando (este sem.)" value={totalCursando} icon={<Users className="w-5 h-5" />} />
          <StatCard label="Planean próximo sem." value={totalPlannedNext} icon={<TrendingUp className="w-5 h-5" />} />
        </div>
      )}

      <Card className="dark:bg-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-wrap gap-2">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            Predicción de demanda — {faculty}
            {estimatorMode === 'python' && (
              <span className="ml-2 text-xs font-normal text-emerald-600 dark:text-emerald-400">(modelo Python)</span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Ordenar:</span>
            {(['predicted', 'planned', 'trend'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setSortBy(opt)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  sortBy === opt
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {opt === 'planned' ? 'Planeadas' : opt === 'predicted' ? 'Secciones' : 'Tendencia'}
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
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Código</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Materia</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-20 text-center" title="Estudiantes cursando esta materia este semestre">Cursando</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-20 text-center" title="Estudiantes que la planean para el próximo semestre">Planeada</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-24 text-center" title="Demanda propagada desde el histórico del catálogo">DAG hist.</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-24 text-center" title="Demanda propagada desde quienes cursan prerrequisitos ahora">DAG curs.</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-32 text-center">Histórico</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-28 text-center">Secciones</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 w-20 text-center">Tend.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {sortedPredictions.map((row) => (
                  <tr
                    key={row.course_id}
                    onClick={() => setSelected(row)}
                    className="hover:bg-blue-50/60 dark:hover:bg-blue-900/20 transition-colors cursor-pointer"
                  >
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
                            {Math.round(row.avg_sections)} secc.
                          </div>
                          <div className="text-xs text-gray-400">
                            ~{Math.round(row.avg_students)} cupos · {row.num_periods} períodos
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Sin datos</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.model_label === 'sin datos' ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : (
                        <span
                          className={`text-lg font-bold ${
                            row.predicted_sections >= (row.avg_sections || 1)
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-orange-500 dark:text-orange-400'
                          }`}
                        >
                          {row.predicted_sections}
                        </span>
                      )}
                      {estimatorMode === 'python' && row.model_label && row.model_label !== 'sin datos' && (
                        <div className="text-[10px] text-gray-400 mt-0.5">{row.model_label}</div>
                      )}
                    </td>
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
        />
      )}
    </div>
  );
}
