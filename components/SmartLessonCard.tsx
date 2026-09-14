import type { ComputedStatus } from '@/types/schedule';
import { formatDuration } from '@/utils/dayProgress';
import { getLiveCardPresentation, type LiveCardMode } from '@/utils/liveCard';

interface SmartLessonCardProps {
  status: ComputedStatus;
}

const CARD_STYLES: Record<LiveCardMode, string> = {
  calm: 'border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-white/[0.04]',
  upcoming: 'border-amber-300/60 bg-gradient-to-br from-amber-400/15 via-rose-500/5 to-transparent dark:border-amber-400/30 dark:from-amber-400/15 dark:via-rose-950/20',
  live: 'border-emerald-400/40 bg-gradient-to-br from-emerald-400/15 via-emerald-500/5 to-transparent dark:border-emerald-400/30 dark:from-emerald-400/20 dark:via-emerald-950/20',
  complete: 'border-emerald-300/40 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-950/15',
};

const ACCENT_STYLES: Record<LiveCardMode, string> = {
  calm: 'text-slate-500 dark:text-slate-400',
  upcoming: 'text-[#D94B55] dark:text-rose-400',
  live: 'text-emerald-700 dark:text-emerald-400',
  complete: 'text-emerald-700 dark:text-emerald-400',
};

const DOT_STYLES: Record<LiveCardMode, string> = {
  calm: 'bg-slate-400',
  upcoming: 'bg-amber-500',
  live: 'bg-emerald-500',
  complete: 'bg-emerald-500',
};

export function SmartLessonCard({ status }: SmartLessonCardProps) {
  const presentation = getLiveCardPresentation(status);
  const activeLesson = status.currentLesson ?? status.nextLesson;
  const showPulse = presentation.mode === 'upcoming' || presentation.mode === 'live';

  const timeSummary = status.currentLesson
    ? `${status.minutesPassed ?? 0} dakika geçti · ${status.minutesRemaining ?? 0} dakika kaldı`
    : activeLesson && status.minutesUntilNext !== undefined
      ? `${formatDuration(status.minutesUntilNext)} kaldı`
      : undefined;

  return (
    <section
      className={`w-full rounded-3xl border shadow-sm backdrop-blur-md ${presentation.compact ? 'p-3.5' : 'p-4'} ${CARD_STYLES[presentation.mode]}`}
      aria-live="polite"
      aria-label="Güncel ders durumu"
    >
      <div className={`flex items-center gap-1.5 ${presentation.compact ? 'mb-1.5' : 'mb-2'}`}>
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          {showPulse && (
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${DOT_STYLES[presentation.mode]}`} />
          )}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${DOT_STYLES[presentation.mode]}`} />
        </span>
        <span className={`text-[11px] font-extrabold uppercase tracking-wider ${ACCENT_STYLES[presentation.mode]}`}>
          {presentation.label}
        </span>
      </div>

      {presentation.mode === 'complete' ? (
        <p className="text-sm font-extrabold text-gray-900 dark:text-white">
          Bugünkü dersler tamamlandı
        </p>
      ) : activeLesson ? (
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="shrink-0 rounded-lg bg-black/5 px-2 py-0.5 text-xs font-bold text-gray-700 dark:bg-white/10 dark:text-gray-300">
              {activeLesson.start} - {activeLesson.end}
            </span>
            <h2 className="min-w-0 break-words text-base font-extrabold text-gray-900 dark:text-white">
              {activeLesson.subject}
            </h2>
          </div>
          {!presentation.compact && (
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {activeLesson.teacher ? `Öğretmen: ${activeLesson.teacher} · ` : ''}
              {activeLesson.location ? `Konum: ${activeLesson.location}` : 'Konum belirtilmedi'}
            </p>
          )}
          {timeSummary && (
            <p className={`text-xs font-extrabold ${presentation.compact ? '' : 'pt-0.5'} ${ACCENT_STYLES[presentation.mode]}`}>
              {timeSummary}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          Bugün için başka ders kalmadı.
        </p>
      )}
    </section>
  );
}
