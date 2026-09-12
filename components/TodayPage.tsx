import { ComputedStatus, Lesson } from '@/types/schedule';
import { StatusCard } from './StatusCard';
import { LessonCard } from './LessonCard';
import { Header } from './Header';

interface TodayPageProps {
  formattedDate: string;
  formattedTime: string;
  status: ComputedStatus;
  todayLessons: Lesson[];
  currentMinutes: number;
  onSelectLesson: (lesson: Lesson) => void;
  onOpenTimeline: () => void;
}

export function TodayPage({
  formattedDate,
  formattedTime,
  status,
  todayLessons,
  currentMinutes,
  onSelectLesson,
  onOpenTimeline,
}: TodayPageProps) {
  return (
    <div className="space-y-6">
      {/* Üst Header */}
      <Header formattedDate={formattedDate} formattedTime={formattedTime} />

      {/* Durum Kartı */}
      <StatusCard status={status} />

      {/* Bugünün Programı Listesi */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Bugünün Programı
        </h2>

        {todayLessons.length === 0 ? (
          <div className="py-12 text-center text-sm font-medium text-gray-400 dark:text-gray-500">
            Bugün için kayıtlı ders bulunmuyor.
          </div>
        ) : (
          <div className="space-y-2">
            {todayLessons.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                currentMinutes={currentMinutes}
                onClick={() => onSelectLesson(lesson)}
              />
            ))}
          </div>
        )}

        {todayLessons.length > 0 && (
          <button
            onClick={onOpenTimeline}
            className="w-full py-3 mt-2 bg-white dark:bg-[#1C1C1E] border border-black/5 dark:border-white/10 rounded-2xl text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#252525] transition-all shadow-sm"
          >
            Canlı Zaman Çizelgesi →
          </button>
        )}
      </div>
    </div>
  );
}