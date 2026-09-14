import { schoolConfig } from '@/data/scheduleData';
import type { DayKey, Lesson, ScheduleData } from '@/types/schedule';

export function lesson(id: string, start: string, end: string, subject = 'Test'): Lesson {
  return { id, start, end, subject, target: 'SECTION', sessionType: 'STANDARD' };
}

const schedule = {
  monday: [
    lesson('m1', '08:20', '09:00', 'Türkçe'),
    lesson('m2', '09:10', '09:50', 'Türkçe'),
    lesson('m2b', '10:00', '10:40', 'Matematik'),
    lesson('m3', '13:00', '13:40', 'Klasik Bale'),
    lesson('m4', '16:20', '17:00', 'Vücut Kondisyon'),
  ],
  tuesday: [lesson('tu1', '08:20', '09:00')],
  wednesday: [lesson('w1', '08:20', '09:00')],
  thursday: [lesson('th1', '08:20', '09:00')],
  friday: [lesson('f1', '09:10', '09:50')],
  saturday: [],
  sunday: [],
} satisfies Record<DayKey, Lesson[]>;

export const testSchedule: ScheduleData = { school: schoolConfig, schedule };
