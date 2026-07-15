import type { Course } from '../types/curriculum';
import { supabase } from './supabaseClient';
import { loadFacultyCurriculum } from './facultyCurriculum';
import { normalizeOfferCourseCode } from './offerMatching';

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
  const match = mallaCourses.find(
    (c) =>
      normalizeOfferCourseCode(c.id) === normalized ||
      normalizeOfferCourseCode(c.code) === normalized,
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

  return (data ?? []).map((row: { course_code: string; title: string }) => {
    const offerCode = normalizeOfferCourseCode(row.course_code);
    return {
      offerCode,
      courseId: offerCodeToCourseId(offerCode, mallaCourses),
      title: row.title ?? offerCode,
      facultyCode: faculty,
    };
  });
}
