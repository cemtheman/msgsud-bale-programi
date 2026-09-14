import { ComputedStatus, DayKey, ScheduleData } from '@/types/schedule';
import { getLessonsForDay, getNextSchoolDayLesson } from './schedule';
import { timeStringToMinutes } from './time';

export function calculateStatus(scheduleData: ScheduleData, dayKey: DayKey, currentMinutes: number, currentDateKey: string, closedDates = new Set<string>()): ComputedStatus {
  const lessons = getLessonsForDay(scheduleData, dayKey);
  const nextSchoolDay = () => getNextSchoolDayLesson(scheduleData, currentDateKey, closedDates);

  // 1. Resmî tatil veya ders olmayan gün
  if (closedDates.has(currentDateKey) || lessons.length === 0) {
    const nextInfo = nextSchoolDay();
    return { 
      type: 'no_school', 
      nextLesson: nextInfo?.lesson, 
      nextLessonDayLabel: nextInfo?.dayLabel 
    };
  }

  const firstLesson = lessons[0];
  const lastLesson = lessons[lessons.length - 1];
  const firstStartMins = timeStringToMinutes(firstLesson.start);
  const lastEndMins = timeStringToMinutes(lastLesson.end);

  // 2. İlk dersten önce mi?
  if (currentMinutes < firstStartMins) {
    return { 
      type: 'before_school', 
      nextLesson: firstLesson, 
      minutesUntilNext: firstStartMins - currentMinutes 
    };
  }

  // 3. Son dersten sonra mı?
  if (currentMinutes >= lastEndMins) {
    const nextInfo = nextSchoolDay();
    return { 
      type: 'finished', 
      nextLesson: nextInfo?.lesson, 
      nextLessonDayLabel: nextInfo?.dayLabel 
    };
  }

  // 4. Aktif ders var mı?
  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    const startMins = timeStringToMinutes(lesson.start);
    const endMins = timeStringToMinutes(lesson.end);

    if (currentMinutes >= startMins && currentMinutes < endMins) {
      const duration = endMins - startMins;
      const passed = currentMinutes - startMins;
      return {
        type: 'in_lesson',
        currentLesson: lesson,
        nextLesson: lessons[i + 1] || nextSchoolDay()?.lesson,
        progressPercent: Math.min(100, Math.max(0, Math.round((passed / duration) * 100))),
        minutesPassed: passed,
        minutesRemaining: endMins - currentMinutes,
      };
    }
  }

  // 5. Yemek arasında mı? (12:20 - 13:00)
  const lunchStart = timeStringToMinutes(scheduleData.school.lunchBreak.start);
  const lunchEnd = timeStringToMinutes(scheduleData.school.lunchBreak.end);

  if (currentMinutes >= lunchStart && currentMinutes < lunchEnd) {
    return { 
      type: 'lunch', 
      nextLesson: lessons.find(l => timeStringToMinutes(l.start) >= lunchEnd), 
      minutesUntilNext: lunchEnd - currentMinutes 
    };
  }

  // 6. Dersler arası boşluklar (10 dk Teneffüs veya Uzun Serbest Zaman)
  for (let i = 0; i < lessons.length - 1; i++) {
    const prevEnd = timeStringToMinutes(lessons[i].end);
    const nextStart = timeStringToMinutes(lessons[i + 1].start);

    if (currentMinutes >= prevEnd && currentMinutes < nextStart) {
      const gap = nextStart - prevEnd;
      const nextLesson = lessons[i + 1];
      
      return gap === 10
        ? { type: 'break', nextLesson, minutesUntilNext: nextStart - currentMinutes }
        : { type: 'free_time', nextLesson, minutesUntilNext: nextStart - currentMinutes };
    }
  }

  return { type: 'free_time' };
}
