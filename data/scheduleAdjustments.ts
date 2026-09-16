import type { ClassCode, Lesson, ScheduleData } from '@/types/schedule';

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

function hasMatchingLesson(lessons: Lesson[], candidate: Lesson) {
  return lessons.some((lesson) =>
    lesson.subject.toLocaleLowerCase('tr-TR') === candidate.subject.toLocaleLowerCase('tr-TR')
    && lesson.start === candidate.start
    && lesson.end === candidate.end,
  );
}

export function applyScheduleAdjustments(
  data: ScheduleData,
  classCode: ClassCode,
): ScheduleData {
  if (classCode !== '5A') return data;

  const wednesday = [...data.schedule.wednesday];
  WEDNESDAY_5A_PIANO.forEach((lesson) => {
    if (!hasMatchingLesson(wednesday, lesson)) wednesday.push(lesson);
  });
  wednesday.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

  return {
    ...data,
    schedule: {
      ...data.schedule,
      wednesday,
    },
  };
}
