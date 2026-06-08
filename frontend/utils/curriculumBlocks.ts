import { Course } from '../types/curriculum';

function minSemesterForBlock(courses: Course[], block: string): number {
  return courses
    .filter(c => c.block === block)
    .reduce((min, c) => Math.min(min, c.semester), Number.POSITIVE_INFINITY);
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

/** Show Verano for summer/PASEM blocks that scrapers still label as "Semestre N". */
export function getBlockDisplayName(block: string, blockCourses: Course[]): string {
  if (/^verano/i.test(block)) return block;
  if (blockCourses.length > 0 && blockCourses.every(c => c.area === 'PAS')) {
    return 'Verano';
  }
  return block;
}
