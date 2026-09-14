import { schoolConfig } from '@/data/scheduleData';
import type {
  AudienceTarget,
  ClassCode,
  DayKey,
  Lesson,
  ScheduleData,
  SessionType,
} from '@/types/schedule';

const ACADEMIC_YEAR = '2026-2027';

const DAY_KEYS: Record<number, DayKey> = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
};

interface NamedRelation {
  name: string;
}

interface SessionRelation {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  session_type: SessionType;
  notes: string | null;
  subjects: NamedRelation;
  teachers: NamedRelation | null;
  rooms: NamedRelation | null;
}

interface SessionGroupRow {
  id: string;
  target: AudienceTarget;
  subgroup: string | null;
  schedule_sessions: SessionRelation;
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase bağlantı ayarları eksik.');
  return { url, key };
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const { url, key } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Program verisi alınamadı (${response.status}).`);
  }

  return response.json() as Promise<T>;
}

function emptySchedule(): ScheduleData['schedule'] {
  return {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };
}

function normalizeTime(value: string): string {
  return value.slice(0, 5);
}

function parseClassCode(classCode: ClassCode) {
  const match = classCode.match(/^(\d{1,2})([AB])$/);
  if (!match) throw new Error('Geçersiz sınıf seçimi.');
  return { grade: Number(match[1]), section: match[2] };
}

export async function fetchScheduleForClass(
  classCode: ClassCode,
  signal?: AbortSignal,
): Promise<ScheduleData> {
  const { grade, section } = parseClassCode(classCode);
  const groupParams = new URLSearchParams({
    academic_year: `eq.${ACADEMIC_YEAR}`,
    grade: `eq.${grade}`,
    section: `eq.${section}`,
    select: 'id',
    limit: '1',
  });
  const groups = await request<Array<{ id: string }>>(`class_groups?${groupParams}`, signal);
  if (!groups[0]) return { school: schoolConfig, schedule: emptySchedule() };

  const sessionParams = new URLSearchParams({
    class_group_id: `eq.${groups[0].id}`,
    select: 'id,target,subgroup,schedule_sessions!inner(id,day_of_week,start_time,end_time,session_type,notes,subjects(name),teachers(name),rooms(name))',
    'schedule_sessions.academic_year': `eq.${ACADEMIC_YEAR}`,
  });
  const rows = await request<SessionGroupRow[]>(`session_groups?${sessionParams}`, signal);
  const schedule = emptySchedule();

  rows.forEach((row) => {
    const session = row.schedule_sessions;
    const dayKey = DAY_KEYS[session.day_of_week];
    if (!dayKey) return;

    const lesson: Lesson = {
      id: `${session.id}-${row.target}-${row.subgroup ?? 'all'}`,
      start: normalizeTime(session.start_time),
      end: normalizeTime(session.end_time),
      subject: session.subjects.name,
      teacher: session.teachers?.name,
      location: session.rooms?.name,
      target: row.target,
      sessionType: session.session_type,
      subgroup: row.subgroup ?? undefined,
    };
    schedule[dayKey].push(lesson);
  });

  Object.values(schedule).forEach((lessons) => lessons.sort((a, b) =>
    a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.target.localeCompare(b.target),
  ));

  return { school: schoolConfig, schedule };
}

export const scheduleCache = {
  key(classCode: ClassCode) {
    return `msgsu-schedule:${ACADEMIC_YEAR}:${classCode}:v1`;
  },
  read(classCode: ClassCode): ScheduleData | null {
    try {
      const value = localStorage.getItem(this.key(classCode));
      return value ? JSON.parse(value) as ScheduleData : null;
    } catch {
      return null;
    }
  },
  write(classCode: ClassCode, data: ScheduleData) {
    try {
      localStorage.setItem(this.key(classCode), JSON.stringify(data));
    } catch {
      // Storage dolu/kapalıysa ağ verisi yine kullanılabilir.
    }
  },
};
