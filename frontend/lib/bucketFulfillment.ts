import type { Course } from '../types/curriculum';
import type { CourseOfferRow } from './useCourseOffer';
import {
  normalizeCurriculumCode,
  normalizeOfferCourseCode,
  getOfferCoursePreview,
} from './offerMatching';

export type BucketCategory =
  | 'CIENCIAS'
  | 'HUM'
  | 'CCSS'
  | 'ARTE'
  | 'OPT'
  | 'ELECTIVA';

export const BUCKET_AREA_ALLOWED_PREFIXES: Record<
  Exclude<BucketCategory, 'OPT' | 'ELECTIVA'>,
  string[]
> = {
  CIENCIAS: ['BIO', 'QUI', 'FIS', 'ECL', 'NUT', 'GEO'],
  HUM: ['LIT', 'FIL', 'ESC', 'ARH'],
  CCSS: ['ANT', 'EDU', 'HIS', 'REL', 'POL', 'SOC', 'PSI'],
  ARTE: ['ART', 'DAN', 'TEA', 'MUS'],
};

const BUCKET_PREFIXES = new Set([
  'OPT',
  'ELECTIVA',
  'ARTE',
  'HUM',
  'CCSS',
  'CIENCIAS',
]);

export interface BucketFulfillment {
  offerCourseCode: string;
  courseCredits: number;
}

export type BucketFulfillmentsMap = Record<string, BucketFulfillment>;

export interface DisplayCourse extends Course {
  isRemainder?: boolean;
  parentSlotId?: string;
  fulfillment?: BucketFulfillment;
}

