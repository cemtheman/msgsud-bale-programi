-- Management M32.3.7
-- Coordinated teacher reconciliation apply + atomic undo/redo.
--
-- Extends M32.3.6 FINAL_COORDINATED_STATE preview with a durable scheduling
-- command. Different requirements may target different teachers in one atomic
-- user decision.
--
-- The implementation intentionally does NOT reuse M29 same-resource redo,
-- because a coordinated plan may assign different teachers to different cards.
--
-- History model:
--   * one USER/MOVE root per changed card
--   * every root shares one bundle_id and M32.3.7 bundle_engine_version
--   * current day/start/room are preserved
--   * coordinated assignments are stored on every root
--   * custom bundle undo/redo restores/replays the complete final state
--   * generic M26 bundle undo/redo dispatches to M32.3.7 when it sees this
--     bundle engine, so the existing global Undo/Redo UI remains authoritative.
--
-- No requirement teacher-pool mutation. No publication mutation.

begin;


create or replace function public.management_apply_coordinated_teacher_reconciliation(
  p_assignments jsonb,
  p_expected_state_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_preview jsonb;
  v_revision_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_index integer;
  v_bundle_id uuid;
  v_root_id uuid;
  v_last_root_id uuid;
  v_bundle_card_ids jsonb;
  v_changed_count integer;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M32.3.7 management EDITOR role required'
      using errcode = '42501';
  end if;

  v_preview :=
    public.management_preview_coordinated_teacher_reconciliation(
      p_assignments
    );

  if p_expected_state_token is null
     or p_expected_state_token is distinct from (v_preview ->> 'stateToken') then
    raise exception 'M32.3.7 coordinated preview is stale';
  end if;

  if coalesce((v_preview ->> 'canApply')::boolean, false) is not true then
    raise exception 'M32.3.7 coordinated reconciliation apply blocked';
  end if;

  v_revision_id := (v_preview ->> 'revisionId')::uuid;
  v_changed_count := (v_preview ->> 'changedBlockCount')::integer;

  if v_changed_count < 1 or v_changed_count > 96 then
    raise exception
      'M32.3.7 coordinated reconciliation requires 1..96 changed blocks';
  end if;

  with plan as materialized (
    select
      (entry.value ->> 'requirementId')::uuid as requirement_id,
      (entry.value ->> 'teacherId')::uuid as teacher_id
    from jsonb_array_elements(p_assignments) entry(value)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', card.id,
        'requirementId', card.requirement_id,
        'blockIndex', card.block_index,
        'placementId', placement.id,
        'dayOfWeek', placement.day_of_week,
        'startPeriod', placement.start_period,
        'beforeTeacherId', placement.teacher_id,
        'afterTeacherId', plan.teacher_id,
        'roomId', placement.room_id,
        'beforeMoveTransactionId', placement.move_transaction_id,
        'createdAt', placement.created_at
      )
      order by card.requirement_id, card.block_index, card.id
    ),
    '[]'::jsonb
  )
  into v_items
  from plan
  join public.schedule_cards card
    on card.requirement_id = plan.requirement_id
   and card.schedule_revision_id = v_revision_id
  join public.placements placement
    on placement.card_id = card.id
  where placement.teacher_id is distinct from plan.teacher_id;

  if jsonb_array_length(v_items) <> v_changed_count then
    raise exception
      'M32.3.7 changed-card snapshot drifted from preview';
  end if;

  select jsonb_agg(entry.value ->> 'cardId' order by entry.ordinality)
  into v_bundle_card_ids
  from jsonb_array_elements(v_items) with ordinality
    as entry(value, ordinality);

  for v_item, v_index in
    select
      entry.value,
      entry.ordinality::integer
    from jsonb_array_elements(v_items) with ordinality
      as entry(value, ordinality)
  loop
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
        'engine_version', 'M32.3.7-coordinated-teacher',
        'coordinated_teacher_reconciliation', true,
        'card_id', (v_item ->> 'cardId')::uuid,
        'requirement_id', (v_item ->> 'requirementId')::uuid,
        'before', jsonb_build_object(
          'placement_id', (v_item ->> 'placementId')::uuid,
          'card_id', (v_item ->> 'cardId')::uuid,
          'day_of_week', (v_item ->> 'dayOfWeek')::smallint,
          'start_period', (v_item ->> 'startPeriod')::smallint,
          'teacher_id', nullif(v_item ->> 'beforeTeacherId', '')::uuid,
          'room_id', nullif(v_item ->> 'roomId', '')::uuid,
          'move_transaction_id',
            nullif(v_item ->> 'beforeMoveTransactionId', '')::uuid,
          'created_at', (v_item ->> 'createdAt')::timestamptz
        ),
        'after', jsonb_build_object(
          'placement_id', (v_item ->> 'placementId')::uuid,
          'card_id', (v_item ->> 'cardId')::uuid,
          'day_of_week', (v_item ->> 'dayOfWeek')::smallint,
          'start_period', (v_item ->> 'startPeriod')::smallint,
          'teacher_id', (v_item ->> 'afterTeacherId')::uuid,
          'room_id', nullif(v_item ->> 'roomId', '')::uuid
        ),
        'coordinated_assignments', p_assignments,
        'propagation_auto_count', 0,
        'propagation_stop_reason', 'COORDINATED_TEACHER_RECONCILIATION',
        'candidate_domain_refresh', 'DEFERRED'
      )
    )
    returning id into v_root_id;

    if v_bundle_id is null then
      v_bundle_id := v_root_id;
    end if;

    update public.move_transactions transaction
    set payload = transaction.payload || jsonb_build_object(
      'bundle_id', v_bundle_id,
      'bundle_index', v_index,
      'bundle_size', v_changed_count,
      'bundle_card_ids', v_bundle_card_ids,
      'bundle_engine_version', 'M32.3.7-coordinated-teacher'
    )
    where transaction.id = v_root_id;

    update public.placements placement
    set
      teacher_id = (v_item ->> 'afterTeacherId')::uuid,
      move_transaction_id = v_root_id,
      updated_at = now()
    where placement.id = (v_item ->> 'placementId')::uuid
      and placement.card_id = (v_item ->> 'cardId')::uuid
      and placement.day_of_week = (v_item ->> 'dayOfWeek')::smallint
      and placement.start_period = (v_item ->> 'startPeriod')::smallint
      and placement.teacher_id
        is not distinct from nullif(v_item ->> 'beforeTeacherId', '')::uuid
      and placement.room_id
        is not distinct from nullif(v_item ->> 'roomId', '')::uuid;

    if not found then
      raise exception
        'M32.3.7 placement changed after preview for card %',
        v_item ->> 'cardId';
    end if;

    v_last_root_id := v_root_id;
  end loop;

  -- All placement writes are complete before candidate deltas are refreshed,
  -- so every delta sees the coordinated final teacher state.
  for v_item in
    select entry.value
    from jsonb_array_elements(v_items) entry(value)
  loop
    perform public.refresh_management_candidate_domain_delta(
      v_revision_id,
      (v_item ->> 'cardId')::uuid,
      (v_item ->> 'dayOfWeek')::smallint,
      (v_item ->> 'startPeriod')::smallint,
      nullif(v_item ->> 'beforeTeacherId', '')::uuid,
      nullif(v_item ->> 'roomId', '')::uuid,
      (v_item ->> 'dayOfWeek')::smallint,
      (v_item ->> 'startPeriod')::smallint,
      (v_item ->> 'afterTeacherId')::uuid,
      nullif(v_item ->> 'roomId', '')::uuid
    );
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_assignments) entry(value)
    join public.schedule_cards card
      on card.requirement_id =
        (entry.value ->> 'requirementId')::uuid
     and card.schedule_revision_id = v_revision_id
    join public.placements placement
      on placement.card_id = card.id
    where placement.teacher_id is distinct from
      (entry.value ->> 'teacherId')::uuid
  ) then
    raise exception
      'M32.3.7 coordinated reconciliation did not converge';
  end if;

  return jsonb_build_object(
    'applied', true,
    'revisionId', v_revision_id,
    'assignmentCount', jsonb_array_length(p_assignments),
    'changedBlockCount', v_changed_count,
    'bundleId', v_bundle_id,
    'transactionId', v_last_root_id,
    'assignments', v_preview -> 'assignments',
    'preservedTime', true,
    'preservedRoom', true,
    'changedTeacherPools', false,
    'publishedChanged', false
  );
