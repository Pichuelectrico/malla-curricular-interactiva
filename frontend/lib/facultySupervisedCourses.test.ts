import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({ supabase: {} }));

import { dedupeSupervisedByCanonicalCode } from './facultySupervisedCourses';

describe('dedupeSupervisedByCanonicalCode', () => {
  it('devuelve una sola fila por código canónico (CMP-4004E ≡ CMP-4004)', () => {
    const rows = [
      { course_code: 'CMP-4004E', title: 'Artificial Intelligence' },
      { course_code: 'CMP-4004', title: 'Inteligencia Artificial' },
      { course_code: 'CMP-5006E', title: 'Computer Security' },
      { course_code: 'CMP-4005', title: 'Redes +Lab' },
    ];
    const out = dedupeSupervisedByCanonicalCode(rows, 'CMP', []);
    expect(out.map((c) => c.offerCode).sort()).toEqual(['CMP-4004', 'CMP-4005', 'CMP-5006']);
    expect(out.find((c) => c.offerCode === 'CMP-4004')!.title).toBe('Inteligencia Artificial');
    expect(out.find((c) => c.offerCode === 'CMP-5006')!.title).toBe('Computer Security');
  });
});
