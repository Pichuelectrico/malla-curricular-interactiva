/** Email domain used to identify USFQ faculty/staff accounts. */
export const USFQ_PROFESSOR_EMAIL_SUFFIX = '@usfq.edu.ec';

export function isProfessorEmail(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith(USFQ_PROFESSOR_EMAIL_SUFFIX));
}

/** Extract faculty code from curriculum_id, e.g. "Malla-academica-CMP" → "CMP". */
export function facultyFromCurriculumId(curriculumId: string): string | null {
  const match = curriculumId.match(/Malla-(?:academica-)?([A-Z]{3})/i);
  return match ? match[1].toUpperCase() : null;
}

export const ALL_FACULTIES = [
  'ADM', 'ANT', 'AQQ', 'ARV', 'BTC', 'CIN', 'CMP', 'COM', 'JUR', 'DIC', 'DIT',
  'ECO', 'EDU', 'FIN', 'FIS', 'GST', 'HSP', 'AGE', 'ALI', 'ICV', 'IEL',
  'IIN', 'IME', 'INQ', 'LIT', 'MAC', 'MAK', 'MAT', 'MED', 'VET', 'NIT',
  'NUT', 'ODT', 'PER', 'POL', 'PSI', 'PSC', 'PUB',
] as const;