end
$$;


create or replace function public.management_undo_coordinated_teacher_reconciliation(
  p_root_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_bundle_id uuid;
  v_bundle_size integer;
  v_bundle_card_ids jsonb;
  v_history_sequence bigint;
  v_latest_structure_sequence bigint;
  v_latest_active_bundle_id uuid;
  v_assignments jsonb;
  v_root record;
  v_before jsonb;
  v_after jsonb;
  v_undo_id uuid;
  v_last_undo_id uuid;
  v_delta_items jsonb := '[]'::jsonb;
  v_reverted_at timestamptz := clock_timestamp();
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M32.3.7 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    root.schedule_revision_id,
    nullif(root.payload ->> 'bundle_id', '')::uuid,
    coalesce((root.payload ->> 'bundle_size')::integer, 1),
    coalesce(root.payload -> 'bundle_card_ids', '[]'::jsonb),
    root.history_sequence,
    root.payload -> 'coordinated_assignments'
  into
    v_revision_id,
    v_bundle_id,
    v_bundle_size,
    v_bundle_card_ids,
    v_history_sequence,
    v_assignments
  from public.move_transactions root
  where root.id = p_root_transaction_id
    and root.actor_type = 'USER'
    and root.action = 'MOVE'
    and root.root_transaction_id is null
    and root.parent_transaction_id is null
    and root.reverted_at is null
    and root.payload ->> 'source' in ('MANUAL', 'ROOT_REDO')
    and root.payload ->> 'bundle_engine_version'
      = 'M32.3.7-coordinated-teacher';

  if v_bundle_id is null then
    raise exception
      'M32.3.7 active coordinated bundle root not found: %',
      p_root_transaction_id;
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
    raise exception
      'M32.3.7 undo cannot cross a structural history epoch';
  end if;

  select nullif(latest.payload ->> 'bundle_id', '')::uuid
  into v_latest_active_bundle_id
  from public.move_transactions latest
  where latest.schedule_revision_id = v_revision_id
    and latest.actor_type = 'USER'
    and latest.action in ('PLACE', 'MOVE', 'REMOVE')
    and latest.root_transaction_id is null
    and latest.parent_transaction_id is null
    and latest.reverted_at is null
    and latest.payload ->> 'source' in ('MANUAL', 'ROOT_REDO')
  order by latest.history_sequence desc
  limit 1;

  if v_latest_active_bundle_id is distinct from v_bundle_id then
    raise exception
      'M32.3.7 undo is LIFO: a newer scheduling decision exists';
  end if;

  for v_root in
    select
      root.id,
      root.history_sequence,
      root.payload
    from public.move_transactions root
    where root.schedule_revision_id = v_revision_id
      and root.actor_type = 'USER'
      and root.action = 'MOVE'
      and root.root_transaction_id is null
      and root.parent_transaction_id is null
      and root.reverted_at is null
      and root.payload ->> 'source' in ('MANUAL', 'ROOT_REDO')
      and root.payload ->> 'bundle_id' = v_bundle_id::text
      and root.payload ->> 'bundle_engine_version'
        = 'M32.3.7-coordinated-teacher'
    order by root.history_sequence desc, root.id::text desc
  loop
    v_before := v_root.payload -> 'before';
    v_after := v_root.payload -> 'after';

    if v_before is null or v_after is null then
      raise exception
        'M32.3.7 coordinated root is missing before/after snapshot';
    end if;

    if not exists (
      select 1
      from public.placements placement
      where placement.card_id = (v_root.payload ->> 'card_id')::uuid
        and placement.move_transaction_id = v_root.id
        and placement.day_of_week =
          (v_after ->> 'day_of_week')::smallint
        and placement.start_period =
          (v_after ->> 'start_period')::smallint
        and placement.teacher_id
          is not distinct from (v_after ->> 'teacher_id')::uuid
        and placement.room_id
          is not distinct from (v_after ->> 'room_id')::uuid
    ) then
      raise exception
        'M32.3.7 coordinated undo state drifted for card %',
        v_root.payload ->> 'card_id';
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
        'source', 'ROOT_UNDO',
        'engine_version', 'M32.3.7-coordinated-teacher-undo',
        'coordinated_teacher_reconciliation', true,
        'reverts_root_transaction_id', v_root.id,
        'reverted_root_action', 'MOVE',
        'reverted_transaction_count', 1,
        'card_id', (v_root.payload ->> 'card_id')::uuid,
        'before', v_after,
        'after', v_before,
        'coordinated_assignments', v_assignments,
        'bundle_id', v_bundle_id,
        'bundle_index',
          coalesce((v_root.payload ->> 'bundle_index')::integer, 1),
        'bundle_size', v_bundle_size,
        'bundle_card_ids', v_bundle_card_ids,
        'bundle_engine_version', 'M32.3.7-coordinated-teacher'
      )
    )
    returning id into v_undo_id;

    update public.placements placement
    set
      day_of_week = (v_before ->> 'day_of_week')::smallint,
      start_period = (v_before ->> 'start_period')::smallint,
      teacher_id = nullif(v_before ->> 'teacher_id', '')::uuid,
      room_id = nullif(v_before ->> 'room_id', '')::uuid,
      move_transaction_id =
        nullif(v_before ->> 'move_transaction_id', '')::uuid,
      updated_at = now()
    where placement.card_id = (v_root.payload ->> 'card_id')::uuid
      and placement.move_transaction_id = v_root.id;

    if not found then
      raise exception
        'M32.3.7 coordinated undo lost placement for card %',
        v_root.payload ->> 'card_id';
    end if;

    update public.move_transactions transaction
    set
      reverted_at = v_reverted_at,
      reverted_by_transaction_id = v_undo_id
    where transaction.id = v_root.id
      and transaction.reverted_at is null;

    if not found then
      raise exception
        'M32.3.7 coordinated undo lost root transaction %',
        v_root.id;
    end if;

    v_delta_items := v_delta_items || jsonb_build_array(
      jsonb_build_object(
        'cardId', v_root.payload ->> 'card_id',
        'from', v_after,
        'to', v_before
      )
    );

    v_last_undo_id := v_undo_id;
  end loop;

  if v_last_undo_id is null then
    raise exception
      'M32.3.7 coordinated bundle has no active roots to undo';
  end if;

  for v_root in
    select entry.value as item
    from jsonb_array_elements(v_delta_items) entry(value)
  loop
    perform public.refresh_management_candidate_domain_delta(
      v_revision_id,
      (v_root.item ->> 'cardId')::uuid,
      ((v_root.item -> 'from') ->> 'day_of_week')::smallint,
      ((v_root.item -> 'from') ->> 'start_period')::smallint,
      nullif((v_root.item -> 'from') ->> 'teacher_id', '')::uuid,
      nullif((v_root.item -> 'from') ->> 'room_id', '')::uuid,
      ((v_root.item -> 'to') ->> 'day_of_week')::smallint,
      ((v_root.item -> 'to') ->> 'start_period')::smallint,
      nullif((v_root.item -> 'to') ->> 'teacher_id', '')::uuid,
      nullif((v_root.item -> 'to') ->> 'room_id', '')::uuid
    );
  end loop;

  return v_last_undo_id;
