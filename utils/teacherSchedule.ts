import { applyTemporaryLessonChanges } from '@/data/temporarySchedule';
import { schoolConfig } from '@/data/scheduleData';
import type { ClassCode, DayKey, Lesson, ScheduleData } from '@/types/schedule';
import { addDaysToDateKey } from '@/utils/events';

export type TeacherLesson = Lesson & { classCodes: ClassCode[] };

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

const SUBJECT_TEACHER_LABELS: Record<string, string> = {
  'din kültürü ve ahlak bilgisi': 'Din Kültürü',
  'din kültürü': 'Din Kültürü',
};

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

function fallbackTeacherName(subject: string): string {
  const trimmed = subject.trim();
  const normalized = trimmed.toLocaleLowerCase('tr-TR');
  return `${SUBJECT_TEACHER_LABELS[normalized] ?? trimmed} Ö.`;
}

export function getLessonTeacherName(lesson: Lesson): string {
  return lesson.teacher?.trim() || fallbackTeacherName(lesson.subject);
}

function groupTeacherLessons(lessons: Array<Lesson & { classCode: ClassCode }>): TeacherLesson[] {
  const groups = new Map<string, Array<Lesson & { classCode: ClassCode }>>();

  lessons.forEach((lesson) => {
    const key = [
      lesson.start,
      lesson.end,
      lesson.subject.trim().toLocaleLowerCase('tr-TR'),
    ].join('|');
    const group = groups.get(key) ?? [];
    group.push(lesson);
    groups.set(key, group);
  });

  return Array.from(groups.values()).map((group) => {
    const first = group[0];
    const classCodes = Array.from(new Set(group.map((lesson) => lesson.classCode)))
      .sort((a, b) => a.localeCompare(b, 'tr-TR', { numeric: true }));
    const locations = Array.from(new Set(
      group.map((lesson) => lesson.location?.trim()).filter((value): value is string => Boolean(value)),
    ));
    const subgroups = Array.from(new Set(
      group.map((lesson) => lesson.subgroup?.trim()).filter((value): value is string => Boolean(value)),
    ));

    return {
      ...first,
      id: `teacher-group-${first.start}-${first.end}-${first.subject}-${classCodes.join('-')}`,
      teacher: getLessonTeacherName(first),
      location: locations.length > 0 ? locations.join(' / ') : undefined,
      subgroup: subgroups.length > 0 ? subgroups.join(' / ') : undefined,
      classCode: undefined,
      classCodes,
    };
  }).sort((a, b) =>
    a.start.localeCompare(b.start)
    || a.end.localeCompare(b.end)
    || a.subject.localeCompare(b.subject, 'tr-TR'),
  );
}

export function getTeacherNames(
  schedules: Partial<Record<ClassCode, ScheduleData>>,
): string[] {
  const names = new Set<string>();

  Object.values(schedules).forEach((scheduleData) => {
    if (!scheduleData) return;
    Object.values(scheduleData.schedule).forEach((lessons) => {
      lessons.forEach((lesson) => names.add(getLessonTeacherName(lesson)));
    });
  });

  return Array.from(names).sort((a, b) => a.localeCompare(b, 'tr-TR'));
}

export function buildTeacherSchedule(
  schedules: Partial<Record<ClassCode, ScheduleData>>,
  teacherName: string,
): ScheduleData {
  const schedule = emptySchedule();

  TEACHER_WEEKDAYS.forEach(({ key }) => {
    const teacherLessons: Array<Lesson & { classCode: ClassCode }> = [];

    TEACHER_CLASS_CODES.forEach((classCode) => {
      const classSchedule = schedules[classCode];
      if (!classSchedule) return;

      classSchedule.schedule[key].forEach((lesson) => {
        if (getLessonTeacherName(lesson) !== teacherName) return;
        teacherLessons.push({
          ...lesson,
          teacher: getLessonTeacherName(lesson),
          id: `teacher-${classCode}-${lesson.id}`,
          classCode,
        });
      });
    });

    schedule[key] = groupTeacherLessons(teacherLessons);
  });

  return { school: schoolConfig, schedule };
}

export function getTeacherLessonsForDate(
  scheduleData: ScheduleData,
  dayKey: DayKey,
  dateKey: string,
): TeacherLesson[] {
  return scheduleData.schedule[dayKey].flatMap((lesson) => {
    const classCodes = lesson.classCodes ?? (lesson.classCode ? [lesson.classCode] : []);
    const activeClassCodes = classCodes.filter(
      (classCode) => applyTemporaryLessonChanges([lesson], dateKey, classCode).length > 0,
    );

    if (activeClassCodes.length === 0) return [];

    return [{
      ...lesson,
      classCode: undefined,
      classCodes: activeClassCodes,
    } as TeacherLesson];
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
