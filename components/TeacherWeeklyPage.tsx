'use client';

import { useMemo, useState } from 'react';
import { schoolConfig } from '@/data/scheduleData';
import type { Lesson, ScheduleData } from '@/types/schedule';
import { useTheme } from '@/hooks/useTheme';
import { addDaysToDateKey } from '@/utils/events';
import {
  getTeacherWeek,
  getWeekStartDateKey,
} from '@/utils/teacherSchedule';
import {
  createWeeklySchedulePdf,
  shareOrDownloadWeeklySchedulePdf,
} from '@/utils/weeklySchedulePdf';

interface TeacherWeeklyPageProps {
  scheduleData: ScheduleData;
  teacherName: string;
  currentDateKey: string;
  closedDates: Set<string>;
  onSelectLesson: (lesson: Lesson) => void;
}

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Istanbul',
});

function formatDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return dateFormatter.format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function weekLabel(startDateKey: string) {
  return `${formatDateKey(startDateKey)} – ${formatDateKey(addDaysToDateKey(startDateKey, 4))}`;
}

export function TeacherWeeklyPage({
  scheduleData,
  teacherName,
  currentDateKey,
  closedDates,
  onSelectLesson,
}: TeacherWeeklyPageProps) {
  const currentWeekStart = getWeekStartDateKey(currentDateKey);
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const days = useMemo(
    () => getTeacherWeek(scheduleData, weekStart, closedDates),
    [closedDates, scheduleData, weekStart],
  );

  const exportPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);

    try {
      const slots = new Map<string, { start: string; end: string; kind: 'lesson' | 'lunch' }>();
      schoolConfig.periods.forEach((period) => slots.set(period.start, { ...period, kind: 'lesson' }));
      days.forEach((day) => {
        day.lessons.forEach((lesson) => {
          const existing = slots.get(lesson.start);
          if (!existing || lesson.end > existing.end) {
            slots.set(lesson.start, { start: lesson.start, end: lesson.end, kind: 'lesson' });
          }
        });
      });
      slots.set(schoolConfig.lunchBreak.start, { ...schoolConfig.lunchBreak, kind: 'lunch' });

      const printableDays = days.map((day) => ({
        label: day.label,
        lessons: day.lessons.map((lesson) => ({
          ...lesson,
          subject: lesson.classCode ? `${lesson.classCode} · ${lesson.subject}` : lesson.subject,
          teacher: undefined,
        })),
      }));

      const logo = document.querySelector<HTMLImageElement>('.weekly-print-logo');
      const blob = createWeeklySchedulePdf({
        schoolName: 'MSGSÜ İstanbul Devlet Konservatuvarı',
        className: teacherName,
        scheduleTitle: `${teacherName} · Öğretmen Haftalık Ders Programı`,
        days: printableDays,
        slots: Array.from(slots.values()).sort((a, b) => a.start.localeCompare(b.start)),
        lunchLabel: schoolConfig.lunchBreak.label,
        logo,
      });

      const safeTeacher = teacherName.replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ]+/g, '_');
      await shareOrDownloadWeeklySchedulePdf(
        blob,
        `MSGSÜ_${safeTeacher}_${weekStart}_Haftalik_Ders_Programi.pdf`,
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-3.5">
      <div className="rounded-3xl border border-black/5 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#1C1C1E]">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addDaysToDateKey(weekStart, -7))}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 font-bold text-gray-700 active:scale-95 dark:bg-white/10 dark:text-gray-200"
            aria-label="Önceki hafta"
          >
            ‹
          </button>

          <button
            type="button"
            onClick={() => setWeekStart(currentWeekStart)}
            className="min-w-0 flex-1 text-center"
            title="Bu haftaya dön"
          >
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
              Haftalık öğretmen programı
            </div>
            <div className="truncate text-sm font-extrabold text-gray-900 dark:text-white">
              {weekLabel(weekStart)}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setWeekStart(addDaysToDateKey(weekStart, 7))}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 font-bold text-gray-700 active:scale-95 dark:bg-white/10 dark:text-gray-200"
            aria-label="Sonraki hafta"
          >
            ›
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-xs active:scale-95 dark:bg-white/10"
            aria-label={isDark ? 'Gündüz temasına geç' : 'Gece temasına geç'}
            title={isDark ? 'Gündüz temasına geç' : 'Gece temasına geç'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>

          <button
            type="button"
            onClick={exportPdf}
            disabled={isExportingPdf}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-700 active:scale-95 disabled:cursor-wait disabled:opacity-60 dark:bg-white/10 dark:text-gray-200"
            aria-label="Öğretmen haftalık programını PDF olarak oluştur"
            title="PDF oluştur ve paylaş"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 8V4h10v4M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 14h10v7H7z" />
            </svg>
          </button>
        </div>
      </div>

      {days.map((day) => (
        <section
          key={day.key}
          className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-[#1C1C1E]"
        >
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/10">
            <div>
              <h3 className="text-sm font-extrabold text-gray-900 dark:text-white">{day.label}</h3>
              <p className="text-[11px] font-semibold text-gray-400">{formatDateKey(day.dateKey)}</p>
            </div>
            <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500 dark:bg-white/10 dark:text-gray-300">
              {day.lessons.length} ders
            </span>
          </div>

          {day.isClosed ? (
            <div className="px-4 py-5 text-center text-xs font-semibold text-gray-400">
              Okul tatil / kapalı.
            </div>
          ) : day.lessons.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs font-semibold text-gray-400">
              Ders bulunmuyor.
            </div>
          ) : (
            <div className="divide-y divide-black/5 dark:divide-white/10">
              {day.lessons.map((lesson) => (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => onSelectLesson(lesson)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                >
                  <div className="w-[72px] shrink-0">
                    <div className="text-xs font-extrabold text-gray-900 dark:text-white">{lesson.start}</div>
                    <div className="text-[10px] font-semibold text-gray-400">{lesson.end}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-[#D94B55]/10 px-2 py-0.5 text-[11px] font-extrabold text-[#D94B55] dark:text-rose-400">
                        {lesson.classCode}
                      </span>
                      <span className="min-w-0 font-bold text-gray-900 dark:text-white">{lesson.subject}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                      {lesson.location ? `📍 ${lesson.location}` : 'Konum belirtilmedi'}
                      {lesson.subgroup ? ` · ${lesson.subgroup}` : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
