import { useEffect, useRef } from 'react';
import { Lesson } from '@/types/schedule';
import { timeStringToMinutes } from '@/utils/time';
import { getSubjectCategory } from '@/utils/schedule';
import { getTimelineEndHour } from '@/utils/timeline';
import { schoolConfig } from '@/data/scheduleData';
import { AudienceBadge } from './AudienceBadge';

interface LiveTimelineProps {
  lessons: Lesson[];
  currentMinutes: number;
  onSelectLesson: (lesson: Lesson) => void;
}

// 1 dakika = 1.4px
const PX_PER_MINUTE = 1.4;
const START_HOUR = 8; // Timeline 08:00'de başlar
const START_MINUTES = START_HOUR * 60;

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

  const endHour = getTimelineEndHour(lessons, START_HOUR);
  const endMinutes = endHour * 60;
  const containerHeight = (endMinutes - START_MINUTES) * PX_PER_MINUTE;
  const nowY = (currentMinutes - START_MINUTES) * PX_PER_MINUTE;
  const lunchBreak = schoolConfig.lunchBreak;
  const lunchStart = timeStringToMinutes(lunchBreak.start);
  const lunchEnd = timeStringToMinutes(lunchBreak.end);

  // Otomatik scroll: Ekran açıldığında "Şimdi" çizgisine odaklan
  useEffect(() => {
    if (
      !hasAutoScrolledRef.current &&
      nowMarkerRef.current &&
      currentMinutes >= START_MINUTES &&
      currentMinutes <= endMinutes
    ) {
      hasAutoScrolledRef.current = true;
      nowMarkerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentMinutes, endMinutes]);

  return (
    <div className="relative w-full bg-white dark:bg-[#1C1C1E] rounded-2xl border border-black/10 dark:border-white/10 p-4 overflow-x-hidden">
      <div ref={containerRef} className="relative w-full" style={{ height: `${containerHeight}px` }}>
        
        {/* Saat Izgarası (Grid Lines) */}
        {Array.from({ length: endHour - START_HOUR + 1 }).map((_, idx) => {
          const hour = START_HOUR + idx;
          const topPx = idx * 60 * PX_PER_MINUTE;
          return (
            <div
              key={hour}
              className="absolute left-0 right-0 flex items-center border-t border-gray-100 dark:border-white/10"
              style={{ top: `${topPx}px` }}
            >
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 w-10">
                {String(hour).padStart(2, '0')}:00
              </span>
            </div>
          );
        })}

        {/* Yemek Arası */}
        {lessons.length > 0 && (
          <div
            className="pointer-events-none absolute left-12 right-0 z-10 overflow-hidden rounded-xl border border-dashed border-amber-300/80 bg-amber-50/75 p-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/25 dark:text-amber-100"
            style={{
              top: `${(lunchStart - START_MINUTES) * PX_PER_MINUTE}px`,
              height: `${(lunchEnd - lunchStart) * PX_PER_MINUTE}px`,
            }}
          >
            <div className="font-bold truncate">🍽️ {lunchBreak.label}</div>
            <div className="text-[10px] opacity-80">
              {lunchBreak.start} - {lunchBreak.end}
            </div>
          </div>
        )}

        {/* Ders Blokları */}
        {lessons.map((lesson) => {
          const startMins = timeStringToMinutes(lesson.start);
          const endMins = timeStringToMinutes(lesson.end);
          const duration = endMins - startMins;

          const top = (startMins - START_MINUTES) * PX_PER_MINUTE;
          const height = duration * PX_PER_MINUTE;
          const category = getSubjectCategory(lesson.subject, lesson.target);
          const style = CATEGORY_STYLES[category];
          const concurrentLessons = lessons.filter(
            (item) => item.start === lesson.start && item.end === lesson.end,
          );
          const concurrentIndex = concurrentLessons.findIndex((item) => item.id === lesson.id);
          const hasConcurrentLesson = concurrentLessons.length > 1;
          const availableWidth = 86;
          const columnWidth = availableWidth / concurrentLessons.length;

          return (
            <div
              key={lesson.id}
              onClick={() => onSelectLesson(lesson)}
              className={`absolute z-10 rounded-xl border p-2 text-xs cursor-pointer shadow-sm overflow-hidden ${hasConcurrentLesson ? '' : 'left-12 right-0 pr-10'} ${style.bg} ${style.border} ${style.text}`}
              style={{
                top: `${top}px`,
                height: `${height}px`,
                ...(hasConcurrentLesson ? {
                  left: `${12 + (concurrentIndex * columnWidth)}%`,
                  width: `calc(${columnWidth}% - 3px)`,
                } : {}),
              }}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="min-w-0 flex-1 truncate font-bold">{lesson.classCode ? `${lesson.classCode} · ${lesson.subject}` : lesson.subject}</div>
                <AudienceBadge lesson={lesson} />
              </div>
              <div className="text-[10px] opacity-80">
                {lesson.start} - {lesson.end} {lesson.location ? `· ${lesson.location}` : ''}
              </div>
            </div>
          );
        })}

        {/* CANLI ŞİMDİ ÇİZGİSİ */}
        {currentMinutes >= START_MINUTES && currentMinutes <= endMinutes && (
          <div
            ref={nowMarkerRef}
            className="pointer-events-none absolute left-0 right-0 z-20 h-px -translate-y-1/2"
            style={{ top: `${nowY}px` }}
          >
            <div className="absolute left-8 top-1/2 h-[2px] w-5 -translate-y-1/2 bg-[#D94B55]" />
            <div className="animate-ballerina-hop absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 dark:bg-[#1C1C1E]/95 shadow-sm ring-1 ring-[#D94B55]/25">
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
          </div>
        )}
      </div>
    </div>
  );
}
