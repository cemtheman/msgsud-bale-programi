import { SpecialEvent } from '@/data/eventsData';
import type { DayKey } from '@/types/schedule';

export const REMINDER_PREFERENCE_EVENT = 'bale-reminder-preference-changed';

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

export function readCustomEvents(storageKey = 'custom_events'): SpecialEvent[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSpecialEvent) : [];
  } catch {
    return [];
  }
}

export function saveCustomEvent(event: SpecialEvent, storageKey = 'custom_events'): SpecialEvent[] {
  const events = readCustomEvents(storageKey);
  const existingIndex = events.findIndex((item) => item.id === event.id);
  const updatedEvents = [...events];

  if (existingIndex >= 0) updatedEvents[existingIndex] = event;
  else updatedEvents.push(event);

  localStorage.setItem(storageKey, JSON.stringify(updatedEvents));
  return updatedEvents;
}

export function getIstanbulDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getDayKeyForDate(dateKey: string): DayKey {
  const keys: DayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return keys[new Date(`${dateKey}T12:00:00Z`).getUTCDay()];
}

export function readDismissedEventIds(dateKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(`dismissed_events_${dateKey}`);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const ids = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
    const legacyId = localStorage.getItem(`dismissed_event_${dateKey}`);
    if (legacyId) ids.push(legacyId);
    return new Set(ids);
  } catch {
    return new Set();
  }
}

export function dismissEventForDay(dateKey: string, eventId: string): void {
  const ids = readDismissedEventIds(dateKey);
  ids.add(eventId);
  localStorage.setItem(`dismissed_events_${dateKey}`, JSON.stringify([...ids]));
  localStorage.removeItem(`dismissed_event_${dateKey}`);
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
