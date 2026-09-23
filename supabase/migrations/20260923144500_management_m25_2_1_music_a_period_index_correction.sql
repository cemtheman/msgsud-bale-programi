-- Management / M25.2.1
-- Correct Music-A source period indexing after the lunch break.
--
-- ROOT CAUSE
--   M25.2 normalized source clock times correctly but mapped post-lunch slots
--   one period too high. The canonical timetable period map is:
--     1  08:20-09:00
--     2  09:10-09:50
--     3  10:00-10:40
--     4  10:50-11:30
--     5  11:40-12:20
--     6  13:00-13:40
--     7  13:50-14:30
--     8  14:40-15:20
--     9  15:30-16:10
--    10  16:20-17:00
--    11  17:10-17:50
--    12  18:00-18:40
--
-- M25.2 used 7 for 13:00, 8 for 13:50, etc. This migration corrects
-- ONLY the normalized evidence rows. It does not change requirements, cards,
-- placements, move history, or the public schedule.
--
-- APPLIED MIGRATIONS ARE IMMUTABLE:
--   M25.2 remains unchanged.

begin;

do $$
declare
  v_requirement_set_id uuid;
  v_revision_id uuid;
  v_shifted_schedule_count integer;
  v_shifted_period_count integer;
  v_diag jsonb;
