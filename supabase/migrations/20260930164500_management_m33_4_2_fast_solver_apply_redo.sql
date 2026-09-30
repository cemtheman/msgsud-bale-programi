-- Management M33.4.2
-- Fast solver proposal apply + fast MOVE bundle redo.
--
-- Global solver proposals are derived from the immutable M33 structural
-- snapshot, not from occupancy-relative interactive candidate rows.
-- Keeping M15/M26 candidate-domain refreshes inside the atomic apply/redo
-- transaction makes multi-card solver operations unnecessarily expensive and
-- has produced statement timeouts.
--
-- This migration:
--   * adds a cheap placement baseline hash guard at the database boundary;
--   * applies solver proposals atomically without candidate-domain writes;
--   * validates final time/resource/group overlaps directly;
--   * replays already-applied-and-undone MOVE bundles without re-running the
--     interactive candidate engine;
--   * leaves interactive candidate rows lazy/on-demand. Drag/assistant flows
--     already refresh their selected card groups before using them.

begin;

create or replace function public.management_solver_baseline_hash(
  p_schedule_revision_id uuid
)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select md5(
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cardId', card.id,
          'dayOfWeek', placement.day_of_week,
          'startPeriod', placement.start_period,
          'teacherId', placement.teacher_id,
          'roomId', placement.room_id
        )
        order by card.id
      ),
      '[]'::jsonb
    )::text
  )
  from public.schedule_cards card
  left join public.placements placement
    on placement.card_id = card.id
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.schedule_revision_id = p_schedule_revision_id
    and requirement.term_status = 'ACTIVE'
$$;

revoke all
  on function public.management_solver_baseline_hash(uuid)
  from public, anon, authenticated;


