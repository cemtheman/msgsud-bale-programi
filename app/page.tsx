'use client';

import { useState } from 'react';
import { useNow } from '@/hooks/useNow';
import { useHolidays } from '@/hooks/useHolidays';
import { useClassSchedule } from '@/hooks/useClassSchedule';
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
import { ClassSelector } from '@/components/ClassSelector';

export default function Home() {
  const now = useNow();
  const holidays = useHolidays();
  const classSchedule = useClassSchedule();

  const [activeTab, setActiveTab] = useState<'today' | 'weekly' | 'events'>('today');
  const [showTimeline, setShowTimeline] = useState<boolean>(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);

  if (!now || (classSchedule.loading && !classSchedule.schedule)) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center text-sm font-semibold text-gray-400 animate-pulse">
        Program yükleniyor...
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
  const schedule = classSchedule.schedule;
  if (!schedule) {
    return (
      <main className="w-full flex-1 px-4 pt-6 pb-28">
        <div className="mb-4 flex justify-end">
          <ClassSelector value={classSchedule.selectedClass} onChange={classSchedule.setSelectedClass} />
        </div>
        <div className="rounded-3xl border border-rose-200 bg-rose-50/80 p-5 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Program yüklenemedi</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{classSchedule.error}</p>
          <button onClick={classSchedule.retry} className="mt-3 rounded-xl bg-[#D94B55] px-4 py-2 text-xs font-bold text-white">Tekrar dene</button>
        </div>
        <BottomNavigation activeTab={activeTab} setActiveTab={setActiveTab} />
      </main>
    );
  }
  const status = calculateStatus(schedule, dayKey, totalMinutes, todayDateKey, closedDates);
  const todayLessons = closedDates.has(todayDateKey) ? [] : getLessonsForDay(schedule, dayKey);
  const nextSchoolDay = getNextSchoolDayInfo(schedule, todayDateKey, closedDates);

  // Hafta sonu kontrolü (Cumartesi veya Pazar)
  const isNoSchoolDay = dayKey === 'saturday' || dayKey === 'sunday' || closedDates.has(todayDateKey);

  return (
    <main className="w-full flex-1 px-4 pt-6 pb-28">
      <div className="mb-3 flex items-center justify-end">
        <ClassSelector value={classSchedule.selectedClass} onChange={classSchedule.setSelectedClass} />
      </div>

      {classSchedule.error && classSchedule.fromCache && (
        <div className="mb-3 rounded-2xl border border-amber-300/50 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200">
          Çevrimdışı: son kaydedilen program gösteriliyor.
        </div>
      )}
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
            <WeeklyPage scheduleData={schedule} todayDayKey={dayKey} onSelectLesson={setSelectedLesson} />
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
