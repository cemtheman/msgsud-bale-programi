import { DayKey } from '@/types/schedule';

export const DAYS_ORDER: DayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const DAY_LABELS: Record<DayKey, string> = {
  monday: 'Pazartesi',
  tuesday: 'Salı',
  wednesday: 'Çarşamba',
  thursday: 'Perşembe',
  friday: 'Cuma',
  saturday: 'Cumartesi',
  sunday: 'Pazar',
};

export const SHORT_DAY_LABELS: Record<DayKey, string> = {
  monday: 'Pzt',
  tuesday: 'Sal',
  wednesday: 'Çar',
  thursday: 'Per',
  friday: 'Cum',
  saturday: 'Cmt',
  sunday: 'Paz',
};

// Europe/Istanbul Zaman Dilimi Kontrolü
export function getIstanbulDate(now: Date = new Date()): {
  hours: number;
  minutes: number;
  dayKey: DayKey;
  formattedDate: string;
  formattedTime: string;
  totalMinutes: number;
} {
  const timeFormatter = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const dayOfWeekFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    weekday: 'long',
  });

  const timeString = timeFormatter.format(now);
  const [hours, minutes] = timeString.split(':').map(Number);
  
  const rawDay = dayOfWeekFormatter.format(now).toLowerCase() as DayKey;
  const formattedDate = dateFormatter.format(now);

  return {
    hours,
    minutes,
    dayKey: rawDay,
    formattedDate,
    formattedTime: timeString,
    totalMinutes: hours * 60 + minutes,
  };
}

export function timeStringToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function formatMinutesToDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} dk`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs} sa ${mins} dk` : `${hrs} sa`;
}