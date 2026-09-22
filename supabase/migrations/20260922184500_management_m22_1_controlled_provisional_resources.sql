-- Management / M22.1
-- Controlled provisional placement + resource reconciliation.
--
-- M22 proved that UNKNOWN resource identity can be represented as VALID
-- provisional candidate state. M22.1 exposes that state safely:
--   * manual PLACE/MOVE may accept NULL teacher/room only when the exact
--     candidate is VALID and its resolution status explicitly permits it
--   * resolved PLACE/MOVE continues through the previously validated engines
--   * later teacher/room discovery is reconciled with preview + stale-state
--     token + conflict simulation, without moving the lesson in time
--   * resource reconciliation has its own durable audit trail
--
-- SAFETY:
--   * no migration-time placement/resource decision
--   * no public schedule mutation
--   * no M20.3 invocation
--   * no publication/template unlock

begin;


-- -------------------------------------------------------------------------
-- CANDIDATE CERTAINTY REVALIDATION COMPATIBILITY
-- -------------------------------------------------------------------------
create or replace function public.management_apply_provisional_candidate_semantics()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $
declare
  v_reasons text[] :=
    coalesce(new.reason_codes, array[]::text[]);
  v_warnings text[] :=
    coalesce(new.warning_codes, array[]::text[]);
  v_hard_invalid boolean;
  v_hard_unresolved boolean;
begin
  -- Teacher UNKNOWN is knowledge uncertainty, not resource unavailability.
  if 'TEACHER_UNKNOWN' = any(v_reasons) then
    v_reasons := array(
      select reason
      from unnest(v_reasons) reason
      where reason <> 'TEACHER_UNKNOWN'
    );
    v_warnings :=
      v_warnings || array['TEACHER_IDENTITY_PROVISIONAL']::text[];
    new.teacher_resolution_status := 'PROVISIONAL_UNKNOWN';
  elsif 'TEACHER_ASSIGNMENT_MISSING' = any(v_reasons) then
    new.teacher_resolution_status := 'BLOCKED_MISSING_ASSIGNMENT';
  elsif new.teacher_id is null then
    -- Preserve explicit provisional state across M15 delta revalidation, whose
    -- static reason list no longer contains TEACHER_UNKNOWN after normalization.
    if new.teacher_resolution_status <> 'PROVISIONAL_UNKNOWN' then
      new.teacher_resolution_status := 'BLOCKED_MISSING_ASSIGNMENT';
    end if;
  else
    new.teacher_resolution_status := 'RESOLVED';
  end if;

  -- Room UNKNOWN is likewise schedulable. An unconfirmed capability match has a
  -- concrete room_id, so real room conflicts are still enforceable.
  if 'ROOM_UNKNOWN' = any(v_reasons) then
    v_reasons := array(
      select reason
      from unnest(v_reasons) reason
      where reason <> 'ROOM_UNKNOWN'
    );
    v_warnings :=
      v_warnings || array['ROOM_IDENTITY_PROVISIONAL']::text[];
    new.room_resolution_status := 'PROVISIONAL_UNKNOWN';

  elsif 'CAPABILITY_UNCONFIRMED' = any(v_reasons) then
    v_reasons := array(
      select reason
      from unnest(v_reasons) reason
      where reason <> 'CAPABILITY_UNCONFIRMED'
    );
    v_warnings :=
      v_warnings || array['ROOM_CAPABILITY_PROVISIONAL']::text[];
    new.room_resolution_status := 'PROVISIONAL_CAPABILITY';

  elsif 'CAPABILITY_UNRESOLVED' = any(v_reasons) then
    -- No room carries the required capability at all. This is not mere
    -- uncertainty; there is currently no eligible resource.
    v_reasons := array(
      select case
        when reason = 'CAPABILITY_UNRESOLVED'
          then 'NO_ELIGIBLE_ROOM'
        else reason
      end
      from unnest(v_reasons) reason
    );
    new.room_resolution_status := 'BLOCKED_NO_ELIGIBLE_ROOM';

  elsif 'ROOM_ASSIGNMENT_MISSING' = any(v_reasons) then
    new.room_resolution_status := 'BLOCKED_MISSING_ASSIGNMENT';

  elsif new.room_id is null then
    if new.room_resolution_status <> 'PROVISIONAL_UNKNOWN' then
      new.room_resolution_status := 'BLOCKED_MISSING_ASSIGNMENT';
    end if;
  elsif new.room_resolution_status = 'PROVISIONAL_CAPABILITY'
     or 'ROOM_CAPABILITY_PROVISIONAL' = any(v_warnings) then
    new.room_resolution_status := 'PROVISIONAL_CAPABILITY';
    v_warnings :=
      v_warnings || array['ROOM_CAPABILITY_PROVISIONAL']::text[];
  else
    new.room_resolution_status := 'RESOLVED';
  end if;

  -- Normalize arrays after translating uncertainty into warnings.
  select coalesce(
    array_agg(distinct reason order by reason),
    array[]::text[]
  )
  into v_reasons
  from unnest(v_reasons) reason;

  select coalesce(
    array_agg(distinct warning order by warning),
    array[]::text[]
  )
  into v_warnings
  from unnest(v_warnings) warning;

  new.reason_codes := v_reasons;
  new.warning_codes := v_warnings;

  v_hard_invalid :=
    v_reasons && array[
      'TIME_OUTSIDE_DAY',
      'LUNCH_BREAK_CROSSING',
      'TEACHER_CONFLICT',
      'ROOM_CONFLICT',
      'GROUP_CONFLICT',
      'ROOM_INACTIVE',
      'NO_ELIGIBLE_ROOM'
    ]::text[];

  v_hard_unresolved :=
    v_reasons && array[
      'TEACHER_ASSIGNMENT_MISSING',
      'ROOM_ASSIGNMENT_MISSING'
    ]::text[];

  if v_hard_invalid then
    new.status := 'INVALID';
    new.is_complete := false;
  elsif v_hard_unresolved then
    new.status := 'UNRESOLVED';
    new.is_complete := false;
  elsif cardinality(v_reasons) > 0 then
    -- Unknown future static reason codes stay conservative.
    if new.status = 'INVALID' then
      new.is_complete := false;
    else
      new.status := 'UNRESOLVED';
      new.is_complete := false;
    end if;
  else
    new.status := 'VALID';
    new.is_complete := true;
  end if;

  new.details :=
    coalesce(new.details, '{}'::jsonb)
    || jsonb_build_object(
      'resource_semantics_version', 'M22-v1',
      'teacher_resolution_status',
        new.teacher_resolution_status,
      'room_resolution_status',
        new.room_resolution_status
    );

  return new;
