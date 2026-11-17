import { describe, expect, it } from 'vitest';
import {
  selectReportRows,
  shortRecommendation,
  sortForReport,
  summarizeReport,
  type ReportRowBase,
} from './printReport';

const r = (over: Partial<ReportRowBase> & { offer_code: string }): ReportRowBase => ({
  title: over.offer_code,
  coverage_class: 'equilibrado',
  estimated_students: 10,
  published_capacity: 20,
  ...over,
});

const rows = [
  r({ offer_code: 'CMP-1', coverage_class: 'equilibrado' }),
  r({ offer_code: 'CMP-2', coverage_class: 'deficit_leve', estimated_students: 30, published_capacity: 25 }),
  r({ offer_code: 'CMP-3', coverage_class: 'deficit_critico', estimated_students: 90, published_capacity: 40 }),
  r({ offer_code: 'CMP-4', coverage_class: 'deficit_critico', estimated_students: 120, published_capacity: 40 }),
  r({ offer_code: 'CMP-5', coverage_class: 'exceso', estimated_students: 5, published_capacity: 60 }),
];

describe('selectReportRows', () => {
  it('toda la facultad devuelve todas las filas en orden de tabla', () => {
    expect(selectReportRows(rows, 'faculty', new Set()).map((x) => x.offer_code)).toEqual([
      'CMP-1', 'CMP-2', 'CMP-3', 'CMP-4', 'CMP-5',
    ]);
  });

  it('seleccionadas filtra por código y conserva el orden de la tabla', () => {
    const out = selectReportRows(rows, 'selected', new Set(['CMP-4', 'CMP-1']));
    expect(out.map((x) => x.offer_code)).toEqual(['CMP-1', 'CMP-4']);
  });

  it('sin selección devuelve vacío', () => {
    expect(selectReportRows(rows, 'selected', new Set())).toEqual([]);
  });
});

describe('sortForReport', () => {
  it('ordena por severidad y luego por mayor faltante de cupo', () => {
    expect(sortForReport(rows).map((x) => x.offer_code)).toEqual([
      'CMP-4', 'CMP-3', 'CMP-2', 'CMP-5', 'CMP-1',
    ]);
  });

  it('no muta el arreglo original', () => {
    const copy = [...rows];
    sortForReport(rows);
    expect(rows).toEqual(copy);
  });
});

describe('summarizeReport', () => {
  it('cuenta clases y suma cupo y demanda central', () => {
    const s = summarizeReport(rows);
    expect(s.count).toBe(5);
    expect(s.byClass.deficit_critico).toBe(2);
    expect(s.byClass.exceso).toBe(1);
    expect(s.totalCapacity).toBe(20 + 25 + 40 + 40 + 60);
    expect(s.totalDemandCentral).toBe(10 + 30 + 90 + 120 + 5);
  });
});

describe('shortRecommendation', () => {
  it('trunca textos largos con elipsis y respeta los cortos', () => {
    expect(shortRecommendation('Mantener.')).toBe('Mantener.');
    const long = 'Añadir 3 sección(es) '.repeat(10);
    const out = shortRecommendation(long, 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith('…')).toBe(true);
    expect(shortRecommendation(undefined)).toBe('');
  });
});
