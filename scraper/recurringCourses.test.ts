import { test, expect } from 'bun:test';
import { disambiguateRecurringCourses } from './recurringCourses';
const row = (id: string, semester: number, prerequisites: string[] = []) => ({ id, code: id, semester, prerequisites, alternatives: [] as string[] });
test('suffixes in semester order, chains occurrences and remaps references without losing original requirements', () => {
  const input = [row('P', 3, ['BASE']), row('P', 1), row('END', 4, ['P || OTHER'])];
  const out = disambiguateRecurringCourses(input);
  expect(out.map(c => c.id)).toEqual(['P-3', 'P-1', 'END']);
  expect(out[0].prerequisites).toEqual(['BASE', 'P-1']);
  expect(out[2].prerequisites).toEqual(['P-1 || OTHER']);
  expect(input[0].id).toBe('P');
});
test('reports same-semester duplicates and suffix collisions without changing them', () => {
  const warnings: string[] = [];
  const input = [row('P', 1), row('P', 1), row('Q', 1), row('Q', 2), row('Q-1', 3)];
  expect(disambiguateRecurringCourses(input, m => warnings.push(m))).toEqual(input);
  expect(warnings).toHaveLength(2);
});
