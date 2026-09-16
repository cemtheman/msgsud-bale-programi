import { getSubjectCategory as resolveSubjectCategory } from '@/data/scheduleData';
import { Lesson, DayKey, Category, ScheduleData, AudienceTarget, ClassCode } from '@/types/schedule';
import { applyTemporaryLessonChanges } from '@/data/temporarySchedule';
import { DAY_LABELS } from './time';
import { addDaysToDateKey, getDayKeyForDate } from './events';

export function getLessonsForDay(scheduleData: ScheduleData, dayKey: DayKey): Lesson[] {
  return scheduleData.schedule[dayKey] || [];
}

export function getLessonsForDate(
  scheduleData: ScheduleData,
  dayKey: DayKey,
  dateKey: string,
  classCode: ClassCode,
): Lesson[] {
  return applyTemporaryLessonChanges(getLessonsForDay(scheduleData, dayKey), dateKey, classCode);
}

export function getSubjectCategory(subject: string, target?: AudienceTarget): Category {
  return resolveSubjectCategory(subject, target);
}

export interface NextSchoolDayInfo {
  dateKey: string;
  dayKey: DayKey;
  dayLabel: string;
  lessons: Lesson[];
}

export function getNextSchoolDayInfo(
  scheduleData: ScheduleData,
  currentDateKey: string,
  closedDates = new Set<string>(),
  classCode?: ClassCode,
): NextSchoolDayInfo | null {
  for (let i = 1; i <= 60; i++) {
    const nextDateKey = addDaysToDateKey(currentDateKey, i);
    if (closedDates.has(nextDateKey)) continue;
    const nextDayKey = getDayKeyForDate(nextDateKey);
    const lessons = classCode
      ? getLessonsForDate(scheduleData, nextDayKey, nextDateKey, classCode)
      : getLessonsForDay(scheduleData, nextDayKey);
    
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

export function getNextSchoolDayLesson(
  scheduleData: ScheduleData,
  currentDateKey: string,
  closedDates = new Set<string>(),
  classCode?: ClassCode,
): { lesson: Lesson; dayLabel: string } | null {
  const info = getNextSchoolDayInfo(scheduleData, currentDateKey, closedDates, classCode);
  return info ? { lesson: info.lessons[0], dayLabel: info.dayLabel } : null;
}
