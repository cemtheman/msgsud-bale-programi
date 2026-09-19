'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchScheduleForClass, scheduleCache } from '@/lib/supabaseSchedule';
import type { ClassCode, ScheduleData } from '@/types/schedule';
import {
  buildTeacherSchedule,
  getTeacherNames,
  TEACHER_CLASS_CODES,
} from '@/utils/teacherSchedule';

const SELECTION_KEY = 'msgsu-selected-teacher:v1';

type ClassSchedules = Partial<Record<ClassCode, ScheduleData>>;

function readSavedTeacher() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(SELECTION_KEY) ?? '';
}

export function useTeacherSchedule(enabled: boolean) {
  const [classSchedules, setClassSchedules] = useState<ClassSchedules>({});
  const [selectedTeacher, setSelectedTeacherState] = useState(readSavedTeacher);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let active = true;

    Promise.resolve().then(async () => {
      setLoading(true);
      setError(null);

      const cached: ClassSchedules = {};
      TEACHER_CLASS_CODES.forEach((classCode) => {
        const value = scheduleCache.read(classCode);
        if (value) cached[classCode] = value;
      });

      if (active && Object.keys(cached).length > 0) {
        setClassSchedules(cached);
        setFromCache(true);
      }

      const results = await Promise.allSettled(
        TEACHER_CLASS_CODES.map(async (classCode) => {
          const data = await fetchScheduleForClass(classCode, controller.signal);
          scheduleCache.write(classCode, data);
          return { classCode, data };
        }),
      );

      if (!active || controller.signal.aborted) return;

      const merged: ClassSchedules = { ...cached };
      let failures = 0;

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          merged[result.value.classCode] = result.value.data;
        } else {
          failures += 1;
        }
      });

      if (Object.keys(merged).length === 0) {
        setError('Öğretmen programları yüklenemedi.');
      } else if (failures > 0) {
        setError('Bazı sınıf programları çevrimdışı kaldı; bulunan son veriler gösteriliyor.');
      }

      setClassSchedules(merged);
      setFromCache(failures > 0);
      setLoading(false);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled, reloadToken]);

  const teachers = useMemo(() => getTeacherNames(classSchedules), [classSchedules]);

  useEffect(() => {
    if (teachers.length === 0) return;
    if (teachers.includes(selectedTeacher)) return;

    const saved = readSavedTeacher();
    const nextTeacher = teachers.includes(saved) ? saved : teachers[0];
    setSelectedTeacherState(nextTeacher);
    localStorage.setItem(SELECTION_KEY, nextTeacher);
  }, [selectedTeacher, teachers]);

  const setSelectedTeacher = useCallback((teacherName: string) => {
    localStorage.setItem(SELECTION_KEY, teacherName);
    setSelectedTeacherState(teacherName);
  }, []);

  const schedule = useMemo(
    () => selectedTeacher && teachers.includes(selectedTeacher)
      ? buildTeacherSchedule(classSchedules, selectedTeacher)
      : null,
    [classSchedules, selectedTeacher, teachers],
  );

  return {
    teachers,
    selectedTeacher,
    setSelectedTeacher,
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
