-- Management v0.1 / M9
-- Safe redo for the most recent still-redoable ROOT_UNDO.
-- Redo replays the original human intent against the current draft state:
-- PLACE/MOVE require the exact target candidate to still be VALID; REMOVE
-- requires the restored placement to still match the original pre-remove state.
-- AUTO descendants are never copied blindly; deterministic propagation is
-- recomputed from current domains.
-- Publish, RBAC grants, and management UI remain outside this phase.

begin;

alter table public.move_transactions
  add column redone_at timestamptz null,
  add column redone_by_transaction_id uuid null
    references public.move_transactions(id) on delete restrict;

alter table public.move_transactions
  add constraint move_transactions_redo_pair
    check (
      (redone_at is null and redone_by_transaction_id is null)
      or
      (redone_at is not null and redone_by_transaction_id is not null)
    ),
  add constraint move_transactions_redo_not_self
    check (
      redone_by_transaction_id is null
      or redone_by_transaction_id <> id
    );

create index move_transactions_redone_by_idx
  on public.move_transactions (redone_by_transaction_id)
  where redone_by_transaction_id is not null;

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
    and payload ->> 'source' in ('MANUAL', 'ROOT_REDO');

comment on column public.move_transactions.redone_at is
  'M9 redo marker. Set on a ROOT_UNDO transaction when that undo has been consumed by a successful redo.';

comment on column public.move_transactions.redone_by_transaction_id is
  'ROOT_REDO USER transaction that consumed this ROOT_UNDO transaction.';

-- Forced propagation may follow either a direct manual PLACE/MOVE or a replayed
-- ROOT_REDO PLACE/MOVE. REMOVE remains excluded by design.
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
    raise exception 'M9 propagation requires revision, root transaction, and parent transaction';
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
    and mt.payload ->> 'source' in ('MANUAL', 'ROOT_REDO');

  if v_root_count <> 1 then
    raise exception
      'M9 propagation root must be one active USER PLACE/MOVE MANUAL/ROOT_REDO root: %',
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
    raise exception 'M9 propagation parent is outside active root chain: %',
      p_parent_transaction_id;
  end if;

  loop
    if v_auto_count > 289 then
      raise exception 'M9 propagation exceeded card safety bound';
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
      raise exception 'M9 forced domain produced incomplete candidate for card %',
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
        'engine_version', 'M9-v0.1',
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
  'M9 deterministic forced propagation for active USER PLACE/MOVE roots sourced from MANUAL or ROOT_REDO.';

revoke all
  on function public.propagate_management_forced_cards(uuid, uuid, uuid)
  from public;

