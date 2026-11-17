import type { Course } from '../types/curriculum';
import { supabase } from './supabaseClient';
import { loadFacultyCurriculum } from './facultyCurriculum';
import { normalizeOfferCourseCode } from './offerMatching';
import { canonicalOfferCourseCode } from './offerCodes';

/**
 * Catalog code prefixes supervised by each faculty.
 * Default: the faculty code itself (CMP → CMP-*, BTC → BTC-*).
 */
export const FACULTY_OFFER_PREFIXES: Record<string, string[]> = {
  ECO: ['ECN'],
  // Arquitectura: código de carrera/malla AQQ, pero los cursos usan prefijo ARQ.
  AQQ: ['ARQ'],
};

/** Individual courses without a matching prefix but under faculty supervision. */
export const FACULTY_EXTRA_SUPERVISED_CODES: Record<string, string[]> = {};

export interface SupervisedCourse {
  offerCode: string;
  courseId: string;
  title: string;
  facultyCode: string;
}

export function offerPrefixesForFaculty(facultyCode: string): string[] {
  const faculty = facultyCode.toUpperCase();
  return FACULTY_OFFER_PREFIXES[faculty] ?? [faculty];
}

export function extraSupervisedCodes(facultyCode: string): string[] {
  return FACULTY_EXTRA_SUPERVISED_CODES[facultyCode.toUpperCase()] ?? [];
}

/** Map USFQ offer code to curriculum slot id used in user_progress. */
export function offerCodeToCourseId(offerCode: string, mallaCourses: Course[]): string {
  const normalized = normalizeOfferCourseCode(offerCode);
  const canonical = canonicalOfferCourseCode(offerCode);
  const match =
    mallaCourses.find(
      (c) =>
        normalizeOfferCourseCode(c.id) === normalized ||
        normalizeOfferCourseCode(c.code) === normalized,
    ) ??
    mallaCourses.find(
      (c) =>
        canonicalOfferCourseCode(c.id) === canonical ||
        canonicalOfferCourseCode(c.code) === canonical,
    );
  if (match) return match.id;
  return normalized.replace(/-/g, '');
}

export async function fetchFacultySupervisedCourses(
  facultyCode: string,
): Promise<SupervisedCourse[]> {
  const faculty = facultyCode.toUpperCase();
  const prefixes = offerPrefixesForFaculty(faculty);
  const extras = extraSupervisedCodes(faculty);

  const { data, error } = await supabase.rpc('get_faculty_supervised_courses', {
    p_prefixes: prefixes,
    p_extra_codes: extras,
  });
  if (error) throw new Error(error.message);

  let mallaCourses: Course[] = [];
  try {
    mallaCourses = await loadFacultyCurriculum(faculty);
  } catch {
    // Career malla optional for id mapping
  }

  return dedupeSupervisedByCanonicalCode(
    (data ?? []) as { course_code: string; title: string }[],
    faculty,
    mallaCourses,
  );
}

/**
 * Una sola fila por código canónico: CMP-4004E y CMP-4004 son la misma materia para demanda.
 * El RPC devuelve ambas grafías como filas separadas. Se conserva el código base como llave y el
 * título de la variante sin E si existe (si no, el de la variante E).
 */
export function dedupeSupervisedByCanonicalCode(
  rows: { course_code: string; title: string }[],
  faculty: string,
  mallaCourses: Course[],
): SupervisedCourse[] {
  const byCanonical = new Map<string, { title: string | null; hasBase: boolean }>();
  for (const row of rows) {
    const normalized = normalizeOfferCourseCode(row.course_code);
    const canonical = canonicalOfferCourseCode(normalized);
    const isBase = normalized === canonical;
    const prev = byCanonical.get(canonical);
    if (!prev || (isBase && !prev.hasBase)) {
      byCanonical.set(canonical, { title: row.title ?? prev?.title ?? null, hasBase: isBase });
    }
  }
  return [...byCanonical.entries()].map(([offerCode, v]) => ({
    offerCode,
    courseId: offerCodeToCourseId(offerCode, mallaCourses),
    title: v.title ?? offerCode,
    facultyCode: faculty,
  }));
}
