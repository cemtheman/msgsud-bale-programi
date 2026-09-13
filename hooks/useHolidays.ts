'use client';

import { useEffect, useState } from 'react';
import { SpecialEvent } from '@/data/eventsData';
import { isSpecialEvent } from '@/utils/events';

export function useHolidays() {
  const [holidays, setHolidays] = useState<SpecialEvent[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch('/api/holidays');
        const payload: unknown = response.ok ? await response.json() : [];
        if (!cancelled && Array.isArray(payload)) {
          setHolidays(payload.filter(isSpecialEvent));
        }
      } catch {
        // Ağ yoksa haftalık program çalışmaya devam eder.
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  return holidays;
}