-- Generalized LIFO undo for MANUAL and ROOT_REDO roots. Undoing a redo creates
-- a fresh ROOT_UNDO, which becomes a new redo opportunity without mutating the
-- older consumed undo record.
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
  v_root_source text;
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
    raise exception 'M9 undo requires root transaction id';
  end if;

  select
    revision.id,
    revision.status,
    root_tx.action,
    root_tx.payload ->> 'source',
    root_tx.payload
  into
    v_revision_id,
    v_revision_status,
    v_root_action,
    v_root_source,
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
    and root_tx.payload ->> 'source' in ('MANUAL', 'ROOT_REDO')
  for update of revision, root_tx;

  if v_revision_id is null then
    raise exception 'M9 active USER MANUAL/ROOT_REDO root not found: %',
      p_root_transaction_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M9 undo requires DRAFT revision, found %', v_revision_status;
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
    and mt.payload ->> 'source' in ('MANUAL', 'ROOT_REDO')
  order by mt.created_at desc, mt.id::text desc
  limit 1;

  if v_latest_root_id is distinct from p_root_transaction_id then
    raise exception
      'M9 undo is LIFO: latest active root is %, requested %',
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
    raise exception 'M9 root chain contains unsupported active descendants';
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
    raise exception 'M9 found no active transaction chain for root %',
      p_root_transaction_id;
  end if;

  select count(*)
  into v_auto_placement_count
  from public.placements placement
  where v_auto_ids is not null
    and placement.move_transaction_id = any(v_auto_ids);

  if v_auto_placement_count <> v_auto_count then
    raise exception
      'M9 AUTO descendant state mismatch: % active AUTO transactions, % linked placements',
      v_auto_count,
      v_auto_placement_count;
  end if;

  select count(*)
  into v_root_placement_count
  from public.placements placement
  where placement.move_transaction_id = p_root_transaction_id;

  if v_root_action in ('PLACE', 'MOVE') and v_root_placement_count <> 1 then
    raise exception
      'M9 % root must own exactly one current placement, found %',
      v_root_action,
      v_root_placement_count;
  end if;

  if v_root_action = 'REMOVE' and (
    v_root_placement_count <> 0
    or v_auto_count <> 0
  ) then
    raise exception 'M9 REMOVE root must own zero placement and zero AUTO descendants';
  end if;

  v_before := v_root_payload -> 'before';
  v_after := v_root_payload -> 'after';

  if v_root_action = 'PLACE' then
    v_undo_action := 'REMOVE';
  elsif v_root_action = 'MOVE' then
    v_undo_action := 'MOVE';

    if v_before is null or jsonb_typeof(v_before) <> 'object' then
      raise exception 'M9 MOVE undo requires before snapshot';
    end if;
  else
    v_undo_action := 'PLACE';

    if v_before is null or jsonb_typeof(v_before) <> 'object' then
      raise exception 'M9 REMOVE undo requires before snapshot';
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
      'engine_version', 'M9-v0.1',
      'reverts_root_transaction_id', p_root_transaction_id,
      'reverts_root_source', v_root_source,
      'reverted_root_action', v_root_action,
      'reverted_transaction_count', v_chain_count,
      'before', v_after,
      'after', v_before
    )
  )
  returning id into v_undo_transaction_id;

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
      raise exception 'M9 MOVE undo could not restore root placement';
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
    raise exception 'M9 failed to mark the complete root chain as reverted';
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
  'M9 LIFO undo for active MANUAL/ROOT_REDO USER PLACE/MOVE/REMOVE roots. Reverses root state, removes AUTO descendants, preserves audit rows, creates a fresh ROOT_UNDO transaction, and refreshes domains.';

revoke all
  on function public.undo_management_root_transaction(uuid)
  from public;

