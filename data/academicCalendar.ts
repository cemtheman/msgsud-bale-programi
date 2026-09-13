import { addDaysToDateKey } from '@/utils/events';

export const academicCalendar = {
  label: '2026–27',
  firstTerm: { start: '2026-09-14', end: '2027-01-22' },
  secondTerm: { start: '2027-02-08', end: '2027-06-25' },
  breaks: [
    { start: '2026-11-16', end: '2026-11-20', title: 'Birinci ara tatil' },
    { start: '2027-01-23', end: '2027-02-07', title: 'Yarıyıl tatili' },
    { start: '2027-03-08', end: '2027-03-12', title: 'İkinci ara tatil' },
  ],
} as const;

export type AcademicCalendarPhase = 'before_year' | 'in_session' | 'break' | 'after_year';

export interface AcademicCalendarState {
  phase: AcademicCalendarPhase;
  label: string;
  closureTitle?: string;
}

function isWithin(dateKey: string, start: string, end: string): boolean {
  return dateKey >= start && dateKey <= end;
}

export function getAcademicCalendarState(dateKey: string): AcademicCalendarState {
  if (dateKey < academicCalendar.firstTerm.start) {
    return {
      phase: 'before_year',
      label: academicCalendar.label,
      closureTitle: 'Eğitim dönemi 14 Eylül 2026’da başlıyor',
    };
  }

  if (dateKey > academicCalendar.secondTerm.end) {
    return {
      phase: 'after_year',
      label: academicCalendar.label,
      closureTitle: '2026–27 eğitim dönemi sona erdi',
    };
  }

  const currentBreak = academicCalendar.breaks.find((item) =>
    isWithin(dateKey, item.start, item.end),
  );
  if (currentBreak) {
    return {
      phase: 'break',
      label: academicCalendar.label,
      closureTitle: currentBreak.title,
    };
  }

  const isFirstTerm = isWithin(
    dateKey,
    academicCalendar.firstTerm.start,
    academicCalendar.firstTerm.end,
  );
  const isSecondTerm = isWithin(
    dateKey,
    academicCalendar.secondTerm.start,
    academicCalendar.secondTerm.end,
  );

  return {
    phase: isFirstTerm || isSecondTerm ? 'in_session' : 'break',
    label: academicCalendar.label,
    closureTitle: isFirstTerm || isSecondTerm ? undefined : 'Ders yapılmayan dönem',
  };
}

export function isInstructionDate(dateKey: string): boolean {
  return getAcademicCalendarState(dateKey).phase === 'in_session';
}

export function getAcademicClosureDates(startDateKey: string, daysAhead = 60): Set<string> {
  const closedDates = new Set<string>();
  for (let offset = 0; offset <= daysAhead; offset++) {
    const dateKey = addDaysToDateKey(startDateKey, offset);
    if (!isInstructionDate(dateKey)) closedDates.add(dateKey);
  }
  return closedDates;
}
