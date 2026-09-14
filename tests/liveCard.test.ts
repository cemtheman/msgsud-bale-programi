import { describe, expect, it } from 'vitest';
import type { ComputedStatus } from '@/types/schedule';
import { getLiveCardPresentation, getLiveCardTimeSummary } from '@/utils/liveCard';

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
      nextLesson: { id: 'next', start: '13:00', end: '13:40', subject: 'Klasik Bale' },
    };

    expect(getLiveCardTimeSummary(status)).toBe('Yemek arasının bitmesine 23 dakika kaldı');
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