end
$$;


create or replace function public.management_redo_coordinated_teacher_reconciliation(
  p_undo_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_bundle_id uuid;
  v_bundle_size integer;
  v_bundle_card_ids jsonb;
  v_history_sequence bigint;
  v_assignments jsonb;
  v_latest_structure_sequence bigint;
  v_preview jsonb;
  v_undo record;
  v_original record;
  v_before jsonb;
  v_after jsonb;
  v_redo_id uuid;
  v_last_redo_id uuid;
  v_delta_items jsonb := '[]'::jsonb;
  v_redone_at timestamptz := clock_timestamp();
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M32.3.7 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    undo_tx.schedule_revision_id,
    nullif(undo_tx.payload ->> 'bundle_id', '')::uuid,
    coalesce((undo_tx.payload ->> 'bundle_size')::integer, 1),
    coalesce(undo_tx.payload -> 'bundle_card_ids', '[]'::jsonb),
    undo_tx.history_sequence,
    undo_tx.payload -> 'coordinated_assignments'
  into
    v_revision_id,
    v_bundle_id,
    v_bundle_size,
    v_bundle_card_ids,
    v_history_sequence,
    v_assignments
  from public.move_transactions undo_tx
  where undo_tx.id = p_undo_transaction_id
    and undo_tx.actor_type = 'USER'
    and undo_tx.root_transaction_id is null
    and undo_tx.parent_transaction_id is null
    and undo_tx.payload ->> 'source' = 'ROOT_UNDO'
    and undo_tx.payload ->> 'bundle_engine_version'
      = 'M32.3.7-coordinated-teacher'
    and undo_tx.redone_at is null
    and undo_tx.redone_by_transaction_id is null;

  if v_bundle_id is null then
    raise exception
      'M32.3.7 redoable coordinated undo not found: %',
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
    raise exception
      'M32.3.7 redo cannot cross a structural history epoch';
  end if;

  if exists (
    select 1
    from public.move_transactions transaction
    where transaction.schedule_revision_id = v_revision_id
      and transaction.actor_type = 'USER'
      and transaction.root_transaction_id is null
      and transaction.parent_transaction_id is null
      and transaction.payload ->> 'source' = 'MANUAL'
      and transaction.history_sequence > v_history_sequence
  ) then
    raise exception
      'M32.3.7 redo branch was invalidated by a newer manual scheduling decision';
  end if;

  v_preview :=
    public.management_preview_coordinated_teacher_reconciliation(
      v_assignments
    );

  if coalesce((v_preview ->> 'canApply')::boolean, false) is not true then
    raise exception
      'M32.3.7 coordinated redo is no longer safe';
  end if;

  for v_undo in
    select
      undo_tx.id,
      undo_tx.history_sequence,
      undo_tx.payload
    from public.move_transactions undo_tx
    where undo_tx.schedule_revision_id = v_revision_id
      and undo_tx.actor_type = 'USER'
      and undo_tx.root_transaction_id is null
      and undo_tx.parent_transaction_id is null
      and undo_tx.payload ->> 'source' = 'ROOT_UNDO'
      and undo_tx.payload ->> 'bundle_id' = v_bundle_id::text
      and undo_tx.payload ->> 'bundle_engine_version'
        = 'M32.3.7-coordinated-teacher'
      and undo_tx.redone_at is null
      and undo_tx.redone_by_transaction_id is null
    order by
      coalesce((undo_tx.payload ->> 'bundle_index')::integer, 1),
      undo_tx.history_sequence,
      undo_tx.id::text
  loop
    select
      original.id,
      original.payload
    into v_original
    from public.move_transactions original
    where original.id =
      (v_undo.payload ->> 'reverts_root_transaction_id')::uuid
      and original.reverted_at is not null
      and original.reverted_by_transaction_id = v_undo.id;

    if v_original.id is null then
      raise exception
        'M32.3.7 redo original root is missing for undo %',
        v_undo.id;
    end if;

    v_before := v_original.payload -> 'before';
    v_after := v_original.payload -> 'after';

    if not exists (
      select 1
      from public.placements placement
      where placement.card_id =
        (v_original.payload ->> 'card_id')::uuid
        and placement.day_of_week =
          (v_before ->> 'day_of_week')::smallint
        and placement.start_period =
          (v_before ->> 'start_period')::smallint
        and placement.teacher_id
          is not distinct from nullif(v_before ->> 'teacher_id', '')::uuid
        and placement.room_id
          is not distinct from nullif(v_before ->> 'room_id', '')::uuid
    ) then
      raise exception
        'M32.3.7 coordinated redo state drifted for card %',
        v_original.payload ->> 'card_id';
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
        'source', 'ROOT_REDO',
        'engine_version', 'M32.3.7-coordinated-teacher-redo',
        'coordinated_teacher_reconciliation', true,
        'redo_of_undo_transaction_id', v_undo.id,
        'replays_root_transaction_id', v_original.id,
        'card_id', (v_original.payload ->> 'card_id')::uuid,
        'requirement_id',
          nullif(v_original.payload ->> 'requirement_id', '')::uuid,
        'before', v_before,
        'after', v_after,
        'coordinated_assignments', v_assignments,
        'bundle_id', v_bundle_id,
        'bundle_index',
          coalesce((v_undo.payload ->> 'bundle_index')::integer, 1),
        'bundle_size', v_bundle_size,
        'bundle_card_ids', v_bundle_card_ids,
        'bundle_engine_version', 'M32.3.7-coordinated-teacher',
        'propagation_auto_count', 0,
        'propagation_stop_reason', 'COORDINATED_TEACHER_RECONCILIATION_REDO',
        'candidate_domain_refresh', 'DEFERRED'
      )
    )
    returning id into v_redo_id;

    update public.placements placement
    set
      day_of_week = (v_after ->> 'day_of_week')::smallint,
      start_period = (v_after ->> 'start_period')::smallint,
      teacher_id = (v_after ->> 'teacher_id')::uuid,
      room_id = nullif(v_after ->> 'room_id', '')::uuid,
      move_transaction_id = v_redo_id,
      updated_at = now()
    where placement.card_id =
      (v_original.payload ->> 'card_id')::uuid
      and placement.day_of_week =
        (v_before ->> 'day_of_week')::smallint
      and placement.start_period =
        (v_before ->> 'start_period')::smallint
      and placement.teacher_id
        is not distinct from nullif(v_before ->> 'teacher_id', '')::uuid
      and placement.room_id
        is not distinct from nullif(v_before ->> 'room_id', '')::uuid;

    if not found then
      raise exception
        'M32.3.7 coordinated redo lost placement for card %',
        v_original.payload ->> 'card_id';
    end if;

    update public.move_transactions undo_tx
    set
      redone_at = v_redone_at,
      redone_by_transaction_id = v_redo_id
    where undo_tx.id = v_undo.id
      and undo_tx.redone_at is null
      and undo_tx.redone_by_transaction_id is null;

    if not found then
      raise exception
        'M32.3.7 coordinated redo lost undo transaction %',
        v_undo.id;
    end if;

    v_delta_items := v_delta_items || jsonb_build_array(
      jsonb_build_object(
        'cardId', v_original.payload ->> 'card_id',
        'from', v_before,
        'to', v_after
      )
    );

    v_last_redo_id := v_redo_id;
  end loop;

  if v_last_redo_id is null then
    raise exception
      'M32.3.7 coordinated bundle has no redoable rows';
  end if;

  for v_undo in
    select entry.value as item
    from jsonb_array_elements(v_delta_items) entry(value)
  loop
    perform public.refresh_management_candidate_domain_delta(
      v_revision_id,
      (v_undo.item ->> 'cardId')::uuid,
      ((v_undo.item -> 'from') ->> 'day_of_week')::smallint,
      ((v_undo.item -> 'from') ->> 'start_period')::smallint,
      nullif((v_undo.item -> 'from') ->> 'teacher_id', '')::uuid,
      nullif((v_undo.item -> 'from') ->> 'room_id', '')::uuid,
      ((v_undo.item -> 'to') ->> 'day_of_week')::smallint,
      ((v_undo.item -> 'to') ->> 'start_period')::smallint,
      nullif((v_undo.item -> 'to') ->> 'teacher_id', '')::uuid,
      nullif((v_undo.item -> 'to') ->> 'room_id', '')::uuid
    );
  end loop;

  return v_last_redo_id;
