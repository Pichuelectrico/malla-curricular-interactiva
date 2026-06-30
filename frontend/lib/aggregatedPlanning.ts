import type { Course } from '../types/curriculum';
import { availableCurricula } from '../data/availableCurricula';
import { loadAllUserProgress, type ProgressData } from './supabaseProgress';

export interface PlannedCourseEntry {
  course: Course;
  curriculumId: string;
  curriculumLabel: string;
}

const curriculumCache = new Map<string, Course[]>();

async function loadCoursesForCurriculum(
  curriculumId: string,
): Promise<Course[]> {
  if (curriculumCache.has(curriculumId)) {
    return curriculumCache.get(curriculumId)!;
  }
  for (const c of availableCurricula) {
    try {
      const mod = await c.dataLoader();
      const data = mod.default as { courses: Course[]; source_file?: string };
      const sf = data.source_file ?? c.id;
      if (sf === curriculumId || c.id === curriculumId) {
        const courses = data.courses ?? [];
        curriculumCache.set(curriculumId, courses);
        return courses;
      }
    } catch {
      /* try next */
    }
  }
  curriculumCache.set(curriculumId, []);
  return [];
}

function shortLabelFromCurriculumId(curriculumId: string): string {
  const match = curriculumId.match(/Malla(?:-academica)?-([A-Z0-9]+)/i);
  if (match) return match[1].toUpperCase();
  return curriculumId.slice(0, 6).toUpperCase();
}

export async function aggregatePlannedCourses(
  userId: string,
): Promise<PlannedCourseEntry[]> {
  const rows: ProgressData[] = await loadAllUserProgress(userId);
  const entries: PlannedCourseEntry[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row.plannedCourses?.length) continue;
    const courses = await loadCoursesForCurriculum(row.curriculumId);
    const label = shortLabelFromCurriculumId(row.curriculumId);
    for (const courseId of row.plannedCourses) {
      const key = `${row.curriculumId}:${courseId}`;
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
