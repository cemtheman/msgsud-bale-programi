import type { ComputedStatus } from '@/types/schedule';
import { formatDuration } from './dayProgress';

export type LiveCardMode = 'calm' | 'upcoming' | 'live' | 'complete';

export interface LiveCardPresentation {
  mode: LiveCardMode;
  label: string;
  compact: boolean;
}

export function getLiveCardPresentation(status: ComputedStatus): LiveCardPresentation {
  if (status.type === 'in_lesson') {
    return { mode: 'live', label: 'Şu An Devam Ediyor', compact: false };
  }

  if (status.type === 'finished') {
    return { mode: 'complete', label: 'Gün Tamamlandı', compact: true };
  }

  if (status.minutesUntilNext !== undefined && status.minutesUntilNext <= 60) {
    return { mode: 'upcoming', label: 'Sıradaki Ders', compact: false };
  }

  return {
    mode: 'calm',
    label: status.type === 'before_school' ? 'Bugünün İlk Dersi' : 'Sıradaki Ders',
    compact: true,
  };
}

export function getLiveCardTimeSummary(status: ComputedStatus): string | undefined {
  if (status.currentLesson) {
    return `${status.minutesPassed ?? 0} dakika geçti · ${status.minutesRemaining ?? 0} dakika kaldı`;
  }

  if (status.type === 'lunch' && status.minutesUntilNext !== undefined) {
    return `Yemek arasının bitmesine ${formatDuration(status.minutesUntilNext)} kaldı`;
  }

  if (status.type === 'break' && status.minutesUntilNext !== undefined) {
    return `Teneffüsün bitmesine ${formatDuration(status.minutesUntilNext)} kaldı`;
  }

  if (status.type === 'free_time' && status.nextLesson && status.minutesUntilNext !== undefined) {
    return `Sıradaki derse ${formatDuration(status.minutesUntilNext)} kaldı`;
  }

  if (status.type === 'before_school' && status.nextLesson && status.minutesUntilNext !== undefined) {
    return `İlk derse ${formatDuration(status.minutesUntilNext)} kaldı`;
  }

  if (status.nextLesson && status.minutesUntilNext !== undefined) {
    return `${formatDuration(status.minutesUntilNext)} kaldı`;
  }

  return undefined;
}
