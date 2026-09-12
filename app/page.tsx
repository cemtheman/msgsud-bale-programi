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
import { NotificationManager } from '@/components/NotificationManager';

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

  return (
    <main className="w-full flex-1 px-4 pt-6 pb-28">
      {/* Arka plan bildirim yöneticisi (Görünmez) */}
      <NotificationManager />

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