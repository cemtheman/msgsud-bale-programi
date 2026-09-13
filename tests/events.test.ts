import { beforeEach, describe, expect, it } from 'vitest';
import {
  dismissEventForDay,
  escapeICalText,
  readCustomEvents,
  readDismissedEventIds,
  saveCustomEvent,
} from '@/utils/events';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

describe('etkinlik yardımcıları', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  it('aynı gün birden fazla etkinliği ayrı ayrı kapatır', () => {
    dismissEventForDay('2026-09-14', 'event-a');
    dismissEventForDay('2026-09-14', 'event-b');
    expect([...readDismissedEventIds('2026-09-14')]).toEqual(['event-a', 'event-b']);
  });

  it('takvim metnindeki özel karakterleri kaçırır', () => {
    expect(escapeICalText('Bale, prova; salon\\A')).toBe('Bale\\, prova\\; salon\\\\A');
  });

  it('etkinliği aynı kimliği koruyarak düzenler', () => {
    saveCustomEvent({ id: 'custom-one', title: 'Prova', date: '2026-10-01', type: 'rehearsal' });
    saveCustomEvent({
      id: 'custom-one',
      title: 'Genel Prova',
      date: '2026-10-01',
      time: '18:00',
      type: 'rehearsal',
    });

    expect(readCustomEvents()).toEqual([expect.objectContaining({
      id: 'custom-one',
      title: 'Genel Prova',
      time: '18:00',
    })]);
  });
});
