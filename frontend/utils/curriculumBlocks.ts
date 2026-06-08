import { Course } from '../types/curriculum';

function minSemesterForBlock(courses: Course[], block: string): number {
  return courses
    .filter(c => c.block === block)
    .reduce((min, c) => Math.min(min, c.semester), Number.POSITIVE_INFINITY);
}

function coursesInBlock(courses: Course[], block: string): Course[] {
  return courses.filter(c => c.block === block);
}

function isVeranoBlock(block: string, blockCourses: Course[]): boolean {
  if (/^verano/i.test(block)) return true;
  return blockCourses.length > 0 && blockCourses.every(c => c.area === 'PAS');
}

/** Order blocks by their semester position in the malla (supports 10+ semesters and Verano). */
export function getOrderedBlocks(courses: Course[]): string[] {
  const blocks = [...new Set(courses.map(c => c.block))];
  return blocks.sort((a, b) => {
    const semA = minSemesterForBlock(courses, a);
    const semB = minSemesterForBlock(courses, b);
    if (semA !== semB) return semA - semB;
    return a.localeCompare(b, 'es');
  });
}

/**
 * Label for UI: Verano blocks keep their name; regular semesters are numbered
 * without counting summer slots (so post-verano shows Semestre 9, not 10).
 */
export function getBlockDisplayName(
  block: string,
  blockCourses: Course[],
  allCourses: Course[]
): string {
  if (isVeranoBlock(block, blockCourses)) {
    return /^verano/i.test(block) ? block : 'Verano';
  }

  if (!/^Semestre\s+\d+$/i.test(block)) return block;

  const ordered = getOrderedBlocks(allCourses);
  const regularBlocks = ordered.filter(
    b => !isVeranoBlock(b, coursesInBlock(allCourses, b))
  );
  const index = regularBlocks.indexOf(block);
  return index >= 0 ? `Semestre ${index + 1}` : block;
}
