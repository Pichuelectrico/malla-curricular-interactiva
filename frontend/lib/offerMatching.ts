import type { Course } from '../types/curriculum';
import type { CourseOfferRow } from './useCourseOffer';

const DAY_FULL_TO_SHORT: Record<string, string> = {
  Lunes: 'Lun',
  Martes: 'Mar',
  Miércoles: 'Mié',
  Miercoles: 'Mié',
  Jueves: 'Jue',
  Viernes: 'Vie',
};

const SHORT_DAYS = new Set(['Lun', 'Mar', 'Mié', 'Jue', 'Vie']);

export function normalizeCurriculumCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '-');
}

/** Curriculum slots without a fixed USFQ code (ARTE, HUM, ELECTIVA, etc.) */
export function hasSpecificCourseCode(course: Course): boolean {
  const normalized = normalizeCurriculumCode(course.code);
  return /^[A-Z]{2,5}-\d/.test(normalized);
}

export function isOpenElectiveCourse(course: Course): boolean {
  return !hasSpecificCourseCode(course);
}

export function normalizeOfferCourseCodeInput(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');
}

function getElectivePrefixes(course: Course): string[] | null {
  const normalized = normalizeCurriculumCode(course.code);
  if (/^[A-Z]{2,5}-\d/.test(normalized)) return null;

  const colonMatch = course.title.match(/:\s*([A-Z/]+)/i);
  if (colonMatch) {
    return colonMatch[1].split('/').map(p => `${p.trim().toUpperCase()}-`);
  }

  if (!/\d/.test(normalized)) {
    const area = course.area?.toUpperCase();
    if (area && area.length >= 2) return [`${area}-`];
  }

  return null;
}

export function courseMatchesOffer(course: Course, row: CourseOfferRow): boolean {
  const normalizedCode = normalizeCurriculumCode(course.code);
  const offerCode = row.course_code.toUpperCase();

  if (offerCode === normalizedCode) return true;
  if (offerCode === normalizeCurriculumCode(course.id)) return true;

  const prefixes = getElectivePrefixes(course);
  if (prefixes) {
    return prefixes.some(p => offerCode.startsWith(p));
  }

  return false;
}

export function isValidOfferSchedule(row: CourseOfferRow): boolean {
  if (!row.start_time || row.days.length === 0) return false;
  if (row.start_time.startsWith('00:00') && row.end_time?.startsWith('00:0')) return false;
  return sessionsFromOfferRow(row).length > 0;
}

export function normalizeOfferDay(day: string): string | null {
  if (SHORT_DAYS.has(day)) return day;
  return DAY_FULL_TO_SHORT[day] ?? null;
}

export function normalizeOfferTime(time: string): string {
  return time.slice(0, 5);
}

export function sessionsFromOfferRow(row: CourseOfferRow): { day: string; startTime: string }[] {
  if (!row.start_time) return [];
  const startTime = normalizeOfferTime(row.start_time);
  return row.days
    .map(normalizeOfferDay)
    .filter((d): d is string => d !== null)
    .map(day => ({ day, startTime }));
}

export function sessionsFromOfferNrc(
  nrc: string,
  offerMap: Map<string, CourseOfferRow>
): { day: string; startTime: string }[] {
  const row = offerMap.get(nrc);
  if (!row) return [];
  return sessionsFromOfferRow(row);
}

export type OfferSessionType = 'Teoría' | 'Ejercicios' | 'Laboratorio';

export function getOffersForCourse(
  offerMap: Map<string, CourseOfferRow>,
  course: Course,
  type: OfferSessionType = 'Teoría'
): CourseOfferRow[] {
  return [...offerMap.values()].filter(
    row => row.type === type && courseMatchesOffer(course, row)
  );
}

export function getOffersForExplicitCode(
  offerMap: Map<string, CourseOfferRow>,
  explicitCode: string,
  type: OfferSessionType = 'Teoría'
): CourseOfferRow[] {
  const normalized = normalizeCurriculumCode(explicitCode);
  if (!normalized) return [];
  return [...offerMap.values()].filter(
    row => row.type === type && row.course_code.toUpperCase() === normalized
  );
}

export function getOffersForSchedule(
  offerMap: Map<string, CourseOfferRow>,
  course: Course,
  explicitCode: string | undefined,
  type: OfferSessionType = 'Teoría'
): CourseOfferRow[] {
  const trimmed = explicitCode?.trim();
  if (trimmed) return getOffersForExplicitCode(offerMap, trimmed, type);
  if (isOpenElectiveCourse(course)) return [];
  return getOffersForCourse(offerMap, course, type);
}

export function getOfferCoursePreview(
  offerMap: Map<string, CourseOfferRow>,
  explicitCode: string
): CourseOfferRow | undefined {
  return getOffersForExplicitCode(offerMap, explicitCode, 'Teoría')[0];
}

export function getLinkedOffers(
  mainRow: CourseOfferRow,
  offerMap: Map<string, CourseOfferRow>,
  type: 'Ejercicios' | 'Laboratorio'
): CourseOfferRow[] {
  const letters = new Set(mainRow.group_letters);
  return [...offerMap.values()].filter(row => {
    if (row.course_code !== mainRow.course_code || row.type !== type) return false;
    if (letters.size === 0) return true;
    return row.group_letters.some(l => letters.has(l));
  });
}

export function slotKey(day: string, startTime: string): string {
  return `${day}-${startTime}`;
}

export function nrcConflictsWithSlots(
  nrc: string,
  occupied: Set<string>,
  offerMap: Map<string, CourseOfferRow>
): boolean {
  return sessionsFromOfferNrc(nrc, offerMap).some(s => occupied.has(slotKey(s.day, s.startTime)));
}

export function formatOfferSchedule(row: CourseOfferRow): string {
  if (row.days.length === 0 || !row.start_time) return 'Sin horario';
  const time = `${normalizeOfferTime(row.start_time)}${row.end_time ? `–${normalizeOfferTime(row.end_time)}` : ''}`;
  const days = row.days.map(d => normalizeOfferDay(d) ?? d).join(', ');
  return `${days} ${time}`;
}
