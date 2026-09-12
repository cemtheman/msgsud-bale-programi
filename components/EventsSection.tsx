'use client';

import { useState, useEffect } from 'react';
import { specialEvents, eventTypeLabels, SpecialEvent } from '@/data/eventsData';

export function EventsSection() {
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [allEvents, setAllEvents] = useState<SpecialEvent[]>(specialEvents);

  useEffect(() => {
    // 1. LocalStorage ve Notification Kontrolü
    const savedPref = localStorage.getItem('notifications_enabled') === 'true';
    const hasPermission = 'Notification' in window && Notification.permission === 'granted';
    setIsEnabled(savedPref && hasPermission);

    // 2. Google Tatil Takvimini API'den Çekme (Yakın Tarihli Maks 4 Etkinlik)
    async function fetchHolidays() {
      try {
        const res = await fetch('/api/holidays');
        if (res.ok) {
          const fetchedHolidays: SpecialEvent[] = await res.json();
          
          // Bugünden itibaren tarihe göre sırala ve en yakın ilk 4 kaydı al
          const combined = [...specialEvents, ...fetchedHolidays]
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(0, 4);
            
          setAllEvents(combined);
        }
      } catch (err) {
        console.error('Tatiller yüklenirken hata oluştu:', err);
      }
    }

    fetchHolidays();
  }, []);

  const handleToggleClick = () => {
    if (isEnabled) {
      setIsEnabled(false);
      localStorage.setItem('notifications_enabled', 'false');
    } else {
      setShowModal(true);
    }
  };

  const handleConfirmNotification = async () => {
    setShowModal(false);
    
    if (!('Notification' in window)) {
      alert('Bu tarayıcı web bildirimlerini desteklemiyor.');
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
      setIsEnabled(true);
      localStorage.setItem('notifications_enabled', 'true');
      new Notification('MSGSÜ Bale Programı', {
        body: 'Etkinlik ve ders bildirimleri aktifleştirildi!',
        icon: '/icon-512.png',
      });
    } else {
      setIsEnabled(false);
      localStorage.setItem('notifications_enabled', 'false');
    }
  };

  return (
    <div className="space-y-3 relative w-full overflow-hidden">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-[11px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate">
          Yaklaşan Etkinlikler & Tatiller
        </h2>
        
        <button
          onClick={handleToggleClick}
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-all shrink-0 flex items-center gap-1 ${
            isEnabled
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
              : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-black/5 dark:border-white/10 hover:text-gray-700'
          }`}
        >
          {isEnabled ? '🔔 Açık' : '🔕 Bildirimler'}
        </button>
      </div>

      {/* Kart Listesi */}
      <div className="space-y-2 w-full">
        {allEvents.length === 0 ? (
          <div className="py-6 text-center text-xs font-medium text-gray-400">
            Yaklaşan etkinlik veya tatil bulunmuyor.
          </div>
        ) : (
          allEvents.map((event) => {
            const badge = eventTypeLabels[event.type] || {
              label: 'TATİL',
              bg: 'bg-blue-500/10 dark:bg-blue-500/20',
              text: 'text-blue-600 dark:text-blue-400',
            };

            return (
              <div
                key={event.id}
                className="p-3.5 bg-white dark:bg-[#1C1C1E] rounded-2xl border border-black/5 dark:border-white/10 shadow-sm transition-colors w-full"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start gap-1.5">
                  <div className="space-y-1 w-full min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                      <span className="text-[11px] font-semibold text-gray-400">
                        {event.date} {event.time ? `· ${event.time}` : ''}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                      {event.title}
                    </h3>
                    {event.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                        {event.description}
                      </p>
                    )}
                  </div>
                  {event.location && (
                    <span className="text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-lg shrink-0 self-start">
                      📍 {event.location}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Onay Modalı */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-[300px] bg-white dark:bg-[#1C1C1E] rounded-3xl p-5 shadow-2xl border border-black/10 dark:border-white/10 space-y-4 text-center">
            <div className="w-12 h-12 bg-[#D94B55]/10 text-[#D94B55] rounded-full flex items-center justify-center mx-auto text-2xl">
              🔔
            </div>
            
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Bildirimlere İzin Verilsin mi?
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Yaklaşan temsil, sınav ve provalar için anlık hatırlatmalar almak ister misiniz?
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
              >
                Vazgeç
              </button>
              <button
                onClick={handleConfirmNotification}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-[#D94B55] text-white hover:bg-[#c03d47] transition-colors"
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