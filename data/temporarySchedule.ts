import type { ClassCode, Lesson } from '@/types/schedule';

export const ENGLISH_SUSPENSION = {
  startDate: '2026-09-16',
  endDate: '2026-09-29',
  label: '16–29 Eylül',
} as const;

function isMiddleSchoolClass(classCode: ClassCode): boolean {
  const grade = Number.parseInt(classCode, 10);
  return grade >= 5 && grade <= 8;
}

function isEnglishLesson(lesson: Lesson): boolean {
  return lesson.subject.trim().toLocaleLowerCase('tr-TR') === 'ingilizce';
}

export function isEnglishSuspensionActive(dateKey: string, classCode: ClassCode): boolean {
  return isMiddleSchoolClass(classCode)
    && dateKey >= ENGLISH_SUSPENSION.startDate
    && dateKey <= ENGLISH_SUSPENSION.endDate;
}

export function applyTemporaryLessonChanges(
  lessons: Lesson[],
  dateKey: string,
  classCode: ClassCode,
): Lesson[] {
  if (!isEnglishSuspensionActive(dateKey, classCode)) return lessons;
  return lessons.filter((lesson) => !isEnglishLesson(lesson));
}
