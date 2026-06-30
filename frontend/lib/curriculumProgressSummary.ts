import { availableCurricula } from '../data/availableCurricula';
import { normalizeCurriculumId } from './aggregatedPlanningMerge';
import type { Course } from '../types/curriculum';
import {
  loadAllUserProgress,
  type ProgressData,
} from './supabaseProgress';

export interface CurriculumProgressSummary {
  curriculumId: string;
  curriculumLabel: string;
  careerName: string;
  totalCourses: number;
  completedCount: number;
  inProgressCount: number;
  plannedCount: number;
  percentComplete: number;
}

function resolveCareerMeta(curriculumId: string): {
  name: string;
  label: string;
  totalCourses: number;
} {
  const norm = normalizeCurriculumId(curriculumId);
  const match = availableCurricula.find((c) => {
    const slugCode = c.slug.replace(/^malla-/, '').toUpperCase();
    return c.id === curriculumId || slugCode === norm;
  });
  if (match) {
    return {
      name: match.name,
      label: norm,
      totalCourses: match.courses,
    };
  }
  return {
    name: curriculumId,
    label: norm,
    totalCourses: 0,
  };
}

function rowHasActivity(row: ProgressData): boolean {
  return (
    row.completedCourses.length > 0 ||
    row.inProgressCourses.length > 0 ||
    row.plannedCourses.length > 0 ||
    row.hasWritingIntensive ||
    Object.keys(row.bucketFulfillments ?? {}).length > 0
  );
}

export async function loadCurriculumProgressSummaries(
  userId: string,
): Promise<CurriculumProgressSummary[]> {
  const rows = await loadAllUserProgress(userId);
  const summaries: CurriculumProgressSummary[] = [];

  for (const row of rows) {
    if (!rowHasActivity(row)) continue;
    const meta = resolveCareerMeta(row.curriculumId);
    const completedCount = row.completedCourses.length;
    const percentComplete =
      meta.totalCourses > 0
        ? Math.min(100, Math.round((completedCount / meta.totalCourses) * 100))
        : 0;

    summaries.push({
      curriculumId: row.curriculumId,
      curriculumLabel: meta.label,
      careerName: meta.name,
      totalCourses: meta.totalCourses,
      completedCount,
      inProgressCount: row.inProgressCourses.length,
      plannedCount: row.plannedCourses.length,
      percentComplete,
    });
  }

  summaries.sort((a, b) => a.careerName.localeCompare(b.careerName, 'es'));
  return summaries;
}

async function loadCourseIdsForCurriculum(curriculumId: string): Promise<string[]> {
  const norm = normalizeCurriculumId(curriculumId);
  for (const c of availableCurricula) {
    const slugCode = c.slug.replace(/^malla-/, '').toUpperCase();
    if (c.id !== curriculumId && slugCode !== norm) continue;
    try {
      const mod = await c.dataLoader();
      const data = mod.default as { courses: Course[]; source_file?: string };
      if (
        data.source_file === curriculumId ||
        normalizeCurriculumId(data.source_file ?? c.id) === norm
      ) {
        return (data.courses ?? []).map((course) => course.id);
      }
    } catch {
      /* try next */
    }
  }
  return [];
}

export async function cleanupLocalProgressArtifacts(
  curriculumId: string,
): Promise<void> {
  try {
    localStorage.removeItem(`hasWritingIntensive:${curriculumId}`);
    const courseIds = new Set(await loadCourseIdsForCurriculum(curriculumId));
    if (courseIds.size === 0) return;

    const raw = localStorage.getItem('globalCompletedCourses');
    if (!raw) return;
    const globalCompleted: string[] = JSON.parse(raw);
    const next = globalCompleted.filter((id) => !courseIds.has(id));
    localStorage.setItem('globalCompletedCourses', JSON.stringify(next));
  } catch {
    /* ignore local cleanup errors */
  }
}
