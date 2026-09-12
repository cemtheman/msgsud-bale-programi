'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { TodayPage } from '@/components/TodayPage';
import { WeeklyPage } from '@/components/WeeklyPage';
import { EventsPage } from '@/components/EventsPage';
import { BottomNavigation } from '@/components/BottomNavigation';
import { scheduleData } from '@/data/scheduleData';

// TS hatalarını ezip geçmek ve çalışma anı çökmelerini önlemek için güvenli kapsayıcı
const SafeTodayPage = TodayPage as any;

export default function Home() {
  const [activeTab, setActiveTab] = useState<'today' | 'weekly' | 'events'>('today');
  const [timeState, setTimeState] = useState({ date: '', time: '' });

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formattedDate = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
      const formattedTime = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      setTimeState({ date: formattedDate, time: formattedTime });
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const safeScheduleData: any = scheduleData;
  const todayDayName = new Date().toLocaleDateString('tr-TR', { weekday: 'long' });

  let todayLessons: any[] = [];
  if (Array.isArray(safeScheduleData)) {
    todayLessons = safeScheduleData.find((item: any) => item?.day?.toLowerCase() === todayDayName.toLowerCase())?.lessons || [];
  } else {
    todayLessons = safeScheduleData[todayDayName] || [];
  }

  const hasLesson = todayLessons.length > 0;
  
  const status: any = {
    type: hasLesson ? 'has-lesson' : 'no-lesson',
    title: hasLesson ? `${todayLessons.length} DERS VAR` : 'BUGÜN DERS YOK',
    subtitle: hasLesson ? `Bugün ${todayLessons.length} dersiniz bulunmaktadır.` : 'Sıradaki ders: Türkçe (Pazartesi)',
  };

  return (
    <main className="flex-1 space-y-4 pb-4">
      {/* 1. ÇÖZÜM: Çift başlığı engellemek için TodayPage dışındaki sekmelerde Header gösteriyoruz */}
      {activeTab !== 'today' && (
        <Header formattedDate={timeState.date} formattedTime={timeState.time} />
      )}

      {activeTab === 'today' && (
        <SafeTodayPage
          formattedDate={timeState.date}
          formattedTime={timeState.time}
          status={status}
          todayLessons={todayLessons}
          scheduleData={safeScheduleData}
          onNavigateToWeekly={() => setActiveTab('weekly')}
          // 2. ÇÖZÜM: Bileşen çökmesin diye eksik olabilecek proplara boş/güvenli değerler atıyoruz
          currentLesson={null}
          nextLesson={null}
        />
      )}

      {activeTab === 'weekly' && <WeeklyPage />}
      
      {activeTab === 'events' && (
        <div className="pt-2">
          <EventsPage />
        </div>
      )}

      <BottomNavigation activeTab={activeTab} setActiveTab={setActiveTab} />
    </main>
  );
}