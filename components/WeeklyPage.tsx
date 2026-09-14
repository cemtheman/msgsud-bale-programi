'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { schoolConfig } from '@/data/scheduleData';
import { DayKey, Lesson, ScheduleData } from '@/types/schedule';
import { useTheme } from '@/hooks/useTheme';
import { getLessonsForDay } from '@/utils/schedule';
import { getSubjectCategory } from '@/utils/schedule';
import { AudienceBadge } from './AudienceBadge';

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'monday', label: 'Pazartesi' },
  { key: 'tuesday', label: 'Salı' },
  { key: 'wednesday', label: 'Çarşamba' },
  { key: 'thursday', label: 'Perşembe' },
  { key: 'friday', label: 'Cuma' },
];

interface WeeklyPageProps {
  scheduleData: ScheduleData;
  todayDayKey?: DayKey;
  onSelectLesson?: (lesson: Lesson) => void;
}

export function WeeklyPage({ scheduleData, todayDayKey, onSelectLesson }: WeeklyPageProps) {
  const [selectedDay, setSelectedDay] = useState<DayKey>(
    todayDayKey && ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(todayDayKey)
      ? todayDayKey
      : 'monday'
  );
  
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const dayTabsRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollCue = useCallback(() => {
    const element = dayTabsRef.current;
    if (!element) return;
    setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const element = dayTabsRef.current;
    if (!element) return;

    const frame = requestAnimationFrame(updateScrollCue);
    const resizeObserver = new ResizeObserver(updateScrollCue);
    resizeObserver.observe(element);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [updateScrollCue]);

  const rawLessons = getLessonsForDay(scheduleData, selectedDay);
  const lunchBreak = schoolConfig.lunchBreak;
  const lunchInsertionIndex = rawLessons.findIndex((lesson) => lesson.start >= lunchBreak.end);

  return (
    <div className="space-y-4">
      {/* Header & Gece/Gündüz Selektörü */}
      <div className="flex justify-between items-center">
        <div>
          <h1 
            className="text-xl font-black tracking-tight"
            style={{ color: isDark ? '#FFFFFF' : '#111827' }}
          >
            Haftalık Program
          </h1>
          <p className="text-xs font-semibold text-gray-400">
            MSGSÜ 2026–27 Ders Programı
          </p>
        </div>

        {/* Tema Değiştirme Butonu */}
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-2xl bg-gray-200/60 dark:bg-white/10 text-xs transition-transform active:scale-95 shadow-sm"
          aria-label="Tema Değiştir"
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Gün Seçici Sekmeler (Day Tabs) */}
      <div className="relative">
        <div
          ref={dayTabsRef}
          className="no-scrollbar flex gap-1.5 overflow-x-auto scroll-smooth pb-1 pr-8"
          aria-label="Haftanın günleri"
          role="tablist"
          onScroll={updateScrollCue}
        >
          {DAYS.map((day) => {
            const isActive = selectedDay === day.key;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                key={day.key}
                onClick={() => setSelectedDay(day.key)}
                className={`min-h-10 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                  isActive
                    ? 'bg-[#D94B55] text-white shadow-sm'
                    : 'bg-white dark:bg-[#1C1C1E] text-gray-600 dark:text-gray-400 border border-black/5 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-[#252525]'
                }`}
                style={isActive ? { color: '#FFFFFF' } : undefined}
              >
                {day.label}
              </button>
            );
          })}
        </div>
        {canScrollRight && (
          <button
            type="button"
            onClick={() => dayTabsRef.current?.scrollBy({ left: 140, behavior: 'smooth' })}
            className="absolute inset-y-0 right-0 mb-1 flex w-9 items-center justify-end bg-gradient-to-l from-[#FAFAF8] via-[#FAFAF8] dark:from-[#121212] dark:via-[#121212] to-transparent text-base font-bold text-gray-500 dark:text-gray-300"
            aria-label="Diğer günleri göster"
          >
            →
          </button>
        )}
      </div>

      {/* Seçilen Günün Ders Listesi */}
      <div className="space-y-2">
        {rawLessons.length === 0 ? (
          <div className="py-12 text-center text-sm font-medium text-gray-400 dark:text-gray-500">
            Bu gün için tanımlı ders bulunmuyor.
          </div>
        ) : (
          rawLessons.map((lessonItem: Lesson, index) => {

            const category = getSubjectCategory(lessonItem.subject, lessonItem.target);
            const isDance = category === 'dance';

            return (
              <Fragment key={lessonItem.id}>
                {index === lunchInsertionIndex && (
                  <div className="w-full rounded-2xl border border-dashed border-amber-300/70 bg-amber-50/60 p-3.5 text-left dark:border-amber-700/50 dark:bg-amber-950/15">
                    <div className="flex flex-wrap items-start justify-between gap-2.5 sm:flex-nowrap">
                      <h3 className="text-sm font-bold text-amber-900 dark:text-amber-100">
                        🍽️ {lunchBreak.label}
                      </h3>
                      <span className="shrink-0 rounded-lg bg-amber-100/80 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        {lunchBreak.start} - {lunchBreak.end}
                      </span>
                    </div>
                  </div>
                )}
                <button
                type="button"
                key={lessonItem.id}
                onClick={() => onSelectLesson?.(lessonItem)}
                className={`w-full rounded-2xl border p-3.5 text-left transition-all ${
                  isDance
                    ? 'bg-rose-50/40 dark:bg-[#2A181A] border-rose-100 dark:border-rose-900/30'
                    : 'bg-white dark:bg-[#1C1C1E] border-black/5 dark:border-white/10'
                } hover:border-black/10 dark:hover:border-white/20`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2.5 sm:flex-nowrap">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 
                        className="text-sm font-bold"
                        style={{ color: isDark ? '#FFFFFF' : '#111827' }}
                      >
                        {lessonItem.subject}
                      </h3>
                      <AudienceBadge lesson={lessonItem} />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {lessonItem.teacher ? `${lessonItem.teacher} · ` : ''}
                      {lessonItem.location || 'Derslik Belirtilmedi'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-400 dark:bg-white/5 dark:text-gray-400">
                    {lessonItem.start} - {lessonItem.end}
                  </span>
                </div>
                </button>
              </Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}
