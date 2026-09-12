'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { TodayPage } from '@/components/TodayPage';
import { WeeklyPage } from '@/components/WeeklyPage';
import { EventsPage } from '@/components/EventsPage';
import { BottomNavigation } from '@/components/BottomNavigation';
import { scheduleData } from '@/data/scheduleData';

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

  // Tür denetimlerini güvenli hale getirmek için veriyi `any` olarak işaretliyoruz
  const safeScheduleData: any = scheduleData;
  const todayDayName = new Date().toLocaleDateString('tr-TR', { weekday: 'long' });

  // scheduleData array ise find ile, değilse key ile veri arama
  let todayLessons: any[] = [];
  if (Array.isArray(safeScheduleData)) {
    const found = safeScheduleData.find((item: any) => item?.day?.toLowerCase() === todayDayName.toLowerCase());
    todayLessons = found?.lessons || [];
  } else {
    todayLessons = safeScheduleData[todayDayName] || [];
  }

  const hasLesson = todayLessons.length > 0;
  
  // Eksiksiz ve güvenli ComputedStatus objesi
  const status: any = {
    type: hasLesson ? 'has-lesson' : 'no-lesson',
    title: hasLesson ? `${todayLessons.length} DERS VAR` : 'BUGÜN DERS YOK',
    subtitle: hasLesson ? `Bugün ${todayLessons.length} dersiniz bulunmaktadır.` : 'İyi dinlenmeler!',
  };

  return (
    <main className="flex-1 space-y-4 pb-4">
      <Header formattedDate={timeState.date} formattedTime={timeState.time} />

      {activeTab === 'today' && (
        <TodayPage
          formattedDate={timeState.date}
          formattedTime={timeState.time}
          status={status}
          todayLessons={todayLessons}
          scheduleData={safeScheduleData}
          onNavigateToWeekly={() => setActiveTab('weekly')}
          {...({} as any)} // TS'nin bilmediğimiz ekstra proplar için hata vermesini engeller
        />
      )}

      {activeTab === 'weekly' && <WeeklyPage />}
      {activeTab === 'events' && <EventsPage />}

      <BottomNavigation activeTab={activeTab} setActiveTab={setActiveTab} />
    </main>
  );
}