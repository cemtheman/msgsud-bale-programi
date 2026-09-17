'use client';

import { useEffect } from 'react';
import type { Lesson } from '@/types/schedule';
import { LiveTimeline } from './LiveTimeline';

interface TimelineSheetProps {
  lessons: Lesson[];
  currentMinutes: number;
  onClose: () => void;
  onSelectLesson: (lesson: Lesson) => void;
}

export function TimelineSheet({
  lessons,
  currentMinutes,
  onClose,
  onSelectLesson,
}: TimelineSheetProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="timeline-sheet-title"
        className="flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-[28px] border border-black/10 bg-[#FAFAF8] shadow-2xl dark:border-white/10 dark:bg-[#121212] sm:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-black/5 bg-[#FAFAF8]/95 px-4 pb-3 pt-2 backdrop-blur-md dark:border-white/10 dark:bg-[#121212]/95 sm:pt-4">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-gray-300 dark:bg-white/20 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#D94B55] dark:text-rose-400">
                Gün ilerlemesi
              </p>
              <h2 id="timeline-sheet-title" className="text-base font-extrabold text-gray-900 dark:text-white">
                Canlı Zaman Çizelgesi
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Zaman çizelgesini kapat"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-lg font-semibold text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15 dark:hover:text-white"
            >
              ×
            </button>
          </div>
        </div>

        <div className="overscroll-contain overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <LiveTimeline
            lessons={lessons}
            currentMinutes={currentMinutes}
            onSelectLesson={onSelectLesson}
          />
        </div>
      </section>
    </div>
  );
}
