'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { schoolConfig } from '@/data/scheduleData';
import { applyTemporaryLessonChanges } from '@/data/temporarySchedule';
import { ClassCode, DayKey, Lesson, ScheduleData } from '@/types/schedule';
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
  currentDateKey: string;
  classCode: ClassCode;
  todayDayKey?: DayKey;
  onSelectLesson?: (lesson: Lesson) => void;
}

export function WeeklyPage({ scheduleData, currentDateKey, classCode, todayDayKey, onSelectLesson }: WeeklyPageProps) {
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

  const rawLessons = applyTemporaryLessonChanges(
    getLessonsForDay(scheduleData, selectedDay),
    currentDateKey,
    classCode,
  );
  const lunchBreak = schoolConfig.lunchBreak;
  const lunchInsertionIndex = rawLessons.findIndex((lesson) => lesson.start >= lunchBreak.end);
  const printRows = DAYS.flatMap(({ key, label }) => {
    const lessons = applyTemporaryLessonChanges(
      getLessonsForDay(scheduleData, key),
      currentDateKey,
      classCode,
    );
    const rows: Array<{
      id: string;
      dayLabel: string;
      lesson?: Lesson;
      kind: 'lesson' | 'lunch' | 'empty';
    }> = [];

    if (lessons.length === 0) {
      rows.push({ id: `${key}-empty`, dayLabel: label, kind: 'empty' });
      return rows;
    }

    const lunchIndex = lessons.findIndex((lesson) => lesson.start >= lunchBreak.end);
    lessons.forEach((lesson, index) => {
      if (index === lunchIndex) {
        rows.push({ id: `${key}-lunch`, dayLabel: label, kind: 'lunch' });
      }
      rows.push({ id: `${key}-${lesson.id}`, dayLabel: label, lesson, kind: 'lesson' });
    });
    return rows;
  });

  const printWeeklySchedule = () => {
    const previousTitle = document.title;
    const restoreTitle = () => {
      document.title = previousTitle;
    };

    document.title = `MSGSÜ_${classCode}_Haftalik_Ders_Programi`;
    window.addEventListener('afterprint', restoreTitle, { once: true });
    requestAnimationFrame(() => {
      window.print();
      window.setTimeout(restoreTitle, 1000);
    });
  };

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

        <div className="flex items-center gap-2">
          {/* Haftalık programı PDF/yazdırma görünümüne aktar */}
          <button
            type="button"
            onClick={printWeeklySchedule}
            className="flex size-10 items-center justify-center rounded-2xl bg-gray-200/60 text-gray-700 shadow-sm transition-transform active:scale-95 dark:bg-white/10 dark:text-gray-200"
            aria-label={`${classCode} haftalık ders programını PDF olarak yazdır`}
            title="PDF / Yazdır"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 8V4h10v4M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 14h10v6H7z" />
              <path strokeLinecap="round" d="M17.5 11.5h.01" />
            </svg>
          </button>

          {/* Tema Değiştirme Butonu */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex size-10 items-center justify-center rounded-2xl bg-gray-200/60 text-xs shadow-sm transition-transform active:scale-95 dark:bg-white/10"
            aria-label="Tema Değiştir"
          >
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>
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

      <section className="weekly-print-sheet" aria-hidden="true">
        <header className="weekly-print-header">
          <div>
            <h1>MSGSÜ Haftalık Ders Programı</h1>
            <p>2026-27 Akademik Yılı</p>
          </div>
          <strong>{classCode} Sınıfı</strong>
        </header>

        <table className="weekly-print-table">
          <thead>
            <tr>
              <th>Gün</th>
              <th>Saat</th>
              <th>Ders</th>
              <th>Grup</th>
              <th>Öğretmen</th>
              <th>Yer</th>
            </tr>
          </thead>
          <tbody>
            {printRows.map(({ id, dayLabel, lesson, kind }) => (
              <tr key={id} className={kind === 'lunch' ? 'weekly-print-lunch' : undefined}>
                <td>{dayLabel}</td>
                <td>
                  {kind === 'lunch'
                    ? `${lunchBreak.start} - ${lunchBreak.end}`
                    : lesson
                      ? `${lesson.start} - ${lesson.end}`
                      : '-'}
                </td>
                <td>
                  {kind === 'lunch'
                    ? lunchBreak.label
                    : lesson?.subject ?? 'Ders yok'}
                </td>
                <td>{lesson?.subgroup ?? '-'}</td>
                <td>{lesson?.teacher ?? '-'}</td>
                <td>{lesson?.location ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
