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

/** USFQ offer code: CMP 1001 / CMP1001 / CMP-1001 → CMP-1001 */
export function normalizeOfferCourseCode(code: string): string {
  const raw = code.trim().toUpperCase().replace(/\s+/g, '-');
  if (/^[A-Z]{2,5}-\d/.test(raw)) return raw;
  const bare = raw.replace(/-/g, '');
  const match = bare.match(/^([A-Z]{2,5})(\d.*)$/);
  if (match) return `${match[1]}-${match[2]}`;
  return raw;
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
  if (offerCode === normalizeOfferCourseCode(course.id)) return true;

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

export function normalizeOfferTime(time: string | null | undefined): string {
  if (!time) return "00:00";
  return time.slice(0, 5);
}

export function timeToMinutes(time: string): number {
  const [h, m] = normalizeOfferTime(time).split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Grid rows are spaced 90 min apart; each row represents a 1h30 block. */
export const GRID_SLOT_DURATION_MINUTES = 90;

export const GRID_TIME_SLOTS = [
  '07:00', '08:30', '10:00', '11:30', '13:00', '14:30', '16:00', '17:30',
] as const;

export interface ScheduleSessionSlot {
  day: string;
  startTime: string;
  endTime?: string;
}

export function expandSessionToGridSlots(
  startTime: string | null | undefined,
  endTime?: string | null
): string[] {
  if (!startTime) return [];
  const start = timeToMinutes(startTime);
  const end = endTime
    ? timeToMinutes(endTime)
    : start + GRID_SLOT_DURATION_MINUTES;
  if (end <= start) return [normalizeOfferTime(startTime)];

  const slots: string[] = [];
  let t = start;
  while (t < end) {
    slots.push(minutesToTime(t));
    t += GRID_SLOT_DURATION_MINUTES;
  }
  return slots;
}

export function sessionOccupiesGridSlot(
  session: ScheduleSessionSlot,
  day: string,
  slotTime: string
): boolean {
  if (session.day !== day) return false;
  return expandSessionToGridSlots(session.startTime, session.endTime).includes(
    normalizeOfferTime(slotTime)
  );
}

export function collectCalendarTimeSlots(
  sessions: ScheduleSessionSlot[]
): string[] {
  const slotSet = new Set<string>(GRID_TIME_SLOTS);
  sessions.forEach((sess) => {
    if (!sess.startTime) return;
    expandSessionToGridSlots(sess.startTime, sess.endTime).forEach((t) =>
      slotSet.add(t)
    );
  });
  return [...slotSet].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
}

export function sessionsFromOfferRow(row: CourseOfferRow): ScheduleSessionSlot[] {
  if (!row.start_time) return [];
  const startTime = normalizeOfferTime(row.start_time);
  const endTime = row.end_time ? normalizeOfferTime(row.end_time) : undefined;
  return row.days
    .map(normalizeOfferDay)
    .filter((d): d is string => d !== null)
    .map((day) => ({ day, startTime, endTime }));
}

export function formatSessionTimeRange(session: ScheduleSessionSlot): string {
  if (session.endTime && session.endTime !== session.startTime) {
    return `${session.startTime}–${session.endTime}`;
  }
  return session.startTime;
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

export function getScheduleDisplayLabels(
  course: Course,
  schedule: {
    offerCourseCode?: string;
    nrc: string;
    nrcEJ?: string;
    nrcLAB?: string;
  },
  offerMap: Map<string, CourseOfferRow>,
  part: 'main' | 'ej' | 'lab' = 'main'
): { code: string; title: string } {
  const nrc =
    part === 'main'
      ? schedule.nrc
      : part === 'ej'
        ? schedule.nrcEJ
        : schedule.nrcLAB;

  if (nrc) {
    const row = offerMap.get(nrc);
    if (row) return { code: row.course_code, title: row.title };
  }

  if (isOpenElectiveCourse(course) && schedule.offerCourseCode?.trim()) {
    const preview = getOfferCoursePreview(offerMap, schedule.offerCourseCode);
    if (preview) return { code: preview.course_code, title: preview.title };
    const code = normalizeOfferCourseCode(schedule.offerCourseCode);
    return { code, title: code };
  }

  return { code: course.code, title: course.title };
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
  const row = offerMap.get(nrc);
  if (!row) return false;
  return sessionsFromOfferRow(row).some((sess) =>
    expandSessionToGridSlots(sess.startTime, sess.endTime).some((slot) =>
      occupied.has(slotKey(sess.day, slot))
    )
  );
}

export function formatOfferSchedule(row: CourseOfferRow): string {
  if (row.days.length === 0 || !row.start_time) return 'Sin horario';
  const time = `${normalizeOfferTime(row.start_time)}${row.end_time ? `–${normalizeOfferTime(row.end_time)}` : ''}`;
  const days = row.days.map(d => normalizeOfferDay(d) ?? d).join(', ');
  return `${days} ${time}`;
}
