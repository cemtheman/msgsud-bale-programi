-- Management v0.1 / M6
-- Forced propagation + AUTO transaction descendants.
-- A USER placement is followed only by uniquely forced complete candidates.
-- Propagation stops at ambiguity, unresolved data, contradiction, or completion.
-- No undo/redo or publish action in this phase.

begin;

create or replace function public.propagate_management_forced_cards(
  p_schedule_revision_id uuid,
  p_root_transaction_id uuid,
  p_parent_transaction_id uuid
)
returns integer
language plpgsql
as $$
declare
  v_root_count integer;
  v_parent_count integer;
  v_parent_transaction_id uuid := p_parent_transaction_id;
  v_forced_card_id uuid;
  v_candidate_id uuid;
  v_day_of_week smallint;
  v_start_period smallint;
  v_teacher_id uuid;
  v_room_id uuid;
  v_auto_transaction_id uuid;
  v_auto_count integer := 0;
begin
  if p_schedule_revision_id is null
     or p_root_transaction_id is null
     or p_parent_transaction_id is null then
    raise exception 'M6 propagation requires revision, root transaction, and parent transaction';
  end if;

  select count(*)
  into v_root_count
  from public.move_transactions mt
  where mt.id = p_root_transaction_id
    and mt.schedule_revision_id = p_schedule_revision_id
    and mt.actor_type = 'USER'
    and mt.root_transaction_id is null
    and mt.parent_transaction_id is null
    and mt.action = 'PLACE';

  if v_root_count <> 1 then
    raise exception 'M6 propagation root must be one USER root transaction: %', p_root_transaction_id;
  end if;

  select count(*)
  into v_parent_count
  from public.move_transactions mt
  where mt.id = p_parent_transaction_id
    and mt.schedule_revision_id = p_schedule_revision_id
    and (
      mt.id = p_root_transaction_id
      or mt.root_transaction_id = p_root_transaction_id
    );

  if v_parent_count <> 1 then
    raise exception 'M6 propagation parent is outside root chain: %', p_parent_transaction_id;
  end if;

  loop
    if v_auto_count > 289 then
      raise exception 'M6 propagation exceeded card safety bound';
    end if;

    perform public.refresh_management_candidate_domain(p_schedule_revision_id);

    -- Once an unplaced card is contradictory, additional placements cannot add
    -- candidates back. Preserve the current chain and stop for human recovery.
    if exists (
      select 1
      from public.schedule_card_domain_summaries summary
      join public.schedule_cards card
        on card.id = summary.card_id
      where card.schedule_revision_id = p_schedule_revision_id
        and summary.is_contradiction
        and not exists (
          select 1
          from public.placements placement
          where placement.card_id = card.id
        )
    ) then
      exit;
    end if;

    v_forced_card_id := null;
    v_candidate_id := null;
    v_day_of_week := null;
    v_start_period := null;
    v_teacher_id := null;
    v_room_id := null;

    -- Multiple forced cards can coexist. Pick one in a stable order; after each
    -- AUTO placement the entire domain is recomputed before considering another.
    select
      card.id,
      assessment.id,
      assessment.day_of_week,
      assessment.start_period,
      assessment.teacher_id,
      assessment.room_id
    into
      v_forced_card_id,
      v_candidate_id,
      v_day_of_week,
      v_start_period,
      v_teacher_id,
      v_room_id
    from public.schedule_card_domain_summaries summary
    join public.schedule_cards card
      on card.id = summary.card_id
    join public.schedule_card_candidate_assessments assessment
      on assessment.card_id = card.id
     and assessment.status = 'VALID'
     and assessment.is_complete
    where card.schedule_revision_id = p_schedule_revision_id
      and summary.is_forced
      and summary.unresolved_count = 0
      and not exists (
        select 1
        from public.placements placement
        where placement.card_id = card.id
      )
    order by
      card.requirement_id::text,
      card.block_index,
      card.id::text
    limit 1;

    -- No forced card means remaining cards are ambiguous and/or unresolved,
    -- or every card has already been placed.
    if v_forced_card_id is null then
      exit;
    end if;

    if v_candidate_id is null
       or v_teacher_id is null
       or v_room_id is null then
      raise exception 'M6 forced domain produced an incomplete candidate for card %', v_forced_card_id;
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
      p_schedule_revision_id,
      p_root_transaction_id,
      v_parent_transaction_id,
      'AUTO',
      'PLACE',
      jsonb_build_object(
        'source', 'FORCED_PROPAGATION',
        'engine_version', 'M6-v0.1',
        'propagation_step', v_auto_count + 1,
        'candidate_assessment_id', v_candidate_id,
        'card_id', v_forced_card_id,
        'before', null,
        'after', jsonb_build_object(
          'day_of_week', v_day_of_week,
          'start_period', v_start_period,
          'teacher_id', v_teacher_id,
          'room_id', v_room_id
        )
      )
    )
    returning id into v_auto_transaction_id;

    insert into public.placements (
      card_id,
      day_of_week,
      start_period,
      teacher_id,
      room_id,
      move_transaction_id
    )
    values (
      v_forced_card_id,
      v_day_of_week,
      v_start_period,
      v_teacher_id,
      v_room_id,
      v_auto_transaction_id
    );

    v_auto_count := v_auto_count + 1;
    v_parent_transaction_id := v_auto_transaction_id;
  end loop;

  return v_auto_count;
end
$$;

