'use client';

import { Fragment } from 'react';
import { Lesson, ComputedStatus } from '@/types/schedule';
import { schoolConfig } from '@/data/scheduleData';
import { useTheme } from '@/hooks/useTheme';
import type { NextSchoolDayInfo } from '@/utils/schedule';
import { calculateDayProgress, formatDuration } from '@/utils/dayProgress';
import { AudienceBadge } from './AudienceBadge';

interface TodayPageProps {
  formattedDate: string;
  formattedTime: string;
  status: ComputedStatus;
  todayLessons: Lesson[];
  currentMinutes: number;
  onSelectLesson: (lesson: Lesson) => void;
  onOpenTimeline: () => void;
  holidayTitle?: string;
  academicYearLabel: string;
  closureTitle?: string;
  nextSchoolDay: NextSchoolDayInfo | null;
  contextLabel?: string;
}

export function TodayPage({
  formattedDate,
  formattedTime,
  status,
  todayLessons,
  currentMinutes,
  onSelectLesson,
  onOpenTimeline,
  holidayTitle,
  academicYearLabel,
  closureTitle,
  nextSchoolDay,
  contextLabel,
}: TodayPageProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const dayProgress = calculateDayProgress(todayLessons, currentMinutes);
  const firstLesson = todayLessons[0];
  const lastLesson = todayLessons.at(-1);
  const lunchBreak = schoolConfig.lunchBreak;
  const lunchInsertionIndex = todayLessons.findIndex((lesson) => lesson.start >= lunchBreak.end);
  
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            {formattedDate}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            MSGSÜ Ders Programı · {academicYearLabel}{contextLabel ? ` · ${contextLabel}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-[#1C1C1E] pl-1.5 pr-3 py-1.5 rounded-2xl border border-black/5 dark:border-white/10 shadow-sm">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-7 w-7 items-center justify-center rounded-xl bg-gray-100 dark:bg-white/10 text-xs transition-transform active:scale-95"
            aria-label={isDark ? 'Gündüz temasına geç' : 'Gece temasına geç'}
            title={isDark ? 'Gündüz temasına geç' : 'Gece temasına geç'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>
          <span className="text-sm font-extrabold text-gray-900 dark:text-white">
            {formattedTime}
          </span>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1C1C1E] p-4 rounded-3xl border border-black/5 dark:border-white/10 shadow-sm space-y-1">
        <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
          PROGRAMA GÖRE
        </span>
        <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">
          {status.type === 'no_school' && (holidayTitle ? 'BUGÜN RESMÎ TATİL' : 'BUGÜN DERS YOK')}
          {status.type === 'before_school' && 'DERSLER HENÜZ BAŞLAMADI'}
          {status.type === 'in_lesson' && status.currentLesson?.subject}
          {status.type === 'break' && 'TENEFFÜS'}
          {status.type === 'lunch' && 'YEMEK ARASI'}
          {status.type === 'free_time' && 'BOŞ VAKİT'}
          {status.type === 'finished' && 'BUGÜNKÜ DERSLER BİTTİ'}
        </h2>

        {closureTitle && (
          <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 pt-0.5">
            {closureTitle}
          </p>
        )}

        {status.type === 'before_school' && status.nextLesson && (
          <p className="text-xs text-gray-500 dark:text-gray-400 pt-0.5">
            İlk ders: <span className="font-bold text-gray-800 dark:text-gray-200">{status.nextLesson.subject}</span> ({status.nextLesson.start})
          </p>
        )}
      </div>

      {dayProgress.totalLessons > 0 && (
        <div className="rounded-3xl border border-black/5 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#1C1C1E]">
          <div className="flex items-end justify-between gap-3">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                Gün ilerlemesi
              </span>
              <p className="text-sm font-extrabold text-gray-900 dark:text-white">
                {dayProgress.completedLessons}/{dayProgress.totalLessons} ders tamamlandı
              </p>
            </div>
            <p className="text-right text-xs font-bold text-[#D94B55] dark:text-rose-400">
              {status.type === 'before_school' && firstLesson && lastLesson ? (
                <>
                  Başlangıç {firstLesson.start}
                  <br />
                  Çıkış {lastLesson.end}
                </>
              ) : dayProgress.minutesUntilEnd > 0
                ? `Çıkışa ${formatDuration(dayProgress.minutesUntilEnd)} kaldı`
                : 'Ders günü tamamlandı'}
            </p>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10"
            role="progressbar"
            aria-label="Günün zaman ilerlemesi"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={dayProgress.progressPercent}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#D94B55] to-rose-400 transition-[width] duration-500"
              style={{ width: `${dayProgress.progressPercent}%` }}
            />
          </div>
          <button
            type="button"
            onClick={onOpenTimeline}
            className="mt-3 flex w-full items-center justify-between border-t border-black/5 pt-3 text-left text-xs font-bold text-[#D94B55] transition-colors hover:text-[#bd3540] dark:border-white/10 dark:text-rose-400 dark:hover:text-rose-300"
          >
            <span>Canlı zaman çizelgesini görüntüle</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      )}

      {(status.type === 'finished' || status.type === 'no_school') && nextSchoolDay && (
        <div className="bg-indigo-500/10 dark:bg-indigo-400/10 p-4 rounded-3xl border border-indigo-500/20 space-y-1">
          <span className="text-[10px] font-extrabold text-indigo-500 uppercase tracking-wider">
            {nextSchoolDay.dayLabel} için hazırlık
          </span>
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            {nextSchoolDay.lessons.length} ders var · İlk ders {nextSchoolDay.lessons[0].start}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            {nextSchoolDay.lessons[0].subject}
            {' · '}Ders bitişi {nextSchoolDay.lessons.at(-1)?.end}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center px-1">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            BUGÜNÜN PROGRAMI
          </h3>
        </div>

        {todayLessons.length === 0 ? (
          <div className="py-12 text-center text-xs font-medium text-gray-400 bg-white dark:bg-[#1C1C1E] rounded-3xl border border-black/5 dark:border-white/10">
            Bugün için kayıtlı ders bulunmuyor.
          </div>
        ) : (
          <div className="space-y-2">
            {todayLessons.map((lesson, index) => {
              const isCurrent = status.currentLesson?.id === lesson.id;

              return (
                <Fragment key={lesson.id}>
                  {index === lunchInsertionIndex && (
                    <div
                      aria-current={status.type === 'lunch' ? 'true' : undefined}
                      className={`flex w-full items-center rounded-2xl border border-dashed p-3.5 ${
                        status.type === 'lunch'
                          ? 'border-amber-500 bg-amber-100/70 dark:bg-amber-900/25'
                          : 'border-amber-300/70 bg-amber-50/60 dark:border-amber-700/50 dark:bg-amber-950/15'
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <span className="text-[10px] font-extrabold text-amber-700/70 dark:text-amber-300/70">
                          {lunchBreak.start} - {lunchBreak.end}
                        </span>
                        <h4 className="text-sm font-bold text-amber-900 dark:text-amber-100">
                          🍽️ {lunchBreak.label}
                        </h4>
                      </div>
                    </div>
                  )}
                  <button
                  type="button"
                  key={lesson.id}
                  onClick={() => onSelectLesson(lesson)}
                  aria-current={isCurrent ? 'true' : undefined}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition-all ${
                    isCurrent
                      ? 'bg-[#D94B55]/10 border-[#D94B55] shadow-xs'
                      : 'bg-white dark:bg-[#1C1C1E] border-black/5 dark:border-white/10 hover:border-gray-300'
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <span className="text-[10px] font-extrabold text-gray-400">
                      {lesson.start} - {lesson.end}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">{lesson.subject}</h4>
                      <AudienceBadge lesson={lesson} />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {lesson.classCodes?.length
                        ? `🏫 ${lesson.classCodes.join(' - ')}`
                        : lesson.classCode
                          ? `🏫 ${lesson.classCode}`
                          : lesson.teacher
                            ? `👨‍🏫 ${lesson.teacher}`
                            : ''}
                      {(lesson.classCodes?.length || lesson.classCode || lesson.teacher) && lesson.location && ' · '}
                      {lesson.location && `📍 ${lesson.location}`}
                    </p>
                  </div>

                  </button>
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
