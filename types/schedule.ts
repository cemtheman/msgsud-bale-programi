export type Category = 'academic' | 'dance' | 'other';

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
  schedule: Record<DayKey, Omit<Lesson, 'id'>[]>;
}

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