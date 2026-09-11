import { useEffect, useRef } from 'react';
import { Lesson } from '@/types/schedule';
import { timeStringToMinutes } from '@/utils/time';
import { getSubjectCategory } from '@/utils/schedule';

interface LiveTimelineProps {
  lessons: Lesson[];
  currentMinutes: number;
  onSelectLesson: (lesson: Lesson) => void;
}

// 1 dakika = 1.4px
const PX_PER_MINUTE = 1.4;
const START_HOUR = 8; // Timeline 08:00'de başlar
const START_MINUTES = START_HOUR * 60;
const END_HOUR = 19;  // Timeline 19:00'da biter
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;

const CATEGORY_STYLES = {
  academic: { bg: 'bg-[#F4E8B8]', border: 'border-[#D6BC63]', text: 'text-[#50451F]' },
  dance: { bg: 'bg-[#CFE8E5]', border: 'border-[#76AAA5]', text: 'text-[#244A47]' },
  other: { bg: 'bg-[#DDE3EC]', border: 'border-[#9AAABD]', text: 'text-[#364454]' },
};

export function LiveTimeline({ lessons, currentMinutes, onSelectLesson }: LiveTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nowMarkerRef = useRef<HTMLDivElement>(null);

  const containerHeight = TOTAL_MINUTES * PX_PER_MINUTE;
  const nowY = (currentMinutes - START_MINUTES) * PX_PER_MINUTE;

  // Otomatik scroll: Ekran açıldığında "Şimdi" çizgisine odaklan
  useEffect(() => {
    if (nowMarkerRef.current && currentMinutes >= START_MINUTES && currentMinutes <= END_HOUR * 60) {
      nowMarkerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  return (
    <div className="relative w-full bg-white rounded-2xl border border-black/10 p-4 overflow-x-hidden">
      <div ref={containerRef} className="relative w-full" style={{ height: `${containerHeight}px` }}>
        
        {/* Saat Izgarası (Grid Lines) */}
        {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, idx) => {
          const hour = START_HOUR + idx;
          const topPx = idx * 60 * PX_PER_MINUTE;
          return (
            <div
              key={hour}
              className="absolute left-0 right-0 border-b border-gray-100 flex items-center"
              style={{ top: `${topPx}px` }}
            >
              <span className="text-[10px] font-semibold text-gray-400 w-10">
                {String(hour).padStart(2, '0')}:00
              </span>
            </div>
          );
        })}

        {/* Ders Blokları */}
        {lessons.map((lesson) => {
          const startMins = timeStringToMinutes(lesson.start);
          const endMins = timeStringToMinutes(lesson.end);
          const duration = endMins - startMins;

          const top = (startMins - START_MINUTES) * PX_PER_MINUTE;
          const height = duration * PX_PER_MINUTE;
          const category = getSubjectCategory(lesson.subject);
          const style = CATEGORY_STYLES[category];

          return (
            <div
              key={lesson.id}
              onClick={() => onSelectLesson(lesson)}
              className={`absolute left-12 right-0 rounded-xl border p-2 text-xs cursor-pointer shadow-sm overflow-hidden ${style.bg} ${style.border} ${style.text}`}
              style={{ top: `${top}px`, height: `${height}px` }}
            >
              <div className="font-bold truncate">{lesson.subject}</div>
              <div className="text-[10px] opacity-80">
                {lesson.start} - {lesson.end} {lesson.location ? `· ${lesson.location}` : ''}
              </div>
            </div>
          );
        })}

        {/* CANLI ŞİMDİ ÇİZGİSİ */}
        {currentMinutes >= START_MINUTES && currentMinutes <= END_HOUR * 60 && (
          <div
            ref={nowMarkerRef}
            className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
            style={{ top: `${nowY}px` }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[#D94B55] -ml-1 border-2 border-white shadow-sm" />
            <div className="h-[2px] w-full bg-[#D94B55]" />
          </div>
        )}
      </div>
    </div>
  );
}