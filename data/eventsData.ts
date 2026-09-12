export interface SpecialEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string;
  type: 'exam' | 'performance' | 'rehearsal' | 'holiday';
  location?: string;
  description?: string;
}

export const eventTypeLabels: Record<SpecialEvent['type'], { label: string; bg: string; text: string }> = {
  exam: { label: 'SINAV', bg: 'bg-amber-500/10 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
  performance: { label: 'TEMSİL', bg: 'bg-rose-500/10 dark:bg-rose-500/20', text: 'text-rose-600 dark:text-rose-400' },
  rehearsal: { label: 'PROVA', bg: 'bg-purple-500/10 dark:bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400' },
  holiday: { label: 'TATİL', bg: 'bg-blue-500/10 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400' },
};

export const specialEvents: SpecialEvent[] = [
  {
    id: '1',
    title: 'Genel Prova - Fındıkkıran',
    date: '2026-09-25',
    time: '14:00',
    type: 'rehearsal',
    location: 'Ana Sahne',
    description: 'Tüm kadro kostümlü katılım zorunludur.',
  },
  {
    id: '2',
    title: 'Yıl İçi Sahne Temsili',
    date: '2026-10-12',
    time: '19:00',
    type: 'performance',
    location: 'MSGSÜ Kültür Merkezi',
  },
  {
    id: '3',
    title: 'Cumhuriyet Bayramı Tatili',
    date: '2026-10-29',
    type: 'holiday',
  },
];