import { Lesson, Category } from '@/types/schedule';
import { getSubjectCategory } from '@/utils/schedule';

interface LessonCardProps {
  lesson: Lesson;
  status?: 'completed' | 'active' | 'upcoming';
  onClick?: () => void;
}

const CATEGORY_STYLES: Record<Category, { bg: string; border: string; text: string }> = {
  academic: { bg: 'bg-[#F4E8B8]', border: 'border-[#D6BC63]', text: 'text-[#50451F]' },
  dance: { bg: 'bg-[#CFE8E5]', border: 'border-[#76AAA5]', text: 'text-[#244A47]' },
  other: { bg: 'bg-[#DDE3EC]', border: 'border-[#9AAABD]', text: 'text-[#364454]' },
};

export function LessonCard({ lesson, status = 'upcoming', onClick }: LessonCardProps) {
  const category = getSubjectCategory(lesson.subject);
  const style = CATEGORY_STYLES[category];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl p-4 border transition-all active:scale-[0.98] ${style.bg} ${style.border} ${style.text} ${
        status === 'completed' ? 'opacity-50' : 'opacity-100'
      } ${status === 'active' ? 'ring-2 ring-[#D94B55] ring-offset-2' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span>{lesson.start} — {lesson.end}</span>
          {status === 'completed' && <span className="text-xs">✓</span>}
          {status === 'active' && <span className="text-xs text-[#D94B55]">●</span>}
        </div>
        {lesson.location && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-white/50 border border-black/5">
            {lesson.location}
          </span>
        )}
      </div>

      <div className="mt-1 text-base font-bold leading-tight">{lesson.subject}</div>

      {lesson.teacher && (
        <div className="mt-1 text-xs opacity-80">{lesson.teacher}</div>
      )}
    </button>
  );
}