begin
  select
    revision.requirement_set_id,
    revision.id
  into
    v_requirement_set_id,
    v_revision_id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
    and requirement_set.status = 'DRAFT'
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1
  for update of revision, requirement_set;

  if v_revision_id is null then
    raise exception 'M25.2.1 requires the active 2026-2027 term-1 DRAFT';
  end if;

  if v_revision_id <>
       '02a42aa9-b6e1-47e2-8e4d-188d5dcfd0b5'::uuid then
    raise exception
      'M25.2.1 unexpected active DRAFT revision: %',
      v_revision_id;
  end if;

  if coalesce(
    (
      select revision.validation_summary
        ->> 'm25_2_music_a_source_normalization'
      from public.schedule_revisions revision
      where revision.id = v_revision_id
    ),
    ''
  ) <> 'PASS' then
    raise exception 'M25.2.1 requires M25.2 PASS';
  end if;

  if (
    select count(*)
    from public.schedule_cards card
    where card.schedule_revision_id = v_revision_id
  ) <> 299
  or (
    select count(*)
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    where card.schedule_revision_id = v_revision_id
  ) <> 299
  or (
    select count(*)
    from public.move_transactions move
    where move.schedule_revision_id = v_revision_id
  ) <> 0 then
    raise exception 'M25.2.1 clean DRAFT baseline drift';
  end if;

  if public.management_public_sessions_hash('2026-2027')
       <> 'a0bb49d37440119271457d0f678456d4'
     or public.management_public_groups_hash('2026-2027')
       <> 'e9ff78dfe6bc55cc98c5aa589a80142e' then
    raise exception 'M25.2.1 public baseline drift';
  end if;

  if (
    select count(*)
    from public.management_source_schedule_evidence evidence
    where evidence.requirement_set_id = v_requirement_set_id
      and evidence.source_document =
        '(MÜZİK) A ŞUBESİ DERS PROGRAMI.pdf'
  ) <> 29
  or (
    select coalesce(sum(evidence.source_period_count), 0)
    from public.management_source_schedule_evidence evidence
    where evidence.requirement_set_id = v_requirement_set_id
      and evidence.source_document =
        '(MÜZİK) A ŞUBESİ DERS PROGRAMI.pdf'
  ) <> 96 then
    raise exception 'M25.2.1 Music-A source cardinality drift';
  end if;

  select count(*)
  into v_shifted_period_count
  from public.management_source_schedule_evidence evidence
  cross join lateral jsonb_array_elements(evidence.source_schedule) unit
  where evidence.requirement_set_id = v_requirement_set_id
    and evidence.source_document =
      '(MÜZİK) A ŞUBESİ DERS PROGRAMI.pdf'
    and (unit ->> 'p')::integer >= 7;

  select count(*)
  into v_shifted_schedule_count
  from public.management_source_schedule_evidence evidence
  where evidence.requirement_set_id = v_requirement_set_id
    and evidence.source_document =
      '(MÜZİK) A ŞUBESİ DERS PROGRAMI.pdf'
    and exists (
      select 1
      from jsonb_array_elements(evidence.source_schedule) unit
      where (unit ->> 'p')::integer >= 7
    );

  if v_shifted_schedule_count <> 10
     or v_shifted_period_count <> 30 then
    raise exception
      'M25.2.1 unexpected correction scope: schedules %, periods %',
      v_shifted_schedule_count,
      v_shifted_period_count;
  end if;

  update public.management_source_schedule_evidence evidence
  set source_schedule = (
    select jsonb_agg(
      case
        when (unit.value ->> 'p')::integer >= 7 then
          jsonb_set(
            unit.value,
            '{p}',
            to_jsonb((unit.value ->> 'p')::integer - 1),
            false
          )
        else unit.value
      end
      order by unit.ordinality
    )
    from jsonb_array_elements(evidence.source_schedule)
      with ordinality as unit(value, ordinality)
  )
  where evidence.requirement_set_id = v_requirement_set_id
    and evidence.source_document =
      '(MÜZİK) A ŞUBESİ DERS PROGRAMI.pdf'
    and exists (
      select 1
      from jsonb_array_elements(evidence.source_schedule) unit
      where (unit ->> 'p')::integer >= 7
    );

  if not exists (
    select 1
    from public.management_source_schedule_evidence evidence
    where evidence.requirement_set_id = v_requirement_set_id
      and evidence.source_document =
        '(MÜZİK) A ŞUBESİ DERS PROGRAMI.pdf'
      and evidence.grade = 10
      and evidence.section = 'A'
      and evidence.audience_target = 'MUSIC'
      and evidence.subject_name = 'Müzik Teorisi'
      and evidence.reconciliation_strategy = 'EXPLICIT_SCHEDULE'
      and evidence.source_schedule =
        '[{"d":5,"p":6,"r":"A105"},{"d":5,"p":7,"r":"A105"}]'::jsonb
  ) then
    raise exception
      'M25.2.1 corrected 10A Müzik Teorisi schedule is missing';
  end if;

  v_diag := public.management_music_a_reconciliation_diagnostic();

  if coalesce((v_diag ->> 'sourceRequirementCount')::integer, -1) <> 29
     or coalesce((v_diag ->> 'sourcePeriodCount')::integer, -1) <> 96
     or coalesce((v_diag ->> 'counterpartRequirementCount')::integer, -1) <> 28
     or coalesce((v_diag ->> 'counterpartExactMatchCount')::integer, -1) <> 28
     or coalesce((v_diag ->> 'counterpartMismatchCount')::integer, -1) <> 0
     or coalesce((v_diag ->> 'draftCardCount')::integer, -1) <> 299
     or coalesce((v_diag ->> 'draftPlacementCount')::integer, -1) <> 299
     or v_diag ->> 'publicSessionsHash'
       <> 'a0bb49d37440119271457d0f678456d4'
     or v_diag ->> 'publicGroupsHash'
       <> 'e9ff78dfe6bc55cc98c5aa589a80142e' then
    raise exception
      'M25.2.1 post-correction diagnostic mismatch: %',
      v_diag;
  end if;

  update public.schedule_revisions revision
  set validation_summary =
    coalesce(revision.validation_summary, '{}'::jsonb)
    || jsonb_build_object(
      'm25_2_1_period_index_correction', 'PASS',
      'music_a_corrected_schedule_count', v_shifted_schedule_count,
      'music_a_corrected_period_count', v_shifted_period_count,
      'music_a_counterpart_exact_match_count',
        (v_diag ->> 'counterpartExactMatchCount')::integer,
      'music_a_counterpart_mismatch_count',
        (v_diag ->> 'counterpartMismatchCount')::integer,
      'music_a_custom_group_conflict_card_count',
        (v_diag ->> 'customGroupConflictCardCount')::integer,
      'music_a_custom_room_conflict_card_count',
        (v_diag ->> 'customRoomConflictCardCount')::integer,
      'music_a_apply_status', 'PENDING',
      'publication_source_complete', false,
      'public_projection_changed', false
    )
  where revision.id = v_revision_id;
end
$$;

commit;