end
$;


comment on function public.management_apply_provisional_candidate_semantics() is
  'M22.1 candidate certainty normalizer. Preserves PROVISIONAL_CAPABILITY across delta revalidation while keeping UNKNOWN identity schedulable and hard resource failures blocking.';

-- -------------------------------------------------------------------------
-- NULL-SAFE EXACT CANDIDATE REFRESH
-- -------------------------------------------------------------------------

create or replace function public.refresh_management_candidate_exact(
  p_schedule_revision_id uuid,
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
  v_assessment_id uuid;
begin
  select assessment.id
  into v_assessment_id
  from public.schedule_card_candidate_assessments assessment
  join public.schedule_cards card
    on card.id = assessment.card_id
  where assessment.card_id = p_card_id
    and card.schedule_revision_id = p_schedule_revision_id
    and assessment.day_of_week = p_day_of_week
    and assessment.start_period = p_start_period
    and assessment.teacher_id is not distinct from p_teacher_id
    and assessment.room_id is not distinct from p_room_id;

  if v_assessment_id is null then
    perform public.refresh_management_candidate_domain_subset(
      p_schedule_revision_id,
      array[p_card_id]::uuid[]
    );

    select assessment.id
    into v_assessment_id
    from public.schedule_card_candidate_assessments assessment
    where assessment.card_id = p_card_id
      and assessment.day_of_week = p_day_of_week
      and assessment.start_period = p_start_period
      and assessment.teacher_id is not distinct from p_teacher_id
      and assessment.room_id is not distinct from p_room_id;
  end if;

  if v_assessment_id is null then
    raise exception
      'M22.1 exact candidate not found for card %, day %, period %, teacher %, room %',
      p_card_id,
      p_day_of_week,
      p_start_period,
      p_teacher_id,
      p_room_id;
  end if;

  perform public.revalidate_management_candidate_assessments(
    p_schedule_revision_id,
    array[v_assessment_id]::uuid[]
  );

  return v_assessment_id;
end
$$;

revoke all
  on function public.refresh_management_candidate_exact(
    uuid,
    uuid,
    smallint,
    smallint,
    uuid,
    uuid
  )
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- NULL-SAFE REDO COMPATIBILITY
-- -------------------------------------------------------------------------
create or replace function public.redo_management_undo_transaction(
  p_undo_transaction_id uuid
)
returns uuid
language plpgsql
as $
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
      and mt.history_sequence > v_undo_history_sequence
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
        and manual_tx.history_sequence > candidate.history_sequence
    )
  order by candidate.history_sequence desc
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
       or v_target_start is null then
      raise exception 'M22.1 % redo target snapshot is missing time identity',
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
      and assessment.teacher_id is not distinct from v_target_teacher
      and assessment.room_id is not distinct from v_target_room;

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
          'engine_version', 'M22.1-v1',
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
          'engine_version', 'M22.1-v1',
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
          'engine_version', 'M22.1-v1',
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
$;

comment on function public.redo_management_undo_transaction(uuid) is
  'M22.1 null-safe LIFO redo. Preserves M9.1 history ordering while allowing exact VALID provisional PLACE/MOVE targets with NULL resource identities.';


revoke all
  on function public.redo_management_undo_transaction(uuid)
  from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- PROVISIONAL PLACE
-- -------------------------------------------------------------------------

