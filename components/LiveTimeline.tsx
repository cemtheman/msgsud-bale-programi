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
  academic: {
    bg: 'bg-[#F4E8B8] dark:bg-[#3A321A]',
    border: 'border-[#D6BC63] dark:border-amber-200/35',
    text: 'text-[#50451F] dark:text-amber-50',
  },
  dance: {
    bg: 'bg-[#CFE8E5] dark:bg-[#183A37]',
    border: 'border-[#76AAA5] dark:border-teal-200/35',
    text: 'text-[#244A47] dark:text-teal-50',
  },
  other: {
    bg: 'bg-[#DDE3EC] dark:bg-[#27303A]',
    border: 'border-[#9AAABD] dark:border-slate-200/35',
    text: 'text-[#364454] dark:text-slate-50',
  },
};

export function LiveTimeline({ lessons, currentMinutes, onSelectLesson }: LiveTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nowMarkerRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolledRef = useRef(false);

  const containerHeight = TOTAL_MINUTES * PX_PER_MINUTE;
  const nowY = (currentMinutes - START_MINUTES) * PX_PER_MINUTE;

  // Otomatik scroll: Ekran açıldığında "Şimdi" çizgisine odaklan
  useEffect(() => {
    if (
      !hasAutoScrolledRef.current &&
      nowMarkerRef.current &&
      currentMinutes >= START_MINUTES &&
      currentMinutes <= END_HOUR * 60
    ) {
      hasAutoScrolledRef.current = true;
      nowMarkerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentMinutes]);

  return (
    <div className="relative w-full bg-white dark:bg-[#1C1C1E] rounded-2xl border border-black/10 dark:border-white/10 p-4 overflow-x-hidden">
      <div ref={containerRef} className="relative w-full" style={{ height: `${containerHeight}px` }}>
        
        {/* Saat Izgarası (Grid Lines) */}
        {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, idx) => {
          const hour = START_HOUR + idx;
          const topPx = idx * 60 * PX_PER_MINUTE;
          return (
            <div
              key={hour}
              className="absolute left-0 right-0 border-b border-gray-100 dark:border-white/10 flex items-center"
              style={{ top: `${topPx}px` }}
            >
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 w-10">
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
              className={`absolute left-12 right-0 z-10 rounded-xl border p-2 text-xs cursor-pointer shadow-sm overflow-hidden ${style.bg} ${style.border} ${style.text}`}
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
            className="absolute left-11 right-0 z-20 flex items-center pointer-events-none"
            style={{ top: `${nowY}px` }}
          >
            <div className="animate-ballerina-hop -ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/95 dark:bg-[#1C1C1E]/95 shadow-sm ring-1 ring-[#D94B55]/25">
              <svg
                viewBox="0 0 32 32"
                className="h-6 w-6 text-[#D94B55]"
                aria-hidden="true"
              >
                <circle cx="16" cy="5.5" r="3" fill="currentColor" />
                <path d="M14.4 9h3.2l1.1 7.2 4.6 3.1-1.5 2.1-5.8-3.2-5.8 3.2-1.5-2.1 4.6-3.1L14.4 9Z" fill="currentColor" />
                <path d="M13.7 10.5 7.5 14M18.3 10.5l6.2-3.7M15 17.2l-2 9.3M17 17.2l5 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                <path d="m10.8 27 2.4-.5M21.8 25.2l2 1.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </div>
            <div className="h-[2px] w-full bg-[#D94B55]" />
          </div>
        )}
      </div>
    </div>
  );
}