comment on function public.propagate_management_forced_cards(uuid, uuid, uuid) is
  'M6 deterministic forced propagation. Places only unplaced cards with exactly one VALID complete candidate and zero UNRESOLVED candidates. AUTO moves form a parent chain under one USER root. Stops on contradiction or when no forced card remains.';

revoke all
  on function public.propagate_management_forced_cards(uuid, uuid, uuid)
  from public;

-- Extend the M5 manual command: the human move remains the root transaction;
-- any deterministic forced descendants are added atomically in the same call.
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
  v_auto_count integer;
  v_contradiction_count integer;
  v_forced_remaining_count integer;
  v_unplaced_count integer;
  v_stop_reason text;
begin
  if p_card_id is null then
    raise exception 'M6 manual placement requires card_id';
  end if;

  if p_day_of_week is null or p_day_of_week < 1 or p_day_of_week > 5 then
    raise exception 'M6 manual placement requires day_of_week 1..5';
  end if;

  if p_start_period is null or p_start_period < 1 or p_start_period > 12 then
    raise exception 'M6 manual placement requires start_period 1..12';
  end if;

  if p_teacher_id is null or p_room_id is null then
    raise exception 'M6 manual placement requires resolved teacher and room';
  end if;

  -- Serialize the complete USER + AUTO chain per draft revision.
  select revision.id, revision.status
  into v_revision_id, v_revision_status
  from public.schedule_cards card
  join public.schedule_revisions revision
    on revision.id = card.schedule_revision_id
  where card.id = p_card_id
  for update of revision;

  if v_revision_id is null then
    raise exception 'M6 card not found: %', p_card_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M6 card belongs to non-DRAFT revision: %', v_revision_status;
  end if;

  if exists (
    select 1
    from public.placements placement
    where placement.card_id = p_card_id
  ) then
    raise exception 'M6 card is already placed: %', p_card_id;
  end if;

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
      'M6 candidate not found for card %, day %, period %, teacher %, room %',
      p_card_id,
      p_day_of_week,
      p_start_period,
      p_teacher_id,
      p_room_id;
  end if;

  if v_candidate_status <> 'VALID' then
    raise exception
      'M6 candidate is %, reasons %',
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
      'engine_version', 'M6-v0.1',
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

  v_auto_count := public.propagate_management_forced_cards(
    v_revision_id,
    v_transaction_id,
    v_transaction_id
  );

  -- The propagation helper leaves candidate domains current at its stop point.
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
    -- This should be unreachable unless the propagation invariant regresses.
    raise exception 'M6 propagation stopped with % forced cards remaining', v_forced_remaining_count;
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

comment on function public.place_management_card(uuid, smallint, smallint, uuid, uuid) is
  'M6 manual PLACE command. Writes one USER root placement, deterministically propagates uniquely forced complete candidates as AUTO descendants, refreshes after every move, and stops at contradiction or when no forced card remains.';

revoke all
  on function public.place_management_card(uuid, smallint, smallint, uuid, uuid)
  from public;

-- Lock M6 installation to the clean M5/M4 live state.
do $$
declare
  v_revision_id uuid;
  v_revision_count integer;
  v_card_count integer;
  v_summary_count integer;
  v_placement_count integer;
  v_transaction_count integer;
begin
  select count(*)
  into v_revision_count
  from public.schedule_revisions revision
  where revision.status = 'DRAFT'
    and revision.version_number = 1;

  if v_revision_count <> 1 then
    raise exception 'M6 expected one v1 DRAFT revision, found %', v_revision_count;
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
    raise exception 'M6 expected 289 cards, found %', v_card_count;
  end if;

  select count(*)
  into v_summary_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card on card.id = summary.card_id
  where card.schedule_revision_id = v_revision_id;

  if v_summary_count <> 289 then
    raise exception 'M6 expected 289 candidate domain summaries, found %', v_summary_count;
  end if;

  select count(*) into v_placement_count from public.placements;
  select count(*) into v_transaction_count from public.move_transactions;

  if v_placement_count <> 0 or v_transaction_count <> 0 then
    raise exception
      'M6 installation requires clean scheduling state: placements %, transactions %',
      v_placement_count,
      v_transaction_count;
  end if;

  if exists (
    select 1
    from public.schedule_card_domain_summaries summary
    where summary.is_forced
       or summary.is_contradiction
  ) then
    raise exception 'M6 expected initial M4 state with zero forced domains and zero contradictions';
  end if;
end
$$;

-- Installing M6 must not itself make any scheduling decision.
do $$
declare
  v_published_session_count integer;
begin
  if exists (select 1 from public.placements)
     or exists (select 1 from public.move_transactions) then
    raise exception 'M6 migration unexpectedly created scheduling rows';
  end if;

  select count(*)
  into v_published_session_count
  from public.schedule_sessions
  where academic_year = '2026-2027';

  if v_published_session_count <> 517 then
    raise exception 'M6 changed published schedule projection unexpectedly: %', v_published_session_count;
  end if;

  update public.schedule_revisions revision
  set validation_summary = coalesce(revision.validation_summary, '{}'::jsonb) || jsonb_build_object(
    'forced_propagation_engine_version', 'M6-v0.1',
    'forced_propagation_command', 'READY',
    'forced_propagation_smoke_test', 'PENDING',
    'undo', 'NOT_IMPLEMENTED'
  )
  where revision.status = 'DRAFT'
    and revision.version_number = 1;
end
$$;

commit;
