'use client';

import { useState } from 'react';
import { useNow } from '@/hooks/useNow';
import { getIstanbulDate } from '@/utils/time';
import { calculateStatus } from '@/utils/status';
import { getLessonsForDay } from '@/utils/schedule';
import { Lesson } from '@/types/schedule';

import { TodayPage } from '@/components/TodayPage';
import { WeeklyPage } from '@/components/WeeklyPage';
import { EventsPage } from '@/components/EventsPage';
import { LiveTimeline } from '@/components/LiveTimeline';
import { LessonDetailSheet } from '@/components/LessonDetailSheet';
import { BottomNavigation } from '@/components/BottomNavigation';
import { DailyReminderBanner } from '@/components/DailyReminderBanner';
import { InstallPromptBanner } from '@/components/InstallPromptBanner';
import { scheduleData } from '@/data/scheduleData';

export default function Home() {
  const now = useNow();

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
  const status = calculateStatus(dayKey, totalMinutes);
  const todayLessons = getLessonsForDay(dayKey);

  // Widget için anlık hesaplama
  const currentHours = now.getHours().toString().padStart(2, '0');
  const currentMinutes = now.getMinutes().toString().padStart(2, '0');
  const nowStr = `${currentHours}:${currentMinutes}`;

  const currentLesson = todayLessons.find(
    (lesson) => nowStr >= lesson.start && nowStr <= lesson.end
  );
  const nextLesson = todayLessons.find(
    (lesson) => lesson.start > nowStr
  );
  const activeOrNext = currentLesson || nextLesson;
  const isOngoing = Boolean(currentLesson);

  return (
    <main className="w-full flex-1 px-4 pt-6 pb-28">
      {/* PWA Yükleme Yönlendiricisi */}
      <InstallPromptBanner />

      {/* Günlük Hatırlatıcı Bant */}
      <DailyReminderBanner />

      {/* Sıradaki Ders / Canlı Widget Kartı (Sadece Bugün sekmesinde ve zaman çizelgesi kapalıyken görünür) */}
      {!showTimeline && activeTab === 'today' && (
        <div className="w-full bg-gradient-to-br from-[#D94B55]/15 via-rose-500/5 to-transparent dark:from-[#D94B55]/25 dark:via-rose-950/20 p-4 rounded-3xl border border-[#D94B55]/20 shadow-sm backdrop-blur-md mb-3.5">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isOngoing ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isOngoing ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              </span>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#D94B55] dark:text-rose-400">
                {isOngoing ? 'Şu An Devam Ediyor' : 'Sıradaki Ders'}
              </span>
            </div>
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
              {nowStr}
            </span>
          </div>

          {activeOrNext ? (
            <div className="flex justify-between items-end">
              <div className="space-y-0.5">
                <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                  {activeOrNext.subject}
                </h3>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {activeOrNext.teacher ? `👨‍🏫 ${activeOrNext.teacher} · ` : ''}
                  {activeOrNext.location ? `📍 ${activeOrNext.location}` : '📍 B1-105A'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-white/80 dark:bg-black/30 text-gray-700 dark:text-gray-300 border border-black/5 dark:border-white/10 shadow-xs">
                  {activeOrNext.start} - {activeOrNext.end}
                </span>
              </div>
            </div>
          ) : (
            <div className="py-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
              Bugün için başka ders kalmadı veya tatil günündesiniz. 🎉
            </div>
          )}
        </div>
      )}

      {showTimeline ? (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <button 
              onClick={() => setShowTimeline(false)} 
              className="text-xs font-bold text-gray-500 hover:text-gray-900 flex items-center gap-1"
            >
              ← Geri
            </button>
            <h1 className="text-sm font-bold text-gray-900">Canlı Zaman Çizelgesi</h1>
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