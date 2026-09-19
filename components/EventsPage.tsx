'use client';

import { useState, useEffect, useRef } from 'react';
import { specialEvents, eventTypeLabels, SpecialEvent } from '@/data/eventsData';
import {
  escapeICalText,
  getIstanbulDateKey,
  isSpecialEvent,
  readCustomEvents,
  REMINDER_PREFERENCE_EVENT,
  saveCustomEvent,
  toICalDateTime,
} from '@/utils/events';

type EventIconName = 'bell' | 'backup' | 'upload' | 'calendar' | 'share' | 'hourglass' | 'location' | 'edit' | 'trash';

function EventIcon({ name, className = 'h-3.5 w-3.5' }: { name: EventIconName; className?: string }) {
  const paths: Record<EventIconName, React.ReactNode> = {
    bell: <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 6 2.5 6 2.5 7.5H4c0-1.5 2.5-1.5 2.5-7.5ZM9.5 20h5" />,
    backup: <><path strokeLinecap="round" strokeLinejoin="round" d="M5 11h14v9H5zM7 4h10l2 4H5l2-4Z" /><path strokeLinecap="round" d="M12 7v7m-2.5-2.5L12 14l2.5-2.5" /></>,
    upload: <><path strokeLinecap="round" strokeLinejoin="round" d="M5 14v6h14v-6M12 16V4m-4 4 4-4 4 4" /></>,
    calendar: <><path strokeLinecap="round" strokeLinejoin="round" d="M6 4v3m12-3v3M4 9h16v11H4z" /><path strokeLinecap="round" d="M8 13h3m2 0h3m-8 3h3m2 0h3" /></>,
    share: <><path strokeLinecap="round" strokeLinejoin="round" d="M5 12v8h14v-8M12 16V4m-4 4 4-4 4 4" /></>,
    hourglass: <><path strokeLinecap="round" strokeLinejoin="round" d="M7 3h10M7 21h10M8 4c0 4 1.5 5.5 4 8-2.5 2.5-4 4-4 8m8-16c0 4-1.5 5.5-4 8 2.5 2.5 4 4 4 8" /></>,
    location: <><path strokeLinecap="round" strokeLinejoin="round" d="M12 21s6-5.5 6-11a6 6 0 1 0-12 0c0 5.5 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /></>,
    edit: <><path strokeLinecap="round" strokeLinejoin="round" d="m14.5 5.5 4 4M4 20l4.5-1 10-10a2.8 2.8 0 0 0-4-4l-10 10L4 20Z" /></>,
    trash: <><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 3h6l1 4H8l1-4Zm-2 4 1 14h8l1-14M10 11v6m4-6v6" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

const eventDateFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Istanbul',
});

function formatEventDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return eventDateFormatter.format(new Date(Date.UTC(year, month - 1, day, 12)));
}

interface EventsPageProps {
  storageKey?: string;
  title?: string;
  contextLabel?: string;
}