create or replace function public.redo_management_undo_transaction(
  p_undo_transaction_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_revision_id uuid;
  v_revision_status text;
  v_undo_created_at timestamptz;
  v_original_root_id uuid;
  v_original_action text;
  v_original_payload jsonb;
  v_original_card_id uuid;
  v_original_before jsonb;
  v_original_after jsonb;
  v_expected_chain_count integer;
  v_actual_reverted_count integer;
  v_latest_redoable_undo_id uuid;
  v_locked boolean;

  v_placement_id uuid;
  v_current_day smallint;
  v_current_start smallint;
  v_current_teacher uuid;
  v_current_room uuid;
  v_current_move_transaction_id uuid;
  v_current_created_at timestamptz;

  v_target_day smallint;
  v_target_start smallint;
  v_target_teacher uuid;
  v_target_room uuid;

  v_candidate_id uuid;
  v_candidate_status text;
  v_reason_codes text[];

  v_redo_transaction_id uuid;
  v_redone_at timestamptz := clock_timestamp();
  v_auto_count integer := 0;
  v_contradiction_count integer;
  v_forced_remaining_count integer;
  v_unplaced_count integer;
  v_stop_reason text;
begin
  if p_undo_transaction_id is null then
    raise exception 'M9 redo requires ROOT_UNDO transaction id';
  end if;

  select
    revision.id,
    revision.status,
    undo_tx.created_at,
    (undo_tx.payload ->> 'reverts_root_transaction_id')::uuid,
    coalesce((undo_tx.payload ->> 'reverted_transaction_count')::integer, 0)
  into
    v_revision_id,
    v_revision_status,
    v_undo_created_at,
    v_original_root_id,
    v_expected_chain_count
  from public.move_transactions undo_tx
  join public.schedule_revisions revision
    on revision.id = undo_tx.schedule_revision_id
  where undo_tx.id = p_undo_transaction_id
    and undo_tx.actor_type = 'USER'
    and undo_tx.root_transaction_id is null
    and undo_tx.parent_transaction_id is null
    and undo_tx.payload ->> 'source' = 'ROOT_UNDO'
    and undo_tx.redone_at is null
    and undo_tx.redone_by_transaction_id is null
  for update of revision, undo_tx;

  if v_revision_id is null then
    raise exception 'M9 active redoable ROOT_UNDO not found: %',
      p_undo_transaction_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M9 redo requires DRAFT revision, found %',
      v_revision_status;
  end if;

  if v_original_root_id is null then
    raise exception 'M9 ROOT_UNDO is missing reverts_root_transaction_id';
  end if;

  -- Any direct MANUAL root created after an undo permanently invalidates that
  -- older redo branch. ROOT_REDO operations do not invalidate still-pending
  -- older undos, allowing multiple sequential redos after multiple undos.
  if exists (
    select 1
    from public.move_transactions mt
    where mt.schedule_revision_id = v_revision_id
      and mt.actor_type = 'USER'
      and mt.root_transaction_id is null
      and mt.parent_transaction_id is null
      and mt.payload ->> 'source' = 'MANUAL'
      and (
        mt.created_at > v_undo_created_at
        or (
          mt.created_at = v_undo_created_at
          and mt.id::text > p_undo_transaction_id::text
        )
      )
  ) then
    raise exception
      'M9 redo branch was invalidated by a newer manual scheduling decision';
  end if;

  select candidate.id
  into v_latest_redoable_undo_id
  from public.move_transactions candidate
  where candidate.schedule_revision_id = v_revision_id
    and candidate.actor_type = 'USER'
    and candidate.root_transaction_id is null
    and candidate.parent_transaction_id is null
    and candidate.payload ->> 'source' = 'ROOT_UNDO'
    and candidate.redone_at is null
    and candidate.redone_by_transaction_id is null
    and not exists (
      select 1
      from public.move_transactions manual_tx
      where manual_tx.schedule_revision_id = v_revision_id
        and manual_tx.actor_type = 'USER'
        and manual_tx.root_transaction_id is null
        and manual_tx.parent_transaction_id is null
        and manual_tx.payload ->> 'source' = 'MANUAL'
        and (
          manual_tx.created_at > candidate.created_at
          or (
            manual_tx.created_at = candidate.created_at
            and manual_tx.id::text > candidate.id::text
          )
        )
    )
  order by candidate.created_at desc, candidate.id::text desc
  limit 1;

  if v_latest_redoable_undo_id is distinct from p_undo_transaction_id then
    raise exception
      'M9 redo is LIFO: latest redoable undo is %, requested %',
      v_latest_redoable_undo_id,
      p_undo_transaction_id;
  end if;

  select
    root_tx.action,
    root_tx.payload
  into
    v_original_action,
    v_original_payload
  from public.move_transactions root_tx
  where root_tx.id = v_original_root_id
    and root_tx.schedule_revision_id = v_revision_id
    and root_tx.actor_type = 'USER'
    and root_tx.action in ('PLACE', 'MOVE', 'REMOVE')
    and root_tx.root_transaction_id is null
    and root_tx.parent_transaction_id is null
    and root_tx.reverted_at is not null
    and root_tx.reverted_by_transaction_id = p_undo_transaction_id
    and root_tx.payload ->> 'source' in ('MANUAL', 'ROOT_REDO');

  if v_original_action is null then
    raise exception
      'M9 original reverted root is missing or does not belong to this undo: %',
      v_original_root_id;
  end if;

  select count(*)
  into v_actual_reverted_count
  from public.move_transactions mt
  where (
    mt.id = v_original_root_id
    or mt.root_transaction_id = v_original_root_id
  )
    and mt.reverted_at is not null
    and mt.reverted_by_transaction_id = p_undo_transaction_id;

  if v_actual_reverted_count <> v_expected_chain_count then
    raise exception
      'M9 reverted chain mismatch: undo expected %, found %',
      v_expected_chain_count,
      v_actual_reverted_count;
  end if;

  v_original_card_id := (v_original_payload ->> 'card_id')::uuid;
  v_original_before := v_original_payload -> 'before';
  v_original_after := v_original_payload -> 'after';

  if v_original_card_id is null then
    raise exception 'M9 original root is missing card_id';
  end if;

  select card.locked
  into v_locked
  from public.schedule_cards card
  where card.id = v_original_card_id
    and card.schedule_revision_id = v_revision_id;

  if not found then
    raise exception 'M9 redo card is missing from revision: %',
      v_original_card_id;
  end if;

  if v_locked then
    raise exception 'M9 redo rejected for locked card: %',
      v_original_card_id;
  end if;

  if v_original_action in ('MOVE', 'REMOVE') then
    if v_original_before is null
       or jsonb_typeof(v_original_before) <> 'object' then
      raise exception 'M9 % redo requires original before snapshot',
        v_original_action;
    end if;

    select
      placement.id,
      placement.day_of_week,
      placement.start_period,
      placement.teacher_id,
      placement.room_id,
      placement.move_transaction_id,
      placement.created_at
    into
      v_placement_id,
      v_current_day,
      v_current_start,
      v_current_teacher,
      v_current_room,
      v_current_move_transaction_id,
      v_current_created_at
    from public.placements placement
    where placement.card_id = v_original_card_id
    for update;

    if v_placement_id is null then
      raise exception 'M9 % redo requires current restored placement for card %',
        v_original_action,
        v_original_card_id;
    end if;

    if v_current_day is distinct from (v_original_before ->> 'day_of_week')::smallint
       or v_current_start is distinct from (v_original_before ->> 'start_period')::smallint
       or v_current_teacher is distinct from (v_original_before ->> 'teacher_id')::uuid
       or v_current_room is distinct from (v_original_before ->> 'room_id')::uuid then
      raise exception
        'M9 % redo rejected because current placement no longer matches the undone before-state',
        v_original_action;
    end if;
  else
    if exists (
      select 1
      from public.placements placement
      where placement.card_id = v_original_card_id
    ) then
      raise exception 'M9 PLACE redo requires card to remain unplaced: %',
        v_original_card_id;
    end if;
  end if;

  if v_original_action in ('PLACE', 'MOVE') then
    if v_original_after is null
       or jsonb_typeof(v_original_after) <> 'object' then
      raise exception 'M9 % redo requires original after snapshot',
        v_original_action;
    end if;

    v_target_day := (v_original_after ->> 'day_of_week')::smallint;
    v_target_start := (v_original_after ->> 'start_period')::smallint;
    v_target_teacher := (v_original_after ->> 'teacher_id')::uuid;
    v_target_room := (v_original_after ->> 'room_id')::uuid;

    if v_target_day is null
       or v_target_start is null
       or v_target_teacher is null
       or v_target_room is null then
      raise exception 'M9 % redo target snapshot is incomplete',
        v_original_action;
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
    where assessment.card_id = v_original_card_id
      and assessment.day_of_week = v_target_day
      and assessment.start_period = v_target_start
      and assessment.teacher_id = v_target_teacher
      and assessment.room_id = v_target_room;

    if v_candidate_id is null then
      raise exception
        'M9 redo target candidate no longer exists for card %',
        v_original_card_id;
    end if;

    if v_candidate_status <> 'VALID' then
      raise exception
        'M9 redo target is %, reasons %',
        v_candidate_status,
        coalesce(v_reason_codes, array[]::text[]);
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
    v_original_action,
    case
      when v_original_action = 'PLACE' then
        jsonb_build_object(
          'source', 'ROOT_REDO',
          'engine_version', 'M9-v0.1',
          'redo_of_undo_transaction_id', p_undo_transaction_id,
          'replays_root_transaction_id', v_original_root_id,
          'candidate_assessment_id', v_candidate_id,
          'card_id', v_original_card_id,
          'before', null,
          'after', jsonb_build_object(
            'day_of_week', v_target_day,
            'start_period', v_target_start,
            'teacher_id', v_target_teacher,
            'room_id', v_target_room
          )
        )
      when v_original_action = 'MOVE' then
        jsonb_build_object(
          'source', 'ROOT_REDO',
          'engine_version', 'M9-v0.1',
          'redo_of_undo_transaction_id', p_undo_transaction_id,
          'replays_root_transaction_id', v_original_root_id,
          'candidate_assessment_id', v_candidate_id,
          'card_id', v_original_card_id,
          'before', jsonb_build_object(
            'placement_id', v_placement_id,
            'card_id', v_original_card_id,
            'day_of_week', v_current_day,
            'start_period', v_current_start,
            'teacher_id', v_current_teacher,
            'room_id', v_current_room,
            'move_transaction_id', v_current_move_transaction_id,
            'created_at', v_current_created_at
          ),
          'after', jsonb_build_object(
            'placement_id', v_placement_id,
            'card_id', v_original_card_id,
            'day_of_week', v_target_day,
            'start_period', v_target_start,
            'teacher_id', v_target_teacher,
            'room_id', v_target_room
          )
        )
      else
        jsonb_build_object(
          'source', 'ROOT_REDO',
          'engine_version', 'M9-v0.1',
          'redo_of_undo_transaction_id', p_undo_transaction_id,
          'replays_root_transaction_id', v_original_root_id,
          'card_id', v_original_card_id,
          'before', jsonb_build_object(
            'placement_id', v_placement_id,
            'card_id', v_original_card_id,
            'day_of_week', v_current_day,
            'start_period', v_current_start,
            'teacher_id', v_current_teacher,
            'room_id', v_current_room,
            'move_transaction_id', v_current_move_transaction_id,
            'created_at', v_current_created_at
          ),
          'after', null
        )
    end
  )
  returning id into v_redo_transaction_id;

  if v_original_action = 'PLACE' then
    insert into public.placements (
      card_id,
      day_of_week,
      start_period,
      teacher_id,
      room_id,
      move_transaction_id
    )
    values (
      v_original_card_id,
      v_target_day,
      v_target_start,
      v_target_teacher,
      v_target_room,
      v_redo_transaction_id
    );

    v_auto_count := public.propagate_management_forced_cards(
      v_revision_id,
      v_redo_transaction_id,
      v_redo_transaction_id
    );

  elsif v_original_action = 'MOVE' then
    update public.placements placement
    set
      day_of_week = v_target_day,
      start_period = v_target_start,
      teacher_id = v_target_teacher,
      room_id = v_target_room,
      move_transaction_id = v_redo_transaction_id,
      updated_at = now()
    where placement.id = v_placement_id;

    if not found then
      raise exception 'M9 MOVE redo lost its locked placement';
    end if;

    v_auto_count := public.propagate_management_forced_cards(
      v_revision_id,
      v_redo_transaction_id,
      v_redo_transaction_id
    );

  else
    delete from public.placements placement
    where placement.id = v_placement_id;

    if not found then
      raise exception 'M9 REMOVE redo lost its locked placement';
    end if;

    perform public.refresh_management_candidate_domain(v_revision_id);
    v_auto_count := 0;
  end if;

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

  if v_original_action = 'REMOVE' then
    v_stop_reason := 'MANUAL_REMOVE';
  elsif v_contradiction_count > 0 then
    v_stop_reason := 'CONTRADICTION';
  elsif v_unplaced_count = 0 then
    v_stop_reason := 'COMPLETE';
  elsif v_forced_remaining_count > 0 then
    raise exception 'M9 redo propagation stopped with % forced cards remaining',
      v_forced_remaining_count;
  else
    v_stop_reason := 'NO_FORCED_CANDIDATE';
  end if;

  update public.move_transactions mt
  set payload = mt.payload || jsonb_build_object(
    'propagation_auto_count', v_auto_count,
    'propagation_stop_reason', v_stop_reason,
    'propagation_contradiction_count', v_contradiction_count,
    'remaining_unplaced_count', v_unplaced_count,
    'candidate_domain_refresh', 'PASS'
  )
  where mt.id = v_redo_transaction_id;

  update public.move_transactions undo_tx
  set
    redone_at = v_redone_at,
    redone_by_transaction_id = v_redo_transaction_id
  where undo_tx.id = p_undo_transaction_id
    and undo_tx.redone_at is null
    and undo_tx.redone_by_transaction_id is null;

  if not found then
    raise exception 'M9 redo lost ownership of ROOT_UNDO transaction';
  end if;

  return v_redo_transaction_id;
