import { describe, expect, it } from 'vitest';
import {
  requiresOfferCourseCode,
  sessionsOverlapOnDay,
  sessionEndMinutes,
  GRID_SLOT_DURATION_MINUTES,
  isOfferLinkedToMain,
  requiredLinkLetter,
  formatGroupLetters,
  getLinkedOffers,
  courseRequiresLabEj,
} from './offerMatching';
import type { Course } from '../types/curriculum';
import type { CourseOfferRow } from './useCourseOffer';

function offerRow(
  partial: Partial<CourseOfferRow> & Pick<CourseOfferRow, 'nrc' | 'type' | 'course_code'>,
): CourseOfferRow {
  return {
    title: partial.course_code,
    group_letters: [],
    paralelo: null,
    days: [],
    start_time: null,
    end_time: null,
    teacher: null,
    credits: null,
    college: null,
    available: null,
    total: null,
    period: 'test',
    last_updated: '',
    ...partial,
  };
}

function course(code: string, area = ''): Course {
  return {
    id: code.replace(/\s/g, ''),
    code,
    title: code,
    description: '',
    credits: 3,
    semester: 1,
    block: 'S1',
    area,
    type: 'optativa',
    prerequisites: [],
    alternatives: [],
  };
}

describe('requiresOfferCourseCode', () => {
  it('requires code for OPT buckets', () => {
    expect(requiresOfferCourseCode(course('OPT 1', 'OPT'))).toBe(true);
    expect(requiresOfferCourseCode(course('OPT COCOA', 'OPT'))).toBe(true);
  });

  it('requires code for electives', () => {
    expect(requiresOfferCourseCode(course('ELECTIVA 1', 'ELECTIVA'))).toBe(true);
    expect(requiresOfferCourseCode(course('ARTE', 'ARTE'))).toBe(true);
  });

  it('does not require code for real USFQ codes', () => {
    expect(requiresOfferCourseCode(course('CMP 3002', 'CMP'))).toBe(false);
    expect(requiresOfferCourseCode(course('ADM 3002', 'ADM'))).toBe(false);
  });
});

describe('sessionsOverlapOnDay', () => {
  it('detects overlap 17:00-18:30 vs 17:30-19:00', () => {
    const a = { day: 'Lun', startTime: '17:00', endTime: '18:30' };
    const b = { day: 'Lun', startTime: '17:30', endTime: '19:00' };
    expect(sessionsOverlapOnDay(a, b)).toBe(true);
  });

  it('no overlap when touching at 17:30', () => {
    const a = { day: 'Lun', startTime: '16:00', endTime: '17:30' };
    const b = { day: 'Lun', startTime: '17:30', endTime: '19:00' };
    expect(sessionsOverlapOnDay(a, b)).toBe(false);
  });

  it('defaults end to 90 min without endTime', () => {
    const sess = { day: 'Mar', startTime: '10:00' };
    expect(sessionEndMinutes(sess)).toBe(10 * 60 + GRID_SLOT_DURATION_MINUTES);
  });

  it('different days do not overlap', () => {
    const a = { day: 'Lun', startTime: '17:00', endTime: '18:30' };
    const b = { day: 'Mar', startTime: '17:30', endTime: '19:00' };
    expect(sessionsOverlapOnDay(a, b)).toBe(false);
  });
});

describe('group letter linking (FIS-2701)', () => {
  const theory = offerRow({
    nrc: '2395',
    course_code: 'FIS-2701',
    type: 'Teoría',
    group_letters: ['DO', 'DP'],
  });
  const lab = offerRow({
    nrc: '2401',
    course_code: 'FIS-2701',
    type: 'Laboratorio',
    group_letters: ['DO', 'DQ'],
  });
  const ej = offerRow({
    nrc: '2603',
    course_code: 'FIS-2701',
    type: 'Ejercicios',
    group_letters: ['DP', 'DQ'],
  });
  const wrongLab = offerRow({
    nrc: '9999',
    course_code: 'FIS-2701',
    type: 'Laboratorio',
    group_letters: ['DP', 'DQ'],
  });

  it('formats group letters', () => {
    expect(formatGroupLetters(['DO', 'DP'])).toBe('| DO | | DP |');
  });

  it('required link letters for theory with two groups', () => {
    expect(requiredLinkLetter(theory, 'Laboratorio')).toBe('DO');
    expect(requiredLinkLetter(theory, 'Ejercicios')).toBe('DP');
  });

  it('links correct LAB and EJ to theory', () => {
    expect(isOfferLinkedToMain(theory, lab)).toBe(true);
    expect(isOfferLinkedToMain(theory, ej)).toBe(true);
    expect(isOfferLinkedToMain(theory, wrongLab)).toBe(false);
  });

  it('getLinkedOffers filters by link letter', () => {
    const map = new Map([
      [theory.nrc, theory],
      [lab.nrc, lab],
      [ej.nrc, ej],
      [wrongLab.nrc, wrongLab],
    ]);
    expect(getLinkedOffers(theory, map, 'Laboratorio').map((r) => r.nrc)).toEqual([
      '2401',
    ]);
    expect(getLinkedOffers(theory, map, 'Ejercicios').map((r) => r.nrc)).toEqual([
      '2603',
    ]);
  });

  it('permits any child when theory has no group letters', () => {
    const bareTheory = offerRow({
      nrc: '1000',
      course_code: 'FIS-2701',
      type: 'Teoría',
      group_letters: [],
    });
    expect(isOfferLinkedToMain(bareTheory, lab)).toBe(true);
    expect(isOfferLinkedToMain(bareTheory, wrongLab)).toBe(true);
  });

  it('links alphanumeric group codes like E7 and E8', () => {
    const theoryE = offerRow({
      nrc: '3001',
      course_code: 'MAT-1201',
      type: 'Teoría',
      group_letters: ['E7', 'E8'],
    });
    const labE = offerRow({
      nrc: '3002',
      course_code: 'MAT-1201',
      type: 'Laboratorio',
      group_letters: ['E7', 'E9'],
    });
    const ejE = offerRow({
      nrc: '3003',
      course_code: 'MAT-1201',
      type: 'Ejercicios',
      group_letters: ['E8', 'E9'],
    });
    const wrongLabE = offerRow({
      nrc: '3004',
      course_code: 'MAT-1201',
      type: 'Laboratorio',
      group_letters: ['E8', 'E9'],
    });

    expect(requiredLinkLetter(theoryE, 'Laboratorio')).toBe('E7');
    expect(requiredLinkLetter(theoryE, 'Ejercicios')).toBe('E8');
    expect(isOfferLinkedToMain(theoryE, labE)).toBe(true);
    expect(isOfferLinkedToMain(theoryE, ejE)).toBe(true);
    expect(isOfferLinkedToMain(theoryE, wrongLabE)).toBe(false);
    expect(formatGroupLetters(['E7', 'E8'])).toBe('| E7 | | E8 |');
  });
});

describe('courseRequiresLabEj', () => {
  it('detects +Lab/Ej courses', () => {
    expect(courseRequiresLabEj('Física para Ing. 1+Lab/Ej')).toEqual({
      lab: true,
      ej: true,
    });
  });

  it('detects +Lab only', () => {
    expect(courseRequiresLabEj('Biología General +Lab')).toEqual({
      lab: true,
      ej: false,
    });
  });

  it('detects +EJ only', () => {
    expect(courseRequiresLabEj('Programación en C++ +EJ')).toEqual({
      lab: false,
      ej: true,
    });
  });
});
