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
      .mockResolvedValueOnce(new Response(JSON.stringify(responses[1]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { runtime_adjustments_required: true },
      ]), { status: 200 })));

    const result = await fetchScheduleForClass('9B');

    expect(result.schedule.monday).toHaveLength(2);
    expect(result.schedule.monday.map((lesson) => lesson.target)).toEqual(['MUSIC', 'SECTION']);
    expect(result.schedule.monday[0]).toMatchObject({ sessionType: 'PARALLEL', subgroup: 'M2' });
    expect(result.schedule.monday[1]).toMatchObject({ subject: 'Matematik', location: undefined });
  });

  it('projection metadata false olduğunda 5A compatibility overlayini yeniden uygulamaz', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public-test-key');

    const rawRows = [
      {
        id: 'sg-conditioning',
        target: 'BALLET',
        subgroup: null,
        schedule_sessions: {
          id: 'session-conditioning',
          day_of_week: 1,
          start_time: '16:20:00',
          end_time: '17:00:00',
          session_type: 'STANDARD',
          notes: null,
          subjects: { name: 'V. Kondisyon' },
          teachers: { name: 'S. Kömürcü' },
          rooms: null,
        },
      },
      {
        id: 'sg-buyg',
        target: 'BALLET',
        subgroup: null,
        schedule_sessions: {
          id: 'session-buyg',
          day_of_week: 4,
          start_time: '17:10:00',
          end_time: '17:50:00',
          session_type: 'STANDARD',
          notes: null,
          subjects: { name: 'B. Uygulama' },
          teachers: null,
          rooms: null,
        },
      },
    ];

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'group-5a' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(rawRows), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { runtime_adjustments_required: false },
      ]), { status: 200 })));

    const result = await fetchScheduleForClass('5A');

    expect(result.schedule.monday).toHaveLength(1);
    expect(result.schedule.monday[0]).toMatchObject({
      subject: 'V. Kondisyon',
      start: '16:20',
      end: '17:00',
      teacher: 'S. Kömürcü',
    });

    expect(result.schedule.thursday).toHaveLength(1);
    expect(result.schedule.thursday[0]).toMatchObject({
      subject: 'B. Uygulama',
      start: '17:10',
    });

    expect(result.schedule.wednesday).toHaveLength(0);
    expect(result.schedule.friday).toHaveLength(0);
  });

});
