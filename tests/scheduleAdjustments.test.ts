import { describe, expect, it } from 'vitest';
import { applyScheduleAdjustments } from '@/data/scheduleAdjustments';
import { schoolConfig } from '@/data/scheduleData';
import type { ScheduleData } from '@/types/schedule';

function emptySchedule(): ScheduleData {
  return {
    school: schoolConfig,
    schedule: {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    },
  };
}

describe('5A program düzeltmeleri', () => {
  it('Çarşamba Piyano gruplarını öğrenci adı yayımlamadan ekler', () => {
    const result = applyScheduleAdjustments(emptySchedule(), '5A');

    expect(result.schedule.wednesday).toEqual([
      expect.objectContaining({
        subject: 'Piyano',
        start: '15:30',
        end: '16:15',
        subgroup: '1. Grup',
      }),
      expect.objectContaining({
        subject: 'Piyano',
        start: '16:20',
        end: '17:00',
        subgroup: '2. Grup',
      }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/İris|Aylin|Mira|Deniz|Almila|Yankı/);
  });

  it('aynı canlı dersler geldiğinde çift kayıt üretmez', () => {
    const once = applyScheduleAdjustments(emptySchedule(), '5A');
    const twice = applyScheduleAdjustments(once, '5A');

    expect(twice.schedule.wednesday).toHaveLength(2);
  });

  it('diğer sınıfların programını değiştirmez', () => {
    const original = emptySchedule();

    expect(applyScheduleAdjustments(original, '5B')).toBe(original);
  });
});
