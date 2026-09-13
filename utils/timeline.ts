import type { Lesson } from '@/types/schedule';
import { timeStringToMinutes } from './time';

export function getTimelineEndHour(lessons: Lesson[], startHour = 8): number {
  const lastLesson = lessons.at(-1);
  if (!lastLesson) return startHour + 1;
  return Math.max(startHour + 1, Math.ceil(timeStringToMinutes(lastLesson.end) / 60));
}
