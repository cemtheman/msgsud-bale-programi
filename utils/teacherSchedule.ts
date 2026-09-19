import { applyTemporaryLessonChanges } from '@/data/temporarySchedule';
import { schoolConfig } from '@/data/scheduleData';
import type { ClassCode, DayKey, Lesson, ScheduleData } from '@/types/schedule';
import { addDaysToDateKey } from '@/utils/events';

export type TeacherLesson = Lesson & { classCode: ClassCode };

export const TEACHER_CLASS_CODES: ClassCode[] = [
  '5A', '5B', '6A', '6B', '7A', '7B', '8A', '8B',
  '9A', '9B', '10A', '10B', '11A', '11B', '12A', '12B',
];

export const TEACHER_WEEKDAYS: Array<{ key: DayKey; label: string }> = [
  { key: 'monday', label: 'Pazartesi' },
  { key: 'tuesday', label: 'Salı' },
  { key: 'wednesday', label: 'Çarşamba' },
  { key: 'thursday', label: 'Perşembe' },
  { key: 'friday', label: 'Cuma' },
];

function emptySchedule(): ScheduleData['schedule'] {
  return {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };
}

export function getTeacherNames(
  schedules: Partial<Record<ClassCode, ScheduleData>>,
): string[] {
  const names = new Set<string>();

  Object.values(schedules).forEach((scheduleData) => {
    if (!scheduleData) return;
    Object.values(scheduleData.schedule).forEach((lessons) => {
      lessons.forEach((lesson) => {
        const teacher = lesson.teacher?.trim();
        if (teacher) names.add(teacher);
      });
    });
  });

  return Array.from(names).sort((a, b) => a.localeCompare(b, 'tr-TR'));
}

export function buildTeacherSchedule(
  schedules: Partial<Record<ClassCode, ScheduleData>>,
  teacherName: string,
): ScheduleData {
  const schedule = emptySchedule();

  TEACHER_CLASS_CODES.forEach((classCode) => {
    const classSchedule = schedules[classCode];
    if (!classSchedule) return;

    TEACHER_WEEKDAYS.forEach(({ key }) => {
      classSchedule.schedule[key].forEach((lesson) => {
        if (lesson.teacher?.trim() !== teacherName) return;
        schedule[key].push({
          ...lesson,
          id: `teacher-${classCode}-${lesson.id}`,
          classCode,
        });
      });
    });
  });

  Object.values(schedule).forEach((lessons) => {
    lessons.sort((a, b) =>
      a.start.localeCompare(b.start)
      || a.end.localeCompare(b.end)
      || (a.classCode ?? '').localeCompare(b.classCode ?? '', 'tr-TR')
      || a.subject.localeCompare(b.subject, 'tr-TR'),
    );
  });

  return { school: schoolConfig, schedule };
}

export function getTeacherLessonsForDate(
  scheduleData: ScheduleData,
  dayKey: DayKey,
  dateKey: string,
): TeacherLesson[] {
  return scheduleData.schedule[dayKey].filter((lesson): lesson is TeacherLesson => {
    if (!lesson.classCode) return false;
    return applyTemporaryLessonChanges([lesson], dateKey, lesson.classCode).length > 0;
  });
}

export function getWeekStartDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDaysToDateKey(dateKey, mondayOffset);
}

export function getTeacherWeek(
  scheduleData: ScheduleData,
  weekStartDateKey: string,
  closedDates = new Set<string>(),
) {
  return TEACHER_WEEKDAYS.map(({ key, label }, index) => {
    const dateKey = addDaysToDateKey(weekStartDateKey, index);
    return {
      key,
      label,
      dateKey,
      lessons: closedDates.has(dateKey)
        ? []
        : getTeacherLessonsForDate(scheduleData, key, dateKey),
      isClosed: closedDates.has(dateKey),
    };
  });
}
