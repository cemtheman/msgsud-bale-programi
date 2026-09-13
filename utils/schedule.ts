import { scheduleData, subjectCategories } from '@/data/scheduleData';
import { Lesson, DayKey, Category } from '@/types/schedule';
import { DAY_LABELS } from './time';
import { addDaysToDateKey, getDayKeyForDate } from './events';

export function getLessonsForDay(dayKey: DayKey): Lesson[] {
  const rawList = scheduleData.schedule[dayKey] || [];
  return rawList.map((lesson, idx) => ({ ...lesson, id: `${dayKey}-${idx}-${lesson.start}` }));
}

export function getSubjectCategory(subject: string): Category {
  return subjectCategories[subject] || 'other';
}

export interface NextSchoolDayInfo {
  dateKey: string;
  dayKey: DayKey;
  dayLabel: string;
  lessons: Lesson[];
}

export function getNextSchoolDayInfo(currentDateKey: string, holidayDates = new Set<string>()): NextSchoolDayInfo | null {
  for (let i = 1; i <= 14; i++) {
    const nextDateKey = addDaysToDateKey(currentDateKey, i);
    if (holidayDates.has(nextDateKey)) continue;
    const nextDayKey = getDayKeyForDate(nextDateKey);
    const lessons = getLessonsForDay(nextDayKey);
    
    if (lessons.length > 0) {
      return { 
        dateKey: nextDateKey,
        dayKey: nextDayKey,
        lessons,
        dayLabel: i === 1 ? 'Yarın' : DAY_LABELS[nextDayKey],
      };
    }
  }
  return null;
}

export function getNextSchoolDayLesson(currentDateKey: string, holidayDates = new Set<string>()): { lesson: Lesson; dayLabel: string } | null {
  const info = getNextSchoolDayInfo(currentDateKey, holidayDates);
  return info ? { lesson: info.lessons[0], dayLabel: info.dayLabel } : null;
}
