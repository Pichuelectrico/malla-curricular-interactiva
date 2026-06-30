import type { Course } from '../types/curriculum';
import { availableCurricula } from '../data/availableCurricula';

export interface PlannedCourseEntry {
  course: Course;
  curriculumId: string;
  curriculumLabel: string;
}

/** Canonical career code (CMP, FIN, …) for comparing curriculum ids. */
export function normalizeCurriculumId(curriculumId: string): string {
  if (!curriculumId) return '';
  const m = curriculumId.match(/Malla(?:-academica)?-([A-Z0-9]+)/i);
  if (m) return m[1].toUpperCase();

  const byCatalog = availableCurricula.find(
    (c) => c.id === curriculumId || c.slug === curriculumId,
  );
  if (byCatalog) {
    return byCatalog.slug.replace(/^malla-/, '').toUpperCase();
  }

  return curriculumId.toUpperCase();
}

/** When the same course id appears in multiple mallas, keep the active malla's entry. */
export function mergePlannedEntriesWithDedup(
  entries: PlannedCourseEntry[],
  activeCurriculumId: string,
): PlannedCourseEntry[] {
  const activeNorm = normalizeCurriculumId(activeCurriculumId);
  const byCourseId = new Map<string, PlannedCourseEntry[]>();

  for (const entry of entries) {
    const list = byCourseId.get(entry.course.id) ?? [];
    list.push(entry);
    byCourseId.set(entry.course.id, list);
  }

  const picked: PlannedCourseEntry[] = [];
  for (const list of byCourseId.values()) {
    const activeEntry = list.find(
      (e) => normalizeCurriculumId(e.curriculumId) === activeNorm,
    );
    picked.push(activeEntry ?? list[0]!);
  }

  picked.sort((a, b) => {
    const aActive =
      normalizeCurriculumId(a.curriculumId) === activeNorm ? 0 : 1;
    const bActive =
      normalizeCurriculumId(b.curriculumId) === activeNorm ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return a.course.code.localeCompare(b.course.code);
  });

  return picked;
}

export function resolvePlannedEntriesForPlanner({
  includeOtherMallas,
  activeCurriculumId,
  currentEntries,
  allEntries,
}: {
  includeOtherMallas: boolean;
  activeCurriculumId: string;
  currentEntries: PlannedCourseEntry[];
  allEntries: PlannedCourseEntry[];
}): PlannedCourseEntry[] {
  if (!includeOtherMallas) {
    return currentEntries;
  }
  if (allEntries.length === 0) {
    return currentEntries;
  }
  return mergePlannedEntriesWithDedup(allEntries, activeCurriculumId);
}

export function toPlannedEntries(
  courses: Course[],
  curriculumLabel?: string,
  curriculumId?: string,
): PlannedCourseEntry[] {
  return courses.map((course) => ({
    course,
    curriculumId: curriculumId ?? '',
    curriculumLabel: curriculumLabel ?? '',
  }));
}
