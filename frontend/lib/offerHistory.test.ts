import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({ supabase: {} }));

import { aggregateRows, dedupeHistoryRows, type HistoryRow } from './offerHistory';

const row = (over: Partial<HistoryRow>): HistoryRow => ({
  id: 1,
  nrc: '1652',
  course_code: 'CMP-4005',
  total: 20,
  available: 1,
  period: 'Primer Semestre 2026/2027',
  period_code: '202610',
  ...over,
});

describe('dedupeHistoryRows', () => {
  it('elimina filas repetidas por paginación inestable (CMP-4005: 80 cupos → 40)', () => {
    const rows = [
      row({ id: 'a', nrc: '1652' }),
      row({ id: 'b', nrc: '5173', available: 6 }),
      row({ id: 'a', nrc: '1652' }),
      row({ id: 'b', nrc: '5173', available: 6 }),
    ];
    expect(dedupeHistoryRows(rows)).toHaveLength(2);
    const stats = aggregateRows(rows).get('CMP-4005')!;
    expect(stats.periods[0].capacity).toBe(40);
    expect(stats.periods[0].sections).toBe(2);
    // matriculados = (20-1) + (20-6)
    expect(stats.periods[0].totalStudents).toBe(33);
  });
});

describe('aggregateRows', () => {
  it('separa cupo ofertado de matriculados', () => {
    const stats = aggregateRows([row({ id: 1, total: 20, available: 5 })]).get('CMP-4005')!;
    expect(stats.periods[0].capacity).toBe(20);
    expect(stats.periods[0].totalStudents).toBe(15);
  });

  it('cuenta sobrecupo (available negativo) como matriculados sobre el cupo', () => {
    const stats = aggregateRows([row({ id: 1, total: 15, available: -7 })]).get('CMP-4005')!;
    expect(stats.periods[0].totalStudents).toBe(22);
  });

  it('no usa el cupo como demanda cuando available es NULL', () => {
    const stats = aggregateRows([row({ id: 1, total: 20, available: null })]).get('CMP-4005')!;
    expect(stats.periods[0].capacity).toBe(20);
    expect(stats.periods[0].totalStudents).toBe(0);
    expect(stats.periods[0].measuredSections).toBe(0);
  });

  it('agrupa la variante E con el código base', () => {
    const map = aggregateRows([
      row({ id: 1, nrc: '1', course_code: 'CMP-5006', total: 10, available: 2 }),
      row({ id: 2, nrc: '2', course_code: 'CMP-5006E', total: 10, available: 0 }),
    ]);
    expect([...map.keys()]).toEqual(['CMP-5006']);
    expect(map.get('CMP-5006')!.periods[0].capacity).toBe(20);
    expect(map.get('CMP-5006')!.periods[0].totalStudents).toBe(18);
  });
});
