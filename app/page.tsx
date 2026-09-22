'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useNow } from '@/hooks/useNow';
import { useHolidays } from '@/hooks/useHolidays';
import { useClassSchedule } from '@/hooks/useClassSchedule';
import { useTeacherSchedule } from '@/hooks/useTeacherSchedule';
import { getIstanbulDate } from '@/utils/time';
import { getIstanbulDateKey } from '@/utils/events';
import { calculateStatus } from '@/utils/status';
import { getLessonsForDate, getNextSchoolDayInfo } from '@/utils/schedule';
import { getTeacherLessonsForDate } from '@/utils/teacherSchedule';
import { Lesson } from '@/types/schedule';
import { getAcademicCalendarState, getAcademicClosureDates } from '@/data/academicCalendar';

import { TodayPage } from '@/components/TodayPage';
import { WeeklyPage } from '@/components/WeeklyPage';
import { TeacherWeeklyPage } from '@/components/TeacherWeeklyPage';
import { EventsPage } from '@/components/EventsPage';
import { TimelineSheet } from '@/components/TimelineSheet';
import { LessonDetailSheet } from '@/components/LessonDetailSheet';
import { BottomNavigation } from '@/components/BottomNavigation';
import { DailyReminderBanner } from '@/components/DailyReminderBanner';
import { InstallPromptBanner } from '@/components/InstallPromptBanner';
import { PwaUpdateBanner } from '@/components/PwaUpdateBanner';
import { SmartLessonCard } from '@/components/SmartLessonCard';
import { ClassSelector } from '@/components/ClassSelector';
import { TeacherSelector } from '@/components/TeacherSelector';
import { ENGLISH_SUSPENSION, isEnglishSuspensionActive } from '@/data/temporarySchedule';

type AppMode = 'student' | 'teacher';

const MODE_KEY = 'msgsu-app-mode:v1';

function readInitialMode(): AppMode {
  if (typeof window === 'undefined') return 'student';
  return localStorage.getItem(MODE_KEY) === 'teacher' ? 'teacher' : 'student';
}