end
$$;

comment on function public.redo_management_undo_transaction(uuid) is
  'M9 safe LIFO redo. Consumes the latest still-redoable ROOT_UNDO, verifies the current draft still matches the undone state, revalidates exact PLACE/MOVE targets, recreates a ROOT_REDO USER root, recomputes deterministic AUTO propagation, and marks the undo consumed.';

revoke all
  on function public.redo_management_undo_transaction(uuid)
  from public;

-- Install only on the clean, rollback-validated M8 state.
do $$
declare
  v_revision_id uuid;
  v_revision_count integer;
  v_card_count integer;
  v_summary_count integer;
  v_placement_count integer;
  v_transaction_count integer;
  v_published_session_count integer;
begin
  select count(*)
  into v_revision_count
  from public.schedule_revisions revision
  where revision.status = 'DRAFT'
    and revision.version_number = 1;

  if v_revision_count <> 1 then
    raise exception 'M9 expected one v1 DRAFT revision, found %',
      v_revision_count;
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
    raise exception 'M9 expected 289 cards, found %', v_card_count;
  end if;

  select count(*)
  into v_summary_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card on card.id = summary.card_id
  where card.schedule_revision_id = v_revision_id;

  if v_summary_count <> 289 then
    raise exception 'M9 expected 289 candidate domain summaries, found %',
      v_summary_count;
  end if;

  select count(*) into v_placement_count from public.placements;
  select count(*) into v_transaction_count from public.move_transactions;

  if v_placement_count <> 0 or v_transaction_count <> 0 then
    raise exception
      'M9 installation requires clean scheduling state: placements %, transactions %',
      v_placement_count,
      v_transaction_count;
  end if;

  select count(*)
  into v_published_session_count
  from public.schedule_sessions
  where academic_year = '2026-2027';

  if v_published_session_count <> 517 then
    raise exception 'M9 changed published schedule projection unexpectedly: %',
      v_published_session_count;
  end if;

  update public.schedule_revisions revision
  set validation_summary = coalesce(revision.validation_summary, '{}'::jsonb) || jsonb_build_object(
    'redo_engine_version', 'M9-v0.1',
    'safe_redo_command', 'READY',
    'redo_smoke_test', 'PENDING',
    'redo_invalidated_by_new_manual_root', true,
    'publish', 'NOT_IMPLEMENTED'
  )
  where revision.id = v_revision_id;
end
$$;

commit;
