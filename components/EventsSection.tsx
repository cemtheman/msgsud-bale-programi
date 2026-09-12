'use client';

import { useState, useEffect } from 'react';
import { specialEvents, eventTypeLabels } from '@/data/eventsData';

export function EventsSection() {
  const [notificationStatus, setNotificationStatus] = useState<'default' | 'granted' | 'denied'>('default');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationStatus(Notification.permission);
    }
  }, []);

  const handleConfirmNotification = async () => {
    setShowModal(false);
    if (!('Notification' in window)) {
      alert('Bu tarayıcı web bildirimlerini desteklemiyor.');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationStatus(permission);

    if (permission === 'granted') {
      new Notification('MSGSÜ Bale Programı', {
        body: 'Etkinlik ve ders bildirimleri başarıyla aktifleştirildi!',
        icon: '/icon-512.png',
      });
    }
  };

  return (
    <div className="space-y-3 relative">
      <div className="flex justify-between items-center">
        <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Yaklaşan Etkinlikler & Duyurular
        </h2>
        {notificationStatus !== 'granted' && (
          <button
            onClick={() => setShowModal(true)}
            className="text-[11px] font-bold text-[#D94B55] hover:underline flex items-center gap-1"
          >
            🔔 Bildirimleri Aç
          </button>
        )}
      </div>

      {/* Kart Listesi */}
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

      {/* Bildirim Onay Kutucuğu (Modal) */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-xs bg-white dark:bg-[#1C1C1E] rounded-3xl p-6 shadow-2xl border border-black/10 dark:border-white/10 space-y-4 text-center">
            <div className="w-12 h-12 bg-rose-500/10 text-[#D94B55] rounded-full flex items-center justify-center mx-auto text-2xl">
              🔔
            </div>
            
            <div className="space-y-1">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Bildirimlere İzin Verilsin mi?
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Yaklaşan bale temsilleri, sınav haftaları ve genel provalar için anlık hatırlatmalar almak ister misiniz?
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
              >
                Vazgeç
              </button>
              <button
                onClick={handleConfirmNotification}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-[#D94B55] text-white hover:bg-[#c03d47] shadow-sm transition-colors"
              >
                İzin Ver
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}