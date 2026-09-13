'use client';

import { Lesson, ComputedStatus } from '@/types/schedule';
import { useTheme } from '@/hooks/useTheme';

interface TodayPageProps {
  formattedDate: string;
  formattedTime: string;
  status: ComputedStatus;
  todayLessons: Lesson[];
  currentMinutes: number;
  onSelectLesson: (lesson: Lesson) => void;
  onOpenTimeline: () => void;
}

export function TodayPage({
  formattedDate,
  formattedTime,
  status,
  todayLessons,
  onSelectLesson,
  onOpenTimeline,
}: TodayPageProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  
  let nextDayFirstLesson: { subject: string; start: string; dayLabel: string } | null = null;

  // Sonraki okul günü merkezi durum hesabından gelir.
  if (status.type === 'no_school' || status.type === 'finished') {
    if (status.nextLesson) {
      nextDayFirstLesson = {
        subject: status.nextLesson.subject,
        start: status.nextLesson.start,
        dayLabel: status.nextLessonDayLabel || 'Sonraki okul günü',
      };
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-1">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            {formattedDate}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            MSGSÜ Bale Programı
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
          {status.type === 'no_school' && 'BUGÜN DERS YOK'}
          {status.type === 'before_school' && 'DERSLER HENÜZ BAŞLAMADI'}
          {status.type === 'in_lesson' && status.currentLesson?.subject}
          {status.type === 'break' && 'TENEFFÜS'}
          {status.type === 'lunch' && 'ÖĞLE ARASI'}
          {status.type === 'free_time' && 'BOŞ VAKİT'}
          {status.type === 'finished' && 'BUGÜNKÜ DERSLER BİTTİ'}
        </h2>

        {nextDayFirstLesson && (
          <p className="text-xs text-gray-500 dark:text-gray-400 pt-0.5">
            Sıradaki ders: <span className="font-bold text-gray-800 dark:text-gray-200">{nextDayFirstLesson.subject}</span> ({nextDayFirstLesson.dayLabel} {nextDayFirstLesson.start})
          </p>
        )}

        {status.type === 'before_school' && status.nextLesson && (
          <p className="text-xs text-gray-500 dark:text-gray-400 pt-0.5">
            İlk ders: <span className="font-bold text-gray-800 dark:text-gray-200">{status.nextLesson.subject}</span> ({status.nextLesson.start})
          </p>
        )}
      </div>

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
