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

import { TodayPage } from '@/components/TodayPage';
import { WeeklyPage } from '@/components/WeeklyPage';
import { EventsPage } from '@/components/EventsPage';
import { LiveTimeline } from '@/components/LiveTimeline';
import { LessonDetailSheet } from '@/components/LessonDetailSheet';
import { BottomNavigation } from '@/components/BottomNavigation';
import { DailyReminderBanner } from '@/components/DailyReminderBanner';
import { InstallPromptBanner } from '@/components/InstallPromptBanner';
import { PwaUpdateBanner } from '@/components/PwaUpdateBanner';
import { SmartLessonCard } from '@/components/SmartLessonCard';

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
        <div className="mb-3.5">
          <SmartLessonCard status={status} />
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
            <h1 className="text-sm font-bold text-gray-900 dark:text-white">Zaman Çizelgesi</h1>
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
