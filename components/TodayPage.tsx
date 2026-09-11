import { Lesson, ComputedStatus } from '@/types/schedule';
import { CurrentStatusCard } from './CurrentStatusCard';
import { TodaySchedule } from './TodaySchedule';

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
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-baseline">
        <div>
          <h1 className="text-xl font-bold text-gray-900 capitalize">{formattedDate}</h1>
          <p className="text-xs text-gray-400 font-medium mt-0.5">MSGSÜ Bale Programı</p>
        </div>
        <div className="text-2xl font-extrabold text-gray-900 tracking-tight">{formattedTime}</div>
      </div>

      {/* Durum Kartı */}
      <CurrentStatusCard status={status} onSelectLesson={onSelectLesson} />

      {/* Günlük Ders Listesi */}
      <TodaySchedule
        lessons={todayLessons}
        currentMinutes={currentMinutes}
        onSelectLesson={onSelectLesson}
        onOpenTimeline={onOpenTimeline}
      />
    </div>
  );
}