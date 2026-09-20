-- Management v0.1 / M8
-- Manual MOVE + REMOVE and generalized LIFO root undo.
-- PLACE/MOVE may trigger deterministic forced propagation.
-- REMOVE intentionally returns the card to the pool and does not auto-place it.
-- Redo, publish, RBAC grants, and management UI remain outside this phase.

begin;

drop index if exists public.move_transactions_active_root_idx;

create index move_transactions_active_root_idx
  on public.move_transactions (
    schedule_revision_id,
    created_at desc
  )
  where actor_type = 'USER'
    and action in ('PLACE', 'MOVE', 'REMOVE')
    and root_transaction_id is null
    and parent_transaction_id is null
    and reverted_at is null
    and payload ->> 'source' = 'MANUAL';

comment on column public.move_transactions.reverted_at is
  'Audit marker set when this transaction''s scheduling effect is undone. The immutable history row remains stored.';

comment on column public.move_transactions.reverted_by_transaction_id is
  'ROOT_UNDO transaction that reversed this transaction''s scheduling effect.';

-- M8 allows deterministic propagation after either a manual PLACE or MOVE.
-- REMOVE is deliberately excluded: removing a card means the human explicitly
-- returned it to the unscheduled pool and the engine must not immediately put
-- it back merely because only one candidate remains.
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
    raise exception 'M8 propagation requires revision, root transaction, and parent transaction';
  end if;

  select count(*)
  into v_root_count
  from public.move_transactions mt
  where mt.id = p_root_transaction_id
    and mt.schedule_revision_id = p_schedule_revision_id
    and mt.actor_type = 'USER'
    and mt.action in ('PLACE', 'MOVE')
    and mt.root_transaction_id is null
    and mt.parent_transaction_id is null
    and mt.reverted_at is null
    and mt.payload ->> 'source' = 'MANUAL';

  if v_root_count <> 1 then
    raise exception 'M8 propagation root must be one active manual USER PLACE/MOVE root: %',
      p_root_transaction_id;
  end if;

  select count(*)
  into v_parent_count
  from public.move_transactions mt
  where mt.id = p_parent_transaction_id
    and mt.schedule_revision_id = p_schedule_revision_id
    and mt.reverted_at is null
    and (
      mt.id = p_root_transaction_id
      or mt.root_transaction_id = p_root_transaction_id
    );

  if v_parent_count <> 1 then
    raise exception 'M8 propagation parent is outside active root chain: %',
      p_parent_transaction_id;
  end if;

  loop
    if v_auto_count > 289 then
      raise exception 'M8 propagation exceeded card safety bound';
    end if;

    perform public.refresh_management_candidate_domain(p_schedule_revision_id);

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

    if v_forced_card_id is null then
      exit;
    end if;

    if v_candidate_id is null
       or v_teacher_id is null
       or v_room_id is null then
      raise exception 'M8 forced domain produced incomplete candidate for card %',
        v_forced_card_id;
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
        'engine_version', 'M8-v0.1',
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
  'M8 deterministic forced propagation for active manual USER PLACE/MOVE roots. REMOVE is intentionally excluded.';

revoke all
  on function public.propagate_management_forced_cards(uuid, uuid, uuid)
  from public;

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
  'M8 manual MOVE command. Moves one existing unlocked placement only to an exact current VALID candidate and then runs deterministic forced propagation.';

revoke all
  on function public.move_management_card(uuid, smallint, smallint, uuid, uuid)
  from public;

create or replace function public.remove_management_card(
  p_card_id uuid
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
  v_transaction_id uuid;
  v_remaining_placements integer;
  v_forced_count integer;
  v_contradiction_count integer;
begin
  if p_card_id is null then
    raise exception 'M8 remove requires card_id';
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
    raise exception 'M8 placed card not found for remove: %', p_card_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M8 remove requires DRAFT revision, found %', v_revision_status;
  end if;

  if v_locked then
    raise exception 'M8 remove rejected for locked card: %', p_card_id;
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
    'REMOVE',
    jsonb_build_object(
      'source', 'MANUAL',
      'engine_version', 'M8-v0.1',
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
      'after', null
    )
  )
  returning id into v_transaction_id;

  delete from public.placements placement
  where placement.id = v_placement_id;

  -- Deliberately refresh only. Do not propagate after explicit REMOVE because
  -- the removed card must stay in the unscheduled pool until the human acts.
  perform public.refresh_management_candidate_domain(v_revision_id);

  select count(*)
  into v_remaining_placements
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = v_revision_id;

  select count(*)
  into v_forced_count
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

  update public.move_transactions mt
  set payload = mt.payload || jsonb_build_object(
    'propagation_auto_count', 0,
    'propagation_stop_reason', 'MANUAL_REMOVE',
    'remaining_placement_count', v_remaining_placements,
    'post_remove_forced_count', v_forced_count,
    'post_remove_contradiction_count', v_contradiction_count,
    'candidate_domain_refresh', 'PASS'
  )
  where mt.id = v_transaction_id;

  return v_transaction_id;
end
$$;