function ManagementAccessLink() {
  return (
    <Link
      href="/yonetim"
      aria-label="Yönetim girişi"
      title="Yönetim girişi"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-sm transition hover:border-gray-300 hover:text-gray-700 active:scale-95 dark:border-white/10 dark:bg-[#1C1C1E] dark:text-gray-500 dark:hover:text-gray-200"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <circle cx="8" cy="15" r="3.25" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m10.4 12.6 7.1-7.1 2 2-1.35 1.35 1.1 1.1-1.8 1.8-1.1-1.1-3.55 3.55"
        />
      </svg>
    </Link>
  );
}

export default function Home() {
  const now = useNow();
  const holidays = useHolidays();
  const classSchedule = useClassSchedule();
  const [appMode, setAppMode] = useState<AppMode>(readInitialMode);
  const teacherSchedule = useTeacherSchedule(appMode === 'teacher');

  const [activeTab, setActiveTab] = useState<'today' | 'weekly' | 'events'>('today');
  const [showTimeline, setShowTimeline] = useState<boolean>(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);

  const toggleMode = () => {
    const nextMode: AppMode = appMode === 'student' ? 'teacher' : 'student';
    localStorage.setItem(MODE_KEY, nextMode);
    setAppMode(nextMode);
    setShowTimeline(false);
    setSelectedLesson(null);
  };

  const initialLoading = !now
    || (appMode === 'student' && classSchedule.loading && !classSchedule.schedule)
    || (appMode === 'teacher' && teacherSchedule.loading && !teacherSchedule.schedule);

  if (initialLoading) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center text-sm font-semibold text-gray-400 animate-pulse">
        Program yükleniyor...
      </div>
    );
  }

  const { dayKey, formattedDate, formattedTime, totalMinutes } = getIstanbulDate(now!);
  const todayDateKey = getIstanbulDateKey(now!);
  const officialHolidays = holidays.filter((event) => event.type === 'holiday');
  const closedDates = getAcademicClosureDates(todayDateKey);
  officialHolidays.forEach((event) => closedDates.add(event.date));
  const todayHoliday = officialHolidays.find((event) => event.date === todayDateKey);
  const academicState = getAcademicCalendarState(todayDateKey);
  const isCalendarClosed = dayKey === 'saturday' || dayKey === 'sunday' || closedDates.has(todayDateKey);

  if (appMode === 'student' && !classSchedule.schedule) {
    return (
      <main className="w-full flex-1 px-4 pt-6 pb-28">
        <div className="mb-4 flex items-center justify-between gap-3">
          <ManagementAccessLink />
          <ClassSelector value={classSchedule.selectedClass} onChange={classSchedule.setSelectedClass} />
        </div>
        <div className="rounded-3xl border border-rose-200 bg-rose-50/80 p-5 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Program yüklenemedi</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{classSchedule.error}</p>
          <button onClick={classSchedule.retry} className="mt-3 rounded-xl bg-[#D94B55] px-4 py-2 text-xs font-bold text-white">
            Tekrar dene
          </button>
        </div>
        <BottomNavigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          mode={appMode}
          onToggleMode={toggleMode}
        />
      </main>
    );
  }

  if (appMode === 'teacher' && !teacherSchedule.schedule) {
    return (
      <main className="w-full flex-1 px-4 pt-6 pb-28">
        <div className="mb-4 flex items-center justify-between gap-3">
          <ManagementAccessLink />
          <TeacherSelector
            value={teacherSchedule.selectedTeacher}
            teachers={teacherSchedule.teachers}
            onChange={teacherSchedule.setSelectedTeacher}
            loading={teacherSchedule.loading}
          />
        </div>
        <div className="rounded-3xl border border-rose-200 bg-rose-50/80 p-5 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Öğretmen programı yüklenemedi</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {teacherSchedule.error ?? 'Programda öğretmen kaydı bulunamadı.'}
          </p>
          <button onClick={teacherSchedule.retry} className="mt-3 rounded-xl bg-[#D94B55] px-4 py-2 text-xs font-bold text-white">
            Tekrar dene
          </button>
        </div>
        <BottomNavigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          mode={appMode}
          onToggleMode={toggleMode}
        />
      </main>
    );
  }

  const studentSchedule = classSchedule.schedule;
  const studentStatus = studentSchedule
    ? calculateStatus(
      studentSchedule,
      dayKey,
      totalMinutes,
      todayDateKey,
      closedDates,
      classSchedule.selectedClass,
    )
    : null;
  const studentTodayLessons = studentSchedule && !closedDates.has(todayDateKey)
    ? getLessonsForDate(studentSchedule, dayKey, todayDateKey, classSchedule.selectedClass)
    : [];
  const studentNextSchoolDay = studentSchedule
    ? getNextSchoolDayInfo(
      studentSchedule,
      todayDateKey,
      closedDates,
      classSchedule.selectedClass,
    )
    : null;

  const teacherScheduleData = teacherSchedule.schedule;
  const teacherTodayLessons = teacherScheduleData && !closedDates.has(todayDateKey)
    ? getTeacherLessonsForDate(teacherScheduleData, dayKey, todayDateKey)
    : [];
  const teacherStatusSchedule = teacherScheduleData
    ? {
      ...teacherScheduleData,
      schedule: {
        ...teacherScheduleData.schedule,
        [dayKey]: teacherTodayLessons,
      },
    }
    : null;
  const teacherStatus = teacherStatusSchedule
    ? calculateStatus(
      teacherStatusSchedule,
      dayKey,
      totalMinutes,
      todayDateKey,
      closedDates,
    )
    : null;

  const status = appMode === 'teacher' ? teacherStatus : studentStatus;
  const todayLessons = appMode === 'teacher' ? teacherTodayLessons : studentTodayLessons;
  const showEnglishSuspension = appMode === 'student' && isEnglishSuspensionActive(
    todayDateKey,
    classSchedule.selectedClass,
  );

  if (!status) return null;

  return (
    <main className="w-full flex-1 px-4 pt-6 pb-28">
      <div className="mb-3 flex items-center justify-between gap-3">
        <ManagementAccessLink />
        {appMode === 'student' ? (
          <ClassSelector value={classSchedule.selectedClass} onChange={classSchedule.setSelectedClass} />
        ) : (
          <TeacherSelector
            value={teacherSchedule.selectedTeacher}
            teachers={teacherSchedule.teachers}
            onChange={teacherSchedule.setSelectedTeacher}
            loading={teacherSchedule.loading}
          />
        )}
      </div>

      {showEnglishSuspension && (
        <div className="mb-3 rounded-2xl border border-amber-300/60 bg-amber-50/80 px-3.5 py-3 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/20 dark:text-amber-100">
          <p className="text-xs font-extrabold">{ENGLISH_SUSPENSION.label}: İngilizce dersleri yapılmayacaktır.</p>
          <p className="mt-0.5 text-[11px] font-medium opacity-80">
            Program ve günün çıkış saati geçici değişikliğe göre güncellenmiştir.
          </p>
        </div>
      )}

      {appMode === 'student' && classSchedule.error && classSchedule.fromCache && (
        <div className="mb-3 rounded-2xl border border-amber-300/50 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200">
          Çevrimdışı: son kaydedilen program gösteriliyor.
        </div>
      )}

      {appMode === 'teacher' && teacherSchedule.error && teacherSchedule.fromCache && (
        <div className="mb-3 rounded-2xl border border-amber-300/50 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200">
          Çevrimdışı: bulunan son öğretmen programları gösteriliyor.
        </div>
      )}

      <InstallPromptBanner />
      <PwaUpdateBanner />
      <DailyReminderBanner />

      {activeTab === 'today' && !isCalendarClosed && todayLessons.length > 0 && (
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
          nextSchoolDay={appMode === 'student' ? studentNextSchoolDay : null}
          contextLabel={appMode === 'teacher' ? teacherSchedule.selectedTeacher : undefined}
        />
      )}

      {activeTab === 'weekly' && appMode === 'student' && studentSchedule && (
        <WeeklyPage
          scheduleData={studentSchedule}
          currentDateKey={todayDateKey}
          classCode={classSchedule.selectedClass}
          todayDayKey={dayKey}
          onSelectLesson={setSelectedLesson}
        />
      )}

      {activeTab === 'weekly' && appMode === 'teacher' && teacherScheduleData && (
        <TeacherWeeklyPage
          scheduleData={teacherScheduleData}
          teacherName={teacherSchedule.selectedTeacher}
          currentDateKey={todayDateKey}
          closedDates={closedDates}
          onSelectLesson={setSelectedLesson}
        />
      )}

      {activeTab === 'events' && appMode === 'student' && (
        <EventsPage />
      )}

      {activeTab === 'events' && appMode === 'teacher' && (
        <EventsPage
          key={teacherSchedule.selectedTeacher}
          storageKey={`teacher_events:${encodeURIComponent(teacherSchedule.selectedTeacher)}`}
          title="Öğretmen Etkinlikleri"
          contextLabel={teacherSchedule.selectedTeacher}
        />
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
          mode={appMode}
          onToggleMode={toggleMode}
        />
      )}
    </main>
  );
}
