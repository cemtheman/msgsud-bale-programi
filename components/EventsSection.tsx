'use client';

import { useState, useEffect } from 'react';
import { specialEvents, eventTypeLabels } from '@/data/eventsData';

export function EventsSection() {
  const [notificationStatus, setNotificationStatus] = useState<'default' | 'granted' | 'denied'>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationStatus(Notification.permission);
    }
  }, []);

  const handleRequestPermission = async () => {
    if (!('Notification' in window)) {
      alert('Bu tarayıcı web bildirimlerini desteklemiyor.');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationStatus(permission);

    if (permission === 'granted') {
      new Notification('MSGSÜ Bale Programı', {
        body: 'Etkinlik ve ders bildirimleri aktifleştirildi!',
        icon: '/icon-512.png',
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Yaklaşan Etkinlikler & Duyurular
        </h2>
        {notificationStatus !== 'granted' && (
          <button
            onClick={handleRequestPermission}
            className="text-[11px] font-bold text-[#D94B55] hover:underline"
          >
            🔔 Bildirimleri Aç
          </button>
        )}
      </div>

      <div className="space-y-2">
        {specialEvents.length === 0 ? (
          <div className="py-6 text-center text-xs font-medium text-gray-400">
            Yaklaşan özel etkinlik bulunmuyor.
          </div>
        ) : (
          specialEvents.map((event) => {
            const badge = eventTypeLabels[event.type];
            return (
              <div
                key={event.id}
                className="p-4 bg-white dark:bg-[#1C1C1E] rounded-2xl border border-black/5 dark:border-white/10 shadow-sm transition-colors"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs font-semibold text-gray-400">
                        {event.date} {event.time ? `· ${event.time}` : ''}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                      {event.title}
                    </h3>
                    {event.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {event.description}
                      </p>
                    )}
                  </div>
                  {event.location && (
                    <span className="text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-white/5 px-2 py-1 rounded-lg whitespace-nowrap">
                      📍 {event.location}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}