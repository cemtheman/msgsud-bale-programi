import { scheduleData, subjectCategories } from '@/data/scheduleData';
import { Lesson, DayKey, Category } from '@/types/schedule';
import { DAY_LABELS } from './time';

export function getLessonsForDay(dayKey: DayKey): Lesson[] {
  const rawList = scheduleData.schedule[dayKey] || [];
  return rawList.map((lesson, idx) => ({ ...lesson, id: `${dayKey}-${idx}-${lesson.start}` }));
}

export function getSubjectCategory(subject: string): Category {
  return subjectCategories[subject] || 'other';
}

export function getNextSchoolDayLesson(currentDay: DayKey): { lesson: Lesson; dayLabel: string } | null {
  const keys = Object.keys(scheduleData.schedule) as DayKey[];
  const currentIndex = keys.indexOf(currentDay);

  for (let i = 1; i <= 7; i++) {
    const nextIdx = (currentIndex + i) % 7;
    const nextDayKey = keys[nextIdx];
    const lessons = getLessonsForDay(nextDayKey);
    
    if (lessons.length > 0) {
      const isTomorrow = nextIdx === (currentIndex + 1) % 7;
      return { 
        lesson: lessons[0], 
        dayLabel: isTomorrow ? 'Yarın' : DAY_LABELS[nextDayKey] 
      };
    }
  }
  return null;
}