export interface FulfillmentResult {
  creditsApplied: number;
  creditsRemaining: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const REMAINDER_ID_RE = /^(.+)__rem(\d+)$/;

export function isRemainderSlotId(id: string): boolean {
  return REMAINDER_ID_RE.test(id);
}

export function getRootSlotId(slotId: string): string {
  const match = slotId.match(REMAINDER_ID_RE);
  return match ? match[1] : slotId;
}

export function getBucketCategory(course: Course): BucketCategory | null {
  const normalized = normalizeCurriculumCode(course.code);
  const prefix = normalized.split('-')[0];
  if (BUCKET_PREFIXES.has(prefix)) {
    return prefix as BucketCategory;
  }
  const area = course.area?.toUpperCase() ?? '';
  if (area === 'CIENCIAS') return 'CIENCIAS';
  if (area === 'HUM') return 'HUM';
  if (area === 'CCSS') return 'CCSS';
  if (area === 'ARTE') return 'ARTE';
  if (area.startsWith('OPT') || area.endsWith('OPT')) return 'OPT';
  if (area === 'ELECTIVA' || area.startsWith('ELECTIVA')) return 'ELECTIVA';
  return null;
}

export function getAllowedPrefixesForCourse(
  course: Course,
): string[] | null {
  const category = getBucketCategory(course);
  if (!category) return null;
  if (category === 'OPT' || category === 'ELECTIVA') return null;
  return BUCKET_AREA_ALLOWED_PREFIXES[category];
}

export function getCodePrefix(code: string): string {
  const normalized = normalizeOfferCourseCode(code);
  return normalized.split('-')[0] ?? '';
}

export function validateOfferCodeForBucket(
  course: Course,
  rawCode: string,
): ValidationResult {
  const code = normalizeOfferCourseCode(rawCode.trim());
  if (!code || !/^[A-Z]{2,5}-\d/.test(code)) {
    return { valid: false, error: 'Ingresa un código USFQ válido (ej. MUS-2101).' };
  }

  const allowed = getAllowedPrefixesForCourse(course);
  if (allowed) {
    const prefix = getCodePrefix(code);
    if (!allowed.includes(prefix)) {
      const category = getBucketCategory(course);
      return {
        valid: false,
        error: `El código debe pertenecer a ${category}: ${allowed.join(', ')}.`,
      };
    }
  }

  return { valid: true };
}

export function resolveCourseCredits(
  code: string,
  offerMap: Map<string, CourseOfferRow>,
): number | null {
  const preview = getOfferCoursePreview(offerMap, code);
  if (preview?.credits != null && preview.credits > 0) {
    return preview.credits;
  }
  return null;
}

export function applyFulfillment(
  slotCredits: number,
  courseCredits: number,
): FulfillmentResult {
  const creditsApplied = Math.min(courseCredits, slotCredits);
  const creditsRemaining = Math.max(0, slotCredits - creditsApplied);
  return { creditsApplied, creditsRemaining };
}

/** Course must have at least 1 credit; partial fulfillment is allowed (remainder card is created). */
export function creditsMeetMinimum(
  courseCredits: number,
  _slotCredits: number,
): boolean {
  return courseCredits > 0;
}

function buildRemainderSlot(
  root: Course,
  index: number,
  credits: number,
  fulfillment?: BucketFulfillment,
): DisplayCourse {
  const category = getBucketCategory(root);
  const label = category ?? root.area;
  return {
    ...root,
    id: `${root.id}__rem${index}`,
    code: root.code,
    title: `${label} — ${credits} cr pendiente`,
    credits,
    isRemainder: true,
    parentSlotId: root.id,
    fulfillment,
  };
}

/** Walk fulfillment chain for a root bucket and emit display slots + open remainders. */
function expandBucketChain(
  root: Course,
  fulfillments: BucketFulfillmentsMap,
): DisplayCourse[] {
  const slots: DisplayCourse[] = [];
  let slotCredits = root.credits;
  let remIndex = 0;
  let currentId = root.id;

  while (true) {
    const fulfillment = fulfillments[currentId];
    const isRoot = currentId === root.id;

    if (isRoot) {
      slots.push({ ...root, fulfillment });
    } else {
      slots.push(buildRemainderSlot(root, remIndex - 1, slotCredits, fulfillment));
    }

    if (!fulfillment) break;

    const { creditsRemaining } = applyFulfillment(slotCredits, fulfillment.courseCredits);
    if (creditsRemaining <= 0) break;

    remIndex++;
    const nextId = `${root.id}__rem${remIndex - 1}`;
    slotCredits = creditsRemaining;

    if (!fulfillments[nextId]) {
      slots.push(buildRemainderSlot(root, remIndex - 1, slotCredits));
      break;
    }
    currentId = nextId;
  }

  return slots;
}

export function expandDisplayCourses(
  courses: Course[],
  fulfillments: BucketFulfillmentsMap,
): DisplayCourse[] {
  const result: DisplayCourse[] = [];

  for (const course of courses) {
    const hasChain =
      fulfillments[course.id] ||
      Object.keys(fulfillments).some((k) => getRootSlotId(k) === course.id);

    if (hasChain) {
      result.push(...expandBucketChain(course, fulfillments));
    } else {
      result.push({ ...course });
    }
  }

  return result;
}

export function isSlotFullySatisfied(
  _slotId: string,
  requiredCredits: number,
  fulfillment: BucketFulfillment | undefined,
): boolean {
  if (!fulfillment) return false;
  return applyFulfillment(requiredCredits, fulfillment.courseCredits).creditsRemaining === 0;
}

export function isBucketSatisfiedForPrereq(
  rootId: string,
  courses: Course[],
  fulfillments: BucketFulfillmentsMap,
  completedIds: Set<string>,
  inProgressIds: Set<string>,
): boolean {
  const root = courses.find((c) => c.id === rootId);
  if (!root || !getBucketCategory(root)) {
    return completedIds.has(rootId) || inProgressIds.has(rootId);
  }

  let slotCredits = root.credits;
  let currentId = rootId;
  let remIndex = 0;

  while (slotCredits > 0) {
    const marked = completedIds.has(currentId) || inProgressIds.has(currentId);
    const fulfillment = fulfillments[currentId];
    if (!marked || !fulfillment) return false;

    const { creditsRemaining } = applyFulfillment(slotCredits, fulfillment.courseCredits);
    if (creditsRemaining <= 0) return true;

    remIndex++;
    currentId = `${rootId}__rem${remIndex - 1}`;
    slotCredits = creditsRemaining;
  }

  return slotCredits === 0;
}

export function getDisplayCreditsForSlot(
  course: DisplayCourse,
  fulfillments: BucketFulfillmentsMap,
): number {
  const fulfillment = fulfillments[course.id] ?? course.fulfillment;
  if (fulfillment) {
    return applyFulfillment(course.credits, fulfillment.courseCredits).creditsApplied;
  }
  return course.credits;
}

export function collectFulfillmentSlotIds(
  rootId: string,
  fulfillments: BucketFulfillmentsMap,
): string[] {
  const ids = [rootId];
  for (const key of Object.keys(fulfillments)) {
    if (key.startsWith(`${rootId}__rem`)) ids.push(key);
  }
  return ids;
}

export function clearBucketFulfillmentChain(
  rootId: string,
  fulfillments: BucketFulfillmentsMap,
): BucketFulfillmentsMap {
  const next = { ...fulfillments };
  for (const id of collectFulfillmentSlotIds(rootId, fulfillments)) {
    delete next[id];
  }
  return next;
}

export function getAllowedAreasLabel(course: Course): string | null {
  const prefixes = getAllowedPrefixesForCourse(course);
  if (!prefixes) return null;
  return prefixes.join(', ');
}

export function findDisplayCourse(
  courses: Course[],
  slotId: string,
  fulfillments: BucketFulfillmentsMap,
): DisplayCourse | undefined {
  return expandDisplayCourses(courses, fulfillments).find((c) => c.id === slotId);
}
