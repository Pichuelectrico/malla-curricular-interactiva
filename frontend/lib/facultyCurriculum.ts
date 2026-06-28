import { availableCurricula } from '../data/availableCurricula';
import type { Course, CurriculumData } from '../types/curriculum';

/** Load all courses from the official malla JSON for a faculty code (e.g. CMP). */
export async function loadFacultyCurriculum(facultyCode: string): Promise<Course[]> {
  const slug = `malla-${facultyCode.toLowerCase()}`;
  const curriculum = availableCurricula.find((c) => c.slug === slug);
  if (!curriculum) {
    throw new Error(`No hay malla registrada para la facultad ${facultyCode}`);
  }
  const module = await curriculum.dataLoader();
  const data = (module.default ?? module) as CurriculumData;
  return data.courses ?? [];
}
