import { Lesson } from '@/types/schedule';

interface LessonCardProps {
  lesson: Lesson;
  status?: 'completed' | 'active' | 'upcoming';
  currentMinutes?: number;
  onClick?: () => void;
}

export function LessonCard({ lesson, status, currentMinutes, onClick }: LessonCardProps) {
  return (
    <div 
      onClick={onClick}
      className={`p-4 rounded-2xl border shadow-sm cursor-pointer transition-colors ${
        status === 'active'
          ? 'bg-[#D94B55]/5 border-[#D94B55]/30 dark:bg-[#D94B55]/10 dark:border-[#D94B55]/40'
          : status === 'completed'
          ? 'bg-gray-50/50 dark:bg-[#161618] border-black/5 dark:border-white/5 opacity-60'
          : 'bg-white dark:bg-[#1C1C1E] border-black/5 dark:border-white/10 hover:border-black/10'
      }`}
    >
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{lesson.subject}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {lesson.teacher ? `${lesson.teacher} · ` : ''}{lesson.location || 'Derslik Belirtilmedi'}
          </p>
        </div>
        <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-white/5 px-2.5 py-1 rounded-lg">
          {lesson.start} - {lesson.end}
        </span>
      </div>
    </div>
  );
}