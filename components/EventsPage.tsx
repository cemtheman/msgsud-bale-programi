'use client';

import { useState, useEffect, useRef } from 'react';
import { specialEvents, eventTypeLabels, SpecialEvent } from '@/data/eventsData';
import {
  escapeICalText,
  getIstanbulDateKey,
  isSpecialEvent,
  readCustomEvents,
  REMINDER_PREFERENCE_EVENT,
  toICalDateTime,
} from '@/utils/events';

export function EventsPage() {
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [showNotificationModal, setShowNotificationModal] = useState<boolean>(false);
  const [showAddEventModal, setShowAddEventModal] = useState<boolean>(false);
  const [allEvents, setAllEvents] = useState<SpecialEvent[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState<SpecialEvent['type']>('rehearsal');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');

  const loadAllEvents = async () => {
    const customEvents = readCustomEvents();

    let fetchedHolidays: SpecialEvent[] = [];
    try {
      const res = await fetch('/api/holidays');
      if (res.ok) {
        fetchedHolidays = await res.json();
      }
    } catch (err) {
      console.error('Tatiller yüklenirken hata oluştu:', err);
    }

    const today = getIstanbulDateKey();
    const combined = [...specialEvents, ...customEvents, ...fetchedHolidays]
      .filter(isSpecialEvent)
      .filter((event) => event.date >= today)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    setAllEvents(combined);
  };

  useEffect(() => {
    queueMicrotask(() => {
      setIsEnabled(localStorage.getItem('reminders_enabled') === 'true');
      void loadAllEvents();
    });
  }, []);

  const handleToggleNotification = () => {
    if (isEnabled) {
      setIsEnabled(false);
      localStorage.setItem('reminders_enabled', 'false');
      window.dispatchEvent(new Event(REMINDER_PREFERENCE_EVENT));
    } else {
      setShowNotificationModal(true);
    }
  };

  const handleConfirmNotification = () => {
    setShowNotificationModal(false);
    setIsEnabled(true);
    localStorage.setItem('reminders_enabled', 'true');
    window.dispatchEvent(new Event(REMINDER_PREFERENCE_EVENT));
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

    const customEvents = readCustomEvents();
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

  const handleDeleteEvent = (id: string) => {
    if (!confirm('Bu etkinliği silmek istediğinize emin misiniz?')) return;

    const customEvents = readCustomEvents();
    const updatedCustomEvents = customEvents.filter((event) => event.id !== id);

    localStorage.setItem('custom_events', JSON.stringify(updatedCustomEvents));
    loadAllEvents();
  };

  const handleExportJson = () => {
    const customEvents = readCustomEvents();
    if (customEvents.length === 0) {
      alert('Dışa aktarılacak özel etkinlik bulunmuyor.');
      return;
    }

    const blob = new Blob([JSON.stringify(customEvents, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `msgsud-bale-etkinlikler-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed: unknown = JSON.parse(String(event.target?.result));
        if (Array.isArray(parsed) && parsed.every(isSpecialEvent)) {
          const importedEvents = parsed;
          const currentEvents = readCustomEvents();
          
          const merged = [...currentEvents];
          importedEvents.forEach((imp) => {
            if (!merged.some((existing) => existing.id === imp.id || (existing.date === imp.date && existing.title === imp.title))) {
              merged.push(imp);
            }
          });

          localStorage.setItem('custom_events', JSON.stringify(merged));
          loadAllEvents();
          alert('Etkinlikler başarıyla geri yüklendi!');
        } else {
          alert('Geçersiz yedek dosyası formatı.');
        }
      } catch {
        alert('Dosya okunurken bir hata oluştu.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExportIcal = () => {
    const customEvents = readCustomEvents();

    if (customEvents.length === 0) {
      alert('Takvime aktarılacak özel etkinlik bulunmuyor.');
      return;
    }

    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'PRODID:-//MSGSÜ Bale Programı//TR'];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

    customEvents.forEach((ev) => {
      lines.push('BEGIN:VEVENT', `UID:msgsud-${escapeICalText(ev.id)}@bale.app`, `DTSTAMP:${stamp}`);
      if (ev.time) {
        lines.push(`DTSTART;TZID=Europe/Istanbul:${toICalDateTime(ev.date, ev.time)}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${ev.date.replace(/-/g, '')}`);
      }
      lines.push(`SUMMARY:${escapeICalText(ev.title)}`);
      if (ev.description) lines.push(`DESCRIPTION:${escapeICalText(ev.description)}`);
      if (ev.location) lines.push(`LOCATION:${escapeICalText(ev.location)}`);
      lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');
    const icsContent = `${lines.join('\r\n')}\r\n`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `msgsud-bale-takvim.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Yalnızca Özel Etkinlikleri WhatsApp / Metin Olarak Paylaş ---
  const handleShareText = () => {
    const customEvents = readCustomEvents();

    let text = "🩰 *MSGSÜ 5. Sınıf Bale - Özel Etkinlikler*\n\n";

    if (customEvents.length === 0) {
      text += "Kayıtlı özel etkinlik bulunmuyor.";
    } else {
      customEvents.forEach((ev) => {
        text += `📅 *${ev.title}*\n`;
        text += `   • Tarih: ${ev.date} ${ev.time ? `· ${ev.time}` : ''}\n`;
        if (ev.location) text += `   • Konum: ${ev.location}\n`;
        if (ev.description) text += `   • Not: ${ev.description}\n`;
        text += "\n";
      });
    }

    if (navigator.share) {
      navigator.share({
        title: 'Özel Etkinlikler',
        text: text,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      alert('Özel etkinlikler listesi panoya kopyalandı!');
    }
  };

  const getCountdownLabel = (dateStr: string) => {
    const diffTime = Date.parse(`${dateStr}T00:00:00Z`) - Date.parse(`${getIstanbulDateKey()}T00:00:00Z`);
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: 'Geçti', color: 'bg-gray-500/10 text-gray-400 border-gray-500/20' };
    if (diffDays === 0) return { text: 'Bugün!', color: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 font-extrabold animate-pulse' };
    if (diffDays === 1) return { text: 'Yarın', color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-bold' };
    return { text: `${diffDays} gün sonra`, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' };
  };

  return (
    <div className="space-y-3.5 w-full">
      {/* Başlık & Ana Butonlar */}
      <div className="flex justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
            Etkinlik Takvimi
          </h2>
          <button
            onClick={() => setShowAddEventModal(true)}
            className="w-6 h-6 rounded-full bg-[#D94B55] text-white flex items-center justify-center text-xs font-bold shrink-0 hover:bg-[#c03d47] active:scale-95 transition-all"
            title="Yeni Etkinlik Ekle"
          >
            +
          </button>
        </div>

        <button
          onClick={handleToggleNotification}
          className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-all shrink-0 flex items-center gap-1 ${
            isEnabled
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
              : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-black/5 dark:border-white/10'
          }`}
        >
          {isEnabled ? '🔔 Hatırlatıcı Açık' : '🔕 Hatırlatıcıyı Aç'}
        </button>
      </div>

      {/* Taşmayı Önleyen Kompakt Araç Çubuğu (4 Buton) */}
      <div className="grid grid-cols-4 gap-1 text-[10px] font-semibold w-full">
        <button
          onClick={handleExportJson}
          className="py-2 px-0.5 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 rounded-xl border border-black/5 dark:border-white/10 text-center truncate transition-colors"
          title="Yedek Al (JSON)"
        >
          💾 Yedek
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="py-2 px-0.5 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 rounded-xl border border-black/5 dark:border-white/10 text-center truncate transition-colors"
          title="Geri Yükle"
        >
          📂 Yükle
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleImportJson} 
          accept=".json" 
          className="hidden" 
        />

        <button
          onClick={handleExportIcal}
          className="py-2 px-0.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-500/20 text-center truncate transition-colors"
          title="Takvime Aktar (.ics)"
        >
          📅 Takvim
        </button>

        <button
          onClick={handleShareText}
          className="py-2 px-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-500/20 text-center truncate transition-colors"
          title="WhatsApp / Metin Olarak Paylaş"
        >
          📤 Paylaş
        </button>
      </div>

      {/* Kart Listesi */}
      <div className="space-y-2.5 w-full">
        {allEvents.length === 0 ? (
          <div className="py-10 text-center text-xs font-medium text-gray-400 bg-white dark:bg-[#1C1C1E] rounded-2xl border border-black/5 dark:border-white/10">
            Yaklaşan özel etkinlik veya tatil bulunmuyor.
          </div>
        ) : (
          allEvents.map((event) => {
            const badge = eventTypeLabels[event.type] || {
              label: 'ÖZEL',
              bg: 'bg-blue-500/10 dark:bg-blue-500/20',
              text: 'text-blue-600 dark:text-blue-400',
            };

            const countdown = getCountdownLabel(event.date);
            const isCustom = event.id.startsWith('custom-');

            return (
              <div
                key={event.id}
                className="p-3.5 bg-white dark:bg-[#1C1C1E] rounded-2xl border border-black/5 dark:border-white/10 shadow-sm transition-colors w-full"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-1 w-full min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs font-semibold text-gray-400">
                        {event.date} {event.time ? `· ${event.time}` : ''}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${countdown.color}`}>
                        ⏳ {countdown.text}
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

      {/* Mobile Tam Oturan Kaydırılabilir Form Modalı */}
      {showAddEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-[320px] bg-white dark:bg-[#1C1C1E] rounded-3xl p-4 shadow-2xl border border-black/10 dark:border-white/10 space-y-2.5 max-h-[85vh] overflow-y-auto box-border">
            <div className="flex justify-between items-center pb-2 border-b border-black/5 dark:border-white/10">
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

            <form onSubmit={handleAddEventSubmit} className="space-y-2 text-xs">
              <div>
                <label className="block text-gray-500 font-semibold mb-1">Başlık *</label>
                <input
                  type="text"
                  required
                  placeholder="örn: Fındıkkıran Genel Provası"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full box-border px-3 py-2 rounded-xl bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 text-gray-900 dark:text-white outline-none focus:border-[#D94B55]"
                />
              </div>

              <div>
                <label className="block text-gray-500 font-semibold mb-1">Tarih *</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full box-border px-3 py-2 rounded-xl bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 text-gray-900 dark:text-white outline-none focus:border-[#D94B55] appearance-none"
                />
              </div>

              <div>
                <label className="block text-gray-500 font-semibold mb-1">Saat</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full box-border px-3 py-2 rounded-xl bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 text-gray-900 dark:text-white outline-none focus:border-[#D94B55] appearance-none"
                />
              </div>

              <div>
                <label className="block text-gray-500 font-semibold mb-1">Tür</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as SpecialEvent['type'])}
                  className="w-full box-border px-3 py-2 rounded-xl bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 text-gray-900 dark:text-white outline-none focus:border-[#D94B55]"
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
                  className="w-full box-border px-3 py-2 rounded-xl bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 text-gray-900 dark:text-white outline-none focus:border-[#D94B55]"
                />
              </div>

              <div>
                <label className="block text-gray-500 font-semibold mb-1">Açıklama</label>
                <input
                  type="text"
                  placeholder="örn: Kostümlü katılım zorunludur"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full box-border px-3 py-2 rounded-xl bg-gray-100 dark:bg-white/5 border border-black/5 dark:border-white/10 text-gray-900 dark:text-white outline-none focus:border-[#D94B55]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddEventModal(false)}
                  className="flex-1 py-2 rounded-xl font-bold bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl font-bold bg-[#D94B55] text-white hover:bg-[#c03d47]"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Uygulama içi hatırlatıcı açıklaması */}
      {showNotificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-[300px] bg-white dark:bg-[#1C1C1E] rounded-3xl p-5 shadow-2xl border border-black/10 dark:border-white/10 space-y-4 text-center">
            <div className="w-12 h-12 bg-[#D94B55]/10 text-[#D94B55] rounded-full flex items-center justify-center mx-auto text-2xl">
              🔔
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Uygulama İçi Hatırlatıcı
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Uygulamayı açtığınızda o günkü temsil, sınav ve provaları hatırlatalım mı?
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
                Etkinleştir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
