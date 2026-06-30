import { describe, expect, it } from 'vitest';
import type { Course } from '../types/curriculum';
import {
  mergePlannedEntriesWithDedup,
  normalizeCurriculumId,
  resolvePlannedEntriesForPlanner,
  type PlannedCourseEntry,
} from './aggregatedPlanningMerge';

function course(id: string, code: string): Course {
  return {
    id,
    code,
    title: code,
    description: '',
    credits: 3,
    semester: 1,
    block: '',
    area: '',
    type: 'obligatoria',
    prerequisites: [],
    alternatives: [],
  };
}

function entry(
  courseId: string,
  code: string,
  curriculumId: string,
  label: string,
): PlannedCourseEntry {
  return {
    course: course(courseId, code),
    curriculumId,
    curriculumLabel: label,
  };
}

describe('normalizeCurriculumId', () => {
  it('normalizes Malla-academica-* ids', () => {
    expect(normalizeCurriculumId('Malla-academica-CMP')).toBe('CMP');
    expect(normalizeCurriculumId('Malla-FIN')).toBe('FIN');
  });
});

describe('mergePlannedEntriesWithDedup', () => {
  it('prefers active malla when course id is shared', () => {
    const shared = 'MAT1001';
    const entries = [
      entry(shared, 'MAT-1001', 'Malla-academica-FIN', 'FIN'),
      entry(shared, 'MAT-1001', 'Malla-academica-CMP', 'CMP'),
    ];
    const merged = mergePlannedEntriesWithDedup(
      entries,
      'Malla-academica-CMP',
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.curriculumLabel).toBe('CMP');
  });

  it('keeps distinct courses from multiple mallas', () => {
    const entries = [
      entry('CMP4001', 'CMP-4001', 'Malla-academica-CMP', 'CMP'),
      entry('FIN2001', 'FIN-2001', 'Malla-academica-FIN', 'FIN'),
    ];
    const merged = mergePlannedEntriesWithDedup(
      entries,
      'Malla-academica-CMP',
    );
    expect(merged).toHaveLength(2);
    expect(merged.map((e) => e.curriculumLabel)).toEqual(['CMP', 'FIN']);
  });
});

describe('resolvePlannedEntriesForPlanner', () => {
  it('returns only current malla when toggle is off', () => {
    const current = [entry('CMP4001', 'CMP-4001', 'Malla-academica-CMP', 'CMP')];
    const all = [
      ...current,
      entry('FIN2001', 'FIN-2001', 'Malla-academica-FIN', 'FIN'),
    ];
    const resolved = resolvePlannedEntriesForPlanner({
      includeOtherMallas: false,
      activeCurriculumId: 'Malla-academica-CMP',
      currentEntries: current,
      allEntries: all,
    });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.curriculumLabel).toBe('CMP');
  });

  it('merges all mallas when toggle is on', () => {
    const current = [entry('CMP4001', 'CMP-4001', 'Malla-academica-CMP', 'CMP')];
    const all = [
      ...current,
      entry('FIN2001', 'FIN-2001', 'Malla-academica-FIN', 'FIN'),
    ];
    const resolved = resolvePlannedEntriesForPlanner({
      includeOtherMallas: true,
      activeCurriculumId: 'Malla-academica-CMP',
      currentEntries: current,
      allEntries: all,
    });
    expect(resolved).toHaveLength(2);
  });
});