create or replace function public.place_management_card_provisional(
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
  v_is_complete boolean;
  v_teacher_resolution text;
  v_room_resolution text;
  v_reason_codes text[];
  v_warning_codes text[];
  v_transaction_id uuid;
  v_auto_count integer;
  v_contradiction_count integer;
  v_forced_remaining_count integer;
  v_unplaced_count integer;
  v_stop_reason text;
begin
  if p_card_id is null then
    raise exception 'M22.1 provisional PLACE requires card_id';
  end if;

  if p_day_of_week is null
     or p_day_of_week < 1
     or p_day_of_week > 5 then
    raise exception 'M22.1 provisional PLACE requires day_of_week 1..5';
  end if;

  if p_start_period is null
     or p_start_period < 1
     or p_start_period > 12 then
    raise exception 'M22.1 provisional PLACE requires start_period 1..12';
  end if;

  if p_teacher_id is not null
     and p_room_id is not null then
    raise exception
      'M22.1 provisional PLACE is only for targets with at least one provisional resource dimension';
  end if;

  select
    revision.id,
    revision.status
  into
    v_revision_id,
    v_revision_status
  from public.schedule_cards card
  join public.schedule_revisions revision
    on revision.id = card.schedule_revision_id
  where card.id = p_card_id
  for update of revision;

  if v_revision_id is null then
    raise exception 'M22.1 card not found: %', p_card_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception
      'M22.1 provisional PLACE requires DRAFT revision';
  end if;

  if exists (
    select 1
    from public.placements placement
    where placement.card_id = p_card_id
  ) then
    raise exception 'M22.1 card is already placed: %', p_card_id;
  end if;

  v_candidate_id :=
    public.refresh_management_candidate_exact(
      v_revision_id,
      p_card_id,
      p_day_of_week,
      p_start_period,
      p_teacher_id,
      p_room_id
    );

  select
    assessment.status,
    assessment.is_complete,
    assessment.teacher_resolution_status,
    assessment.room_resolution_status,
    assessment.reason_codes,
    assessment.warning_codes
  into
    v_candidate_status,
    v_is_complete,
    v_teacher_resolution,
    v_room_resolution,
    v_reason_codes,
    v_warning_codes
  from public.schedule_card_candidate_assessments assessment
  where assessment.id = v_candidate_id;

  if v_candidate_status <> 'VALID'
     or not coalesce(v_is_complete, false) then
    raise exception
      'M22.1 provisional PLACE candidate is %, reasons %',
      v_candidate_status,
      coalesce(v_reason_codes, array[]::text[]);
  end if;

  if p_teacher_id is null
     and v_teacher_resolution <> 'PROVISIONAL_UNKNOWN' then
    raise exception
      'M22.1 NULL teacher is not an allowed provisional identity';
  end if;

  if p_room_id is null
     and v_room_resolution <> 'PROVISIONAL_UNKNOWN' then
    raise exception
      'M22.1 NULL room is not an allowed provisional identity';
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
      'engine_version', 'M22.1-v1',
      'candidate_assessment_id', v_candidate_id,
      'resource_certainty',
        jsonb_build_object(
          'teacher', v_teacher_resolution,
          'room', v_room_resolution,
          'warnings', to_jsonb(coalesce(v_warning_codes, array[]::text[]))
        ),
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

  v_auto_count :=
    public.propagate_management_forced_cards(
      v_revision_id,
      v_transaction_id,
      v_transaction_id
    );

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

  if v_contradiction_count > 0 then
    v_stop_reason := 'CONTRADICTION';
  elsif v_unplaced_count = 0 then
    v_stop_reason := 'COMPLETE';
  elsif v_forced_remaining_count > 0 then
    raise exception
      'M22.1 provisional PLACE propagation stopped with % resolved forced cards remaining',
      v_forced_remaining_count;
  else
    v_stop_reason := 'NO_FORCED_CANDIDATE';
  end if;

  update public.move_transactions move
  set payload =
    move.payload || jsonb_build_object(
      'propagation_auto_count', v_auto_count,
      'propagation_stop_reason', v_stop_reason,
      'propagation_contradiction_count', v_contradiction_count,
      'remaining_unplaced_count', v_unplaced_count
    )
  where move.id = v_transaction_id;

  return v_transaction_id;
end
$$;

revoke all
  on function public.place_management_card_provisional(
    uuid,
    smallint,
    smallint,
    uuid,
    uuid
  )
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- PROVISIONAL MOVE
-- -------------------------------------------------------------------------

create or replace function public.move_management_card_provisional(
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
  v_is_complete boolean;
  v_teacher_resolution text;
  v_room_resolution text;
  v_reason_codes text[];
  v_warning_codes text[];
  v_transaction_id uuid;
  v_auto_count integer;
  v_contradiction_count integer;
  v_forced_remaining_count integer;
  v_unplaced_count integer;
  v_stop_reason text;
begin
  if p_card_id is null then
    raise exception 'M22.1 provisional MOVE requires card_id';
  end if;

  if p_day_of_week is null
     or p_day_of_week < 1
     or p_day_of_week > 5 then
    raise exception 'M22.1 provisional MOVE requires day_of_week 1..5';
  end if;

  if p_start_period is null
     or p_start_period < 1
     or p_start_period > 12 then
    raise exception 'M22.1 provisional MOVE requires start_period 1..12';
  end if;

  if p_teacher_id is not null
     and p_room_id is not null then
    raise exception
      'M22.1 provisional MOVE is only for targets with at least one provisional resource dimension';
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
    raise exception 'M22.1 placed card not found: %', p_card_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception
      'M22.1 provisional MOVE requires DRAFT revision';
  end if;

  if v_locked then
    raise exception 'M22.1 MOVE rejected for locked card: %', p_card_id;
  end if;

  if v_before_day = p_day_of_week
     and v_before_start = p_start_period
     and v_before_teacher is not distinct from p_teacher_id
     and v_before_room is not distinct from p_room_id then
    raise exception 'M22.1 MOVE is a no-op for card %', p_card_id;
  end if;

  v_candidate_id :=
    public.refresh_management_candidate_exact(
      v_revision_id,
      p_card_id,
      p_day_of_week,
      p_start_period,
      p_teacher_id,
      p_room_id
    );

  select
    assessment.status,
    assessment.is_complete,
    assessment.teacher_resolution_status,
    assessment.room_resolution_status,
    assessment.reason_codes,
    assessment.warning_codes
  into
    v_candidate_status,
    v_is_complete,
    v_teacher_resolution,
    v_room_resolution,
    v_reason_codes,
    v_warning_codes
  from public.schedule_card_candidate_assessments assessment
  where assessment.id = v_candidate_id;

  if v_candidate_status <> 'VALID'
     or not coalesce(v_is_complete, false) then
    raise exception
      'M22.1 provisional MOVE candidate is %, reasons %',
      v_candidate_status,
      coalesce(v_reason_codes, array[]::text[]);
  end if;

  if p_teacher_id is null
     and v_teacher_resolution <> 'PROVISIONAL_UNKNOWN' then
    raise exception
      'M22.1 NULL teacher is not an allowed provisional identity';
  end if;

  if p_room_id is null
     and v_room_resolution <> 'PROVISIONAL_UNKNOWN' then
    raise exception
      'M22.1 NULL room is not an allowed provisional identity';
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
      'engine_version', 'M22.1-v1',
      'candidate_assessment_id', v_candidate_id,
      'resource_certainty',
        jsonb_build_object(
          'teacher', v_teacher_resolution,
          'room', v_room_resolution,
          'warnings', to_jsonb(coalesce(v_warning_codes, array[]::text[]))
        ),
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

  v_auto_count :=
    public.propagate_management_forced_cards(
      v_revision_id,
      v_transaction_id,
      v_transaction_id
    );

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

  if v_contradiction_count > 0 then
    v_stop_reason := 'CONTRADICTION';
  elsif v_unplaced_count = 0 then
    v_stop_reason := 'COMPLETE';
  elsif v_forced_remaining_count > 0 then
    raise exception
      'M22.1 provisional MOVE propagation stopped with % resolved forced cards remaining',
      v_forced_remaining_count;
  else
    v_stop_reason := 'NO_FORCED_CANDIDATE';
  end if;

  update public.move_transactions move
  set payload =
    move.payload || jsonb_build_object(
      'propagation_auto_count', v_auto_count,
      'propagation_stop_reason', v_stop_reason,
      'propagation_contradiction_count', v_contradiction_count,
      'remaining_unplaced_count', v_unplaced_count
    )
  where move.id = v_transaction_id;

  return v_transaction_id;
end
$$;

revoke all
  on function public.move_management_card_provisional(
    uuid,
    smallint,
    smallint,
    uuid,
    uuid
  )
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- AUTHENTICATED RPC ROUTING
-- -------------------------------------------------------------------------
-- Keep the proven resolved-resource engines untouched. Only requests carrying
-- at least one NULL resource dimension are routed through the M22.1 path.

create or replace function public.management_place_card(
  p_card_id uuid,
  p_day_of_week smallint,
  p_start_period smallint,
  p_teacher_id uuid,
  p_room_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M22.1 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_teacher_id is null or p_room_id is null then
    return public.place_management_card_provisional(
      p_card_id,
      p_day_of_week,
      p_start_period,
      p_teacher_id,
      p_room_id
    );
  end if;

  return public.place_management_card(
    p_card_id,
    p_day_of_week,
    p_start_period,
    p_teacher_id,
    p_room_id
  );
end
$$;

create or replace function public.management_move_card(
  p_card_id uuid,
  p_day_of_week smallint,
  p_start_period smallint,
  p_teacher_id uuid,
  p_room_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M22.1 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_teacher_id is null or p_room_id is null then
    return public.move_management_card_provisional(
      p_card_id,
      p_day_of_week,
      p_start_period,
      p_teacher_id,
      p_room_id
    );
  end if;

  return public.move_management_card(
    p_card_id,
    p_day_of_week,
    p_start_period,
    p_teacher_id,
    p_room_id
  );
end
$$;

revoke all
  on function public.management_place_card(
    uuid,
    smallint,
    smallint,
    uuid,
    uuid
  ),
  function public.management_move_card(
    uuid,
    smallint,
    smallint,
    uuid,
    uuid
  )
  from public, anon, authenticated;

grant execute
  on function public.management_place_card(
    uuid,
    smallint,
    smallint,
    uuid,
    uuid
  ),
  function public.management_move_card(
    uuid,
    smallint,
    smallint,
    uuid,
    uuid
  )
  to authenticated;


-- -------------------------------------------------------------------------
-- DURABLE RESOURCE RECONCILIATION AUDIT
-- -------------------------------------------------------------------------

create table if not exists public.management_resource_reconciliations (
  id uuid primary key default gen_random_uuid(),
  schedule_revision_id uuid not null
    references public.schedule_revisions(id) on delete restrict,
  requirement_id uuid not null
    references public.course_requirements(id) on delete restrict,
  teacher_id uuid null
    references public.teachers(id) on delete restrict,
  room_id uuid null
    references public.rooms(id) on delete restrict,
  state_token text not null,
  before_state jsonb not null,
  after_state jsonb not null,
  applied_by uuid null,
  created_at timestamptz not null default now(),
  constraint management_resource_reconciliations_target_present
    check (teacher_id is not null or room_id is not null),
  constraint management_resource_reconciliations_before_object
    check (jsonb_typeof(before_state) = 'object'),
  constraint management_resource_reconciliations_after_object
    check (jsonb_typeof(after_state) = 'object')
);

create index if not exists
  management_resource_reconciliations_revision_idx
  on public.management_resource_reconciliations (
    schedule_revision_id,
    created_at desc
  );

create index if not exists
  management_resource_reconciliations_requirement_idx
  on public.management_resource_reconciliations (
    requirement_id,
    created_at desc
  );

alter table public.management_resource_reconciliations
  enable row level security;

revoke all
  on public.management_resource_reconciliations
  from anon, authenticated;

grant select
  on public.management_resource_reconciliations
  to authenticated;

drop policy if exists
  management_resource_reconciliations_read
  on public.management_resource_reconciliations;

create policy management_resource_reconciliations_read
  on public.management_resource_reconciliations
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));


-- -------------------------------------------------------------------------
-- RECONCILIATION STATE TOKEN
-- -------------------------------------------------------------------------

create or replace function public.management_resource_reconciliation_state_token(
  p_requirement_id uuid,
  p_teacher_id uuid,
  p_room_id uuid
)
returns text
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  with requirement_state as (
    select jsonb_build_object(
      'id', requirement.id,
      'teacherMode', requirement.teacher_mode,
      'resourceMode', requirement.resource_mode,
      'requiredCapability', requirement.required_capability,
      'requirementSetId', requirement.requirement_set_id
    ) as value
    from public.course_requirements requirement
    where requirement.id = p_requirement_id
  ),
  revision_state as (
    select jsonb_build_object(
      'id', revision.id,
      'status', revision.status
    ) as value
    from public.schedule_revisions revision
    join public.course_requirements requirement
      on requirement.requirement_set_id = revision.requirement_set_id
    where requirement.id = p_requirement_id
      and revision.status = 'DRAFT'
    order by revision.version_number desc
    limit 1
  ),
  teacher_assignments as (
    select coalesce(
      jsonb_agg(
        assignment.teacher_id
        order by assignment.teacher_id::text
      ),
      '[]'::jsonb
    ) as value
    from public.course_requirement_teachers assignment
    where assignment.requirement_id = p_requirement_id
  ),
  room_assignments as (
    select coalesce(
      jsonb_agg(
        assignment.room_id
        order by assignment.room_id::text
      ),
      '[]'::jsonb
    ) as value
    from public.course_requirement_rooms assignment
    where assignment.requirement_id = p_requirement_id
  ),
  placements_state as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cardId', card.id,
          'durationPeriods', card.duration_periods,
          'dayOfWeek', placement.day_of_week,
          'startPeriod', placement.start_period,
          'teacherId', placement.teacher_id,
          'roomId', placement.room_id,
          'teacherResolution', placement.teacher_resolution_status,
          'roomResolution', placement.room_resolution_status
        )
        order by card.id
      ),
      '[]'::jsonb
    ) as value
    from public.schedule_cards card
    left join public.placements placement
      on placement.card_id = card.id
    join public.schedule_revisions revision
      on revision.id = card.schedule_revision_id
    where card.requirement_id = p_requirement_id
      and revision.status = 'DRAFT'
  ),
  target_teacher as (
    select case
      when p_teacher_id is null then null
      else jsonb_build_object(
        'id', teacher.id,
        'name', teacher.name
      )
    end as value
    from (select 1) seed
    left join public.teachers teacher
      on teacher.id = p_teacher_id
  ),
  target_room as (
    select case
      when p_room_id is null then null
      else jsonb_build_object(
        'id', room.id,
        'canonicalRoomId', room.canonical_room_id,
        'operationalStatus', room.operational_status,
        'knowledgeStatus', room.knowledge_status
      )
    end as value
    from (select 1) seed
    left join public.rooms room
      on room.id = p_room_id
  )
  select md5(
    jsonb_build_object(
      'requirement', requirement_state.value,
      'revision', revision_state.value,
      'teacherAssignments', teacher_assignments.value,
      'roomAssignments', room_assignments.value,
      'placements', placements_state.value,
      'targetTeacher', target_teacher.value,
      'targetRoom', target_room.value
    )::text
  )
  from requirement_state,
       revision_state,
       teacher_assignments,
       room_assignments,
       placements_state,
       target_teacher,
       target_room
