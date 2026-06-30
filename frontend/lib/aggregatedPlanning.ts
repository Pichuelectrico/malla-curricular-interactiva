import type { Course } from '../types/curriculum';
import { availableCurricula } from '../data/availableCurricula';
import { loadAllUserProgress, type ProgressData } from './supabaseProgress';
import {
  normalizeCurriculumId,
  type PlannedCourseEntry,
} from './aggregatedPlanningMerge';

export type { PlannedCourseEntry } from './aggregatedPlanningMerge';
export {
  mergePlannedEntriesWithDedup,
  normalizeCurriculumId,
  resolvePlannedEntriesForPlanner,
  toPlannedEntries,
} from './aggregatedPlanningMerge';

const curriculumCache = new Map<string, Course[]>();

async function loadCoursesForCurriculum(
  curriculumId: string,
): Promise<Course[]> {
  const norm = normalizeCurriculumId(curriculumId);
  if (curriculumCache.has(norm)) {
    return curriculumCache.get(norm)!;
  }

  for (const c of availableCurricula) {
    const slugCode = c.slug.replace(/^malla-/, '').toUpperCase();
    if (c.id === curriculumId || slugCode === norm) {
      try {
        const mod = await c.dataLoader();
        const data = mod.default as { courses: Course[]; source_file?: string };
        const courses = data.courses ?? [];
        curriculumCache.set(norm, courses);
        return courses;
      } catch {
        /* try next */
      }
    }

    try {
      const mod = await c.dataLoader();
      const data = mod.default as { courses: Course[]; source_file?: string };
      const sf = data.source_file ?? c.id;
      if (
        sf === curriculumId ||
        normalizeCurriculumId(sf) === norm
      ) {
        const courses = data.courses ?? [];
        curriculumCache.set(norm, courses);
        return courses;
      }
    } catch {
      /* try next */
    }
  }

  curriculumCache.set(norm, []);
  return [];
}

export function countCurriculaWithPlanned(rows: ProgressData[]): number {
  return rows.filter((r) => (r.plannedCourses?.length ?? 0) > 0).length;
}

export function countCurriculaWithActivity(rows: ProgressData[]): number {
  return rows.filter(
    (r) =>
      (r.completedCourses?.length ?? 0) > 0 ||
      (r.inProgressCourses?.length ?? 0) > 0 ||
      (r.plannedCourses?.length ?? 0) > 0 ||
      r.hasWritingIntensive ||
      Object.keys(r.bucketFulfillments ?? {}).length > 0,
  ).length;
}

export async function aggregatePlannedFromRows(
  rows: ProgressData[],
): Promise<PlannedCourseEntry[]> {
  const entries: PlannedCourseEntry[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row.plannedCourses?.length) continue;
    const courses = await loadCoursesForCurriculum(row.curriculumId);
    const label = normalizeCurriculumId(row.curriculumId);
    for (const courseId of row.plannedCourses) {
      const key = `${normalizeCurriculumId(row.curriculumId)}:${courseId}`;
      if (seen.has(key)) continue;
      const course = courses.find((c) => c.id === courseId);
      if (!course) continue;
      seen.add(key);
      entries.push({
        course,
        curriculumId: row.curriculumId,
        curriculumLabel: label,
      });
    }
  }
  return entries;
}

export async function aggregatePlannedCourses(
  userId: string,
): Promise<PlannedCourseEntry[]> {
  const rows: ProgressData[] = await loadAllUserProgress(userId);
  return aggregatePlannedFromRows(rows);
}

export async function loadMultiMallaPlanned(userId: string): Promise<{
  entries: PlannedCourseEntry[];
  curriculaWithPlanned: number;
  curriculaWithActivity: number;
}> {
  const rows = await loadAllUserProgress(userId);
  const entries = await aggregatePlannedFromRows(rows);
  return {
    entries,
    curriculaWithPlanned: countCurriculaWithPlanned(rows),
    curriculaWithActivity: countCurriculaWithActivity(rows),
  };
}
