export type Category = 'academic' | 'dance' | 'other';
export type AudienceTarget = 'SECTION' | 'BALLET' | 'MUSIC';
export type SessionType = 'STANDARD' | 'SHARED' | 'PARALLEL';

export type DayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface Lesson {
  id: string;
  start: string; // HH:mm
  end: string;   // HH:mm
  subject: string;
  teacher?: string;
  location?: string;
  target: AudienceTarget;
  sessionType: SessionType;
  subgroup?: string;
  classCode?: ClassCode;
}

export interface TimeBlock {
  start: string;
  end: string;
}

export interface LunchBreak extends TimeBlock {
  label: string;
}

export interface SchoolConfig {
  timezone: string;
  lunchBreak: LunchBreak;
  periods: TimeBlock[];
}

export interface ScheduleData {
  school: SchoolConfig;
  schedule: Record<DayKey, Lesson[]>;
}

export type ClassCode = `${5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}${'A' | 'B'}`;

export type DayStatusType =
  | 'before_school'
  | 'in_lesson'
  | 'break'
  | 'lunch'
  | 'free_time'
  | 'finished'
  | 'no_school';

export interface ComputedStatus {
  type: DayStatusType;
  currentLesson?: Lesson;
  nextLesson?: Lesson;
  nextLessonDayLabel?: string;
  progressPercent?: number;
  minutesPassed?: number;
  minutesRemaining?: number;
  minutesUntilNext?: number;
}