$$;

revoke all
  on function public.management_resource_reconciliation_state_token(
    uuid,
    uuid,
    uuid
  )
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- RECONCILIATION PREVIEW
-- -------------------------------------------------------------------------

create or replace function public.management_preview_resource_reconciliation(
  p_requirement_id uuid,
  p_teacher_id uuid,
  p_room_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_teacher_mode text;
  v_resource_mode text;
  v_required_capability text;
  v_teacher_exists boolean;
  v_room record;
  v_card_count integer;
  v_placed_count integer;
  v_teacher_provisional_count integer;
  v_room_provisional_count integer;
  v_teacher_mismatch_count integer;
  v_room_mismatch_count integer;
  v_teacher_conflict_count integer;
  v_room_conflict_count integer;
  v_block_reasons jsonb := '[]'::jsonb;
  v_token text;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M22.1 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_teacher_id is null and p_room_id is null then
    raise exception
      'M22.1 reconciliation requires teacher and/or room target';
  end if;

  select
    revision.id,
    requirement.teacher_mode,
    requirement.resource_mode,
    requirement.required_capability
  into
    v_revision_id,
    v_teacher_mode,
    v_resource_mode,
    v_required_capability
  from public.course_requirements requirement
  join public.schedule_revisions revision
    on revision.requirement_set_id =
      requirement.requirement_set_id
  where requirement.id = p_requirement_id
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1;

  if v_revision_id is null then
    raise exception
      'M22.1 requirement is not part of an active DRAFT: %',
      p_requirement_id;
  end if;

  if p_teacher_id is not null then
    select exists (
      select 1
      from public.teachers teacher
      where teacher.id = p_teacher_id
    )
    into v_teacher_exists;

    if not v_teacher_exists then
      v_block_reasons :=
        v_block_reasons || jsonb_build_array('TEACHER_NOT_FOUND');
    end if;

    if v_teacher_mode <> 'UNKNOWN' then
      v_block_reasons :=
        v_block_reasons
        || jsonb_build_array('TEACHER_MODE_NOT_UNKNOWN');
    end if;

    if exists (
      select 1
      from public.course_requirement_teachers assignment
      where assignment.requirement_id = p_requirement_id
    ) then
      v_block_reasons :=
        v_block_reasons
        || jsonb_build_array('TEACHER_ASSIGNMENT_ALREADY_EXISTS');
    end if;
  end if;

  if p_room_id is not null then
    select
      room.id,
      room.canonical_room_id,
      room.operational_status
    into v_room
    from public.rooms room
    where room.id = p_room_id;

    if not found then
      v_block_reasons :=
        v_block_reasons || jsonb_build_array('ROOM_NOT_FOUND');
    else
      if v_room.canonical_room_id is not null then
        v_block_reasons :=
          v_block_reasons || jsonb_build_array('ROOM_ALIAS_NOT_ALLOWED');
      end if;

      if v_room.operational_status <> 'ACTIVE' then
        v_block_reasons :=
          v_block_reasons || jsonb_build_array('ROOM_INACTIVE');
      end if;
    end if;

    if v_resource_mode <> 'UNKNOWN' then
      v_block_reasons :=
        v_block_reasons
        || jsonb_build_array('ROOM_MODE_NOT_UNKNOWN');
    end if;

    if exists (
      select 1
      from public.course_requirement_rooms assignment
      where assignment.requirement_id = p_requirement_id
    ) then
      v_block_reasons :=
        v_block_reasons
        || jsonb_build_array('ROOM_ASSIGNMENT_ALREADY_EXISTS');
    end if;
  end if;

  select
    count(*)::integer,
    count(placement.id)::integer,
    count(*) filter (
      where placement.id is not null
        and placement.teacher_resolution_status =
          'PROVISIONAL_UNKNOWN'
    )::integer,
    count(*) filter (
      where placement.id is not null
        and placement.room_resolution_status =
          'PROVISIONAL_UNKNOWN'
    )::integer,
    count(*) filter (
      where placement.id is not null
        and p_teacher_id is not null
        and placement.teacher_id is not null
        and placement.teacher_id <> p_teacher_id
    )::integer,
    count(*) filter (
      where placement.id is not null
        and p_room_id is not null
        and placement.room_id is not null
        and placement.room_id <> p_room_id
    )::integer
  into
    v_card_count,
    v_placed_count,
    v_teacher_provisional_count,
    v_room_provisional_count,
    v_teacher_mismatch_count,
    v_room_mismatch_count
  from public.schedule_cards card
  left join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = p_requirement_id;

  if v_teacher_mismatch_count > 0 then
    v_block_reasons :=
      v_block_reasons
      || jsonb_build_array('EXISTING_TEACHER_MISMATCH');
  end if;

  if v_room_mismatch_count > 0 then
    v_block_reasons :=
      v_block_reasons
      || jsonb_build_array('EXISTING_ROOM_MISMATCH');
  end if;

  with future_placements as (
    select
      placement.card_id,
      card.requirement_id,
      card.duration_periods,
      placement.day_of_week,
      placement.start_period,
      case
        when card.requirement_id = p_requirement_id
          and p_teacher_id is not null
          and placement.teacher_id is null
        then p_teacher_id
        else placement.teacher_id
      end as teacher_id,
      case
        when card.requirement_id = p_requirement_id
          and p_room_id is not null
          and placement.room_id is null
        then p_room_id
        else coalesce(
          selected_room.canonical_room_id,
          placement.room_id
        )
      end as room_id
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    left join public.rooms selected_room
      on selected_room.id = placement.room_id
    where card.schedule_revision_id = v_revision_id
  )
  select
    count(*) filter (
      where target.teacher_id is not null
        and other.teacher_id = target.teacher_id
    )::integer,
    count(*) filter (
      where target.room_id is not null
        and other.room_id = target.room_id
    )::integer
  into
    v_teacher_conflict_count,
    v_room_conflict_count
  from future_placements target
  join future_placements other
    on other.card_id <> target.card_id
   and other.day_of_week = target.day_of_week
   and other.start_period <=
      target.start_period + target.duration_periods - 1
   and other.start_period + other.duration_periods - 1 >=
      target.start_period
  where target.requirement_id = p_requirement_id
    and (
      (
        p_teacher_id is not null
        and target.teacher_id is not null
        and other.teacher_id = target.teacher_id
      )
      or
      (
        p_room_id is not null
        and target.room_id is not null
        and other.room_id = target.room_id
      )
    );

  if p_teacher_id is not null
     and v_teacher_conflict_count > 0 then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array('TEACHER_CONFLICT');
  end if;

  if p_room_id is not null
     and v_room_conflict_count > 0 then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array('ROOM_CONFLICT');
  end if;

  v_token :=
    public.management_resource_reconciliation_state_token(
      p_requirement_id,
      p_teacher_id,
      p_room_id
    );

  return jsonb_build_object(
    'requirementId', p_requirement_id,
    'revisionId', v_revision_id,
    'teacherId', p_teacher_id,
    'roomId', p_room_id,
    'cardCount', v_card_count,
    'placedCount', v_placed_count,
    'teacherProvisionalPlacementCount',
      v_teacher_provisional_count,
    'roomProvisionalPlacementCount',
      v_room_provisional_count,
    'teacherConflictCount', v_teacher_conflict_count,
    'roomConflictCount', v_room_conflict_count,
    'canApply', jsonb_array_length(v_block_reasons) = 0,
    'canCurrentUserApply',
      jsonb_array_length(v_block_reasons) = 0
      and public.has_management_role('EDITOR'),
    'blockReasons', v_block_reasons,
    'stateToken', v_token,
    'publishedChanged', false
  );
end
$$;

revoke all
  on function public.management_preview_resource_reconciliation(
    uuid,
    uuid,
    uuid
  )
  from public, anon, authenticated;

grant execute
  on function public.management_preview_resource_reconciliation(
    uuid,
    uuid,
    uuid
  )
  to authenticated;


-- -------------------------------------------------------------------------
-- RECONCILIATION APPLY
-- -------------------------------------------------------------------------

create or replace function public.management_apply_resource_reconciliation(
  p_requirement_id uuid,
  p_teacher_id uuid,
  p_room_id uuid,
  p_expected_state_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_card_ids uuid[];
  v_preview jsonb;
  v_current_token text;
  v_before_state jsonb;
  v_after_state jsonb;
  v_teacher_updated_count integer := 0;
  v_room_updated_count integer := 0;
  v_audit_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M22.1 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_expected_state_token is null
     or length(btrim(p_expected_state_token)) = 0 then
    raise exception
      'M22.1 reconciliation apply requires preview state token';
  end if;

  select revision.id
  into v_revision_id
  from public.schedule_revisions revision
  join public.course_requirements requirement
    on requirement.requirement_set_id =
      revision.requirement_set_id
  where requirement.id = p_requirement_id
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1
  for update of revision;

  if v_revision_id is null then
    raise exception
      'M22.1 requirement is not part of an active DRAFT';
  end if;

  perform 1
  from public.course_requirements requirement
  where requirement.id = p_requirement_id
  for update;

  select coalesce(
    array_agg(card.id order by card.block_index),
    array[]::uuid[]
  )
  into v_card_ids
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = p_requirement_id;

  if cardinality(v_card_ids) > 0 then
    perform 1
    from public.schedule_cards card
    where card.id = any(v_card_ids)
    for update;

    perform 1
    from public.placements placement
    where placement.card_id = any(v_card_ids)
    for update;
  end if;

  v_current_token :=
    public.management_resource_reconciliation_state_token(
      p_requirement_id,
      p_teacher_id,
      p_room_id
    );

  if v_current_token is distinct from p_expected_state_token then
    raise exception
      'M22.1 reconciliation preview is stale';
  end if;

  v_preview :=
    public.management_preview_resource_reconciliation(
      p_requirement_id,
      p_teacher_id,
      p_room_id
    );

  if not coalesce((v_preview ->> 'canApply')::boolean, false) then
    raise exception
      'M22.1 reconciliation blocked: %',
      coalesce(v_preview -> 'blockReasons', '[]'::jsonb)::text;
  end if;

  select jsonb_build_object(
    'requirement', jsonb_build_object(
      'teacherMode', requirement.teacher_mode,
      'resourceMode', requirement.resource_mode,
      'requiredCapability', requirement.required_capability
    ),
    'placements', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'cardId', card.id,
            'teacherId', placement.teacher_id,
            'roomId', placement.room_id,
            'teacherResolution',
              placement.teacher_resolution_status,
            'roomResolution',
              placement.room_resolution_status
          )
          order by card.id
        )
        from public.schedule_cards card
        left join public.placements placement
          on placement.card_id = card.id
        where card.schedule_revision_id = v_revision_id
          and card.requirement_id = p_requirement_id
      ),
      '[]'::jsonb
    )
  )
  into v_before_state
  from public.course_requirements requirement
  where requirement.id = p_requirement_id;

  if p_teacher_id is not null then
    delete from public.course_requirement_teachers
    where requirement_id = p_requirement_id;

    insert into public.course_requirement_teachers (
      requirement_id,
      teacher_id
    )
    values (
      p_requirement_id,
      p_teacher_id
    );

    update public.course_requirements
    set teacher_mode = 'FIXED'
    where id = p_requirement_id;

    update public.placements placement
    set
      teacher_id = p_teacher_id,
      updated_at = now()
    where placement.card_id = any(v_card_ids)
      and placement.teacher_id is null;

    get diagnostics v_teacher_updated_count = row_count;
  end if;

  if p_room_id is not null then
    delete from public.course_requirement_rooms
    where requirement_id = p_requirement_id;

    insert into public.course_requirement_rooms (
      requirement_id,
      room_id
    )
    values (
      p_requirement_id,
      p_room_id
    );

    update public.course_requirements
    set
      resource_mode = 'FIXED',
      required_capability = null
    where id = p_requirement_id;

    update public.placements placement
    set
      room_id = p_room_id,
      updated_at = now()
    where placement.card_id = any(v_card_ids)
      and placement.room_id is null;

    get diagnostics v_room_updated_count = row_count;
  end if;

  perform public.refresh_management_candidate_domain_subset(
    v_revision_id,
    v_card_ids
  );

  select jsonb_build_object(
    'requirement', jsonb_build_object(
      'teacherMode', requirement.teacher_mode,
      'resourceMode', requirement.resource_mode,
      'requiredCapability', requirement.required_capability
    ),
    'placements', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'cardId', card.id,
            'teacherId', placement.teacher_id,
            'roomId', placement.room_id,
            'teacherResolution',
              placement.teacher_resolution_status,
            'roomResolution',
              placement.room_resolution_status
          )
          order by card.id
        )
        from public.schedule_cards card
        left join public.placements placement
          on placement.card_id = card.id
        where card.schedule_revision_id = v_revision_id
          and card.requirement_id = p_requirement_id
      ),
      '[]'::jsonb
    )
  )
  into v_after_state
  from public.course_requirements requirement
  where requirement.id = p_requirement_id;

  insert into public.management_resource_reconciliations (
    schedule_revision_id,
    requirement_id,
    teacher_id,
    room_id,
    state_token,
    before_state,
    after_state,
    applied_by
  )
  values (
    v_revision_id,
    p_requirement_id,
    p_teacher_id,
    p_room_id,
    p_expected_state_token,
    v_before_state,
    v_after_state,
    auth.uid()
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'applied', true,
    'auditId', v_audit_id,
    'revisionId', v_revision_id,
    'requirementId', p_requirement_id,
    'teacherId', p_teacher_id,
    'roomId', p_room_id,
    'teacherPlacementsResolved',
      v_teacher_updated_count,
    'roomPlacementsResolved',
      v_room_updated_count,
    'candidateRebuildCardCount',
      cardinality(v_card_ids),
    'publishedChanged', false
  );
