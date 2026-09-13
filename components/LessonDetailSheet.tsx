import { useEffect } from 'react';
import { Lesson, ComputedStatus } from '@/types/schedule';
import { getSubjectCategory } from '@/utils/schedule';
import { timeStringToMinutes } from '@/utils/time';

interface LessonDetailSheetProps {
  lesson: Lesson | null;
  status: ComputedStatus;
  onClose: () => void;
}

export function LessonDetailSheet({ lesson, status, onClose }: LessonDetailSheetProps) {
  // ESC tuşu ile kapatma
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!lesson) return null;

  const startMins = timeStringToMinutes(lesson.start);
  const endMins = timeStringToMinutes(lesson.end);
  const duration = endMins - startMins;

  const isActive = status.type === 'in_lesson' && status.currentLesson?.id === lesson.id;
  const categoryLabels = { academic: 'Akademik', dance: 'Dans', other: 'Diğer' } as const;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md bg-white rounded-t-3xl p-6 shadow-2xl space-y-5 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto" />

        <div className="flex justify-between items-start">
          <div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 uppercase">
              {categoryLabels[getSubjectCategory(lesson.subject)]}
            </span>
            <h3 className="text-2xl font-bold text-gray-900 mt-2">{lesson.subject}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <div className="text-xs text-gray-400">Saat</div>
            <div className="font-bold text-gray-800">{lesson.start} — {lesson.end}</div>
          </div>
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
            <div className="text-xs text-gray-400">Süre</div>
            <div className="font-bold text-gray-800">{duration} dakika</div>
          </div>
          {lesson.location && (
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
              <div className="text-xs text-gray-400">Salon / Sınıf</div>
              <div className="font-bold text-gray-800">{lesson.location}</div>
            </div>
          )}
          {lesson.teacher && (
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
              <div className="text-xs text-gray-400">Öğretmen</div>
              <div className="font-bold text-gray-800">{lesson.teacher}</div>
            </div>
          )}
        </div>

        {isActive && (
          <div className="space-y-2 bg-red-50 p-4 rounded-xl border border-red-100">
            <div className="text-xs font-bold text-[#D94B55] uppercase">Şu Anda Bu Derstesiniz</div>
            <div className="w-full bg-red-200/50 h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#D94B55] h-full rounded-full transition-all"
                style={{ width: `${status.progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs font-semibold text-gray-600">
              <span>{status.minutesPassed} dk geçti</span>
              <span>{status.minutesRemaining} dk kaldı</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
