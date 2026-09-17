import { SchoolConfig, Category, AudienceTarget } from '@/types/schedule';

export const subjectCategories: Record<string, Category> = {
  'Türkçe': 'academic',
  'Matematik': 'academic',
  'Fen Bilimleri': 'academic',
  'Sosyal Bilgiler': 'academic',
  'İngilizce': 'academic',
  'Din Kültürü ve Ahlak Bilgisi': 'academic',
  'Klasik Bale': 'dance',
  'Point / Dans T.': 'dance',
  'Ritmik': 'dance',
  'Birlikte Uygulama': 'dance',
  'Vücut Kondisyon': 'dance',
  'Kulüp Dersleri': 'other',
  'Piyano': 'other',
};

export const schoolConfig: SchoolConfig = {
    timezone: 'Europe/Istanbul',
    lunchBreak: {
      start: '12:20',
      end: '13:00',
      label: 'Yemek Arası',
    },
    periods: [
      { start: '08:20', end: '09:00' },
      { start: '09:10', end: '09:50' },
      { start: '10:00', end: '10:40' },
      { start: '10:50', end: '11:30' },
      { start: '11:40', end: '12:20' },
      { start: '13:00', end: '13:40' },
      { start: '13:50', end: '14:30' },
      { start: '14:40', end: '15:20' },
      { start: '15:30', end: '16:10' },
      { start: '16:20', end: '17:00' },
      { start: '17:10', end: '17:50' },
      { start: '18:00', end: '18:40' },
    ],
};

export function getSubjectCategory(subject: string, target?: AudienceTarget): Category {
  if (target === 'BALLET') return 'dance';
  if (target === 'MUSIC') return 'other';
  return subjectCategories[subject] || 'academic';
}