end
$$;

revoke all
  on function public.management_apply_resource_reconciliation(
    uuid,
    uuid,
    uuid,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.management_apply_resource_reconciliation(
    uuid,
    uuid,
    uuid,
    text
  )
  to authenticated;


-- -------------------------------------------------------------------------
-- SQL EDITOR / MANAGEMENT DIAGNOSTIC
-- -------------------------------------------------------------------------

create or replace function public.management_diagnose_provisional_resource_controls(
  p_schedule_revision_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M22.1 management VIEWER role required'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'revisionId', p_schedule_revision_id,
    'provisionalPlacements', (
      select jsonb_build_object(
        'total', count(*),
        'teacherProvisional', count(*) filter (
          where placement.teacher_resolution_status =
            'PROVISIONAL_UNKNOWN'
        ),
        'roomProvisional', count(*) filter (
          where placement.room_resolution_status =
            'PROVISIONAL_UNKNOWN'
        ),
        'roomCapabilityProvisional', count(*) filter (
          where placement.room_resolution_status =
            'PROVISIONAL_CAPABILITY'
        ),
        'inconsistent', count(*) filter (
          where placement.teacher_resolution_status = 'INCONSISTENT'
             or placement.room_resolution_status = 'INCONSISTENT'
        )
      )
      from public.placements placement
      join public.schedule_cards card
        on card.id = placement.card_id
      where card.schedule_revision_id =
        p_schedule_revision_id
    ),
    'rpcContract', jsonb_build_object(
      'manualPlaceGranted',
        has_function_privilege(
          'authenticated',
          'public.management_place_card(uuid,smallint,smallint,uuid,uuid)',
          'EXECUTE'
        ),
      'manualMoveGranted',
        has_function_privilege(
          'authenticated',
          'public.management_move_card(uuid,smallint,smallint,uuid,uuid)',
          'EXECUTE'
        ),
      'reconciliationPreviewGranted',
        has_function_privilege(
          'authenticated',
          'public.management_preview_resource_reconciliation(uuid,uuid,uuid)',
          'EXECUTE'
        ),
      'reconciliationApplyGranted',
        has_function_privilege(
          'authenticated',
          'public.management_apply_resource_reconciliation(uuid,uuid,uuid,text)',
          'EXECUTE'
        ),
      'internalProvisionalPlaceGranted',
        has_function_privilege(
          'authenticated',
          'public.place_management_card_provisional(uuid,smallint,smallint,uuid,uuid)',
          'EXECUTE'
        ),
      'internalProvisionalMoveGranted',
        has_function_privilege(
          'authenticated',
          'public.move_management_card_provisional(uuid,smallint,smallint,uuid,uuid)',
          'EXECUTE'
        )
    ),
    'safety', jsonb_build_object(
      'publicationApplyGranted',
        has_function_privilege(
          'authenticated',
          'public.management_apply_publication(uuid,text)',
          'EXECUTE'
        ),
      'templateApplyGranted',
        has_function_privilege(
          'authenticated',
          'public.management_create_term_from_template(uuid,text,smallint)',
          'EXECUTE'
        ),
      'publicBaseline',
        public.management_publication_baseline_status(
          '2026-2027'
        )
    )
  );
end
$$;

revoke all
  on function public.management_diagnose_provisional_resource_controls(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_diagnose_provisional_resource_controls(uuid)
  to authenticated;


-- -------------------------------------------------------------------------
-- INSTALLATION INVARIANTS
-- -------------------------------------------------------------------------

do $$
declare
  v_sessions integer;
  v_groups integer;
  v_placements integer;
  v_reconciliations integer;
  v_baseline_healthy boolean;
begin
  select count(*)
  into v_sessions
  from public.schedule_sessions
  where academic_year = '2026-2027';

  select count(*)
  into v_groups
  from public.session_groups group_row
  join public.schedule_sessions session_row
    on session_row.id = group_row.session_id
  where session_row.academic_year = '2026-2027';

  select count(*)
  into v_placements
  from public.placements;

  select count(*)
  into v_reconciliations
  from public.management_resource_reconciliations;

  if v_sessions <> 517
     or v_groups <> 609
     or v_placements <> 28 then
    raise exception
      'M22.1 installation changed accepted schedule state: sessions %, groups %, placements %',
      v_sessions,
      v_groups,
      v_placements;
  end if;

  if v_reconciliations <> 0 then
    raise exception
      'M22.1 installation must not perform resource reconciliation';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.place_management_card_provisional(uuid,smallint,smallint,uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.move_management_card_provisional(uuid,smallint,smallint,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception
      'M22.1 internal provisional engines must remain private';
  end if;

  select coalesce(
    (
      public.management_publication_baseline_status(
        '2026-2027'
      )
      ->> 'healthy'
    )::boolean,
    false
  )
  into v_baseline_healthy;

  if not v_baseline_healthy then
    raise exception
      'M22.1 caused public baseline drift';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M22.1 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M22.1 must not unlock term template apply';
  end if;
end
$$;

commit;
