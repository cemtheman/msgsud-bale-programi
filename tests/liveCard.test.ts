import { describe, expect, it } from 'vitest';
import type { ComputedStatus } from '@/types/schedule';
import { getLiveCardPresentation, getLiveCardTimeSummary } from '@/utils/liveCard';
import { lesson } from './fixtures';

describe('getLiveCardPresentation', () => {
  it('keeps a distant first lesson calm and compact', () => {
    const status: ComputedStatus = { type: 'before_school', minutesUntilNext: 465 };

    expect(getLiveCardPresentation(status)).toEqual({
      mode: 'calm',
      label: 'Bugünün İlk Dersi',
      compact: true,
    });
  });

  it('highlights the next lesson in the final 60 minutes', () => {
    const status: ComputedStatus = { type: 'before_school', minutesUntilNext: 60 };

    expect(getLiveCardPresentation(status).mode).toBe('upcoming');
  });

  it('uses the live state while a lesson is in progress', () => {
    const status: ComputedStatus = { type: 'in_lesson', minutesRemaining: 20 };

    expect(getLiveCardPresentation(status).mode).toBe('live');
  });

  it('yemek arasında bağlama özgü geri sayım gösterir', () => {
    const status: ComputedStatus = {
      type: 'lunch',
      minutesUntilNext: 23,
      nextLesson: lesson('next', '13:00', '13:40', 'Klasik Bale'),
    };

    expect(getLiveCardTimeSummary(status)).toBe('Yemek arasının bitmesine 23 dakika kaldı');
  });

  it.each([
    ['break', 7, 'Teneffüsün bitmesine 7 dakika kaldı'],
    ['free_time', 80, 'Sıradaki derse 1 saat 20 dakika kaldı'],
    ['before_school', 35, 'İlk derse 35 dakika kaldı'],
  ] as const)('%s durumunda geri sayımın bağlamını açıklar', (type, minutesUntilNext, expected) => {
    const status: ComputedStatus = {
      type,
      minutesUntilNext,
      nextLesson: lesson('next', '13:00', '13:40', 'Klasik Bale'),
    };

    expect(getLiveCardTimeSummary(status)).toBe(expected);
  });

  it('shows a compact completion state after the final lesson', () => {
    const status: ComputedStatus = { type: 'finished' };

    expect(getLiveCardPresentation(status)).toEqual({
      mode: 'complete',
      label: 'Gün Tamamlandı',
      compact: true,
    });
  });
});
