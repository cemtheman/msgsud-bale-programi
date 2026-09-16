import { describe, expect, it } from 'vitest';
import { applyTemporaryLessonChanges, isEnglishSuspensionActive } from '@/data/temporarySchedule';
import { schoolConfig } from '@/data/scheduleData';
import { calculateStatus } from '@/utils/status';
import { timeStringToMinutes } from '@/utils/time';
import type { ScheduleData } from '@/types/schedule';
import { lesson } from './fixtures';

const lessons = [
  lesson('tr', '08:20', '09:00', 'Türkçe'),
  lesson('en', '16:20', '17:00', 'İngilizce'),
];

const schedule: ScheduleData = {
  school: schoolConfig,
  schedule: {
    monday: lessons,
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  },
};

describe('geçici İngilizce dersi düzenlemesi', () => {
  it('16–29 Eylül arasında ortaokul İngilizce derslerini kaldırır', () => {
    expect(applyTemporaryLessonChanges(lessons, '2026-09-16', '5A'))
      .toEqual([lessons[0]]);
    expect(applyTemporaryLessonChanges(lessons, '2026-09-29', '8B'))
      .toEqual([lessons[0]]);
  });

  it('30 Eylül tarihinde normal programa otomatik döner', () => {
    expect(applyTemporaryLessonChanges(lessons, '2026-09-30', '5A'))
      .toEqual(lessons);
  });

  it('İngilizce son dersse çıkış hesabını önceki derse çeker', () => {
    expect(calculateStatus(
      schedule,
      'monday',
      timeStringToMinutes('16:30'),
      '2026-09-21',
      new Set(),
      '5A',
    ).type).toBe('finished');

    expect(calculateStatus(
      schedule,
      'monday',
      timeStringToMinutes('16:30'),
      '2026-10-05',
      new Set(),
      '5A',
    ).type).toBe('in_lesson');
  });

  it('lise sınıflarının İngilizce derslerine dokunmaz', () => {
    expect(isEnglishSuspensionActive('2026-09-21', '9A')).toBe(false);
    expect(applyTemporaryLessonChanges(lessons, '2026-09-21', '9A'))
      .toEqual(lessons);
  });
});
