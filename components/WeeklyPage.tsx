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

type PrintCategory = 'academic' | 'dance' | 'other' | 'lunch';

function PrintCategoryIcon({ kind }: { kind: PrintCategory }) {
  if (kind === 'academic') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 5.5c3.1-.8 5.9-.2 8.5 1.7v12c-2.6-1.9-5.4-2.5-8.5-1.7v-12Zm17 0c-3.1-.8-5.9-.2-8.5 1.7v12c2.6-1.9 5.4-2.5 8.5-1.7v-12Z" />
      </svg>
    );
  }

  if (kind === 'dance') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 4c1.4 2.5 2.1 5.2 2 8.2-.1 2.7-1.3 5.2-3.7 7.4-1.3 1.2-3.2.5-3.5-1.2-.4-2.2.2-4.5 1.8-7C6 9.2 7.1 6.7 8 4Zm8 0c-1.4 2.5-2.1 5.2-2 8.2.1 2.7 1.3 5.2 3.7 7.4 1.3 1.2 3.2.5 3.5-1.2.4-2.2-.2-4.5-1.8-7C18 9.2 16.9 6.7 16 4ZM7.3 3 12 7m4.7-4L12 7" />
      </svg>
    );
  }

  if (kind === 'lunch') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3v7m-2-7v5a2 2 0 0 0 4 0V3M6 10v11m10-18v18m0-18c3 2.4 4 5 3 8h-3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <circle cx="12" cy="6" r="3" />
      <path d="M2.5 19c.5-4 2.4-6 5.5-6m13.5 6c-.5-4-2.4-6-5.5-6m-8 7c.4-5 1.8-7.5 4-7.5s3.6 2.5 4 7.5" />
    </svg>
  );
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
  const printDays = DAYS.map(({ key, label }) => ({
    key,
    label,
    lessons: applyTemporaryLessonChanges(
      getLessonsForDay(scheduleData, key),
      currentDateKey,
      classCode,
    ),
  }));
  const printSlotMap = new Map<string, { start: string; end: string; kind: 'lesson' | 'lunch' }>();

  schoolConfig.periods.forEach((period) => {
    printSlotMap.set(period.start, { ...period, kind: 'lesson' });
  });
  printDays.forEach(({ lessons }) => {
    lessons.forEach((lesson) => {
      const existing = printSlotMap.get(lesson.start);
      if (!existing || lesson.end > existing.end) {
        printSlotMap.set(lesson.start, {
          start: lesson.start,
          end: lesson.end,
          kind: 'lesson',
        });
      }
    });
  });
  printSlotMap.set(lunchBreak.start, {
    start: lunchBreak.start,
    end: lunchBreak.end,
    kind: 'lunch',
  });

  const printSlots = Array.from(printSlotMap.values())
    .sort((a, b) => a.start.localeCompare(b.start));
  const classParts = /^(\d{1,2})([AB])$/.exec(classCode);
  const grade = classParts ? Number(classParts[1]) : 5;
  const section = classParts?.[2] ?? '';
  const schoolName = grade >= 9
    ? 'MSGSÜ İstanbul Devlet Konservatuvarı Müzik ve Sahne Sanatları Lisesi'
    : 'MSGSÜ İstanbul Devlet Konservatuvarı Müzik ve Bale Ortaokulu';
  const printableClassName = section ? `${grade}-${section}` : classCode;

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
          <div className="weekly-print-brandmark" aria-hidden="true">
            <span />
          </div>
          <div className="weekly-print-heading">
            <h1>{schoolName}</h1>
            <p>{printableClassName} Sınıfı Ders Programı</p>
          </div>
          <div className="weekly-print-wordmark">
            <strong>MİMAR SİNAN</strong>
            <span>GÜZEL SANATLAR ÜNİVERSİTESİ</span>
            <small>İSTANBUL DEVLET KONSERVATUVARI</small>
          </div>
        </header>

        <table className="weekly-print-grid">
          <thead>
            <tr>
              <th className="weekly-print-time-heading">
                <span className="weekly-print-clock" aria-hidden="true" />
                SAAT
              </th>
              {printDays.map((day) => (
                <th key={day.key}>{day.label.toLocaleUpperCase('tr-TR')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {printSlots.map((slot) => (
              <tr key={slot.start} className={slot.kind === 'lunch' ? 'weekly-print-lunch-row' : undefined}>
                <th scope="row">{slot.start} - {slot.end}</th>
                {printDays.map((day) => {
                  if (slot.kind === 'lunch') {
                    return (
                      <td key={day.key} className="weekly-print-lunch-cell">
                        <div className="weekly-print-cell-content">
                          <PrintCategoryIcon kind="lunch" />
                          <strong>{lunchBreak.label.toLocaleUpperCase('tr-TR')}</strong>
                        </div>
                      </td>
                    );
                  }

                  const lessons = day.lessons.filter((lesson) => lesson.start === slot.start);
                  if (lessons.length === 0) {
                    return (
                      <td key={day.key} className="weekly-print-empty-cell">
                        <span className="weekly-print-empty-mark" aria-label="Boş saat" />
                      </td>
                    );
                  }

                  return (
                    <td key={day.key}>
                      <div className="weekly-print-lessons">
                        {lessons.map((lesson) => {
                          const category = getSubjectCategory(lesson.subject, lesson.target);
                          const details = [
                            lesson.subgroup,
                            lesson.teacher,
                            lesson.location,
                            lesson.end !== slot.end ? `${lesson.start}-${lesson.end}` : undefined,
                          ].filter(Boolean).join(' / ');

                          return (
                            <div key={lesson.id} className={`weekly-print-lesson weekly-print-${category}`}>
                              <PrintCategoryIcon kind={category} />
                              <div>
                                <strong>{lesson.subject}</strong>
                                {details && <span>{details}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="weekly-print-legend">
          <span className="weekly-print-academic"><PrintCategoryIcon kind="academic" /> Kültür Dersleri</span>
          <span className="weekly-print-dance"><PrintCategoryIcon kind="dance" /> Sanat Dersleri</span>
          <span className="weekly-print-other"><PrintCategoryIcon kind="other" /> Kulüp Dersleri</span>
          <span className="weekly-print-lunch"><PrintCategoryIcon kind="lunch" /> Yemek Arası</span>
          <span className="weekly-print-empty"><i /> Boş Saat</span>
        </footer>
      </section>
    </div>
  );
}
