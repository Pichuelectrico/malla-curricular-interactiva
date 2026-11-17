import { describe, expect, it } from 'vitest';
import { canonicalOfferCourseCode, offerCodeVariants } from './offerCodes';

describe('canonicalOfferCourseCode', () => {
  it('unifica sufijo E con el código base', () => {
    expect(canonicalOfferCourseCode('CMP-5006E')).toBe('CMP-5006');
    expect(canonicalOfferCourseCode('CMP5006E')).toBe('CMP-5006');
    expect(canonicalOfferCourseCode('cmp 5006')).toBe('CMP-5006');
  });

  it('no altera códigos sin dígito antes de la E', () => {
    expect(canonicalOfferCourseCode('ELECTIVA')).toBe('ELECTIVA');
    expect(canonicalOfferCourseCode('ARTE')).toBe('ARTE');
  });

  it('ofrece ambas grafías para consultar tablas', () => {
    expect(offerCodeVariants('CMP-4004E')).toEqual(['CMP-4004', 'CMP-4004E']);
    expect(offerCodeVariants('ARTE')).toEqual(['ARTE']);
  });
});
