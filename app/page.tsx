'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { TodayPage } from '@/components/TodayPage';
import { WeeklyPage } from '@/components/WeeklyPage';
import { EventsPage } from '@/components/EventsPage';
import { BottomNavigation } from '@/components/BottomNavigation';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'today' | 'weekly' | 'events'>('today');
  const [timeState, setTimeState] = useState({ date: '', time: '' });

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      
      const formattedDate = now.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        weekday: 'long',
      });

      const formattedTime = now.toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      setTimeState({ date: formattedDate, time: formattedTime });
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="flex-1 space-y-4 pb-4">
      <Header formattedDate={timeState.date} formattedTime={timeState.time} />

      {activeTab === 'today' && <TodayPage />}
      {activeTab === 'weekly' && <WeeklyPage />}
      {activeTab === 'events' && <EventsPage />}

      <BottomNavigation activeTab={activeTab} setActiveTab={setActiveTab} />
    </main>
  );
}