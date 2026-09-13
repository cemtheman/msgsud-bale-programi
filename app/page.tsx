'use client';

import { useState } from 'react';
import { useNow } from '@/hooks/useNow';
import { useHolidays } from '@/hooks/useHolidays';
import { getIstanbulDate } from '@/utils/time';
import { getIstanbulDateKey } from '@/utils/events';
import { calculateStatus } from '@/utils/status';
import { getLessonsForDay, getNextSchoolDayInfo } from '@/utils/schedule';
import { Lesson } from '@/types/schedule';
import { getAcademicCalendarState, getAcademicClosureDates } from '@/data/academicCalendar';
import { formatDuration } from '@/utils/dayProgress';

import { TodayPage } from '@/components/TodayPage';
import { WeeklyPage } from '@/components/WeeklyPage';
import { EventsPage } from '@/components/EventsPage';
import { LiveTimeline } from '@/components/LiveTimeline';
import { LessonDetailSheet } from '@/components/LessonDetailSheet';
import { BottomNavigation } from '@/components/BottomNavigation';
import { DailyReminderBanner } from '@/components/DailyReminderBanner';
import { InstallPromptBanner } from '@/components/InstallPromptBanner';
import { PwaUpdateBanner } from '@/components/PwaUpdateBanner';

export default function Home() {
  const now = useNow();
  const holidays = useHolidays();

  const [activeTab, setActiveTab] = useState<'today' | 'weekly' | 'events'>('today');
  const [showTimeline, setShowTimeline] = useState<boolean>(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);

  if (!now) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center text-sm font-semibold text-gray-400 animate-pulse">
        Yükleniyor...
      </div>
    );
  }

  const { dayKey, formattedDate, formattedTime, totalMinutes } = getIstanbulDate(now);
  const todayDateKey = getIstanbulDateKey(now);
  const officialHolidays = holidays.filter((event) => event.type === 'holiday');
  const closedDates = getAcademicClosureDates(todayDateKey);
  officialHolidays.forEach((event) => closedDates.add(event.date));
  const todayHoliday = officialHolidays.find((event) => event.date === todayDateKey);
  const academicState = getAcademicCalendarState(todayDateKey);
  const status = calculateStatus(dayKey, totalMinutes, todayDateKey, closedDates);
  const todayLessons = closedDates.has(todayDateKey) ? [] : getLessonsForDay(dayKey);
  const nextSchoolDay = getNextSchoolDayInfo(todayDateKey, closedDates);

  // Hafta sonu kontrolü (Cumartesi veya Pazar)
  const isNoSchoolDay = dayKey === 'saturday' || dayKey === 'sunday' || closedDates.has(todayDateKey);

  // Tüm canlı durumlar tek bir Europe/Istanbul zaman hesabını kullanır.
  const nowStr = formattedTime;
  const currentLesson = status.currentLesson;
  const activeOrNext = currentLesson || status.nextLesson;
  const labelPrefix = currentLesson ? 'Şu An Devam Ediyor' : 'Sıradaki Ders';
  const nextDayLabel = currentLesson ? undefined : status.nextLessonDayLabel;

  const isOngoing = Boolean(currentLesson);
  const lessonTimeSummary = currentLesson
    ? `${status.minutesPassed ?? 0} dakika geçti · ${status.minutesRemaining ?? 0} dakika kaldı`
    : activeOrNext && status.minutesUntilNext !== undefined
      ? `${activeOrNext.subject} dersine ${formatDuration(status.minutesUntilNext)} kaldı`
      : undefined;

  return (
    <main className="w-full flex-1 px-4 pt-6 pb-28">
      {/* PWA Yükleme Yönlendiricisi */}
      <InstallPromptBanner />

      {/* Yeni servis çalışanı hazır olduğunda kontrollü güncelleme */}
      <PwaUpdateBanner />

      {/* Günlük Hatırlatıcı Bant */}
      <DailyReminderBanner />

      {/* Sıradaki Ders / Canlı Widget Kartı (Sadece hafta içi günlerde görünür) */}
      {!showTimeline && activeTab === 'today' && !isNoSchoolDay && (
        <div className="w-full bg-gradient-to-br from-[#D94B55]/15 via-rose-500/5 to-transparent dark:from-[#D94B55]/25 dark:via-rose-950/20 p-4 rounded-3xl border border-[#D94B55]/20 shadow-sm backdrop-blur-md mb-3.5">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isOngoing ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isOngoing ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              </span>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#D94B55] dark:text-rose-400">
                {labelPrefix}
              </span>
            </div>
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
              {nowStr}
            </span>
          </div>

          {activeOrNext ? (
            <div className="flex justify-between items-end">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-300">
                    {activeOrNext.start} - {activeOrNext.end} {nextDayLabel ? `(${nextDayLabel})` : ''}
                  </span>
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                    {activeOrNext.subject}
                  </h3>
                </div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {activeOrNext.teacher ? `👨‍🏫 ${activeOrNext.teacher} · ` : ''}
                  {activeOrNext.location ? `📍 ${activeOrNext.location}` : '📍 Konum belirtilmedi'}
                </p>
                {lessonTimeSummary && (
                  <p className="pt-1 text-xs font-extrabold text-[#D94B55] dark:text-rose-400">
                    {lessonTimeSummary}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="py-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
              Bugün için başka ders kalmadı. 🎉
            </div>
          )}
        </div>
      )}

      {showTimeline ? (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <button 
              onClick={() => setShowTimeline(false)} 
              className="text-xs font-bold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white flex items-center gap-1"
            >
              ← Geri
            </button>
            <h1 className="text-sm font-bold text-gray-900 dark:text-white">Canlı Zaman Çizelgesi</h1>
            <div className="w-8" />
          </div>
          <LiveTimeline lessons={todayLessons} currentMinutes={totalMinutes} onSelectLesson={setSelectedLesson} />
        </div>
      ) : (
        <>
          {activeTab === 'today' && (
            <TodayPage 
              formattedDate={formattedDate} 
              formattedTime={formattedTime} 
              status={status} 
              todayLessons={todayLessons} 
              currentMinutes={totalMinutes}
              onSelectLesson={setSelectedLesson} 
              onOpenTimeline={() => setShowTimeline(true)} 
              holidayTitle={todayHoliday?.title}
              academicYearLabel={academicState.label}
              closureTitle={todayHoliday?.title ?? academicState.closureTitle}
              nextSchoolDay={nextSchoolDay}
            />
          )}
          {activeTab === 'weekly' && (
            <WeeklyPage todayDayKey={dayKey} onSelectLesson={setSelectedLesson} />
          )}
          {activeTab === 'events' && (
            <EventsPage />
          )}
        </>
      )}

      <LessonDetailSheet lesson={selectedLesson} status={status} onClose={() => setSelectedLesson(null)} />

      {!showTimeline && (
        <BottomNavigation 
          activeTab={activeTab} 
          setActiveTab={(tab) => { 
            setActiveTab(tab); 
            setShowTimeline(false); 
          }} 
        />
      )}
    </main>
  );
}
