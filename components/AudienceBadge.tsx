import type { Lesson } from '@/types/schedule';

const LABELS = {
  SECTION: 'Tüm sınıf',
  BALLET: 'Bale',
  MUSIC: 'Müzik',
} as const;

export function AudienceBadge({ lesson }: { lesson: Lesson }) {
  if (lesson.target === 'SECTION' && lesson.sessionType === 'STANDARD' && !lesson.subgroup) return null;
  if (lesson.target === 'SECTION' && lesson.subgroup) {
    return (
      <span className="rounded-full bg-[#D94B55]/10 px-2 py-0.5 text-[10px] font-extrabold text-[#D94B55] dark:text-rose-300">
        {lesson.subgroup}
      </span>
    );
  }
  const suffix = lesson.subgroup ? ` · ${lesson.subgroup}` : '';

  return (
    <span className="rounded-full bg-[#D94B55]/10 px-2 py-0.5 text-[10px] font-extrabold text-[#D94B55] dark:text-rose-300">
      {LABELS[lesson.target]}{suffix}
    </span>
  );
}

