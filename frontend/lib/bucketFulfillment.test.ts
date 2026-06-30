import { describe, expect, it } from 'vitest';
import {
  applyFulfillment,
  creditsMeetMinimum,
  expandDisplayCourses,
  getBucketCategory,
  isBucketSatisfiedForPrereq,
  validateOfferCodeForBucket,
} from './bucketFulfillment';
import type { Course } from '../types/curriculum';

function course(
  id: string,
  code: string,
  area: string,
  credits = 3,
): Course {
  return {
    id,
    code,
    title: code,
    description: '',
    credits,
    semester: 1,
    block: 'Semestre 1',
    area,
    type: 'optativa',
    prerequisites: [],
    alternatives: [],
  };
}

describe('getBucketCategory', () => {
  it('detects CIENCIAS and ARTE buckets', () => {
    expect(getBucketCategory(course('CIENCIAS', 'CIENCIAS', 'CIENCIAS'))).toBe('CIENCIAS');
    expect(getBucketCategory(course('ARTE', 'ARTE', 'ARTE'))).toBe('ARTE');
  });
});

describe('validateOfferCodeForBucket', () => {
  it('accepts MUS for ARTE', () => {
    const result = validateOfferCodeForBucket(course('ARTE', 'ARTE', 'ARTE'), 'MUS-2101');
    expect(result.valid).toBe(true);
  });

  it('rejects MUS for CIENCIAS area slot', () => {
    const result = validateOfferCodeForBucket(
      course('CIENCIAS', 'CIENCIAS', 'CIENCIAS'),
      'MUS-1001',
    );
    expect(result.valid).toBe(false);
  });

  it('accepts QUI for CIENCIAS', () => {
    const result = validateOfferCodeForBucket(
      course('CIENCIAS', 'CIENCIAS', 'CIENCIAS'),
      'QUI-1001',
    );
    expect(result.valid).toBe(true);
  });

  it('accepts BIO for CIENCIAS', () => {
    const result = validateOfferCodeForBucket(
      course('CIENCIAS', 'CIENCIAS', 'CIENCIAS'),
      'BIO-1102',
    );
    expect(result.valid).toBe(true);
  });

  it('allows any code for OPT', () => {
    const result = validateOfferCodeForBucket(course('OPT1', 'OPT 1', 'OPT'), 'CMP-3002');
    expect(result.valid).toBe(true);
  });
});

describe('applyFulfillment', () => {
  it('splits 3cr slot with 2cr course', () => {
    expect(applyFulfillment(3, 2)).toEqual({
      creditsApplied: 2,
      creditsRemaining: 1,
    });
  });

  it('over-fulfills 1cr remainder with 3cr course', () => {
    expect(applyFulfillment(1, 3)).toEqual({
      creditsApplied: 1,
      creditsRemaining: 0,
    });
  });
});

describe('creditsMeetMinimum', () => {
  it('rejects 0 credits', () => {
    expect(creditsMeetMinimum(0, 3)).toBe(false);
  });

  it('accepts 2cr for 3cr bucket slot (partial allowed)', () => {
    expect(creditsMeetMinimum(2, 3)).toBe(true);
  });

  it('accepts 2cr for 1cr remainder', () => {
    expect(creditsMeetMinimum(2, 1)).toBe(true);
  });
});

describe('expandDisplayCourses', () => {
  const arte = course('ARTE', 'ARTE', 'ARTE', 3);

  it('shows remainder when partial fulfillment', () => {
    const expanded = expandDisplayCourses([arte], {
      ARTE: { offerCourseCode: 'MUS-2101', courseCredits: 2 },
    });
    expect(expanded).toHaveLength(2);
    expect(expanded[0].id).toBe('ARTE');
    expect(expanded[0].fulfillment?.offerCourseCode).toBe('MUS-2101');
    expect(expanded[1].id).toBe('ARTE__rem0');
    expect(expanded[1].credits).toBe(1);
    expect(expanded[1].isRemainder).toBe(true);
  });

  it('no remainder when fully satisfied', () => {
    const expanded = expandDisplayCourses([arte], {
      ARTE: { offerCourseCode: 'MUS-3101', courseCredits: 3 },
    });
    expect(expanded).toHaveLength(1);
  });
});

describe('isBucketSatisfiedForPrereq', () => {
  const arte = course('ARTE', 'ARTE', 'ARTE', 3);
  const cmp = course('CMP3002', 'CMP 3002', 'CMP');

  it('false when partial without remainder filled', () => {
    const fulfillments = { ARTE: { offerCourseCode: 'MUS-2101', courseCredits: 2 } };
    const completed = new Set(['ARTE']);
    expect(
      isBucketSatisfiedForPrereq('ARTE', [arte], fulfillments, completed, new Set()),
    ).toBe(false);
  });

  it('true when chain fully satisfied', () => {
    const fulfillments = {
      ARTE: { offerCourseCode: 'MUS-2101', courseCredits: 2 },
      ARTE__rem0: { offerCourseCode: 'MUS-1101', courseCredits: 1 },
    };
    const completed = new Set(['ARTE', 'ARTE__rem0']);
    expect(
      isBucketSatisfiedForPrereq('ARTE', [arte], fulfillments, completed, new Set()),
    ).toBe(true);
  });

  it('passes through non-bucket courses', () => {
    const completed = new Set(['CMP3002']);
    expect(
      isBucketSatisfiedForPrereq('CMP3002', [cmp], {}, completed, new Set()),
    ).toBe(true);
  });
});
