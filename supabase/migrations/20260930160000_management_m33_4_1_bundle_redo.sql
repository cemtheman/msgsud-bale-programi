-- Management M33.4.1
-- True simultaneous MOVE bundle execution + bundle-aware REDO.
--
-- M26.8 validates a grouped move against external occupancy as a bundle, but
-- then management_move_bundle_member re-validates each member individually.
-- During cyclic/overlapping grouped moves (including optimizer proposals and
-- their REDO), siblings that have not moved yet can therefore falsely block
-- one another.
--
-- This migration keeps the M26.8 external-occupancy validation, then writes
-- the already-validated members without a second per-member candidate check.
-- management_redo_bundle replays ordinary MOVE bundles through that same
-- simultaneous path. M29 placement-resource overrides keep their specialized
-- M29.5 single-root redo semantics.

begin;

create or replace function public.management_move_bundle_member_prevalidated(
  p_card_id uuid,
  p_day_of_week smallint,
  p_start_period smallint,
  p_teacher_id uuid,
  p_room_id uuid
)
returns uuid
language plpgsql
set search_path = pg_catalog, public
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
begin
  if p_card_id is null
     or p_day_of_week is null
     or p_start_period is null then
    raise exception 'M33.4.1 MOVE bundle member is incomplete';
  end if;

  if p_day_of_week < 1 or p_day_of_week > 5
     or p_start_period < 1 or p_start_period > 12 then
    raise exception 'M33.4.1 MOVE bundle member has invalid day/period';
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
    raise exception 'M33.4.1 MOVE placed card not found: %', p_card_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M33.4.1 MOVE requires DRAFT revision';
  end if;

  if v_locked then
    raise exception 'M33.4.1 MOVE rejected for locked card: %', p_card_id;
  end if;

  if v_before_day = p_day_of_week
     and v_before_start = p_start_period
     and v_before_teacher is not distinct from p_teacher_id
     and v_before_room is not distinct from p_room_id then
    raise exception 'M33.4.1 MOVE is a no-op for card %', p_card_id;
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
      'engine_version', 'M33.4.1-prevalidated-bundle-member',
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
      ),
      'propagation_auto_count', 0,
      'propagation_stop_reason', 'BUNDLE_PENDING',
      'candidate_domain_refresh', 'BUNDLE_PREVALIDATED'
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

  if not found then
    raise exception 'M33.4.1 MOVE lost placement for card %', p_card_id;
  end if;

  -- Keep external candidate domains in sync with the released/occupied
  -- windows. The selected bundle itself is refreshed as one set after all
  -- members have been written.
  perform public.refresh_management_candidate_domain_delta(
    v_revision_id,
    p_card_id,
    v_before_day,
    v_before_start,
    v_before_teacher,
    v_before_room,
    p_day_of_week,
    p_start_period,
    p_teacher_id,
    p_room_id
  );

  return v_transaction_id;
end
$$;

revoke all
  on function public.management_move_bundle_member_prevalidated(
    uuid, smallint, smallint, uuid, uuid
  )
  from public, anon, authenticated;


