'use client';

import { useState, useEffect } from 'react';
import { specialEvents, eventTypeLabels, SpecialEvent } from '@/data/eventsData';

export function EventsSection() {
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [showNotificationModal, setShowNotificationModal] = useState<boolean>(false);
  const [showAddEventModal, setShowAddEventModal] = useState<boolean>(false);
  const [allEvents, setAllEvents] = useState<SpecialEvent[]>([]);

  // Form State
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState<SpecialEvent['type']>('rehearsal');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');

  const loadAllEvents = async () => {
    const localData = localStorage.getItem('custom_events');
    const customEvents: SpecialEvent[] = localData ? JSON.parse(localData) : [];

    let fetchedHolidays: SpecialEvent[] = [];
    try {
      const res = await fetch('/api/holidays');
      if (res.ok) {
        fetchedHolidays = await res.json();
      }
    } catch (err) {
      console.error('Tatiller yüklenirken hata oluştu:', err);
    }

    const combined = [...specialEvents, ...customEvents, ...fetchedHolidays]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);

    setAllEvents(combined);
  };

  useEffect(() => {
    const savedPref = localStorage.getItem('notifications_enabled') === 'true';
    const hasPermission = 'Notification' in window && Notification.permission === 'granted';
    setIsEnabled(savedPref && hasPermission);

    loadAllEvents();
  }, []);

  const handleToggleNotification = () => {
    if (isEnabled) {
      setIsEnabled(false);
      localStorage.setItem('notifications_enabled', 'false');
    } else {
      setShowNotificationModal(true);
    }
  };

  const handleConfirmNotification = async () => {
    setShowNotificationModal(false);
    if (!('Notification' in window)) return;

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

  const handleAddEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date) return;

    const newEvent: SpecialEvent = {
      id: `custom-${Date.now()}`,
      title,
      date,
      time: time || undefined,
      type,
      location: location || undefined,
      description: description || undefined,
    };

    const localData = localStorage.getItem('custom_events');
    const customEvents: SpecialEvent[] = localData ? JSON.parse(localData) : [];
    const updatedCustomEvents = [...customEvents, newEvent];

    localStorage.setItem('custom_events', JSON.stringify(updatedCustomEvents));

    setTitle('');
    setDate('');
    setTime('');
    setType('rehearsal');
    setLocation('');
    setDescription('');
    setShowAddEventModal(false);

    loadAllEvents();
  };

  // Özel Etkinlik Silme Fonksiyonu
  const handleDeleteEvent = (id: string) => {
    if (!confirm('Bu etkinliği silmek istediğinize emin misiniz?')) return;

    const localData = localStorage.getItem('custom_events');
    if (!localData) return;

    const customEvents: SpecialEvent[] = JSON.parse(localData);
    const updatedCustomEvents = customEvents.filter((event) => event.id !== id);

    localStorage.setItem('custom_events', JSON.stringify(updatedCustomEvents));
    loadAllEvents();
  };

  return (
    <div className="space-y-3 relative w-full">
      {/* Esnek Başlık Satırı */}
      <div className="flex justify-between items-center gap-1.5 w-full">
        <div className="flex items-center gap-1.5 min-w-0">
          <h2 className="text-[11px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate">
            Etkinlikler & Özel Günler
          </h2>
          <button
            onClick={() => setShowAddEventModal(true)}
            className="w-5 h-5 rounded-full bg-[#D94B55] text-white flex items-center justify-center text-xs font-bold shrink-0 hover:bg-[#c03d47] active:scale-95 transition-all"
            title="Yeni Etkinlik Ekle"
          >
            +
          </button>
        </div>

        <button
          onClick={handleToggleNotification}
          className={`text-[10px] sm:text-[11px] font-bold px-2 py-1 rounded-full transition-all shrink-0 flex items-center gap-1 ${
            isEnabled
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
              : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-black/5 dark:border-white/10'
          }`}
        >
          {isEnabled ? '🔔 Açık' : '🔕 Bildirim'}
        </button>
      </div>

      {/* Kart Listesi */}
      <div className="space-y-2 w-full">
        {allEvents.length === 0 ? (
          <div className="py-6 text-center text-xs font-medium text-gray-400">
            Yaklaşan etkinlik veya özel gün bulunmuyor.
          </div>
        ) : (
          allEvents.map((event) => {
            const badge = eventTypeLabels[event.type] || {
              label: 'ÖZEL',
              bg: 'bg-blue-500/10 dark:bg-blue-500/20',
              text: 'text-blue-600 dark:text-blue-400',
            };

            const isCustom = event.id.startsWith('custom-');

            return (
              <div
                key={event.id}
                className="p-3.5 bg-white dark:bg-[#1C1C1E] rounded-2xl border border-black/5 dark:border-white/10 shadow-sm transition-colors w-full"
              >
                <div className="flex justify-between items-start gap-1.5">
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

                  <div className="flex items-center gap-1 shrink-0 self-start">
                    {event.location && (
                      <span className="text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-lg whitespace-nowrap">
                        📍 {event.location}
                      </span>
                    )}

                    {/* Manuel Eklenen Etkinlikler İçin Sil Butonu */}
                    {isCustom && (
                      <button
                        onClick={() => handleDeleteEvent(event.id)}
                        className="p-1 text-gray-400 hover:text-rose-500 transition-colors text-xs ml-1"
                        title="Etkinliği Sil"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Form Modalı */}
      {showAddEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-[320px] bg-white dark:bg-[#1C1C1E] rounded-3xl p-5 shadow-2xl border border-black/10 dark:border-white/10 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-1 border-b border-black/5 dark:border-white/10">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Yeni Etkinlik Ekle
              </h3>
              <button
                onClick={() => setShowAddEventModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddEventSubmit} className="space-y-2.5 text-xs">
              <div>
                <label className="block text-gray-500 font-semibold mb-1">Başlık *</label>
                <input
                  type="text"
                  required
                  placeholder="örn: Fındıkkıran Genel Provası"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 text-gray-900 dark:text-white outline-none focus:border-[#D94B55]"
                />
              </div>

              <div>
                <label className="block text-gray-500 font-semibold mb-1">Tarih *</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 text-gray-900 dark:text-white outline-none focus:border-[#D94B55]"
                />
              </div>

              <div>
                <label className="block text-gray-500 font-semibold mb-1">Saat</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 text-gray-900 dark:text-white outline-none focus:border-[#D94B55]"
                />
              </div>

              <div>
                <label className="block text-gray-500 font-semibold mb-1">Tür</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as SpecialEvent['type'])}
                  className="w-full p-2.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 text-gray-900 dark:text-white outline-none focus:border-[#D94B55]"
                >
                  <option value="rehearsal">PROVA</option>
                  <option value="performance">TEMSİL</option>
                  <option value="exam">SINAV</option>
                  <option value="special">ÖZEL GÜN</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-500 font-semibold mb-1">Konum</label>
                <input
                  type="text"
                  placeholder="örn: Ana Sahne"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 text-gray-900 dark:text-white outline-none focus:border-[#D94B55]"
                />
              </div>

              <div>
                <label className="block text-gray-500 font-semibold mb-1">Açıklama</label>
                <input
                  type="text"
                  placeholder="örn: Kostümlü katılım zorunludur"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 text-gray-900 dark:text-white outline-none focus:border-[#D94B55]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddEventModal(false)}
                  className="flex-1 py-2.5 rounded-xl font-bold bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl font-bold bg-[#D94B55] text-white hover:bg-[#c03d47]"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bildirim İzin Modalı */}
      {showNotificationModal && (
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
                onClick={() => setShowNotificationModal(false)}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300"
              >
                Vazgeç
              </button>
              <button
                onClick={handleConfirmNotification}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-[#D94B55] text-white hover:bg-[#c03d47]"
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