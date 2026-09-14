import { describe, expect, it } from 'vitest';
import { getNextSchoolDayInfo } from '@/utils/schedule';
import { calculateStatus } from '@/utils/status';
import { timeStringToMinutes } from '@/utils/time';
import { testSchedule } from './fixtures';

describe('canlı ders durumu', () => {
  it('ders başlangıç ve bitiş sınırlarını doğru hesaplar', () => {
    expect(calculateStatus(testSchedule, 'monday', timeStringToMinutes('08:19'), '2026-09-14').type)
      .toBe('before_school');
    expect(calculateStatus(testSchedule, 'monday', timeStringToMinutes('08:20'), '2026-09-14').type)
      .toBe('in_lesson');
    expect(calculateStatus(testSchedule, 'monday', timeStringToMinutes('09:00'), '2026-09-14').type)
      .toBe('break');
    expect(calculateStatus(testSchedule, 'monday', timeStringToMinutes('09:49'), '2026-09-14').type)
      .toBe('in_lesson');
    expect(calculateStatus(testSchedule, 'monday', timeStringToMinutes('09:50'), '2026-09-14').type)
      .toBe('break');
    expect(calculateStatus(testSchedule, 'monday', timeStringToMinutes('17:00'), '2026-09-14').type)
      .toBe('finished');
  });

  it('yemek arasını derslerden ayırır ve bitişine kalan süreyi üretir', () => {
    expect(calculateStatus(testSchedule, 'monday', timeStringToMinutes('12:20'), '2026-09-14'))
      .toMatchObject({ type: 'lunch', minutesUntilNext: 40 });
    expect(calculateStatus(testSchedule, 'monday', timeStringToMinutes('12:59'), '2026-09-14'))
      .toMatchObject({ type: 'lunch', minutesUntilNext: 1 });
    expect(calculateStatus(testSchedule, 'monday', timeStringToMinutes('13:00'), '2026-09-14').type)
      .toBe('in_lesson');
  });

  it('derse kalan ve ders içinde geçen süreleri üretir', () => {
    expect(calculateStatus(testSchedule, 'monday', timeStringToMinutes('08:00'), '2026-09-14'))
      .toMatchObject({ minutesUntilNext: 20 });
    expect(calculateStatus(testSchedule, 'monday', timeStringToMinutes('08:51'), '2026-09-14'))
      .toMatchObject({ minutesPassed: 31, minutesRemaining: 9 });
  });

  it('cuma gününden sonra hafta sonunu atlayıp pazartesiyi bulur', () => {
    const next = getNextSchoolDayInfo(testSchedule, '2026-09-18');
    expect(next).toMatchObject({ dateKey: '2026-09-21', dayKey: 'monday' });
  });

  it('kapalı günleri sıradaki ders aramasında atlar', () => {
    const closedDates = new Set(['2026-09-21', '2026-09-22']);
    const next = getNextSchoolDayInfo(testSchedule, '2026-09-18', closedDates);
    expect(next).toMatchObject({ dateKey: '2026-09-23', dayKey: 'wednesday' });
  });

  it('uzun yarıyıl tatilinden sonraki ilk ders gününü bulur', () => {
    const closedDates = new Set<string>();
    for (let day = 23; day <= 31; day++) closedDates.add(`2027-01-${day}`);
    for (let day = 1; day <= 7; day++) closedDates.add(`2027-02-0${day}`);

    const next = getNextSchoolDayInfo(testSchedule, '2027-01-22', closedDates);
    expect(next).toMatchObject({ dateKey: '2027-02-08', dayKey: 'monday' });
  });
});