create or replace function public.management_move_card_bundle(
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_index integer;
  v_bundle_size integer;
  v_distinct_card_count integer;
  v_matched_card_count integer;
  v_revision_id uuid;
  v_revision_ids uuid[];
  v_card_ids uuid[];
  v_bundle_card_ids jsonb;
  v_bundle_id uuid;
  v_transaction_id uuid;
  v_last_transaction_id uuid;
  v_candidate_status text;
  v_candidate_complete boolean;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M33.4.1 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'M33.4.1 MOVE bundle requires a JSON array';
  end if;

  v_bundle_size := jsonb_array_length(p_items);
  if v_bundle_size < 1 or v_bundle_size > 24 then
    raise exception 'M33.4.1 MOVE bundle requires 1..24 cards';
  end if;

  select
    count(distinct entry.value ->> 'card_id'),
    array_agg(distinct (entry.value ->> 'card_id')::uuid),
    jsonb_agg(entry.value ->> 'card_id' order by entry.ordinality)
  into
    v_distinct_card_count,
    v_card_ids,
    v_bundle_card_ids
  from jsonb_array_elements(p_items) with ordinality
    as entry(value, ordinality);

  if v_distinct_card_count <> v_bundle_size then
    raise exception 'M33.4.1 MOVE bundle contains duplicate card ids';
  end if;

  select
    count(*),
    array_agg(distinct card.schedule_revision_id)
  into
    v_matched_card_count,
    v_revision_ids
  from public.schedule_cards card
  where card.id = any(v_card_ids);

  if v_matched_card_count <> v_bundle_size
     or v_revision_ids is null
     or cardinality(v_revision_ids) <> 1 then
    raise exception
      'M33.4.1 MOVE bundle requires known cards from one revision';
  end if;

  v_revision_id := v_revision_ids[1];

  if not exists (
    select 1
    from public.schedule_revisions revision
    where revision.id = v_revision_id
      and revision.status = 'DRAFT'
  ) then
    raise exception 'M33.4.1 MOVE bundle requires DRAFT revision';
  end if;

  if exists (
    select 1
    from public.schedule_cards card
    where card.id = any(v_card_ids)
      and card.locked
  ) then
    raise exception 'M33.4.1 MOVE bundle contains locked card';
  end if;

  if (
    select count(*)
    from public.placements placement
    where placement.card_id = any(v_card_ids)
  ) <> v_bundle_size then
    raise exception 'M33.4.1 MOVE bundle requires all cards to be placed';
  end if;

  -- One shared candidate refresh excludes all selected siblings from current
  -- occupancy. This is the authoritative validation for the whole move.
  perform public.refresh_management_candidate_domain_bundle_subset(
    v_revision_id,
    v_card_ids
  );

  for v_item in
    select entry.value
    from jsonb_array_elements(p_items) as entry(value)
  loop
    select
      assessment.status,
      assessment.is_complete
    into
      v_candidate_status,
      v_candidate_complete
    from public.schedule_card_candidate_assessments assessment
    where assessment.card_id = nullif(v_item ->> 'card_id', '')::uuid
      and assessment.day_of_week =
        nullif(v_item ->> 'day_of_week', '')::smallint
      and assessment.start_period =
        nullif(v_item ->> 'start_period', '')::smallint
      and assessment.teacher_id is not distinct from
        nullif(v_item ->> 'teacher_id', '')::uuid
      and assessment.room_id is not distinct from
        nullif(v_item ->> 'room_id', '')::uuid
    limit 1;

    if v_candidate_status is distinct from 'VALID'
       or coalesce(v_candidate_complete, false) is not true then
      raise exception
        'M33.4.1 MOVE bundle member is not externally valid: card %, status %',
        v_item ->> 'card_id',
        coalesce(v_candidate_status, 'MISSING');
    end if;
  end loop;

  -- The full bundle is validated now. Do not revalidate members one by one:
  -- their siblings may legitimately occupy one another's source/target slots
  -- while this single database transaction is still in progress.
  for v_item, v_index in
    select entry.value, entry.ordinality::integer
    from jsonb_array_elements(p_items) with ordinality
      as entry(value, ordinality)
  loop
    v_transaction_id :=
      public.management_move_bundle_member_prevalidated(
        nullif(v_item ->> 'card_id', '')::uuid,
        nullif(v_item ->> 'day_of_week', '')::smallint,
        nullif(v_item ->> 'start_period', '')::smallint,
        nullif(v_item ->> 'teacher_id', '')::uuid,
        nullif(v_item ->> 'room_id', '')::uuid
      );

    if v_bundle_id is null then
      v_bundle_id := v_transaction_id;
    end if;

    perform public.management_tag_bundle_root(
      v_transaction_id,
      v_bundle_id,
      v_index,
      v_bundle_size,
      v_bundle_card_ids
    );

    v_last_transaction_id := v_transaction_id;
  end loop;

  perform public.refresh_management_candidate_domain_bundle_subset(
    v_revision_id,
    v_card_ids
  );

  perform public.management_finalize_bundle_propagation(
    v_revision_id,
    v_last_transaction_id
  );

  perform public.management_tag_bundle_root(
    v_last_transaction_id,
    v_bundle_id,
    v_bundle_size,
    v_bundle_size,
    v_bundle_card_ids
  );

  return v_last_transaction_id;
end
$$;

comment on function public.management_move_card_bundle(jsonb) is
  'M33.4.1 simultaneous atomic MOVE bundle. Validates the complete target against external occupancy once, then writes all prevalidated members without sibling self-conflicts.';

revoke all
  on function public.management_move_card_bundle(jsonb)
  from public, anon;

grant execute
  on function public.management_move_card_bundle(jsonb)
  to authenticated;


create or replace function public.management_redo_bundle(
  p_undo_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_history_sequence bigint;
  v_bundle_id uuid;
  v_bundle_size integer;
  v_bundle_card_ids jsonb;
  v_latest_structure_sequence bigint;
  v_bundle_undo_max_sequence bigint;
  v_bundle_undo_count integer;
  v_move_count integer;
  v_override_count integer;
  v_items jsonb;
  v_last_redo_id uuid;
  v_new_bundle_id uuid;
  v_redone_at timestamptz := clock_timestamp();
  v_undo_id uuid;
  v_bundle_index integer;
  v_redo_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M33.4.1 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    transaction.schedule_revision_id,
    transaction.history_sequence,
    nullif(transaction.payload ->> 'bundle_id', '')::uuid,
    coalesce((transaction.payload ->> 'bundle_size')::integer, 1),
    coalesce(transaction.payload -> 'bundle_card_ids', '[]'::jsonb)
  into
    v_revision_id,
    v_history_sequence,
    v_bundle_id,
    v_bundle_size,
    v_bundle_card_ids
  from public.move_transactions transaction
  where transaction.id = p_undo_transaction_id
    and transaction.actor_type = 'USER'
    and transaction.root_transaction_id is null
    and transaction.parent_transaction_id is null
    and transaction.payload ->> 'source' = 'ROOT_UNDO'
    and transaction.redone_at is null
    and transaction.redone_by_transaction_id is null;

  if v_bundle_id is null then
    raise exception 'M33.4.1 redoable bundle undo not found: %',
      p_undo_transaction_id;
  end if;

  select max(barrier.history_sequence)
  into v_latest_structure_sequence
  from public.move_transactions barrier
  where barrier.schedule_revision_id = v_revision_id
    and barrier.actor_type = 'USER'
    and barrier.action = 'STRUCTURE'
    and barrier.root_transaction_id is null
    and barrier.parent_transaction_id is null
    and barrier.payload ->> 'source'
      in ('STRUCTURE_APPLY', 'STRUCTURE_REVERT');

  if v_latest_structure_sequence is not null
     and v_history_sequence < v_latest_structure_sequence then
    raise exception 'M33.4.1 redo cannot cross a structural history epoch';
  end if;

  with bundle_undos as (
    select undo_tx.*
    from public.move_transactions undo_tx
    where undo_tx.schedule_revision_id = v_revision_id
      and undo_tx.actor_type = 'USER'
      and undo_tx.root_transaction_id is null
      and undo_tx.parent_transaction_id is null
      and undo_tx.payload ->> 'source' = 'ROOT_UNDO'
      and undo_tx.payload ->> 'bundle_id' = v_bundle_id::text
      and undo_tx.redone_at is null
      and undo_tx.redone_by_transaction_id is null
  ),
  originals as (
    select
      undo_tx.id as undo_id,
      undo_tx.history_sequence as undo_history_sequence,
      root.id as root_id,
      root.action,
      root.payload
    from bundle_undos undo_tx
    join public.move_transactions root
      on root.id =
        nullif(undo_tx.payload ->> 'reverts_root_transaction_id', '')::uuid
  )
  select
    count(*)::integer,
    max(originals.undo_history_sequence),
    count(*) filter (where originals.action = 'MOVE')::integer,
    count(*) filter (
      where coalesce(
        (originals.payload ->> 'placement_resource_override')::boolean,
        false
      )
      or originals.payload ->> 'engine_version'
        like 'M29.%placement-resource-override%'
    )::integer
  into
    v_bundle_undo_count,
    v_bundle_undo_max_sequence,
    v_move_count,
    v_override_count
  from originals;

  if v_bundle_undo_count < 1 then
    raise exception 'M33.4.1 bundle has no redoable undo rows: %',
      v_bundle_id;
  end if;

  -- Any later manual scheduling decision invalidates this redo branch.
  if exists (
    select 1
    from public.move_transactions transaction
    where transaction.schedule_revision_id = v_revision_id
      and transaction.actor_type = 'USER'
      and transaction.root_transaction_id is null
      and transaction.parent_transaction_id is null
      and transaction.payload ->> 'source' = 'MANUAL'
      and transaction.history_sequence > v_bundle_undo_max_sequence
  ) then
    raise exception
      'M33.4.1 redo branch was invalidated by a newer manual scheduling decision';
  end if;

  -- Ordinary MOVE bundles are replayed simultaneously. Resource override
  -- bundles keep M29.5's dedicated safety preview/redo path.
  if v_move_count = v_bundle_undo_count
     and v_override_count = 0 then

    with bundle_undos as (
      select
        undo_tx.id as undo_id,
        coalesce((undo_tx.payload ->> 'bundle_index')::integer, 1)
          as bundle_index,
        nullif(
          undo_tx.payload ->> 'reverts_root_transaction_id',
          ''
        )::uuid as root_id
      from public.move_transactions undo_tx
      where undo_tx.schedule_revision_id = v_revision_id
        and undo_tx.actor_type = 'USER'
        and undo_tx.root_transaction_id is null
        and undo_tx.parent_transaction_id is null
        and undo_tx.payload ->> 'source' = 'ROOT_UNDO'
        and undo_tx.payload ->> 'bundle_id' = v_bundle_id::text
        and undo_tx.redone_at is null
        and undo_tx.redone_by_transaction_id is null
    )
    select jsonb_agg(
      jsonb_build_object(
        'card_id', root.payload ->> 'card_id',
        'day_of_week', root.payload -> 'after' ->> 'day_of_week',
        'start_period', root.payload -> 'after' ->> 'start_period',
        'teacher_id', root.payload -> 'after' ->> 'teacher_id',
        'room_id', root.payload -> 'after' ->> 'room_id'
      )
      order by bundle_undos.bundle_index
    )
    into v_items
    from bundle_undos
    join public.move_transactions root
      on root.id = bundle_undos.root_id
    where root.action = 'MOVE';

    if v_items is null
       or jsonb_array_length(v_items) <> v_bundle_undo_count then
      raise exception 'M33.4.1 could not reconstruct MOVE bundle target';
    end if;

    v_last_redo_id := public.management_move_card_bundle(v_items);

    select nullif(root.payload ->> 'bundle_id', '')::uuid
    into v_new_bundle_id
    from public.move_transactions root
    where root.id = v_last_redo_id;

    if v_new_bundle_id is null then
      raise exception 'M33.4.1 replayed MOVE bundle has no bundle id';
    end if;

    -- Convert the newly replayed MANUAL roots into ROOT_REDO audit roots and
    -- link each original ROOT_UNDO to the replayed card root.
    with redo_roots as (
      select
        root.id,
        root.payload ->> 'card_id' as card_id
      from public.move_transactions root
      where root.schedule_revision_id = v_revision_id
        and root.actor_type = 'USER'
        and root.root_transaction_id is null
        and root.parent_transaction_id is null
        and root.reverted_at is null
        and root.payload ->> 'bundle_id' = v_new_bundle_id::text
    ),
    undo_map as (
      select
        undo_tx.id as undo_id,
        original.id as original_root_id,
        original.payload ->> 'card_id' as card_id
      from public.move_transactions undo_tx
      join public.move_transactions original
        on original.id =
          nullif(
            undo_tx.payload ->> 'reverts_root_transaction_id',
            ''
          )::uuid
      where undo_tx.schedule_revision_id = v_revision_id
        and undo_tx.actor_type = 'USER'
        and undo_tx.root_transaction_id is null
        and undo_tx.parent_transaction_id is null
        and undo_tx.payload ->> 'source' = 'ROOT_UNDO'
        and undo_tx.payload ->> 'bundle_id' = v_bundle_id::text
        and undo_tx.redone_at is null
        and undo_tx.redone_by_transaction_id is null
    ),
    changed_roots as (
      update public.move_transactions root
      set payload = root.payload || jsonb_build_object(
        'source', 'ROOT_REDO',
        'engine_version', 'M33.4.1-bundle-redo',
        'redo_of_undo_transaction_id', undo_map.undo_id,
        'replays_root_transaction_id', undo_map.original_root_id
      )
      from undo_map
      where root.id in (
        select redo_roots.id
        from redo_roots
        where redo_roots.card_id = undo_map.card_id
      )
      returning root.id, root.payload ->> 'card_id' as card_id
    )
    update public.move_transactions undo_tx
    set
      redone_at = v_redone_at,
      redone_by_transaction_id = changed_roots.id
    from changed_roots
    join undo_map
      on undo_map.card_id = changed_roots.card_id
    where undo_tx.id = undo_map.undo_id;

    if (
      select count(*)
      from public.move_transactions undo_tx
      where undo_tx.schedule_revision_id = v_revision_id
        and undo_tx.payload ->> 'source' = 'ROOT_UNDO'
        and undo_tx.payload ->> 'bundle_id' = v_bundle_id::text
        and undo_tx.redone_at = v_redone_at
    ) <> v_bundle_undo_count then
      raise exception 'M33.4.1 failed to mark complete MOVE bundle as redone';
    end if;

    return v_last_redo_id;
  end if;

  -- Legacy fallback for PLACE/REMOVE bundles and M29 resource overrides.
  for v_undo_id, v_bundle_index in
    select
      undo_tx.id,
      coalesce((undo_tx.payload ->> 'bundle_index')::integer, 1)
    from public.move_transactions undo_tx
    where undo_tx.schedule_revision_id = v_revision_id
      and undo_tx.actor_type = 'USER'
      and undo_tx.root_transaction_id is null
      and undo_tx.parent_transaction_id is null
      and undo_tx.payload ->> 'source' = 'ROOT_UNDO'
      and undo_tx.payload ->> 'bundle_id' = v_bundle_id::text
      and undo_tx.redone_at is null
      and undo_tx.redone_by_transaction_id is null
    order by undo_tx.history_sequence desc, undo_tx.id::text desc
  loop
    v_redo_id := public.redo_management_undo_transaction(v_undo_id);

    perform public.management_tag_bundle_root(
      v_redo_id,
      v_bundle_id,
      v_bundle_index,
      v_bundle_size,
      v_bundle_card_ids
    );

    v_last_redo_id := v_redo_id;
  end loop;

  if v_last_redo_id is null then
    raise exception 'M33.4.1 bundle has no redoable undo rows: %',
      v_bundle_id;
  end if;

  return v_last_redo_id;
end
$$;

comment on function public.management_redo_bundle(uuid) is
  'M33.4.1 bundle-aware redo. Ordinary MOVE bundles are validated/replayed simultaneously so sibling cards cannot falsely block one another; M29 resource overrides preserve specialized redo safety.';

revoke all
  on function public.management_redo_bundle(uuid)
  from public, anon;

grant execute
  on function public.management_redo_bundle(uuid)
  to authenticated;

commit;
