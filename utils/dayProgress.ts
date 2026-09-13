import type { Lesson } from '@/types/schedule';
import { timeStringToMinutes } from './time';

export interface DayProgress {
  completedLessons: number;
  totalLessons: number;
  minutesUntilEnd: number;
  progressPercent: number;
}

export function calculateDayProgress(lessons: Lesson[], currentMinutes: number): DayProgress {
  if (lessons.length === 0) {
    return { completedLessons: 0, totalLessons: 0, minutesUntilEnd: 0, progressPercent: 0 };
  }

  const firstStart = timeStringToMinutes(lessons[0].start);
  const lastEnd = timeStringToMinutes(lessons.at(-1)!.end);
  const completedLessons = lessons.filter(
    (lesson) => currentMinutes >= timeStringToMinutes(lesson.end),
  ).length;
  const elapsed = Math.max(0, Math.min(currentMinutes - firstStart, lastEnd - firstStart));
  const progressPercent = lastEnd === firstStart
    ? 100
    : Math.round((elapsed / (lastEnd - firstStart)) * 100);

  return {
    completedLessons,
    totalLessons: lessons.length,
    minutesUntilEnd: Math.max(0, lastEnd - currentMinutes),
    progressPercent,
  };
}

export function formatDuration(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;

  if (hours === 0) return `${remainingMinutes} dakika`;
  if (remainingMinutes === 0) return `${hours} saat`;
  return `${hours} saat ${remainingMinutes} dakika`;
}