comment on function public.remove_management_card(uuid) is
  'M8 manual REMOVE command. Returns one unlocked placed card to the unscheduled pool and refreshes domains without forced propagation.';

revoke all
  on function public.remove_management_card(uuid)
  from public;

-- Generalized stack-style undo for PLACE, MOVE, and REMOVE manual roots.
create or replace function public.undo_management_root_transaction(
  p_root_transaction_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_revision_id uuid;
  v_revision_status text;
  v_root_action text;
  v_root_payload jsonb;
  v_before jsonb;
  v_after jsonb;
  v_latest_root_id uuid;
  v_chain_ids uuid[];
  v_chain_count integer;
  v_auto_ids uuid[];
  v_auto_count integer;
  v_root_placement_count integer;
  v_auto_placement_count integer;
  v_undo_action text;
  v_undo_transaction_id uuid;
  v_reverted_at timestamptz := clock_timestamp();
  v_remaining_placements integer;
  v_forced_count integer;
  v_contradiction_count integer;
begin
  if p_root_transaction_id is null then
    raise exception 'M8 undo requires root transaction id';
  end if;

  select
    revision.id,
    revision.status,
    root_tx.action,
    root_tx.payload
  into
    v_revision_id,
    v_revision_status,
    v_root_action,
    v_root_payload
  from public.move_transactions root_tx
  join public.schedule_revisions revision
    on revision.id = root_tx.schedule_revision_id
  where root_tx.id = p_root_transaction_id
    and root_tx.actor_type = 'USER'
    and root_tx.action in ('PLACE', 'MOVE', 'REMOVE')
    and root_tx.root_transaction_id is null
    and root_tx.parent_transaction_id is null
    and root_tx.reverted_at is null
    and root_tx.payload ->> 'source' = 'MANUAL'
  for update of revision, root_tx;

  if v_revision_id is null then
    raise exception 'M8 active manual USER root not found: %', p_root_transaction_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M8 undo requires DRAFT revision, found %', v_revision_status;
  end if;

  select mt.id
  into v_latest_root_id
  from public.move_transactions mt
  where mt.schedule_revision_id = v_revision_id
    and mt.actor_type = 'USER'
    and mt.action in ('PLACE', 'MOVE', 'REMOVE')
    and mt.root_transaction_id is null
    and mt.parent_transaction_id is null
    and mt.reverted_at is null
    and mt.payload ->> 'source' = 'MANUAL'
  order by mt.created_at desc, mt.id::text desc
  limit 1;

  if v_latest_root_id is distinct from p_root_transaction_id then
    raise exception
      'M8 undo is LIFO: latest active manual root is %, requested %',
      v_latest_root_id,
      p_root_transaction_id;
  end if;

  if exists (
    select 1
    from public.move_transactions mt
    where mt.root_transaction_id = p_root_transaction_id
      and mt.reverted_at is null
      and (
        mt.actor_type <> 'AUTO'
        or mt.action <> 'PLACE'
      )
  ) then
    raise exception 'M8 root chain contains unsupported active descendants';
  end if;

  select
    array_agg(mt.id order by mt.created_at, mt.id::text),
    count(*)
  into
    v_chain_ids,
    v_chain_count
  from public.move_transactions mt
  where (
    mt.id = p_root_transaction_id
    or mt.root_transaction_id = p_root_transaction_id
  )
    and mt.reverted_at is null;

  select
    array_agg(mt.id order by mt.created_at, mt.id::text),
    count(*)
  into
    v_auto_ids,
    v_auto_count
  from public.move_transactions mt
  where mt.root_transaction_id = p_root_transaction_id
    and mt.reverted_at is null
    and mt.actor_type = 'AUTO'
    and mt.action = 'PLACE';

  v_auto_count := coalesce(v_auto_count, 0);

  if v_chain_count = 0 or v_chain_ids is null then
    raise exception 'M8 found no active transaction chain for root %', p_root_transaction_id;
  end if;

  select count(*)
  into v_auto_placement_count
  from public.placements placement
  where v_auto_ids is not null
    and placement.move_transaction_id = any(v_auto_ids);

  if v_auto_placement_count <> v_auto_count then
    raise exception
      'M8 AUTO descendant state mismatch: % active AUTO transactions, % linked placements',
      v_auto_count,
      v_auto_placement_count;
  end if;

  select count(*)
  into v_root_placement_count
  from public.placements placement
  where placement.move_transaction_id = p_root_transaction_id;

  if v_root_action in ('PLACE', 'MOVE') and v_root_placement_count <> 1 then
    raise exception
      'M8 % root must own exactly one current placement, found %',
      v_root_action,
      v_root_placement_count;
  end if;

  if v_root_action = 'REMOVE' and (
    v_root_placement_count <> 0
    or v_auto_count <> 0
  ) then
    raise exception 'M8 REMOVE root must own zero placement and zero AUTO descendants';
  end if;

  v_before := v_root_payload -> 'before';
  v_after := v_root_payload -> 'after';

  if v_root_action = 'PLACE' then
    v_undo_action := 'REMOVE';
  elsif v_root_action = 'MOVE' then
    v_undo_action := 'MOVE';
    if v_before is null or jsonb_typeof(v_before) <> 'object' then
      raise exception 'M8 MOVE undo requires before snapshot';
    end if;
  else
    v_undo_action := 'PLACE';
    if v_before is null or jsonb_typeof(v_before) <> 'object' then
      raise exception 'M8 REMOVE undo requires before snapshot';
    end if;
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
    v_undo_action,
    jsonb_build_object(
      'source', 'ROOT_UNDO',
      'engine_version', 'M8-v0.1',
      'reverts_root_transaction_id', p_root_transaction_id,
      'reverted_root_action', v_root_action,
      'reverted_transaction_count', v_chain_count,
      'before', v_after,
      'after', v_before
    )
  )
  returning id into v_undo_transaction_id;

  -- Forced descendants are always inverse-removed first.
  if v_auto_ids is not null then
    delete from public.placements placement
    where placement.move_transaction_id = any(v_auto_ids);
  end if;

  if v_root_action = 'PLACE' then
    delete from public.placements placement
    where placement.move_transaction_id = p_root_transaction_id;

  elsif v_root_action = 'MOVE' then
    update public.placements placement
    set
      day_of_week = (v_before ->> 'day_of_week')::smallint,
      start_period = (v_before ->> 'start_period')::smallint,
      teacher_id = (v_before ->> 'teacher_id')::uuid,
      room_id = (v_before ->> 'room_id')::uuid,
      move_transaction_id = (v_before ->> 'move_transaction_id')::uuid,
      updated_at = now()
    where placement.move_transaction_id = p_root_transaction_id;

    if not found then
      raise exception 'M8 MOVE undo could not restore root placement';
    end if;

  elsif v_root_action = 'REMOVE' then
    insert into public.placements (
      id,
      card_id,
      day_of_week,
      start_period,
      teacher_id,
      room_id,
      move_transaction_id,
      created_at,
      updated_at
    )
    values (
      (v_before ->> 'placement_id')::uuid,
      (v_before ->> 'card_id')::uuid,
      (v_before ->> 'day_of_week')::smallint,
      (v_before ->> 'start_period')::smallint,
      (v_before ->> 'teacher_id')::uuid,
      (v_before ->> 'room_id')::uuid,
      (v_before ->> 'move_transaction_id')::uuid,
      coalesce((v_before ->> 'created_at')::timestamptz, now()),
      now()
    );
  end if;

  update public.move_transactions mt
  set
    reverted_at = v_reverted_at,
    reverted_by_transaction_id = v_undo_transaction_id
  where mt.id = any(v_chain_ids)
    and mt.reverted_at is null;

  if (
    select count(*)
    from public.move_transactions mt
    where mt.reverted_by_transaction_id = v_undo_transaction_id
  ) <> v_chain_count then
    raise exception 'M8 failed to mark the complete root chain as reverted';
  end if;

  perform public.refresh_management_candidate_domain(v_revision_id);

  select count(*)
  into v_remaining_placements
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = v_revision_id;

  select count(*)
  into v_forced_count
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

  update public.move_transactions mt
  set payload = mt.payload || jsonb_build_object(
    'remaining_placement_count', v_remaining_placements,
    'post_undo_forced_count', v_forced_count,
    'post_undo_contradiction_count', v_contradiction_count,
    'candidate_domain_refresh', 'PASS'
  )
  where mt.id = v_undo_transaction_id;

  return v_undo_transaction_id;
