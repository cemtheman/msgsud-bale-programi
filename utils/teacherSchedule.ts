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

type ClassSchedules = Partial<Record<ClassCode, ScheduleData>>;

interface UnnamedLessonRecord {
  classCode: ClassCode;
  dayKey: DayKey;
  lesson: Lesson;
  subjectKey: string;
  locationKey: string;
}

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

function normalizeKey(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('tr-TR') ?? '';
}

function toTurkishTitleCase(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/(^|[\s/()-])([a-zçğıöşü])/g, (match, prefix: string, letter: string) =>
      `${prefix}${letter.toLocaleUpperCase('tr-TR')}`
    );
}

function fallbackTeacherBaseName(subject: string): string {
  const normalized = normalizeKey(subject);
  const label = SUBJECT_TEACHER_LABELS[normalized] ?? toTurkishTitleCase(subject);
  return `${label} Ö.`;
}

function lessonRecordKey(classCode: ClassCode, dayKey: DayKey, lesson: Lesson): string {
  return [classCode, dayKey, lesson.id].join('|');
}

function collectUnnamedLessonRecords(schedules: ClassSchedules): UnnamedLessonRecord[] {
  const records: UnnamedLessonRecord[] = [];

  TEACHER_CLASS_CODES.forEach((classCode) => {
    const classSchedule = schedules[classCode];
    if (!classSchedule) return;

    TEACHER_WEEKDAYS.forEach(({ key: dayKey }) => {
      classSchedule.schedule[dayKey].forEach((lesson) => {
        if (lesson.teacher?.trim()) return;
        records.push({
          classCode,
          dayKey,
          lesson,
          subjectKey: normalizeKey(lesson.subject),
          locationKey: normalizeKey(lesson.location),
        });
      });
    });
  });

  return records;
}

function colorLocationConflictGraph(records: UnnamedLessonRecord[]): Map<string, number> {
  const locations = Array.from(new Set(
    records.map((record) => record.locationKey).filter(Boolean),
  )).sort((a, b) => a.localeCompare(b, 'tr-TR'));

  const edges = new Map<string, Set<string>>();
  locations.forEach((location) => edges.set(location, new Set()));

  const bySlot = new Map<string, Set<string>>();
  records.forEach((record) => {
    if (!record.locationKey) return;
    const slotKey = [record.dayKey, record.lesson.start, record.lesson.end].join('|');
    const slotLocations = bySlot.get(slotKey) ?? new Set<string>();
    slotLocations.add(record.locationKey);
    bySlot.set(slotKey, slotLocations);
  });

  bySlot.forEach((slotLocations) => {
    const items = Array.from(slotLocations);
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        edges.get(items[i])?.add(items[j]);
        edges.get(items[j])?.add(items[i]);
      }
    }
  });

  const hasConflict = Array.from(edges.values()).some((neighbors) => neighbors.size > 0);
  if (!hasConflict) return new Map();

  const ordered = [...locations].sort((a, b) => {
    const degreeDiff = (edges.get(b)?.size ?? 0) - (edges.get(a)?.size ?? 0);
    return degreeDiff || a.localeCompare(b, 'tr-TR');
  });

  const colors = new Map<string, number>();
  ordered.forEach((location) => {
    const usedColors = new Set(
      Array.from(edges.get(location) ?? [])
        .map((neighbor) => colors.get(neighbor))
        .filter((color): color is number => color !== undefined),
    );

    let color = 1;
    while (usedColors.has(color)) color += 1;
    colors.set(location, color);
  });

  return colors;
}

function buildUnnamedTeacherAssignments(schedules: ClassSchedules): Map<string, string> {
  const records = collectUnnamedLessonRecords(schedules);
  const bySubject = new Map<string, UnnamedLessonRecord[]>();

  records.forEach((record) => {
    const subjectRecords = bySubject.get(record.subjectKey) ?? [];
    subjectRecords.push(record);
    bySubject.set(record.subjectKey, subjectRecords);
  });

  const assignments = new Map<string, string>();

  bySubject.forEach((subjectRecords) => {
    const baseName = fallbackTeacherBaseName(subjectRecords[0].lesson.subject);
    const locationColors = colorLocationConflictGraph(subjectRecords);
    const needsSuffix = locationColors.size > 0;

    subjectRecords.forEach((record) => {
      const teacherName = needsSuffix
        ? `${baseName}-${record.locationKey ? locationColors.get(record.locationKey) ?? 1 : 1}`
        : baseName;

      assignments.set(
        lessonRecordKey(record.classCode, record.dayKey, record.lesson),
        teacherName,
      );
    });
  });

  return assignments;
}

function createTeacherNameResolver(schedules: ClassSchedules) {
  const unnamedAssignments = buildUnnamedTeacherAssignments(schedules);

  return (classCode: ClassCode, dayKey: DayKey, lesson: Lesson): string => {
    const explicitTeacher = lesson.teacher?.trim();
    if (explicitTeacher) return explicitTeacher;

    return unnamedAssignments.get(lessonRecordKey(classCode, dayKey, lesson))
      ?? fallbackTeacherBaseName(lesson.subject);
  };
}

function groupTeacherLessons(lessons: Array<Lesson & { classCode: ClassCode }>): TeacherLesson[] {
  const groups = new Map<string, Array<Lesson & { classCode: ClassCode }>>();

  lessons.forEach((lesson) => {
    const key = [
      lesson.start,
      lesson.end,
      normalizeKey(lesson.subject),
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
  schedules: ClassSchedules,
): string[] {
  const names = new Set<string>();
  const resolveTeacherName = createTeacherNameResolver(schedules);

  TEACHER_CLASS_CODES.forEach((classCode) => {
    const classSchedule = schedules[classCode];
    if (!classSchedule) return;

    TEACHER_WEEKDAYS.forEach(({ key: dayKey }) => {
      classSchedule.schedule[dayKey].forEach((lesson) => {
        names.add(resolveTeacherName(classCode, dayKey, lesson));
      });
    });
  });

  return Array.from(names).sort((a, b) => a.localeCompare(b, 'tr-TR', { numeric: true }));
}

export function buildTeacherSchedule(
  schedules: ClassSchedules,
  teacherName: string,
): ScheduleData {
  const schedule = emptySchedule();
  const resolveTeacherName = createTeacherNameResolver(schedules);

  TEACHER_WEEKDAYS.forEach(({ key: dayKey }) => {
    const teacherLessons: Array<Lesson & { classCode: ClassCode }> = [];

    TEACHER_CLASS_CODES.forEach((classCode) => {
      const classSchedule = schedules[classCode];
      if (!classSchedule) return;

      classSchedule.schedule[dayKey].forEach((lesson) => {
        const resolvedTeacherName = resolveTeacherName(classCode, dayKey, lesson);
        if (resolvedTeacherName !== teacherName) return;

        teacherLessons.push({
          ...lesson,
          teacher: resolvedTeacherName,
          id: `teacher-${classCode}-${lesson.id}`,
          classCode,
        });
      });
    });

    schedule[dayKey] = groupTeacherLessons(teacherLessons);
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
