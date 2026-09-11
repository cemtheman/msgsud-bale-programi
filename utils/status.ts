import { ComputedStatus, DayKey, Lesson } from '@/types/schedule';
import { scheduleData } from '@/data/scheduleData';
import { getLessonsForDay, getNextSchoolDayLesson } from './schedule';
import { timeStringToMinutes } from './time';

export function calculateStatus(dayKey: DayKey, currentMinutes: number): ComputedStatus {
  const lessons = getLessonsForDay(dayKey);

  if (!lessons || lessons.length === 0) {
    const nextInfo = getNextSchoolDayLesson(dayKey);
    return {
      type: 'no_school',
      nextLesson: nextInfo?.lesson,
      nextLessonDayLabel: nextInfo?.dayLabel,
    };
  }

  const firstLesson = lessons[0];
  const lastLesson = lessons[lessons.length - 1];
  const firstStartMins = timeStringToMinutes(firstLesson.start);
  const lastEndMins = timeStringToMinutes(lastLesson.end);

  // 1. İlk dersten önce mi?
  if (currentMinutes < firstStartMins) {
    return {
      type: 'before_school',
      nextLesson: firstLesson,
      minutesUntilNext: firstStartMins - currentMinutes,
    };
  }

  // 2. Son dersten sonra mı?
  if (currentMinutes >= lastEndMins) {
    const nextInfo = getNextSchoolDayLesson(dayKey);
    return {
      type: 'finished',
      nextLesson: nextInfo?.lesson,
      nextLessonDayLabel: nextInfo?.dayLabel,
    };
  }

  // 3. Aktif ders var mı?
  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    const startMins = timeStringToMinutes(lesson.start);
    const endMins = timeStringToMinutes(lesson.end);

    if (currentMinutes >= startMins && currentMinutes < endMins) {
      const duration = endMins - startMins;
      const passed = currentMinutes - startMins;
      const remaining = endMins - currentMinutes;
      const progress = Math.min(100, Math.max(0, Math.round((passed / duration) * 100)));

      return {
        type: 'in_lesson',
        currentLesson: lesson,
        nextLesson: lessons[i + 1] || getNextSchoolDayLesson(dayKey)?.lesson,
        progressPercent: progress,
        minutesPassed: passed,
        minutesRemaining: remaining,
      };
    }
  }

  // 4. Yemek arasında mı? (12:20 - 13:00)
  const lunchStart = timeStringToMinutes(scheduleData.school.lunchBreak.start);
  const lunchEnd = timeStringToMinutes(scheduleData.school.lunchBreak.end);

  if (currentMinutes >= lunchStart && currentMinutes < lunchEnd) {
    const nextLesson = lessons.find((l) => timeStringToMinutes(l.start) >= lunchEnd);
    return {
      type: 'lunch',
      nextLesson,
      minutesUntilNext: lunchEnd - currentMinutes,
    };
  }

  // 5. Aradaki boşluklar (Teneffüs vs. Serbest Zaman)
  for (let i = 0; i < lessons.length - 1; i++) {
    const prevLessonEnd = timeStringToMinutes(lessons[i].end);
    const nextLessonStart = timeStringToMinutes(lessons[i + 1].start);

    if (currentMinutes >= prevLessonEnd && currentMinutes < nextLessonStart) {
      const gapDuration = nextLessonStart - prevLessonEnd;
      const nextLesson = lessons[i + 1];

      // Ardışık iki ders arasında tam 10 dk standart boşluk varsa
      if (gapDuration === 10) {
        return {
          type: 'break',
          nextLesson,
          minutesUntilNext: nextLessonStart - currentMinutes,
        };
      }

      // 10 dakikadan uzun boşluk
      return {
        type: 'free_time',
        nextLesson,
        minutesUntilNext: nextLessonStart - currentMinutes,
      };
    }
  }

  return { type: 'free_time' };
}