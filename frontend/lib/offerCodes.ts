import { normalizeOfferCourseCode } from './offerMatching';

// Sin lookbehind: es SyntaxError al parsear el bundle en Safari < 16.4.
const E_SUFFIX = /(\d)E$/;

/**
 * Canonical demand key: normalized offer code without the trailing "E" (CMP-5006E ≡ CMP-5006).
 * Same criterion as the predictor (`canonical_course_code`) and offerMatching's base-code fallback.
 */
export function canonicalOfferCourseCode(code: string): string {
  return normalizeOfferCourseCode(code).replace(E_SUFFIX, '$1');
}

/** Both catalog spellings of a canonical code, for querying history/offer tables. */
export function offerCodeVariants(code: string): string[] {
  const base = canonicalOfferCourseCode(code);
  return /^[A-Z]{2,5}-\d/.test(base) ? [base, `${base}E`] : [base];
}
