interface RecurringCourse {
  id: string;
  code: string;
  semester: number;
  prerequisites: string[];
  alternatives: string[];
}

/** Distinguish semester-specific occurrences without changing their visible titles. */
export function disambiguateRecurringCourses<T extends RecurringCourse>(
  courses: T[],
  warn: (message: string) => void = console.warn,
): T[] {
  const result = courses.map(c => ({ ...c, prerequisites: [...c.prerequisites], alternatives: [...c.alternatives] }));
  const groups = new Map<string, T[]>();
  for (const course of result) groups.set(course.id, [...(groups.get(course.id) ?? []), course]);
  const ids = new Set(courses.map(c => c.id));
  const references = new Map<string, string>();
  for (const [id, group] of groups) {
    if (group.length < 2) continue;
    if (new Set(group.map(c => c.semester)).size !== group.length) {
      warn(`Duplicate course ${id} in the same semester; left unchanged.`);
      continue;
    }
    group.sort((a, b) => a.semester - b.semester);
    if (group.some(c => ids.has(`${id}-${c.semester}`))) {
      warn(`Semester suffix for ${id} collides with an existing ID; left unchanged.`);
      continue;
    }
    references.set(id, `${id}-${group[0].semester}`);
    for (let i = 0; i < group.length; i++) {
      const course = group[i];
      course.id = `${id}-${course.semester}`;
      course.code = `${course.code}-${course.semester}`;
      if (i > 0) course.prerequisites.push(group[i - 1].id);
    }
  }
  const remap = (expression: string) => expression.replace(/[A-Za-z0-9_-]+/g, token => references.get(token) ?? token);
  for (const course of result) {
    course.prerequisites = [...new Set(course.prerequisites.map(remap))];
    course.alternatives = course.alternatives.map(remap);
  }
  return result;
}