end
$$;

comment on function public.undo_management_root_transaction(uuid) is
  'M8 LIFO undo for active manual USER PLACE/MOVE/REMOVE roots. Reverses root state, removes AUTO descendants, preserves audit rows as reverted, writes one ROOT_UNDO transaction, and refreshes domains.';

revoke all
  on function public.undo_management_root_transaction(uuid)
  from public;

-- Install only on the clean, rollback-validated M7 state.
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
    raise exception 'M8 expected one v1 DRAFT revision, found %', v_revision_count;
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
    raise exception 'M8 expected 289 cards, found %', v_card_count;
  end if;

  select count(*)
  into v_summary_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card on card.id = summary.card_id
  where card.schedule_revision_id = v_revision_id;

  if v_summary_count <> 289 then
    raise exception 'M8 expected 289 candidate domain summaries, found %', v_summary_count;
  end if;

  select count(*) into v_placement_count from public.placements;
  select count(*) into v_transaction_count from public.move_transactions;

  if v_placement_count <> 0 or v_transaction_count <> 0 then
    raise exception
      'M8 installation requires clean scheduling state: placements %, transactions %',
      v_placement_count,
      v_transaction_count;
  end if;

  update public.schedule_revisions revision
  set validation_summary = coalesce(revision.validation_summary, '{}'::jsonb) || jsonb_build_object(
    'manual_move_remove_engine_version', 'M8-v0.1',
    'manual_move_command', 'READY',
    'manual_remove_command', 'READY',
    'generalized_root_undo', 'READY',
    'move_remove_smoke_test', 'PENDING',
    'redo', 'NOT_IMPLEMENTED'
  )
  where revision.id = v_revision_id;
end
$$;

commit;
