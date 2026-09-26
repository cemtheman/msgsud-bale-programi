-- Management M29.5
-- Redo support for placement resource overrides without requirement-pool membership.

begin;

create or replace function public.redo_management_undo_transaction(
  p_undo_transaction_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_revision_id uuid;
  v_revision_status text;
  v_undo_history_sequence bigint;
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

  v_is_resource_override boolean := false;
  v_override_resource_type text;
  v_override_resource_id uuid;
  v_override_card_ids uuid[];
  v_override_preview jsonb;

  v_redo_transaction_id uuid;
  v_redone_at timestamptz := clock_timestamp();
  v_auto_count integer := 0;
  v_contradiction_count integer;
  v_forced_remaining_count integer;
  v_unplaced_count integer;
  v_stop_reason text;
begin
  if p_undo_transaction_id is null then
    raise exception 'M26.1 redo requires ROOT_UNDO transaction id';
  end if;

  select
    revision.id,
    revision.status,
    undo_tx.history_sequence,
    (undo_tx.payload ->> 'reverts_root_transaction_id')::uuid,
    coalesce((undo_tx.payload ->> 'reverted_transaction_count')::integer, 0)
  into
    v_revision_id,
    v_revision_status,
    v_undo_history_sequence,
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
    raise exception 'M26.1 active redoable ROOT_UNDO not found: %',
      p_undo_transaction_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M26.1 redo requires DRAFT revision, found %',
      v_revision_status;
  end if;

  if v_original_root_id is null then
    raise exception 'M26.1 ROOT_UNDO is missing reverts_root_transaction_id';
  end if;

  if exists (
    select 1
    from public.move_transactions transaction
    where transaction.schedule_revision_id = v_revision_id
      and transaction.actor_type = 'USER'
      and transaction.root_transaction_id is null
      and transaction.parent_transaction_id is null
      and transaction.payload ->> 'source' = 'MANUAL'
      and transaction.history_sequence > v_undo_history_sequence
  ) then
    raise exception
      'M26.1 redo branch was invalidated by a newer manual scheduling decision';
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
        and manual_tx.history_sequence > candidate.history_sequence
    )
  order by candidate.history_sequence desc
  limit 1;

  if v_latest_redoable_undo_id is distinct from p_undo_transaction_id then
    raise exception
      'M26.1 redo is LIFO: latest redoable undo is %, requested %',
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
      'M26.1 original reverted root is missing or does not belong to this undo: %',
      v_original_root_id;
  end if;

  select count(*)
  into v_actual_reverted_count
  from public.move_transactions transaction
  where (
    transaction.id = v_original_root_id
    or transaction.root_transaction_id = v_original_root_id
  )
    and transaction.reverted_at is not null
    and transaction.reverted_by_transaction_id = p_undo_transaction_id;

  if v_actual_reverted_count <> v_expected_chain_count then
    raise exception
      'M26.1 reverted chain mismatch: undo expected %, found %',
      v_expected_chain_count,
      v_actual_reverted_count;
  end if;

  v_original_card_id := nullif(v_original_payload ->> 'card_id', '')::uuid;
  v_original_before := v_original_payload -> 'before';
  v_original_after := v_original_payload -> 'after';

  v_is_resource_override :=
    coalesce(
      (v_original_payload ->> 'placement_resource_override')::boolean,
      false
    )
    or v_original_payload ->> 'engine_version'
       = 'M29.4-placement-resource-override';

  if v_is_resource_override then
    select coalesce(
      array_agg(value::uuid),
      array[v_original_card_id]::uuid[]
    )
    into v_override_card_ids
    from jsonb_array_elements_text(
      coalesce(
        v_original_payload -> 'bundle_card_ids',
        to_jsonb(array[v_original_card_id]::uuid[])
      )
    ) as item(value);
  end if;

  if v_original_card_id is null then
    raise exception 'M26.1 original root is missing card_id';
  end if;

  select card.locked
  into v_locked
  from public.schedule_cards card
  where card.id = v_original_card_id
    and card.schedule_revision_id = v_revision_id;

  if not found then
    raise exception 'M26.1 redo card is missing from revision: %',
      v_original_card_id;
  end if;

  if v_locked then
    raise exception 'M26.1 redo rejected for locked card: %',
      v_original_card_id;
  end if;

  if v_original_action in ('MOVE', 'REMOVE') then
    if v_original_before is null
       or jsonb_typeof(v_original_before) <> 'object' then
      raise exception 'M26.1 % redo requires original before snapshot',
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
      raise exception 'M26.1 % redo requires current restored placement for card %',
        v_original_action,
        v_original_card_id;
    end if;

    if v_current_day is distinct from (v_original_before ->> 'day_of_week')::smallint
       or v_current_start is distinct from (v_original_before ->> 'start_period')::smallint
       or v_current_teacher is distinct from (v_original_before ->> 'teacher_id')::uuid
       or v_current_room is distinct from (v_original_before ->> 'room_id')::uuid then
      raise exception
        'M26.1 % redo rejected because current placement no longer matches the undone before-state',
        v_original_action;
    end if;
  else
    if exists (
      select 1
      from public.placements placement
      where placement.card_id = v_original_card_id
    ) then
      raise exception 'M26.1 PLACE redo requires card to remain unplaced: %',
        v_original_card_id;
    end if;
  end if;

  if v_original_action in ('PLACE', 'MOVE') then
    if v_original_after is null
       or jsonb_typeof(v_original_after) <> 'object' then
      raise exception 'M26.1 % redo requires original after snapshot',
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
      raise exception 'M26.1 % redo target snapshot is incomplete',
        v_original_action;
    end if;

    if v_is_resource_override and v_original_action = 'MOVE' then
      if
        (v_original_before ->> 'teacher_id')::uuid
          is distinct from v_target_teacher
        and
        (v_original_before ->> 'room_id')::uuid
          is not distinct from v_target_room
      then
        v_override_resource_type := 'TEACHER';
        v_override_resource_id := v_target_teacher;

      elsif
        (v_original_before ->> 'room_id')::uuid
          is distinct from v_target_room
        and
        (v_original_before ->> 'teacher_id')::uuid
          is not distinct from v_target_teacher
      then
        v_override_resource_type := 'ROOM';
        v_override_resource_id := v_target_room;

      else
        raise exception
          'M29.5 override redo requires exactly one resource change';
      end if;

      v_override_preview :=
        public.management_preview_placement_resource_change(
          v_override_card_ids,
          v_override_resource_type,
          v_override_resource_id
        );

      if coalesce(
        (v_override_preview ->> 'canApply')::boolean,
        false
      ) is not true then
        raise exception
          'M29.5 override redo is no longer safe';
      end if;

      v_candidate_id := null;

    else
      v_candidate_id := public.refresh_management_candidate_exact(
        v_revision_id,
        v_original_card_id,
        v_target_day,
        v_target_start,
        v_target_teacher,
        v_target_room
      );

      select
        assessment.status,
        assessment.reason_codes
      into
        v_candidate_status,
        v_reason_codes
      from public.schedule_card_candidate_assessments assessment
      where assessment.id = v_candidate_id;

      if v_candidate_id is null then
        raise exception
          'M26.1 redo target candidate no longer exists for card %',
          v_original_card_id;
      end if;

      if v_candidate_status <> 'VALID' then
        raise exception
          'M26.1 redo target is %, reasons %',
          v_candidate_status,
          coalesce(v_reason_codes, array[]::text[]);
      end if;
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
          'engine_version', 'M26.1-v1',
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
          'engine_version', case
            when v_is_resource_override
              then 'M29.5-placement-resource-override-redo'
            else 'M26.1-v1'
          end,
          'placement_resource_override', v_is_resource_override,
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
          'engine_version', 'M26.1-v1',
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
      raise exception 'M26.1 MOVE redo lost its locked placement';
    end if;

    if v_is_resource_override then
      v_auto_count := 0;
    else
      v_auto_count := public.propagate_management_forced_cards(
        v_revision_id,
        v_redo_transaction_id,
        v_redo_transaction_id
      );
    end if;

  else
    delete from public.placements placement
    where placement.id = v_placement_id;

    if not found then
      raise exception 'M26.1 REMOVE redo lost its locked placement';
    end if;

    perform public.refresh_management_candidate_domain_delta(
      v_revision_id,
      v_original_card_id,
      v_current_day,
      v_current_start,
      v_current_teacher,
      v_current_room,
      null,
      null,
      null,
      null
    );

    v_auto_count := 0;
  end if;

  select count(*)
  into v_contradiction_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card
    on card.id = summary.card_id
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
  join public.schedule_cards card
    on card.id = summary.card_id
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
    raise exception 'M26.1 redo propagation stopped with % forced cards remaining',
      v_forced_remaining_count;
  else
    v_stop_reason := 'NO_FORCED_CANDIDATE';
  end if;

  update public.move_transactions transaction
  set payload = transaction.payload || jsonb_build_object(
    'propagation_auto_count', v_auto_count,
    'propagation_stop_reason', v_stop_reason,
    'propagation_contradiction_count', v_contradiction_count,
    'remaining_unplaced_count', v_unplaced_count,
    'candidate_domain_refresh', 'DELTA_PASS'
  )
  where transaction.id = v_redo_transaction_id;

  update public.move_transactions undo_tx
  set
    redone_at = v_redone_at,
    redone_by_transaction_id = v_redo_transaction_id
  where undo_tx.id = p_undo_transaction_id
    and undo_tx.redone_at is null
    and undo_tx.redone_by_transaction_id is null;

  if not found then
    raise exception 'M26.1 redo lost ownership of ROOT_UNDO transaction';
  end if;

  return v_redo_transaction_id;
end
$$;

commit;
