'use client';

import { useEffect, useState } from 'react';
import { SpecialEvent } from '@/data/eventsData';
import { isSpecialEvent } from '@/utils/events';

const HOLIDAY_CACHE_KEY = 'bale_holidays_cache_v1';

function readHolidayCache(): SpecialEvent[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HOLIDAY_CACHE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isSpecialEvent) : [];
  } catch {
    return [];
  }
}

export function useHolidays() {
  const [holidays, setHolidays] = useState<SpecialEvent[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const cachedHolidays = readHolidayCache();
      if (!cancelled && cachedHolidays.length > 0) setHolidays(cachedHolidays);

      try {
        const response = await fetch('/api/holidays');
        const payload: unknown = response.ok ? await response.json() : [];
        if (!cancelled && Array.isArray(payload)) {
          const validHolidays = payload.filter(isSpecialEvent);
          setHolidays(validHolidays);
          localStorage.setItem(HOLIDAY_CACHE_KEY, JSON.stringify(validHolidays));
        }
      } catch {
        // Ağ yoksa son başarılı tatil verisi kullanılmaya devam eder.
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  return holidays;
}
