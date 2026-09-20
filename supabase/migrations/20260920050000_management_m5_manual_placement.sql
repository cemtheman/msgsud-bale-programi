-- Management v0.1 / M5
-- Manual placement + USER move transaction + deterministic candidate refresh.
-- No forced propagation, auto-placement, undo, or publish action.

begin;

create or replace function public.place_management_card(
  p_card_id uuid,
  p_day_of_week smallint,
  p_start_period smallint,
  p_teacher_id uuid,
  p_room_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_revision_id uuid;
  v_revision_status text;
  v_candidate_id uuid;
  v_candidate_status text;
  v_reason_codes text[];
  v_transaction_id uuid;
begin
  if p_card_id is null then
    raise exception 'M5 manual placement requires card_id';
  end if;

  if p_day_of_week is null or p_day_of_week < 1 or p_day_of_week > 5 then
    raise exception 'M5 manual placement requires day_of_week 1..5';
  end if;

  if p_start_period is null or p_start_period < 1 or p_start_period > 12 then
    raise exception 'M5 manual placement requires start_period 1..12';
  end if;

  if p_teacher_id is null or p_room_id is null then
    raise exception 'M5 manual placement requires resolved teacher and room';
  end if;

  -- Serialize manual writes per draft revision so candidate validation cannot
  -- race another manual placement in the same schedule.
  select revision.id, revision.status
  into v_revision_id, v_revision_status
  from public.schedule_cards card
  join public.schedule_revisions revision
    on revision.id = card.schedule_revision_id
  where card.id = p_card_id
  for update of revision;

  if v_revision_id is null then
    raise exception 'M5 card not found: %', p_card_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M5 card belongs to non-DRAFT revision: %', v_revision_status;
  end if;

  if exists (
    select 1
    from public.placements placement
    where placement.card_id = p_card_id
  ) then
    raise exception 'M5 card is already placed: %', p_card_id;
  end if;

  -- Candidate data is derived state. Refresh immediately before accepting the
  -- human move so the exact drop is checked against current draft occupancy.
  perform public.refresh_management_candidate_domain(v_revision_id);

  select
    assessment.id,
    assessment.status,
    assessment.reason_codes
  into
    v_candidate_id,
    v_candidate_status,
    v_reason_codes
  from public.schedule_card_candidate_assessments assessment
  where assessment.card_id = p_card_id
    and assessment.day_of_week = p_day_of_week
    and assessment.start_period = p_start_period
    and assessment.teacher_id = p_teacher_id
    and assessment.room_id = p_room_id;

  if v_candidate_id is null then
    raise exception
      'M5 candidate not found for card %, day %, period %, teacher %, room %',
      p_card_id,
      p_day_of_week,
      p_start_period,
      p_teacher_id,
      p_room_id;
  end if;

  if v_candidate_status <> 'VALID' then
    raise exception
      'M5 candidate is %, reasons %',
      v_candidate_status,
      coalesce(v_reason_codes, array[]::text[]);
  end if;

  insert into public.move_transactions (
    schedule_revision_id,
    root_transaction_id,
    parent_transaction_id,
    actor_type,
    action,
    payload
  )
  values (
    v_revision_id,
    null,
    null,
    'USER',
    'PLACE',
    jsonb_build_object(
      'source', 'MANUAL',
      'engine_version', 'M5-v0.1',
      'candidate_assessment_id', v_candidate_id,
      'card_id', p_card_id,
      'before', null,
      'after', jsonb_build_object(
        'day_of_week', p_day_of_week,
        'start_period', p_start_period,
        'teacher_id', p_teacher_id,
        'room_id', p_room_id
      )
    )
  )
  returning id into v_transaction_id;

  insert into public.placements (
    card_id,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    move_transaction_id
  )
  values (
    p_card_id,
    p_day_of_week,
    p_start_period,
    p_teacher_id,
    p_room_id,
    v_transaction_id
  );

  -- Recompute all domains after the human move. M5 deliberately stops here:
  -- forced domains may appear, but no AUTO transaction or placement is created.
  perform public.refresh_management_candidate_domain(v_revision_id);

  return v_transaction_id;
end
$$;

comment on function public.place_management_card(uuid, smallint, smallint, uuid, uuid) is
  'M5 manual PLACE command. Accepts only an exact current VALID candidate, writes one USER transaction and one placement atomically, then refreshes candidate domains. No forced propagation.';

-- Management authentication/RBAC is intentionally deferred. Keep the write
-- command unavailable to browser roles until a later explicit grant.
revoke all
  on function public.place_management_card(uuid, smallint, smallint, uuid, uuid)
  from public;

-- Lock migration to the M4 state that was live-validated.
do $$
declare
  v_revision_id uuid;
  v_revision_count integer;
  v_card_count integer;
  v_summary_count integer;
  v_assessment_count integer;
  v_placement_count integer;
  v_transaction_count integer;
begin
  select count(*)
  into v_revision_count
  from public.schedule_revisions
  where status = 'DRAFT'
    and version_number = 1;

  if v_revision_count <> 1 then
    raise exception 'M5 expected one v1 DRAFT revision, found %', v_revision_count;
  end if;

  select revision.id
  into v_revision_id
  from public.schedule_revisions revision
  where revision.status = 'DRAFT'
    and revision.version_number = 1;

  select count(*)
  into v_card_count
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id;

  if v_card_count <> 289 then
    raise exception 'M5 expected 289 cards, found %', v_card_count;
  end if;

  select count(*)
  into v_summary_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card on card.id = summary.card_id
  where card.schedule_revision_id = v_revision_id;

  if v_summary_count <> 289 then
    raise exception 'M5 expected 289 domain summaries, found %', v_summary_count;
  end if;

  select count(*)
  into v_assessment_count
  from public.schedule_card_candidate_assessments assessment
  join public.schedule_cards card on card.id = assessment.card_id
  where card.schedule_revision_id = v_revision_id;

  if v_assessment_count <> 26820 then
    raise exception 'M5 expected M4 assessment snapshot 26820, found %', v_assessment_count;
  end if;

  select count(*) into v_placement_count from public.placements;
  select count(*) into v_transaction_count from public.move_transactions;

  if v_placement_count <> 0 or v_transaction_count <> 0 then
    raise exception
      'M5 migration must start before manual writes: placements %, transactions %',
      v_placement_count,
      v_transaction_count;
  end if;

  if not exists (
    select 1
    from public.schedule_card_candidate_assessments assessment
    where assessment.status = 'VALID'
      and assessment.is_complete
  ) then
    raise exception 'M5 requires at least one complete VALID candidate for smoke testing';
  end if;

  if exists (
    select 1
    from public.schedule_card_candidate_assessments assessment
    where assessment.status = 'VALID'
      and (
        assessment.teacher_id is null
        or assessment.room_id is null
        or not assessment.is_complete
        or cardinality(assessment.reason_codes) <> 0
      )
  ) then
    raise exception 'M5 found malformed VALID candidate data';
  end if;
end
$$;

-- The migration itself must not make a scheduling decision. The function is
-- exercised later inside a caller-controlled transaction that is rolled back.
do $$
declare
  v_placement_count integer;
  v_transaction_count integer;
  v_published_session_count integer;
begin
  select count(*) into v_placement_count from public.placements;
  select count(*) into v_transaction_count from public.move_transactions;

  if v_placement_count <> 0 or v_transaction_count <> 0 then
    raise exception 'M5 migration unexpectedly created manual scheduling rows';
  end if;

  select count(*)
  into v_published_session_count
  from public.schedule_sessions
  where academic_year = '2026-2027';

  if v_published_session_count <> 517 then
    raise exception 'M5 changed published schedule projection unexpectedly: %', v_published_session_count;
  end if;

  update public.schedule_revisions revision
  set validation_summary = coalesce(revision.validation_summary, '{}'::jsonb) || jsonb_build_object(
    'manual_placement_engine_version', 'M5-v0.1',
    'manual_placement_command', 'READY',
    'manual_placement_smoke_test', 'PENDING',
    'forced_propagation', 'NOT_IMPLEMENTED'
  )
  where revision.status = 'DRAFT'
    and revision.version_number = 1;
end
$$;

commit;
