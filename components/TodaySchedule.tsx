import { Lesson } from '@/types/schedule';
import { LessonCard } from './LessonCard';
import { timeStringToMinutes } from '@/utils/time';

interface TodayScheduleProps {
  lessons: Lesson[];
  currentMinutes: number;
  onSelectLesson: (lesson: Lesson) => void;
  onOpenTimeline: () => void;
}

export function TodaySchedule({
  lessons,
  currentMinutes,
  onSelectLesson,
  onOpenTimeline,
}: TodayScheduleProps) {
  if (lessons.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm font-medium">
        Bugün için kayıtlı ders bulunmuyor.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-bold text-gray-900 tracking-tight">Bugünün Programı</div>
      <div className="space-y-2.5">
        {lessons.map((lesson) => {
          const startMins = timeStringToMinutes(lesson.start);
          const endMins = timeStringToMinutes(lesson.end);

          let status: 'completed' | 'active' | 'upcoming' = 'upcoming';
          if (currentMinutes >= endMins) status = 'completed';
          else if (currentMinutes >= startMins && currentMinutes < endMins) status = 'active';

          return (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              status={status}
              onClick={() => onSelectLesson(lesson)}
            />
          );
        })}
      </div>

      <button
        onClick={onOpenTimeline}
        className="w-full py-3 px-4 rounded-xl border border-black/10 bg-white font-semibold text-sm text-gray-700 flex items-center justify-center gap-2 active:bg-gray-50 transition-colors shadow-sm mt-4"
      >
        <span>Canlı Zaman Çizelgesi</span>
        <span>→</span>
      </button>
    </div>
  );
}