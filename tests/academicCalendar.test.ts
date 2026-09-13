import { describe, expect, it } from 'vitest';
import {
  getAcademicCalendarState,
  getAcademicClosureDates,
  isInstructionDate,
} from '@/data/academicCalendar';

describe('2026–27 akademik takvimi', () => {
  it('dönemin ilk ve son gününü ders günü kabul eder', () => {
    expect(isInstructionDate('2026-09-14')).toBe(true);
    expect(isInstructionDate('2027-06-25')).toBe(true);
  });

  it('dönem dışını ve ara tatilleri kapalı kabul eder', () => {
    expect(getAcademicCalendarState('2026-09-13').phase).toBe('before_year');
    expect(getAcademicCalendarState('2026-11-18')).toMatchObject({
      phase: 'break',
      closureTitle: 'Birinci ara tatil',
    });
    expect(getAcademicCalendarState('2027-01-30').closureTitle).toBe('Yarıyıl tatili');
    expect(getAcademicCalendarState('2027-06-26').phase).toBe('after_year');
  });

  it('yaklaşan kapalı tarihleri aralığa ekler', () => {
    const dates = getAcademicClosureDates('2026-11-13', 7);
    expect(dates.has('2026-11-16')).toBe(true);
    expect(dates.has('2026-11-13')).toBe(false);
  });
});
