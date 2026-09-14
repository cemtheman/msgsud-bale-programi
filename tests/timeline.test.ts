import { describe, expect, it } from 'vitest';
import type { Lesson } from '@/types/schedule';
import { lesson as createLesson } from './fixtures';
import { getTimelineEndHour } from '@/utils/timeline';

function lesson(end: string): Lesson {
  return createLesson(end, '08:20', end);
}

describe('canlı zaman çizelgesi bitişi', () => {
  it('tam saatte biten son derste aynı saati kullanır', () => {
    expect(getTimelineEndHour([lesson('17:00')])).toBe(17);
  });

  it('dakikalı bitişi sonraki tam saate yuvarlar', () => {
    expect(getTimelineEndHour([lesson('15:20')])).toBe(16);
    expect(getTimelineEndHour([lesson('18:40')])).toBe(19);
  });

  it('boş programda en az bir saatlik çizelge üretir', () => {
    expect(getTimelineEndHour([])).toBe(9);
  });
});
