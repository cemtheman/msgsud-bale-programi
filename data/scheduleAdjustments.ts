import type { ClassCode, DayKey, Lesson, ScheduleData } from '@/types/schedule';

const DAY_KEYS: DayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const WEDNESDAY_5A_PIANO: Lesson[] = [
  {
    id: 'adjustment-5a-wednesday-piano-group-1',
    start: '15:30',
    end: '16:15',
    subject: 'Piyano',
    target: 'SECTION',
    sessionType: 'PARALLEL',
    subgroup: '1. Grup',
  },
  {
    id: 'adjustment-5a-wednesday-piano-group-2',
    start: '16:20',
    end: '17:00',
    subject: 'Piyano',
    target: 'SECTION',
    sessionType: 'PARALLEL',
    subgroup: '2. Grup',
  },
];

const MONDAY_5A_CONDITIONING: Lesson = {
  id: 'adjustment-5a-monday-conditioning',
  start: '11:40',
  end: '12:20',
  subject: 'V. Kondisyon',
  target: 'BALLET',
  sessionType: 'STANDARD',
};

function hasMatchingLesson(lessons: Lesson[], candidate: Lesson) {
  return lessons.some((lesson) =>
    lesson.subject.toLocaleLowerCase('tr-TR') === candidate.subject.toLocaleLowerCase('tr-TR')
    && lesson.start === candidate.start
    && lesson.end === candidate.end,
  );
}

function isTogetherPractice(subject: string) {
  const normalized = subject.trim().toLocaleLowerCase('tr-TR');
  return normalized === 'b. uygulama' || normalized === 'birlikte uygulama';
}

function removeFifthGradeTogetherPractice(data: ScheduleData): ScheduleData {
  return {
    ...data,
    schedule: {
      ...data.schedule,
      ...Object.fromEntries(DAY_KEYS.map((dayKey) => [
        dayKey,
        data.schedule[dayKey].filter((lesson) => !isTogetherPractice(lesson.subject)),
      ])) as ScheduleData['schedule'],
    },
  };
}

function isConditioning(subject: string) {
  const normalized = subject.trim().toLocaleLowerCase('tr-TR');
  return normalized === 'v. kondisyon' || normalized === 'vücut kondisyon';
}

function replace5AConditioning(data: ScheduleData): ScheduleData {
  const schedule = Object.fromEntries(DAY_KEYS.map((dayKey) => [
    dayKey,
    data.schedule[dayKey].filter((lesson) => !isConditioning(lesson.subject)),
  ])) as ScheduleData['schedule'];

  schedule.monday.push(MONDAY_5A_CONDITIONING);
  schedule.monday.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

  return { ...data, schedule };
}

export function applyScheduleAdjustments(
  data: ScheduleData,
  classCode: ClassCode,
): ScheduleData {
  if (classCode !== '5A' && classCode !== '5B') return data;

  // 5. sınıflarda bu sömestr uygulanmıyor; yeniden planlanırsa bu filtre kaldırılacak.
  const adjustedData = removeFifthGradeTogetherPractice(data);
  if (classCode !== '5A') return adjustedData;

  const personalized5AData = replace5AConditioning(adjustedData);
  const wednesday = [...personalized5AData.schedule.wednesday];
  WEDNESDAY_5A_PIANO.forEach((lesson) => {
    if (!hasMatchingLesson(wednesday, lesson)) wednesday.push(lesson);
  });
  wednesday.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

  return {
    ...personalized5AData,
    schedule: {
      ...personalized5AData.schedule,
      wednesday,
    },
  };
}