create or replace function public.management_write_move_member_fast(
  p_card_id uuid,
  p_day_of_week smallint,
  p_start_period smallint,
  p_teacher_id uuid,
  p_room_id uuid,
  p_engine_version text
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
    raise exception 'M33.4.2 placed card not found: %', p_card_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M33.4.2 move requires DRAFT revision';
  end if;

  if v_locked then
    raise exception 'M33.4.2 move rejected for locked card: %', p_card_id;
  end if;

  if v_before_day = p_day_of_week
     and v_before_start = p_start_period
     and v_before_teacher is not distinct from p_teacher_id
     and v_before_room is not distinct from p_room_id then
    raise exception 'M33.4.2 move is a no-op for card %', p_card_id;
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
      'engine_version', p_engine_version,
      'solver_proposal', true,
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
      'propagation_stop_reason', 'COMPLETE',
      'candidate_domain_refresh', 'DEFERRED_ON_DEMAND'
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
    raise exception 'M33.4.2 lost placement for card %', p_card_id;
  end if;

  return v_transaction_id;
end
$$;

revoke all
  on function public.management_write_move_member_fast(
    uuid, smallint, smallint, uuid, uuid, text
  )
  from public, anon, authenticated;


create or replace function public.management_validate_solver_move_bundle(
  p_schedule_revision_id uuid,
  p_items jsonb
)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_conflict_count integer;
  v_invalid_count integer;
begin
  -- Validate basic time bounds and lunch crossing.
  with requested as materialized (
    select
      nullif(entry.value ->> 'card_id', '')::uuid as card_id,
      nullif(entry.value ->> 'day_of_week', '')::smallint as day_of_week,
      nullif(entry.value ->> 'start_period', '')::smallint as start_period,
      nullif(entry.value ->> 'teacher_id', '')::uuid as teacher_id,
      nullif(entry.value ->> 'room_id', '')::uuid as room_id
    from jsonb_array_elements(p_items) entry(value)
  ),
  enriched as materialized (
    select
      requested.*,
      card.duration_periods,
      requirement.instructional_group_id
    from requested
    join public.schedule_cards card
      on card.id = requested.card_id
     and card.schedule_revision_id = p_schedule_revision_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
  )
  select count(*)::integer
  into v_invalid_count
  from enriched
  where day_of_week not between 1 and 5
     or start_period not between 1 and 12
     or start_period + duration_periods - 1 > 12
     or (
       start_period <= 5
       and start_period + duration_periods - 1 >= 6
     );

  if v_invalid_count > 0 then
    raise exception 'M33.4.2 proposal contains invalid time footprints';
  end if;

  -- External occupancy: requested cards are removed as one decision set.
  with requested as materialized (
    select
      nullif(entry.value ->> 'card_id', '')::uuid as card_id,
      nullif(entry.value ->> 'day_of_week', '')::smallint as day_of_week,
      nullif(entry.value ->> 'start_period', '')::smallint as start_period,
      nullif(entry.value ->> 'teacher_id', '')::uuid as teacher_id,
      nullif(entry.value ->> 'room_id', '')::uuid as room_id
    from jsonb_array_elements(p_items) entry(value)
  ),
  enriched as materialized (
    select
      requested.*,
      card.duration_periods,
      requirement.instructional_group_id
    from requested
    join public.schedule_cards card
      on card.id = requested.card_id
     and card.schedule_revision_id = p_schedule_revision_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
  ),
  occupied as materialized (
    select
      placement.card_id,
      placement.day_of_week,
      placement.start_period,
      occupied_card.duration_periods,
      placement.teacher_id,
      placement.room_id,
      occupied_requirement.instructional_group_id
    from public.placements placement
    join public.schedule_cards occupied_card
      on occupied_card.id = placement.card_id
    join public.course_requirements occupied_requirement
      on occupied_requirement.id = occupied_card.requirement_id
    where occupied_card.schedule_revision_id = p_schedule_revision_id
      and not exists (
        select 1
        from requested
        where requested.card_id = occupied_card.id
      )
  )
  select count(*)::integer
  into v_conflict_count
  from enriched target
  join occupied blocker
    on blocker.day_of_week = target.day_of_week
   and blocker.start_period <=
        target.start_period + target.duration_periods - 1
   and blocker.start_period + blocker.duration_periods - 1
        >= target.start_period
   and (
     (
       target.teacher_id is not null
       and blocker.teacher_id = target.teacher_id
     )
     or (
       target.room_id is not null
       and blocker.room_id = target.room_id
     )
     or public.management_instructional_groups_conflict(
       target.instructional_group_id,
       blocker.instructional_group_id
     )
   );

  if v_conflict_count > 0 then
    raise exception
      'M33.4.2 proposal conflicts with current external occupancy';
  end if;

  -- Internal occupancy: no two requested targets may collide with one another.
  with requested as materialized (
    select
      row_number() over () as row_no,
      nullif(entry.value ->> 'card_id', '')::uuid as card_id,
      nullif(entry.value ->> 'day_of_week', '')::smallint as day_of_week,
      nullif(entry.value ->> 'start_period', '')::smallint as start_period,
      nullif(entry.value ->> 'teacher_id', '')::uuid as teacher_id,
      nullif(entry.value ->> 'room_id', '')::uuid as room_id
    from jsonb_array_elements(p_items) entry(value)
  ),
  enriched as materialized (
    select
      requested.*,
      card.duration_periods,
      requirement.instructional_group_id
    from requested
    join public.schedule_cards card
      on card.id = requested.card_id
     and card.schedule_revision_id = p_schedule_revision_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
  )
  select count(*)::integer
  into v_conflict_count
  from enriched left_item
  join enriched right_item
    on left_item.row_no < right_item.row_no
   and left_item.day_of_week = right_item.day_of_week
   and left_item.start_period <=
        right_item.start_period + right_item.duration_periods - 1
   and right_item.start_period <=
        left_item.start_period + left_item.duration_periods - 1
   and (
     (
       left_item.teacher_id is not null
       and left_item.teacher_id = right_item.teacher_id
     )
     or (
       left_item.room_id is not null
       and left_item.room_id = right_item.room_id
     )
     or public.management_instructional_groups_conflict(
       left_item.instructional_group_id,
       right_item.instructional_group_id
     )
   );

  if v_conflict_count > 0 then
    raise exception
      'M33.4.2 proposal contains internal teacher, room, or group conflicts';
  end if;
end
$$;

revoke all
  on function public.management_validate_solver_move_bundle(uuid, jsonb)
  from public, anon, authenticated;


create or replace function public.management_apply_solver_proposal_bundle(
  p_items jsonb,
  p_expected_baseline_hash text
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
  v_current_baseline_hash text;
  v_bundle_id uuid;
  v_transaction_id uuid;
  v_last_transaction_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M33.4.2 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'M33.4.2 solver proposal requires a JSON array';
  end if;

  v_bundle_size := jsonb_array_length(p_items);
  if v_bundle_size < 1 or v_bundle_size > 24 then
    raise exception 'M33.4.2 solver proposal requires 1..24 cards';
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
    raise exception 'M33.4.2 solver proposal contains duplicate card ids';
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
      'M33.4.2 solver proposal requires known cards from one revision';
  end if;

  v_revision_id := v_revision_ids[1];

  perform 1
  from public.schedule_revisions revision
  where revision.id = v_revision_id
    and revision.status = 'DRAFT'
  for update;

  if not found then
    raise exception 'M33.4.2 solver proposal requires DRAFT revision';
  end if;

  if exists (
    select 1
    from public.schedule_cards card
    where card.id = any(v_card_ids)
      and card.locked
  ) then
    raise exception 'M33.4.2 solver proposal contains locked card';
  end if;

  if (
    select count(*)
    from public.placements placement
    where placement.card_id = any(v_card_ids)
  ) <> v_bundle_size then
    raise exception 'M33.4.2 solver proposal requires all cards to be placed';
  end if;

  v_current_baseline_hash :=
    public.management_solver_baseline_hash(v_revision_id);

  if p_expected_baseline_hash is null
     or v_current_baseline_hash is distinct from p_expected_baseline_hash then
    raise exception
      'M33.4.2 solver proposal baseline is stale';
  end if;

  perform public.management_validate_solver_move_bundle(
    v_revision_id,
    p_items
  );

  for v_item, v_index in
    select entry.value, entry.ordinality::integer
    from jsonb_array_elements(p_items) with ordinality
      as entry(value, ordinality)
  loop
    v_transaction_id :=
      public.management_write_move_member_fast(
        nullif(v_item ->> 'card_id', '')::uuid,
        nullif(v_item ->> 'day_of_week', '')::smallint,
        nullif(v_item ->> 'start_period', '')::smallint,
        nullif(v_item ->> 'teacher_id', '')::uuid,
        nullif(v_item ->> 'room_id', '')::uuid,
        'M33.4.2-solver-proposal'
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

  if v_last_transaction_id is null then
    raise exception 'M33.4.2 solver proposal produced no transaction';
  end if;

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

revoke all
  on function public.management_apply_solver_proposal_bundle(jsonb, text)
  from public, anon;

grant execute
  on function public.management_apply_solver_proposal_bundle(jsonb, text)
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
  v_items jsonb;
  v_current_mismatch_count integer;
  v_last_redo_id uuid;
  v_new_bundle_id uuid;
  v_redone_at timestamptz := clock_timestamp();
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M33.4.2 management EDITOR role required'
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
    raise exception 'M33.4.2 redoable bundle undo not found: %',
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
    raise exception 'M33.4.2 redo cannot cross a structural history epoch';
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
      root.payload,
      coalesce((undo_tx.payload ->> 'bundle_index')::integer, 1)
        as bundle_index
    from bundle_undos undo_tx
    join public.move_transactions root
      on root.id =
        nullif(undo_tx.payload ->> 'reverts_root_transaction_id', '')::uuid
  )
  select
    count(*)::integer,
    max(originals.undo_history_sequence),
    count(*) filter (where originals.action = 'MOVE')::integer,
    jsonb_agg(
      jsonb_build_object(
        'undo_id', originals.undo_id,
        'root_id', originals.root_id,
        'bundle_index', originals.bundle_index,
        'card_id', originals.payload ->> 'card_id',
        'before', originals.payload -> 'before',
        'after', originals.payload -> 'after'
      )
      order by originals.bundle_index
    )
  into
    v_bundle_undo_count,
    v_bundle_undo_max_sequence,
    v_move_count,
    v_items
  from originals;

  if v_bundle_undo_count < 1 then
    raise exception 'M33.4.2 bundle has no redoable undo rows: %',
      v_bundle_id;
  end if;

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
      'M33.4.2 redo branch was invalidated by a newer manual scheduling decision';
  end if;

  if v_move_count = v_bundle_undo_count then
    -- The undo branch itself proves the original targets were once committed.
    -- Verify every card still matches its undone before-state; then replay the
    -- bundle directly. No occupancy-relative candidate rebuild is required.
    with expected as (
      select
        nullif(item.value ->> 'card_id', '')::uuid as card_id,
        item.value -> 'before' as before_state
      from jsonb_array_elements(v_items) item(value)
    )
    select count(*)::integer
    into v_current_mismatch_count
    from expected
    left join public.placements placement
      on placement.card_id = expected.card_id
    where placement.id is null
       or placement.day_of_week is distinct from
          nullif(expected.before_state ->> 'day_of_week', '')::smallint
       or placement.start_period is distinct from
          nullif(expected.before_state ->> 'start_period', '')::smallint
       or placement.teacher_id is distinct from
          nullif(expected.before_state ->> 'teacher_id', '')::uuid
       or placement.room_id is distinct from
          nullif(expected.before_state ->> 'room_id', '')::uuid;

    if v_current_mismatch_count > 0 then
      raise exception
        'M33.4.2 redo rejected because current placements no longer match the undone state';
    end if;

    perform public.management_validate_solver_move_bundle(
      v_revision_id,
      (
        select jsonb_agg(
          jsonb_build_object(
            'card_id', item.value ->> 'card_id',
            'day_of_week', item.value -> 'after' ->> 'day_of_week',
            'start_period', item.value -> 'after' ->> 'start_period',
            'teacher_id', item.value -> 'after' ->> 'teacher_id',
            'room_id', item.value -> 'after' ->> 'room_id'
          )
          order by (item.value ->> 'bundle_index')::integer
        )
        from jsonb_array_elements(v_items) item(value)
      )
    );

    -- Create replay roots directly, one atomic transaction.
    for v_items in
      select item.value
      from jsonb_array_elements(v_items) item(value)
      order by (item.value ->> 'bundle_index')::integer
    loop
      v_last_redo_id :=
        public.management_write_move_member_fast(
          nullif(v_items ->> 'card_id', '')::uuid,
          nullif(v_items -> 'after' ->> 'day_of_week', '')::smallint,
          nullif(v_items -> 'after' ->> 'start_period', '')::smallint,
          nullif(v_items -> 'after' ->> 'teacher_id', '')::uuid,
          nullif(v_items -> 'after' ->> 'room_id', '')::uuid,
          'M33.4.2-bundle-redo'
        );

      if v_new_bundle_id is null then
        v_new_bundle_id := v_last_redo_id;
      end if;

      perform public.management_tag_bundle_root(
        v_last_redo_id,
        v_new_bundle_id,
        (v_items ->> 'bundle_index')::integer,
        v_bundle_size,
        v_bundle_card_ids
      );

      update public.move_transactions redo_tx
      set payload = redo_tx.payload || jsonb_build_object(
        'source', 'ROOT_REDO',
        'redo_of_undo_transaction_id',
          nullif(v_items ->> 'undo_id', '')::uuid,
        'replays_root_transaction_id',
          nullif(v_items ->> 'root_id', '')::uuid
      )
      where redo_tx.id = v_last_redo_id;

      update public.move_transactions undo_tx
      set
        redone_at = v_redone_at,
        redone_by_transaction_id = v_last_redo_id
      where undo_tx.id =
        nullif(v_items ->> 'undo_id', '')::uuid;
    end loop;

    return v_last_redo_id;
  end if;

  -- Non-MOVE legacy bundles retain the established per-root redo path.
  declare
    v_undo_id uuid;
    v_bundle_index integer;
    v_redo_id uuid;
  begin
    v_last_redo_id := null;

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
      raise exception 'M33.4.2 bundle has no redoable undo rows: %',
        v_bundle_id;
    end if;

    return v_last_redo_id;
  end;
end
$$;

comment on function public.management_apply_solver_proposal_bundle(jsonb, text) is
  'M33.4.2 fast atomic solver proposal apply. Uses M33 baseline stale guard and direct hard overlap validation; interactive candidate domains are refreshed lazily on later drag/assistant use.';

comment on function public.management_redo_bundle(uuid) is
  'M33.4.2 fast atomic MOVE bundle redo. Replays a previously committed target from its exact undone before-state without occupancy-relative candidate rebuilds.';

revoke all
  on function public.management_redo_bundle(uuid)
  from public, anon;

grant execute
  on function public.management_redo_bundle(uuid)
  to authenticated;

commit;
