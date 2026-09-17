'use client';

import { useState } from 'react';
import { useNow } from '@/hooks/useNow';
import { useHolidays } from '@/hooks/useHolidays';
import { useClassSchedule } from '@/hooks/useClassSchedule';
import { getIstanbulDate } from '@/utils/time';
import { getIstanbulDateKey } from '@/utils/events';
import { calculateStatus } from '@/utils/status';
import { getLessonsForDate, getNextSchoolDayInfo } from '@/utils/schedule';
import { Lesson } from '@/types/schedule';
import { getAcademicCalendarState, getAcademicClosureDates } from '@/data/academicCalendar';

import { TodayPage } from '@/components/TodayPage';
import { WeeklyPage } from '@/components/WeeklyPage';
import { EventsPage } from '@/components/EventsPage';
import { TimelineSheet } from '@/components/TimelineSheet';
import { LessonDetailSheet } from '@/components/LessonDetailSheet';
import { BottomNavigation } from '@/components/BottomNavigation';
import { DailyReminderBanner } from '@/components/DailyReminderBanner';
import { InstallPromptBanner } from '@/components/InstallPromptBanner';
import { PwaUpdateBanner } from '@/components/PwaUpdateBanner';
import { SmartLessonCard } from '@/components/SmartLessonCard';
import { ClassSelector } from '@/components/ClassSelector';
import { ENGLISH_SUSPENSION, isEnglishSuspensionActive } from '@/data/temporarySchedule';

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
  const status = calculateStatus(
    schedule,
    dayKey,
    totalMinutes,
    todayDateKey,
    closedDates,
    classSchedule.selectedClass,
  );
  const todayLessons = closedDates.has(todayDateKey)
    ? []
    : getLessonsForDate(schedule, dayKey, todayDateKey, classSchedule.selectedClass);
  const nextSchoolDay = getNextSchoolDayInfo(
    schedule,
    todayDateKey,
    closedDates,
    classSchedule.selectedClass,
  );
  const showEnglishSuspension = isEnglishSuspensionActive(
    todayDateKey,
    classSchedule.selectedClass,
  );

  // Hafta sonu kontrolü (Cumartesi veya Pazar)
  const isNoSchoolDay = dayKey === 'saturday' || dayKey === 'sunday' || closedDates.has(todayDateKey);

  return (
    <main className="w-full flex-1 px-4 pt-6 pb-28">
      <div className="mb-3 flex items-center justify-end">
        <ClassSelector value={classSchedule.selectedClass} onChange={classSchedule.setSelectedClass} />
      </div>

      {showEnglishSuspension && (
        <div className="mb-3 rounded-2xl border border-amber-300/60 bg-amber-50/80 px-3.5 py-3 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/20 dark:text-amber-100">
          <p className="text-xs font-extrabold">{ENGLISH_SUSPENSION.label}: İngilizce dersleri yapılmayacaktır.</p>
          <p className="mt-0.5 text-[11px] font-medium opacity-80">
            Program ve günün çıkış saati geçici değişikliğe göre güncellenmiştir.
          </p>
        </div>
      )}

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
      {activeTab === 'today' && !isNoSchoolDay && (
        <div className="mb-3.5">
          <SmartLessonCard status={status} />
        </div>
      )}

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
        <WeeklyPage
          scheduleData={schedule}
          currentDateKey={todayDateKey}
          classCode={classSchedule.selectedClass}
          todayDayKey={dayKey}
          onSelectLesson={setSelectedLesson}
        />
      )}
      {activeTab === 'events' && (
        <EventsPage />
      )}

      {showTimeline && (
        <TimelineSheet
          lessons={todayLessons}
          currentMinutes={totalMinutes}
          onClose={() => setShowTimeline(false)}
          onSelectLesson={setSelectedLesson}
        />
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
