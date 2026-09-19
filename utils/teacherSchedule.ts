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

const SUBJECT_ALIASES: Record<string, string> = {
  'türk d. ve edb.': 'türk dili ve edebiyatı',
  'türk d ve edb': 'türk dili ve edebiyatı',
  'türk dili ve edebiyatı': 'türk dili ve edebiyatı',
  'din kültürü ve ahlak bilgisi': 'din kültürü',
  'din kültürü ve ahlak bilg.': 'din kültürü',
  'din kültürü': 'din kültürü',
};

const SUBJECT_TEACHER_LABELS: Record<string, string> = {
  'türk dili ve edebiyatı': 'Türk Dili ve Edebiyatı',
  'din kültürü': 'Din Kültürü',
};

const MUSIC_TEACHER_SUBJECTS = new Set([
  'müzik tarihi',
  'müzik teorisi',
  'koro',
]);

const NO_INFERRED_TEACHER_SUBJECTS = new Set([
  'kulüp dersleri',
  'kulüp dersi',
  'kulüp',
  'sahne',
  'birlikte uygulama',
]);

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

function canonicalSubjectKey(subject: string): string {
  const normalized = normalizeKey(subject);
  const compact = normalized
    .replace(/[.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    compact === 'türk d ve edb'
    || compact.startsWith('türk d ve edb')
    || compact === 'türk dili ve edebiyatı'
  ) {
    return 'türk dili ve edebiyatı';
  }

  if (compact.startsWith('din kült')) {
    return 'din kültürü';
  }

  if (
    compact === 'b uygulama'
    || compact.startsWith('birlikte uygulama')
  ) {
    return 'birlikte uygulama';
  }

  if (compact.startsWith('kulüp')) {
    return 'kulüp';
  }

  if (compact.startsWith('sahne')) {
    return 'sahne';
  }

  return SUBJECT_ALIASES[normalized] ?? normalized;
}

function inferredTeacherIdentityKey(subject: string): string | null {
  const subjectKey = canonicalSubjectKey(subject);
  if (NO_INFERRED_TEACHER_SUBJECTS.has(subjectKey)) return null;
  if (MUSIC_TEACHER_SUBJECTS.has(subjectKey)) return 'müzik öğretmeni';
  return subjectKey;
}

function fallbackTeacherBaseName(subject: string): string | null {
  const identityKey = inferredTeacherIdentityKey(subject);
  if (!identityKey) return null;
  if (identityKey === 'müzik öğretmeni') return 'Müzik Öğretmeni';

  const label = SUBJECT_TEACHER_LABELS[identityKey] ?? toTurkishTitleCase(identityKey);
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
        const subjectKey = inferredTeacherIdentityKey(lesson.subject);
        if (!subjectKey) return;

        records.push({
          classCode,
          dayKey,
          lesson,
          subjectKey,
          locationKey: normalizeKey(lesson.location),
        });
      });
    });
  });

  return records;
}

function getGrade(classCode: ClassCode): number {
  return Number.parseInt(classCode, 10);
}

function buildSimultaneousTeachingGroups(records: UnnamedLessonRecord[]): UnnamedLessonRecord[][] {
  const parents = records.map((_, index) => index);

  const find = (index: number): number => {
    if (parents[index] !== index) parents[index] = find(parents[index]);
    return parents[index];
  };

  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };

  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      const sameSubject = canonicalSubjectKey(records[i].lesson.subject)
        === canonicalSubjectKey(records[j].lesson.subject);
      const sameGrade = getGrade(records[i].classCode) === getGrade(records[j].classCode);
      const sameKnownLocation = Boolean(records[i].locationKey)
        && records[i].locationKey === records[j].locationKey;

      // Aynı dersin A/B şubeleri ortak ders grubu sayılabilir.
      // Aynı ders ve aynı lokasyondaki farklı sınıflar da tek öğretmen tarafından birlikte işlenebilir.
      // Müzik dersleri tek öğretmen kimliğini paylaşsa da farklı dersler aynı anda ise çakışmadır.
      if (sameSubject && (sameGrade || sameKnownLocation)) union(i, j);
    }
  }

  const groups = new Map<number, UnnamedLessonRecord[]>();
  records.forEach((record, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(record);
    groups.set(root, group);
  });

  return Array.from(groups.values()).sort((left, right) => {
    const leftLocation = left.map((record) => record.locationKey).find(Boolean) ?? '';
    const rightLocation = right.map((record) => record.locationKey).find(Boolean) ?? '';
    const locationCompare = leftLocation.localeCompare(rightLocation, 'tr-TR');
    if (locationCompare !== 0) return locationCompare;

    return left[0].classCode.localeCompare(right[0].classCode, 'tr-TR', { numeric: true });
  });
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
    if (!baseName) return;
    const bySlot = new Map<string, UnnamedLessonRecord[]>();

    subjectRecords.forEach((record) => {
      const slotKey = [
        record.dayKey,
        record.lesson.start,
        record.lesson.end,
      ].join('|');
      const slotRecords = bySlot.get(slotKey) ?? [];
      slotRecords.push(record);
      bySlot.set(slotKey, slotRecords);
    });

    const slotGroups = Array.from(bySlot.values()).map(buildSimultaneousTeachingGroups);
    const maxConcurrentTeachers = Math.max(1, ...slotGroups.map((groups) => groups.length));
    const forceSingleName = subjectRecords[0].subjectKey === 'din kültürü';
    const needsSuffix = maxConcurrentTeachers > 1 && !forceSingleName;

    slotGroups.forEach((groups) => {
      groups.forEach((group, groupIndex) => {
        const teacherName = needsSuffix
          ? `${baseName}-${groupIndex + 1}`
          : baseName;

        group.forEach((record) => {
          assignments.set(
            lessonRecordKey(record.classCode, record.dayKey, record.lesson),
            teacherName,
          );
        });
      });
    });
  });

  return assignments;
}

function createTeacherNameResolver(schedules: ClassSchedules) {
  const unnamedAssignments = buildUnnamedTeacherAssignments(schedules);

  return (classCode: ClassCode, dayKey: DayKey, lesson: Lesson): string | null => {
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
      canonicalSubjectKey(lesson.subject),
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
        const teacherName = resolveTeacherName(classCode, dayKey, lesson);
        if (teacherName) names.add(teacherName);
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
        if (!resolvedTeacherName || resolvedTeacherName !== teacherName) return;

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
