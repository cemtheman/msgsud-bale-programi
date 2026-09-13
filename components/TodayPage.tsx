'use client';

import { Lesson, ComputedStatus } from '@/types/schedule';
import { useTheme } from '@/hooks/useTheme';
import type { NextSchoolDayInfo } from '@/utils/schedule';

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
}

export function TodayPage({
  formattedDate,
  formattedTime,
  status,
  todayLessons,
  onSelectLesson,
  onOpenTimeline,
  holidayTitle,
  academicYearLabel,
  closureTitle,
  nextSchoolDay,
}: TodayPageProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const lastLesson = todayLessons.at(-1);
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-1">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            {formattedDate}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            MSGSÜ Bale Programı · {academicYearLabel}
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
          {status.type === 'lunch' && 'ÖĞLE ARASI'}
          {status.type === 'free_time' && 'BOŞ VAKİT'}
          {status.type === 'finished' && 'BUGÜNKÜ DERSLER BİTTİ'}
        </h2>

        {closureTitle && (
          <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 pt-0.5">
            {closureTitle}
          </p>
        )}

        {lastLesson && (
          <p className="text-xs text-gray-500 dark:text-gray-400 pt-0.5">
            Bugün dersler <span className="font-bold text-gray-800 dark:text-gray-200">{lastLesson.end}</span>&apos;de bitiyor.
          </p>
        )}

        {status.type === 'before_school' && status.nextLesson && (
          <p className="text-xs text-gray-500 dark:text-gray-400 pt-0.5">
            İlk ders: <span className="font-bold text-gray-800 dark:text-gray-200">{status.nextLesson.subject}</span> ({status.nextLesson.start})
          </p>
        )}
      </div>

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
        <div className="flex justify-between items-center px-1">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            BUGÜNÜN PROGRAMI
          </h3>
          {todayLessons.length > 0 && (
            <button
              onClick={onOpenTimeline}
              className="text-xs font-bold text-[#D94B55] hover:underline"
            >
              Zaman Çizelgesi →
            </button>
          )}
        </div>

        {todayLessons.length === 0 ? (
          <div className="py-12 text-center text-xs font-medium text-gray-400 bg-white dark:bg-[#1C1C1E] rounded-3xl border border-black/5 dark:border-white/10">
            Bugün için kayıtlı ders bulunmuyor.
          </div>
        ) : (
          <div className="space-y-2">
            {todayLessons.map((lesson) => {
              const isCurrent = status.currentLesson?.id === lesson.id;

              return (
                <div
                  key={lesson.id}
                  onClick={() => onSelectLesson(lesson)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex justify-between items-center ${
                    isCurrent
                      ? 'bg-[#D94B55]/10 border-[#D94B55] shadow-xs'
                      : 'bg-white dark:bg-[#1C1C1E] border-black/5 dark:border-white/10 hover:border-gray-300'
                  }`}
                >
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-extrabold text-gray-400">
                      {lesson.start} - {lesson.end}
                    </span>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                      {lesson.subject}
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {lesson.teacher ? `👨‍🏫 ${lesson.teacher}` : ''} {lesson.location ? `· 📍 ${lesson.location}` : ''}
                    </p>
                  </div>

                  {isCurrent && (
                    <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-[#D94B55] text-white animate-pulse">
                      CANLI
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
