/** USFQ academic period calendar — mirrors predictor/features/period_calendar.py */

export type PeriodKind =
  | 'regular_10'
  | 'regular_20'
  | 'summer'
  | 'medical_year'
  | 'unknown';

export interface PeriodInfo {
  code: string;
  label: string;
  kind: PeriodKind;
  year: number;
  suffix: string;
}

const MEDICAL_SUFFIXES = new Set(['08', '13', '23', '03']);

export function classifyPeriodKind(periodCode: string): PeriodKind {
  if (periodCode.length < 2) return 'unknown';
  const suffix = periodCode.slice(-2);
  if (suffix === '30') return 'summer';
  if (suffix === '10') return 'regular_10';
  if (suffix === '20') return 'regular_20';
  if (MEDICAL_SUFFIXES.has(suffix)) return 'medical_year';
  return 'unknown';
}

export function isRegularKind(kind: PeriodKind): boolean {
  return kind === 'regular_10' || kind === 'regular_20';
}

export function isSummerPeriodCode(periodCode: string): boolean {
  return classifyPeriodKind(periodCode) === 'summer';
}

export function isMedicalPeriodCode(periodCode: string): boolean {
  return classifyPeriodKind(periodCode) === 'medical_year';
}

/** @deprecated Use isSummerPeriodCode — kept for backward compat */
export function isSummerPeriod(periodCode: string): boolean {
  return isSummerPeriodCode(periodCode);
}

export function isVeranoBlockCourse(block: string | undefined): boolean {
  return (block ?? '').toLowerCase().includes('verano');
}

export class AcademicCalendar {
  private byCode: Map<string, PeriodInfo>;
  private chrono: PeriodInfo[];
  private regular: PeriodInfo[];

  constructor(catalog: PeriodInfo[]) {
    this.byCode = new Map(catalog.map((p) => [p.code, p]));
    this.chrono = [...catalog].sort((a, b) => a.code.localeCompare(b.code));
    this.regular = this.chrono.filter((p) => isRegularKind(p.kind));
  }

  static fromCatalogRows(rows: { code: string; label?: string }[]): AcademicCalendar {
    const catalog = rows.map((r) => makePeriodInfo(r.code, r.label ?? r.code));
    return new AcademicCalendar(catalog);
  }

  get(code: string): PeriodInfo | undefined {
    return this.byCode.get(code);
  }

  regularCodes(): string[] {
    return this.regular.map((p) => p.code);
  }

  nextRegular(fromCode: string): string | null {
    const codes = this.chrono.map((p) => p.code);
    const start = codes.indexOf(fromCode);
    if (start < 0) return this.regular.at(-1)?.code ?? null;
    for (let i = start + 1; i < codes.length; i++) {
      const info = this.byCode.get(codes[i]);
      if (info && isRegularKind(info.kind)) return codes[i];
    }
    return null;
  }

  advanceRegular(fromCode: string, semesterDelta: number): string | null {
    if (semesterDelta <= 0) return this.byCode.has(fromCode) ? fromCode : null;
    let current = fromCode;
    for (let i = 0; i < semesterDelta; i++) {
      const nxt = this.nextRegular(current);
      if (!nxt) return null;
      current = nxt;
    }
    return current;
  }

  summerBeforeRegular(regularCode: string): string | null {
    const info = this.byCode.get(regularCode);
    if (!info || info.kind !== 'regular_10') return null;
    const codes = this.chrono.map((p) => p.code);
    const idx = codes.indexOf(regularCode);
    for (let i = idx - 1; i >= 0; i--) {
      const p = this.byCode.get(codes[i]);
      if (p?.kind === 'summer') return codes[i];
    }
    return null;
  }

  inferTargetPeriod(currentPeriodCode: string | null | undefined): {
    targetPeriodCode: string;
    targetPeriodLabel: string;
  } {
    if (this.chrono.length === 0) {
      return { targetPeriodCode: '', targetPeriodLabel: '' };
    }
    if (!currentPeriodCode || !this.byCode.has(currentPeriodCode)) {
      const lastReg = this.regular.at(-1) ?? this.chrono.at(-1)!;
      const nxt = this.nextRegular(lastReg.code) ?? lastReg.code;
      const tgt = this.byCode.get(nxt);
      return { targetPeriodCode: nxt, targetPeriodLabel: tgt?.label ?? nxt };
    }
    const nxt = this.nextRegular(currentPeriodCode) ?? this.regular.at(-1)?.code ?? currentPeriodCode;
    const tgt = this.byCode.get(nxt);
    return { targetPeriodCode: nxt, targetPeriodLabel: tgt?.label ?? nxt };
  }

  seedPeriodForTarget(targetCode: string): string | null {
    const codes = this.chrono.map((p) => p.code);
    const idx = codes.indexOf(targetCode);
    if (idx <= 0) return this.regular.at(-1)?.code ?? null;
    return codes[idx - 1] ?? null;
  }
}

export function makePeriodInfo(code: string, label: string): PeriodInfo {
  const kind = classifyPeriodKind(code);
  const year = code.length >= 4 && /^\d{4}/.test(code) ? parseInt(code.slice(0, 4), 10) : 0;
  return { code, label, kind, year, suffix: code.slice(-2) };
}

let cachedCalendar: AcademicCalendar | null = null;

export async function loadAcademicCalendar(): Promise<AcademicCalendar> {
  if (cachedCalendar) return cachedCalendar;
  try {
    const base = import.meta.env.BASE_URL || '/';
    const res = await fetch(`${base}data/periods.json`, { cache: 'no-cache' });
    if (res.ok) {
      const rows = (await res.json()) as { code: string; label?: string }[];
      cachedCalendar = AcademicCalendar.fromCatalogRows(rows);
      return cachedCalendar;
    }
  } catch {
    // fallback below
  }
  cachedCalendar = AcademicCalendar.fromCatalogRows(FALLBACK_PERIODS);
  return cachedCalendar;
}

export function clearAcademicCalendarCache(): void {
  cachedCalendar = null;
}

const FALLBACK_PERIODS = [
  { code: '202630', label: 'Verano 2026/2027' },
  { code: '202610', label: 'Primer Semestre 2026/2027' },
  { code: '202520', label: 'Segundo Semestre 2025/2026' },
  { code: '202510', label: 'Primer Semestre 2025/2026' },
  { code: '202430', label: 'Verano 2024/2025' },
  { code: '202420', label: 'Segundo Semestre 2024/2025' },
  { code: '202410', label: 'Primer Semestre 2024/2025' },
];
