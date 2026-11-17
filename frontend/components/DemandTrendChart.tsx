import type { CourseHistoryStats } from '../lib/offerHistory';

function formatPeriodLabel(period: { periodLabel: string; periodCode: string }): string {
  const match = period.periodLabel.match(/(\d{4})\/(\d{4})/);
  if (match) {
    const start = match[1].slice(2);
    const end = match[2].slice(2);
    return `${start}-${end}`;
  }
  return period.periodCode;
}

export function TrendChart({
  history,
  estimatedStudents,
  targetPeriodLabel,
  publishedCapacity,
  light = false,
  compact = false,
}: {
  history: CourseHistoryStats;
  estimatedStudents: number;
  targetPeriodLabel?: string;
  publishedCapacity?: number;
  /** Fuerza colores claros (reporte impreso, aunque la app esté en modo oscuro). */
  light?: boolean;
  /** Oculta el texto explicativo largo (cada página del reporte ya trae su leyenda). */
  compact?: boolean;
}) {
  const cx = (lightCls: string, darkCls: string) => (light ? lightCls : `${lightCls} ${darkCls}`);
  const points = [
    ...history.periods.map((p) => ({
      key: p.periodCode,
      label: formatPeriodLabel(p),
      students: p.totalStudents,
      capacity: p.capacity as number | null,
      sections: p.sections,
      isEstimate: false,
      isSummer: p.isSummer,
    })),
    {
      key: 'estimate',
      label: targetPeriodLabel ? `→ ${targetPeriodLabel.slice(0, 12)}…` : 'Próximo',
      students: estimatedStudents,
      capacity: publishedCapacity ?? null,
      sections: Math.max(1, Math.round(estimatedStudents / 25)),
      isEstimate: true,
      isSummer: false,
    },
  ];

  const maxValue = Math.max(...points.map((p) => Math.max(p.students, p.capacity ?? 0)), 1);
  const chartH = 140;
  const barW = Math.min(20, Math.max(12, 150 / points.length));

  return (
    <div className="space-y-3" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      <div className={`flex items-end justify-center gap-3 h-[180px] px-2 border-b ${cx('border-gray-200', 'dark:border-gray-600')}`}>
        {points.map((p) => {
          const hStudents = Math.max(3, (p.students / maxValue) * chartH);
          const hCap = p.capacity != null ? Math.max(3, (p.capacity / maxValue) * chartH) : 0;
          return (
            <div key={p.key} className="flex flex-col items-center gap-1" style={{ width: barW * 2 + 8 }}>
              <div className="flex items-end gap-0.5">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] text-gray-400">{p.capacity ?? ''}</span>
                  <div
                    className={`rounded-t ${cx('bg-gray-300', 'dark:bg-gray-500')}`}
                    style={{ height: hCap, width: barW }}
                    title={p.capacity != null ? `Cupo ofertado: ${p.capacity} (${p.sections} sección(es) de Teoría)` : 'Sin cupo'}
                  />
                </div>
                <div className="flex flex-col items-center">
                  <span className={`text-[10px] font-medium ${cx('text-gray-700', 'dark:text-gray-200')}`}>{p.students}</span>
                  <div
                    className={`rounded-t ${
                      p.isEstimate
                        ? 'bg-emerald-500/80 border-2 border-dashed border-emerald-600'
                        : p.isSummer
                          ? cx('bg-amber-400', 'dark:bg-amber-500')
                          : cx('bg-blue-500', 'dark:bg-blue-400')
                    }`}
                    style={{ height: hStudents, width: barW }}
                    title={p.isEstimate ? `Demanda estimada: ${p.students}` : `Matriculados: ${p.students}`}
                  />
                </div>
              </div>
              <span className={`text-[9px] text-center leading-tight ${cx('text-gray-500', 'dark:text-gray-400')}`}>
                {p.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className={`flex flex-wrap gap-3 text-[11px] justify-center ${cx('text-gray-500', 'dark:text-gray-400')}`}>
        <span className="flex items-center gap-1">
          <span className={`w-2.5 h-2.5 rounded-sm ${cx('bg-gray-300', 'dark:bg-gray-500')}`} /> Cupo ofertado
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Matriculados (regular)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Matriculados (verano)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 border border-dashed border-emerald-700" /> Demanda estimada
        </span>
      </div>
      {!compact && (
      <p className={`text-xs text-center ${cx('text-gray-500', 'dark:text-gray-400')}`}>
        Barra gris = cupo ofertado (suma de NRC de Teoría; los laboratorios no se cuentan). Barra de color = matriculados
        (cupo − disponibles; en secciones llenas es un mínimo). La última columna es la estimación para el período objetivo
        junto a su cupo publicado.
      </p>
      )}
    </div>
  );
}