export function EventsPage({
  storageKey = 'custom_events',
  title: pageTitle = 'Etkinlik Takvimi',
  contextLabel,
}: EventsPageProps) {
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [showNotificationModal, setShowNotificationModal] = useState<boolean>(false);
  const [showAddEventModal, setShowAddEventModal] = useState<boolean>(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
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
    const customEvents = readCustomEvents(storageKey);

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

  const resetEventForm = () => {
    setTitle('');
    setDate('');
    setTime('');
    setType('rehearsal');
    setLocation('');
    setDescription('');
    setEditingEventId(null);
  };

  const handleOpenAddEvent = () => {
    resetEventForm();
    setShowAddEventModal(true);
  };

  const handleOpenEditEvent = (event: SpecialEvent) => {
    if (!event.id.startsWith('custom-')) return;
    setEditingEventId(event.id);
    setTitle(event.title);
    setDate(event.date);
    setTime(event.time ?? '');
    setType(event.type);
    setLocation(event.location ?? '');
    setDescription(event.description ?? '');
    setShowAddEventModal(true);
  };

  const handleCloseEventModal = () => {
    setShowAddEventModal(false);
    resetEventForm();
  };

  const handleAddEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date) return;

    const eventToSave: SpecialEvent = {
      id: editingEventId ?? `custom-${Date.now()}`,
      title,
      date,
      time: time || undefined,
      type,
      location: location || undefined,
      description: description || undefined,
    };

    saveCustomEvent(eventToSave, storageKey);
    handleCloseEventModal();
    void loadAllEvents();
    window.dispatchEvent(new Event(REMINDER_PREFERENCE_EVENT));
  };

  const handleDeleteEvent = (id: string) => {
    if (!confirm('Bu etkinliği silmek istediğinize emin misiniz?')) return;

    const customEvents = readCustomEvents(storageKey);
    const updatedCustomEvents = customEvents.filter((event) => event.id !== id);

    localStorage.setItem(storageKey, JSON.stringify(updatedCustomEvents));
    void loadAllEvents();
    window.dispatchEvent(new Event(REMINDER_PREFERENCE_EVENT));
  };

  const handleExportJson = () => {
    const customEvents = readCustomEvents(storageKey);
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
          const currentEvents = readCustomEvents(storageKey);
          
          const merged = [...currentEvents];
          importedEvents.forEach((imp) => {
            if (!merged.some((existing) => existing.id === imp.id || (existing.date === imp.date && existing.title === imp.title))) {
              merged.push(imp);
            }
          });

          localStorage.setItem(storageKey, JSON.stringify(merged));
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
    const customEvents = readCustomEvents(storageKey);

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
    const customEvents = readCustomEvents(storageKey);

    let text = `🩰 *${contextLabel ? `${contextLabel} - Özel Etkinlikler` : 'MSGSÜ 5. Sınıf Bale - Özel Etkinlikler'}*\n\n`;

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
            {pageTitle}
          </h2>
          <button
            onClick={handleOpenAddEvent}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D94B55] text-sm font-bold text-white shadow-sm transition-all hover:bg-[#c03d47] active:scale-95"
            title="Yeni Etkinlik Ekle"
            aria-label="Yeni etkinlik ekle"
          >
            +
          </button>
        </div>

        <button
          onClick={handleToggleNotification}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition-[color,background-color,transform] active:scale-[0.97] ${
            isEnabled
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-black/5 bg-gray-100/80 text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400'
          }`}
        >
          <EventIcon name="bell" className="h-3 w-3" />
          {isEnabled ? 'Hatırlatıcı Açık' : 'Hatırlatıcıyı Aç'}
        </button>
      </div>

      {/* İlişkili ikincil işlemler tek, sakin bir kontrol yüzeyinde gruplanır. */}
      <div className="grid w-full grid-cols-4 gap-1 rounded-2xl border border-black/[0.04] bg-gray-100/75 p-1 text-[10px] font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.03)] dark:border-white/10 dark:bg-white/[0.06]">
        <button
          onClick={handleExportJson}
          className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-gray-600 transition-[color,background-color,transform] hover:bg-white/80 hover:text-gray-900 active:scale-[0.97] dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
          title="Yedek Al (JSON)"
        >
          <EventIcon name="backup" />
          <span className="truncate">Yedek</span>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-gray-600 transition-[color,background-color,transform] hover:bg-white/80 hover:text-gray-900 active:scale-[0.97] dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
          title="Geri Yükle"
        >
          <EventIcon name="upload" />
          <span className="truncate">Yükle</span>
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
          className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-gray-600 transition-[color,background-color,transform] hover:bg-white/80 hover:text-gray-900 active:scale-[0.97] dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
          title="Takvime Aktar (.ics)"
        >
          <EventIcon name="calendar" />
          <span className="truncate">Takvim</span>
        </button>

        <button
          onClick={handleShareText}
          className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-gray-600 transition-[color,background-color,transform] hover:bg-white/80 hover:text-gray-900 active:scale-[0.97] dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
          title="WhatsApp / Metin Olarak Paylaş"
        >
          <EventIcon name="share" />
          <span className="truncate">Paylaş</span>
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
                className="w-full rounded-2xl border border-black/[0.04] bg-white p-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition-colors dark:border-white/10 dark:bg-[#1C1C1E]"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-1 w-full min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs font-semibold text-gray-400">
                        {formatEventDate(event.date)} {event.time ? `· ${event.time}` : ''}
                      </span>
                      <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${countdown.color}`}>
                        <EventIcon name="hourglass" className="h-3 w-3" />
                        {countdown.text}
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
                    {event.location && (
                      <p className="flex items-center gap-1 text-[11px] font-medium text-gray-400">
                        <EventIcon name="location" className="h-3 w-3" />
                        {event.location}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-start">
                    {isCustom && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenEditEvent(event)}
                          className="p-1 text-gray-400 transition-colors hover:text-blue-500"
                          title="Etkinliği Düzenle"
                          aria-label={`${event.title} etkinliğini düzenle`}
                        >
                          <EventIcon name="edit" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteEvent(event.id)}
                          className="p-1 text-gray-400 hover:text-rose-500 transition-colors text-xs"
                          title="Etkinliği Sil"
                          aria-label={`${event.title} etkinliğini sil`}
                        >
                          <EventIcon name="trash" className="h-4 w-4" />
                        </button>
                      </>
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
                {editingEventId ? 'Etkinliği Düzenle' : 'Yeni Etkinlik Ekle'}
              </h3>
              <button
                onClick={handleCloseEventModal}
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
                  <option value="holiday">TATİL</option>
                  <option value="commemoration">ANMA</option>
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
                  onClick={handleCloseEventModal}
                  className="flex-1 py-2 rounded-xl font-bold bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl font-bold bg-[#D94B55] text-white hover:bg-[#c03d47]"
                >
                  {editingEventId ? 'Değişiklikleri Kaydet' : 'Kaydet'}
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
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#D94B55]/10 text-[#D94B55]">
              <EventIcon name="bell" className="h-6 w-6" />
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