end
$$;


-- Existing global bundle Undo/Redo remains the UI contract. Dispatch only the
-- new coordinated bundle engine; keep M26 behavior unchanged for all others.

create or replace function public.management_undo_bundle(
  p_root_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_bundle_engine_version text;
  v_revision_id uuid;
  v_history_sequence bigint;
  v_bundle_id uuid;
  v_bundle_size integer;
  v_bundle_card_ids jsonb;
  v_latest_structure_sequence bigint;
  v_root_id uuid;
  v_bundle_index integer;
  v_undo_id uuid;
  v_last_undo_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M32.3.7 management EDITOR role required'
      using errcode = '42501';
  end if;

  select transaction.payload ->> 'bundle_engine_version'
  into v_bundle_engine_version
  from public.move_transactions transaction
  where transaction.id = p_root_transaction_id;

  if v_bundle_engine_version = 'M32.3.7-coordinated-teacher' then
    return public.management_undo_coordinated_teacher_reconciliation(
      p_root_transaction_id
    );
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
  where transaction.id = p_root_transaction_id
    and transaction.actor_type = 'USER'
    and transaction.root_transaction_id is null
    and transaction.parent_transaction_id is null
    and transaction.reverted_at is null
    and transaction.payload ->> 'source' in ('MANUAL', 'ROOT_REDO');

  if v_bundle_id is null then
    raise exception 'M26 active bundle root not found: %',
      p_root_transaction_id;
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
    raise exception 'M26 undo cannot cross a structural history epoch';
  end if;

  for v_root_id, v_bundle_index in
    select
      root.id,
      coalesce((root.payload ->> 'bundle_index')::integer, 1)
    from public.move_transactions root
    where root.schedule_revision_id = v_revision_id
      and root.actor_type = 'USER'
      and root.root_transaction_id is null
      and root.parent_transaction_id is null
      and root.reverted_at is null
      and root.payload ->> 'source' in ('MANUAL', 'ROOT_REDO')
      and root.payload ->> 'bundle_id' = v_bundle_id::text
    order by root.history_sequence desc, root.id::text desc
  loop
    v_undo_id := public.undo_management_root_transaction(v_root_id);

    update public.move_transactions transaction
    set payload = coalesce(transaction.payload, '{}'::jsonb) || jsonb_build_object(
      'bundle_id', v_bundle_id,
      'bundle_index', v_bundle_index,
      'bundle_size', v_bundle_size,
      'bundle_card_ids', v_bundle_card_ids,
      'bundle_engine_version', 'M26-v1'
    )
    where transaction.id = v_undo_id;

    v_last_undo_id := v_undo_id;
  end loop;

  if v_last_undo_id is null then
    raise exception 'M26 bundle has no active roots to undo: %',
      v_bundle_id;
  end if;

  return v_last_undo_id;
end
$$;


create or replace function public.management_redo_bundle(
  p_undo_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_bundle_engine_version text;
  v_revision_id uuid;
  v_history_sequence bigint;
  v_bundle_id uuid;
  v_bundle_size integer;
  v_bundle_card_ids jsonb;
  v_latest_structure_sequence bigint;
  v_undo_id uuid;
  v_bundle_index integer;
  v_redo_id uuid;
  v_last_redo_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M32.3.7 management EDITOR role required'
      using errcode = '42501';
  end if;

  select transaction.payload ->> 'bundle_engine_version'
  into v_bundle_engine_version
  from public.move_transactions transaction
  where transaction.id = p_undo_transaction_id;

  if v_bundle_engine_version = 'M32.3.7-coordinated-teacher' then
    return public.management_redo_coordinated_teacher_reconciliation(
      p_undo_transaction_id
    );
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
    raise exception 'M26 redoable bundle undo not found: %',
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
    raise exception 'M26 redo cannot cross a structural history epoch';
  end if;

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
    raise exception 'M26 bundle has no redoable undo rows: %',
      v_bundle_id;
  end if;

  return v_last_redo_id;
end
$$;


revoke all
  on function public.management_apply_coordinated_teacher_reconciliation(
    jsonb, text
  )
  from public, anon;
revoke all
  on function public.management_undo_coordinated_teacher_reconciliation(uuid)
  from public, anon;
revoke all
  on function public.management_redo_coordinated_teacher_reconciliation(uuid)
  from public, anon;

grant execute
  on function public.management_apply_coordinated_teacher_reconciliation(
    jsonb, text
  )
  to authenticated;
grant execute
  on function public.management_undo_coordinated_teacher_reconciliation(uuid)
  to authenticated;
grant execute
  on function public.management_redo_coordinated_teacher_reconciliation(uuid)
  to authenticated;

comment on function public.management_apply_coordinated_teacher_reconciliation(
  jsonb, text
) is
  'M32.3.7 stale-safe atomic final-state teacher reconciliation for multiple REQUIREMENT+REQUIRED courses. Preserves day/start/room and stores one coordinated undo/redo bundle.';
comment on function public.management_undo_coordinated_teacher_reconciliation(uuid) is
  'M32.3.7 atomic coordinated teacher bundle undo with exact placement restoration and delta candidate refresh.';
comment on function public.management_redo_coordinated_teacher_reconciliation(uuid) is
  'M32.3.7 final-state validated coordinated teacher bundle redo; supports different target teachers within one user decision.';

commit;
