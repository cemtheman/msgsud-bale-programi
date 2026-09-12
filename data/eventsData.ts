export interface SpecialEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string;
  type: 'exam' | 'performance' | 'rehearsal' | 'holiday' | 'commemoration' | 'special';
  location?: string;
  description?: string;
}

export const eventTypeLabels: Record<SpecialEvent['type'], { label: string; bg: string; text: string }> = {
  exam: { label: 'SINAV', bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
  performance: { label: 'TEMSİL', bg: 'bg-rose-500/10 dark:bg-rose-500/20', text: 'text-rose-600 dark:text-rose-400' },
  rehearsal: { label: 'PROVA', bg: 'bg-purple-500/10 dark:bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400' },
  holiday: { label: 'TATİL', bg: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400' },
  commemoration: { label: 'ANMA', bg: 'bg-slate-500/10 dark:bg-slate-500/20', text: 'text-slate-600 dark:text-slate-400' },
  special: { label: 'ÖZEL GÜN', bg: 'bg-indigo-500/10 dark:bg-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400' },
};

export const specialEvents: SpecialEvent[] = [];