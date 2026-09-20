-- Management v0.1 / M14.1
-- MOVE performance hardening.
--
-- Live M14 drag/drop exposed a statement timeout on MOVE. The M8 command
-- rebuilt the complete 289-card candidate domain twice in the common path:
-- once before validating the target and again immediately after the move
-- through deterministic propagation. The first rebuild is redundant when the
-- derived candidate state is current.
--
-- This migration:
-- 1. adds composite occupancy indexes used by the full candidate refresh;
-- 2. keeps exact-candidate safety, but uses current derived state when fresh;
-- 3. falls back to the full refresh only when candidate state is stale/missing;
-- 4. leaves the post-move refresh + propagation contract unchanged.

begin;

create index if not exists placements_teacher_day_start_idx
  on public.placements (teacher_id, day_of_week, start_period)
  where teacher_id is not null;

create index if not exists placements_room_day_start_idx
  on public.placements (room_id, day_of_week, start_period)
  where room_id is not null;

create or replace function public.move_management_card(
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
  v_locked boolean;
  v_placement_id uuid;
  v_before_day smallint;
  v_before_start smallint;
  v_before_teacher uuid;
  v_before_room uuid;
  v_before_move_transaction_id uuid;
  v_before_created_at timestamptz;
  v_candidate_id uuid;
  v_candidate_status text;
  v_reason_codes text[];
  v_candidate_generated_at timestamptz;
  v_latest_placement_change timestamptz;
  v_transaction_id uuid;
  v_auto_count integer;
  v_contradiction_count integer;
  v_forced_remaining_count integer;
  v_unplaced_count integer;
  v_stop_reason text;
begin
  if p_card_id is null then
    raise exception 'M8 move requires card_id';
  end if;

  if p_day_of_week is null or p_day_of_week < 1 or p_day_of_week > 5 then
    raise exception 'M8 move requires day_of_week 1..5';
  end if;

  if p_start_period is null or p_start_period < 1 or p_start_period > 12 then
    raise exception 'M8 move requires start_period 1..12';
  end if;

  if p_teacher_id is null or p_room_id is null then
    raise exception 'M8 move requires resolved teacher and room';
  end if;

  select
    revision.id,
    revision.status,
    card.locked,
    placement.id,
    placement.day_of_week,
    placement.start_period,
    placement.teacher_id,
    placement.room_id,
    placement.move_transaction_id,
    placement.created_at
  into
    v_revision_id,
    v_revision_status,
    v_locked,
    v_placement_id,
    v_before_day,
    v_before_start,
    v_before_teacher,
    v_before_room,
    v_before_move_transaction_id,
    v_before_created_at
  from public.schedule_cards card
  join public.schedule_revisions revision
    on revision.id = card.schedule_revision_id
  join public.placements placement
    on placement.card_id = card.id
  where card.id = p_card_id
  for update of revision, placement;

  if v_revision_id is null then
    raise exception 'M8 placed card not found: %', p_card_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M8 move requires DRAFT revision, found %', v_revision_status;
  end if;

  if v_locked then
    raise exception 'M8 move rejected for locked card: %', p_card_id;
  end if;

  if v_before_day = p_day_of_week
     and v_before_start = p_start_period
     and v_before_teacher = p_teacher_id
     and v_before_room = p_room_id then
    raise exception 'M8 move is a no-op for card %', p_card_id;
  end if;

  -- M14.1 fast path: candidate domains are derived state and every accepted
  -- scheduling mutation refreshes them before commit. Rebuilding all 289 cards
  -- again before a MOVE is therefore redundant in the normal path and was the
  -- primary cause of browser RPC statement timeouts.
  --
  -- Keep the safety invariant: if this exact candidate is missing or older than
  -- the latest placement mutation in the revision, fall back to a full refresh
  -- before accepting the move.
  select
    assessment.id,
    assessment.status,
    assessment.reason_codes,
    assessment.generated_at
  into
    v_candidate_id,
    v_candidate_status,
    v_reason_codes,
    v_candidate_generated_at
  from public.schedule_card_candidate_assessments assessment
  where assessment.card_id = p_card_id
    and assessment.day_of_week = p_day_of_week
    and assessment.start_period = p_start_period
    and assessment.teacher_id = p_teacher_id
    and assessment.room_id = p_room_id;

  select max(placement.updated_at)
  into v_latest_placement_change
  from public.placements placement
  join public.schedule_cards placed_card
    on placed_card.id = placement.card_id
  where placed_card.schedule_revision_id = v_revision_id;

  if v_candidate_id is null
     or (
       v_latest_placement_change is not null
       and (
         v_candidate_generated_at is null
         or v_candidate_generated_at < v_latest_placement_change
       )
     ) then
    perform public.refresh_management_candidate_domain(v_revision_id);

    select
      assessment.id,
      assessment.status,
      assessment.reason_codes,
      assessment.generated_at
    into
      v_candidate_id,
      v_candidate_status,
      v_reason_codes,
      v_candidate_generated_at
    from public.schedule_card_candidate_assessments assessment
    where assessment.card_id = p_card_id
      and assessment.day_of_week = p_day_of_week
      and assessment.start_period = p_start_period
      and assessment.teacher_id = p_teacher_id
      and assessment.room_id = p_room_id;
  end if;

  if v_candidate_id is null then
    raise exception
      'M8 move candidate not found for card %, day %, period %, teacher %, room %',
      p_card_id,
      p_day_of_week,
      p_start_period,
      p_teacher_id,
      p_room_id;
  end if;

  if v_candidate_status <> 'VALID' then
    raise exception
      'M8 move candidate is %, reasons %',
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
    'MOVE',
    jsonb_build_object(
      'source', 'MANUAL',
      'engine_version', 'M8-v0.1',
      'candidate_assessment_id', v_candidate_id,
      'card_id', p_card_id,
      'before', jsonb_build_object(
        'placement_id', v_placement_id,
        'card_id', p_card_id,
        'day_of_week', v_before_day,
        'start_period', v_before_start,
        'teacher_id', v_before_teacher,
        'room_id', v_before_room,
        'move_transaction_id', v_before_move_transaction_id,
        'created_at', v_before_created_at
      ),
      'after', jsonb_build_object(
        'placement_id', v_placement_id,
        'card_id', p_card_id,
        'day_of_week', p_day_of_week,
        'start_period', p_start_period,
        'teacher_id', p_teacher_id,
        'room_id', p_room_id
      )
    )
  )
  returning id into v_transaction_id;

  update public.placements placement
  set
    day_of_week = p_day_of_week,
    start_period = p_start_period,
    teacher_id = p_teacher_id,
    room_id = p_room_id,
    move_transaction_id = v_transaction_id,
    updated_at = now()
  where placement.id = v_placement_id;

  v_auto_count := public.propagate_management_forced_cards(
    v_revision_id,
    v_transaction_id,
    v_transaction_id
  );

  select count(*)
  into v_contradiction_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card on card.id = summary.card_id
  where card.schedule_revision_id = v_revision_id
    and summary.is_contradiction
    and not exists (
      select 1
      from public.placements placement
      where placement.card_id = card.id
    );

  select count(*)
  into v_forced_remaining_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card on card.id = summary.card_id
  where card.schedule_revision_id = v_revision_id
    and summary.is_forced
    and not exists (
      select 1
      from public.placements placement
      where placement.card_id = card.id
    );

  select count(*)
  into v_unplaced_count
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id
    and not exists (
      select 1
      from public.placements placement
      where placement.card_id = card.id
    );

  if v_contradiction_count > 0 then
    v_stop_reason := 'CONTRADICTION';
  elsif v_unplaced_count = 0 then
    v_stop_reason := 'COMPLETE';
  elsif v_forced_remaining_count > 0 then
    raise exception 'M8 move propagation stopped with % forced cards remaining',
      v_forced_remaining_count;
  else
    v_stop_reason := 'NO_FORCED_CANDIDATE';
  end if;

  update public.move_transactions mt
  set payload = mt.payload || jsonb_build_object(
    'propagation_auto_count', v_auto_count,
    'propagation_stop_reason', v_stop_reason,
    'propagation_contradiction_count', v_contradiction_count,
    'remaining_unplaced_count', v_unplaced_count
  )
  where mt.id = v_transaction_id;

  return v_transaction_id;
end
$$;



comment on function public.move_management_card(uuid, smallint, smallint, uuid, uuid) is
  'M14.1 MOVE command. Uses fresh derived candidate state for fast exact-target validation, falls back to full pre-refresh only when stale, then preserves deterministic post-move propagation.';

revoke all
  on function public.move_management_card(uuid, smallint, smallint, uuid, uuid)
  from public, anon, authenticated;

commit;
