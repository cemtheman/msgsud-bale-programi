import { describe, expect, it } from 'vitest';
import type { Lesson } from '@/types/schedule';
import { lesson } from './fixtures';
import { calculateDayProgress, formatDuration } from '@/utils/dayProgress';

const lessons: Lesson[] = [
  lesson('one', '08:20', '09:00', 'Türkçe'),
  lesson('two', '09:10', '09:50', 'Bale'),
  lesson('three', '10:00', '10:40', 'Matematik'),
];

describe('günlük ders ilerlemesi', () => {
  it('tamamlanan dersleri ve çıkışa kalan süreyi hesaplar', () => {
    expect(calculateDayProgress(lessons, 9 * 60 + 30)).toMatchObject({
      completedLessons: 1,
      totalLessons: 3,
      minutesUntilEnd: 70,
    });
  });

  it('ders günü bittiğinde kalan süreyi sıfırlar', () => {
    expect(calculateDayProgress(lessons, 11 * 60)).toMatchObject({
      completedLessons: 3,
      minutesUntilEnd: 0,
      progressPercent: 100,
    });
  });

  it('süreyi ebeveyn dostu biçimde gösterir', () => {
    expect(formatDuration(130)).toBe('2 saat 10 dakika');
    expect(formatDuration(484)).toBe('8 saat 4 dakika');
    expect(formatDuration(60)).toBe('1 saat');
    expect(formatDuration(24)).toBe('24 dakika');
  });
});
