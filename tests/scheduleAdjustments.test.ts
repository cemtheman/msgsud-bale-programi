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

    expect(applyScheduleAdjustments(original, '6A')).toBe(original);
  });

  it.each(['5A', '5B'] as const)('%s programından Birlikte Uygulama derslerini kaldırır', (classCode) => {
    const original = emptySchedule();
    original.schedule.thursday = [
      {
        id: 'together-practice-short',
        start: '17:10',
        end: '17:50',
        subject: 'B. Uygulama',
        target: 'BALLET',
        sessionType: 'STANDARD',
      },
      {
        id: 'together-practice-long',
        start: '18:00',
        end: '18:40',
        subject: 'Birlikte Uygulama',
        target: 'BALLET',
        sessionType: 'STANDARD',
      },
      {
        id: 'keep-ballet',
        start: '16:20',
        end: '17:00',
        subject: 'K. Bale',
        target: 'BALLET',
        sessionType: 'STANDARD',
      },
    ];

    const result = applyScheduleAdjustments(original, classCode);

    expect(result.schedule.thursday.map((lesson) => lesson.subject)).toEqual(['K. Bale']);
  });

  it('6. sınıflardaki Birlikte Uygulama derslerine dokunmaz', () => {
    const original = emptySchedule();
    original.schedule.friday = [{
      id: 'sixth-grade-together-practice',
      start: '13:50',
      end: '14:30',
      subject: 'B. Uygulama',
      target: 'BALLET',
      sessionType: 'STANDARD',
    }];

    expect(applyScheduleAdjustments(original, '6A')).toBe(original);
  });
});
