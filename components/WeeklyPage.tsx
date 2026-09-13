'use client';

import { useState } from 'react';
import { subjectCategories } from '@/data/scheduleData';
import { DayKey, Lesson } from '@/types/schedule';
import { useTheme } from '@/hooks/useTheme';
import { getLessonsForDay } from '@/utils/schedule';

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'monday', label: 'Pazartesi' },
  { key: 'tuesday', label: 'Salı' },
  { key: 'wednesday', label: 'Çarşamba' },
  { key: 'thursday', label: 'Perşembe' },
  { key: 'friday', label: 'Cuma' },
];

interface WeeklyPageProps {
  todayDayKey?: DayKey;
  onSelectLesson?: (lesson: Lesson) => void;
}

export function WeeklyPage({ todayDayKey, onSelectLesson }: WeeklyPageProps) {
  const [selectedDay, setSelectedDay] = useState<DayKey>(
    todayDayKey && ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(todayDayKey)
      ? todayDayKey
      : 'monday'
  );
  
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const rawLessons = getLessonsForDay(selectedDay);

  return (
    <div className="space-y-6">
      {/* Header & Gece/Gündüz Selektörü */}
      <div className="flex justify-between items-center">
        <div>
          <h1 
            className="text-xl font-black tracking-tight"
            style={{ color: isDark ? '#FFFFFF' : '#111827' }}
          >
            Haftalık Program
          </h1>
          <p className="text-xs font-semibold text-gray-400">
            MSGSÜ Bale Anasanat Dalı
          </p>
        </div>

        {/* Tema Değiştirme Butonu */}
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-2xl bg-gray-200/60 dark:bg-white/10 text-xs transition-transform active:scale-95 shadow-sm"
          aria-label="Tema Değiştir"
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Gün Seçici Sekmeler (Day Tabs) */}
      <div
        className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar"
        aria-label="Haftanın günleri; diğer günler için yatay kaydırın"
      >
        {DAYS.map((day) => {
          const isActive = selectedDay === day.key;
          return (
            <button
              key={day.key}
              onClick={() => setSelectedDay(day.key)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[#D94B55] text-white shadow-sm'
                  : 'bg-white dark:bg-[#1C1C1E] text-gray-600 dark:text-gray-400 border border-black/5 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-[#252525]'
              }`}
              style={isActive ? { color: '#FFFFFF' } : undefined}
            >
              {day.label}
            </button>
          );
        })}
      </div>

      {/* Seçilen Günün Ders Listesi */}
      <div className="space-y-2">
        {rawLessons.length === 0 ? (
          <div className="py-12 text-center text-sm font-medium text-gray-400 dark:text-gray-500">
            Bu gün için tanımlı ders bulunmuyor.
          </div>
        ) : (
          rawLessons.map((lessonItem: Lesson) => {

            const category = subjectCategories[lessonItem.subject] || 'other';
            const isDance = category === 'dance';

            return (
              <div
                key={lessonItem.id}
                onClick={() => onSelectLesson?.(lessonItem)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  isDance
                    ? 'bg-rose-50/40 dark:bg-[#2A181A] border-rose-100 dark:border-rose-900/30'
                    : 'bg-white dark:bg-[#1C1C1E] border-black/5 dark:border-white/10'
                } hover:border-black/10 dark:hover:border-white/20`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 
                        className="text-sm font-bold"
                        style={{ color: isDark ? '#FFFFFF' : '#111827' }}
                      >
                        {lessonItem.subject}
                      </h3>
                      {isDance && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#D94B55]/10 text-[#D94B55]">
                          Bale
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {lessonItem.teacher ? `${lessonItem.teacher} · ` : ''}
                      {lessonItem.location || 'Derslik Belirtilmedi'}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-400 bg-gray-100 dark:bg-white/5 px-2.5 py-1 rounded-lg">
                    {lessonItem.start} - {lessonItem.end}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
