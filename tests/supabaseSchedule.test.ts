import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchScheduleForClass } from '@/lib/supabaseSchedule';

describe('Supabase program dönüşümü', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('audience ve parallel kayıtlarını kaybetmeden, null odayı güvenle dönüştürür', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-test-key');
    const responses = [
      [{ id: 'group-9b' }],
      [
        {
          id: 'sg-music', target: 'MUSIC', subgroup: 'M2',
          schedule_sessions: {
            id: 'session-music', day_of_week: 1, start_time: '15:30:00', end_time: '16:10:00',
            session_type: 'PARALLEL', notes: null, subjects: { name: 'Müzik Dersi' },
            teachers: { name: 'Öğretmen' }, rooms: { name: 'Müzik Odası' },
          },
        },
        {
          id: 'sg-section', target: 'SECTION', subgroup: null,
          schedule_sessions: {
            id: 'session-math', day_of_week: 1, start_time: '15:30:00', end_time: '16:10:00',
            session_type: 'STANDARD', notes: null, subjects: { name: 'Matematik' },
            teachers: null, rooms: null,
          },
        },
      ],
    ];
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(responses[0]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(responses[1]), { status: 200 })));

    const result = await fetchScheduleForClass('9B');

    expect(result.schedule.monday).toHaveLength(2);
    expect(result.schedule.monday.map((lesson) => lesson.target)).toEqual(['MUSIC', 'SECTION']);
    expect(result.schedule.monday[0]).toMatchObject({ sessionType: 'PARALLEL', subgroup: 'M2' });
    expect(result.schedule.monday[1]).toMatchObject({ subject: 'Matematik', location: undefined });
  });
});

