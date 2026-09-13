import { SpecialEvent } from '@/data/eventsData';

const eventTypes = new Set<SpecialEvent['type']>([
  'exam', 'performance', 'rehearsal', 'holiday', 'commemoration', 'special',
]);

export function isSpecialEvent(value: unknown): value is SpecialEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === 'string' &&
    typeof event.title === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(event.date)) &&
    eventTypes.has(event.type as SpecialEvent['type']) &&
    (event.time === undefined || /^\d{2}:\d{2}$/.test(String(event.time))) &&
    (event.location === undefined || typeof event.location === 'string') &&
    (event.description === undefined || typeof event.description === 'string')
  );
}

export function readCustomEvents(): SpecialEvent[] {
  try {
    const raw = localStorage.getItem('custom_events');
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSpecialEvent) : [];
  } catch {
    return [];
  }
}

export function getIstanbulDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function escapeICalText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function toICalDateTime(date: string, time?: string): string {
  return `${date.replace(/-/g, '')}T${(time || '09:00').replace(':', '')}00`;
}
