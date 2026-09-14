'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchScheduleForClass, scheduleCache } from '@/lib/supabaseSchedule';
import type { ClassCode, ScheduleData } from '@/types/schedule';

const SELECTION_KEY = 'msgsu-selected-class:v1';
const DEFAULT_CLASS: ClassCode = '5A';

function isClassCode(value: string | null): value is ClassCode {
  return /^(5|6|7|8|9|10|11|12)[AB]$/.test(value ?? '');
}

export function useClassSchedule() {
  const [selectedClass, setSelectedClassState] = useState<ClassCode>(() => {
    if (typeof window === 'undefined') return DEFAULT_CLASS;
    const saved = localStorage.getItem(SELECTION_KEY);
    return isClassCode(saved) ? saved : DEFAULT_CLASS;
  });
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    Promise.resolve().then(async () => {
      const cached = scheduleCache.read(selectedClass);
      if (!active) return;
      setSchedule(cached);
      setFromCache(Boolean(cached));
      setLoading(!cached);
      setError(null);

      try {
        const data = await fetchScheduleForClass(selectedClass, controller.signal);
        if (!active) return;
        scheduleCache.write(selectedClass, data);
        setSchedule(data);
        setFromCache(false);
      } catch (reason: unknown) {
        if (!active || controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : 'Program verisi alınamadı.');
      } finally {
        if (active && !controller.signal.aborted) setLoading(false);
      }
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadToken, selectedClass]);

  const setSelectedClass = useCallback((classCode: ClassCode) => {
    localStorage.setItem(SELECTION_KEY, classCode);
    const cached = scheduleCache.read(classCode);
    setSchedule(cached);
    setFromCache(Boolean(cached));
    setLoading(!cached);
    setError(null);
    setSelectedClassState(classCode);
  }, []);

  return {
    selectedClass,
    setSelectedClass,
    schedule,
    loading,
    error,
    fromCache,
    retry: () => {
      setLoading(true);
      setReloadToken((value) => value + 1);
    },
  };
}
