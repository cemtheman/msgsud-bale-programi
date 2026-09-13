'use client';

import { useState, useEffect } from 'react';
import { SpecialEvent } from '@/data/eventsData';
import {
  dismissEventForDay,
  getIstanbulDateKey,
  readCustomEvents,
  readDismissedEventIds,
  REMINDER_PREFERENCE_EVENT,
} from '@/utils/events';

export function DailyReminderBanner() {
  const [activeEvent, setActiveEvent] = useState<SpecialEvent | null>(null);
  const [showBanner, setShowBanner] = useState<boolean>(false);

  useEffect(() => {
    const checkReminder = () => {
      if (localStorage.getItem('reminders_enabled') !== 'true') {
        setActiveEvent(null);
        setShowBanner(false);
        return;
      }
      const customEvents = readCustomEvents();
      const todayDate = getIstanbulDateKey();

      // 1. Kullanıcı bu etkinlik için "Kapat" (dismiss) yapmış mı?
      const dismissedEventIds = readDismissedEventIds(todayDate);

      // 2. Erteleme süresi (Snooze) kontrolü
      const snoozeUntil = localStorage.getItem(`snooze_until_${todayDate}`);
      if (snoozeUntil && Date.now() < parseInt(snoozeUntil, 10)) {
        return; // Ertelenen süre henüz dolmadı
      }

      // Bugünün tarihine ait ilk etkinliği bul
      const todayEvent = customEvents.find((event) => event.date === todayDate && !dismissedEventIds.has(event.id));

      if (todayEvent) {
        setActiveEvent(todayEvent);
        setShowBanner(true);
      } else {
        setShowBanner(false);
      }
    };

    queueMicrotask(checkReminder);
    const intervalId = window.setInterval(checkReminder, 60_000);
    window.addEventListener(REMINDER_PREFERENCE_EVENT, checkReminder);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(REMINDER_PREFERENCE_EVENT, checkReminder);
    };
  }, []);

  const handleDismiss = () => {
    if (!activeEvent) return;
    const todayDate = getIstanbulDateKey();

    // Bugün için bu etkinliği tamamen kapat
    dismissEventForDay(todayDate, activeEvent.id);
    setShowBanner(false);
    window.setTimeout(() => window.dispatchEvent(new Event(REMINDER_PREFERENCE_EVENT)), 0);
  };

  const handleSnooze = () => {
    const todayDate = getIstanbulDateKey();

    // 1 saat sonrasına ertele (1 * 60 * 60 * 1000 ms)
    const snoozeTime = Date.now() + 60 * 60 * 1000;
    localStorage.setItem(`snooze_until_${todayDate}`, snoozeTime.toString());
    setShowBanner(false);
  };

  if (!showBanner || !activeEvent) return null;

  return (
    <div className="w-full bg-[#D94B55]/10 dark:bg-[#D94B55]/20 border border-[#D94B55]/30 rounded-2xl p-3.5 shadow-sm transition-all animate-fade-in mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="text-xl shrink-0 mt-0.5">🔔</span>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#D94B55] text-white">
                BUGÜNKÜ ETKİNLİK
              </span>
              {activeEvent.time && (
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Saat: {activeEvent.time}
                </span>
              )}
            </div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">
              {activeEvent.title}
            </h4>
            {activeEvent.description && (
              <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                {activeEvent.description} {activeEvent.location ? `(📍 ${activeEvent.location})` : ''}
              </p>
            )}
          </div>
        </div>

        {/* Aksiyon Butonları: Kapat / Ertele */}
        <div className="flex flex-col sm:flex-row items-center gap-1.5 shrink-0">
          <button
            onClick={handleSnooze}
            className="w-full sm:w-auto px-2.5 py-1 text-[11px] font-bold bg-white dark:bg-white/10 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 transition-colors border border-black/5"
            title="1 saat sonra tekrar hatırlat"
          >
            ⏰ Ertele
          </button>
          <button
            onClick={handleDismiss}
            className="w-full sm:w-auto px-2.5 py-1 text-[11px] font-bold bg-[#D94B55] text-white rounded-lg hover:bg-[#c03d47] transition-colors shadow-sm"
            title="Bugün için kapat"
          >
            ✓ Tamam
          </button>
        </div>
      </div>
    </div>
  );
}
