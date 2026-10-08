-- Align coordinated workspace bundle limits with the existing 72-card
-- atomic commit ceiling. The operation remains one transaction; no chunking.
--
-- Background:
-- - management_commit_workspace_v1 already capped total changes at 72.
-- - move/place/remove bundle helpers still carried the older 24-card cap.
-- - solver proposals can legitimately produce >24 coordinated placement edits.
--
-- Keep all four layers on the same 72-card safety ceiling.

CREATE OR REPLACE FUNCTION public.management_commit_workspace_v1(p_schedule_revision_id uuid, p_requirement_set_id uuid, p_expected_revision_version integer, p_expected_snapshot_hash text, p_expected_baseline_hash text, p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_revision record;
  v_current_snapshot jsonb;
  v_current_snapshot_hash text;
  v_current_baseline_hash text;
  v_after_snapshot jsonb;
  v_change jsonb;
  v_card_id uuid;
  v_locked boolean;
  v_placement_id uuid;
  v_current_day smallint;
  v_current_start smallint;
  v_current_teacher uuid;
  v_current_room uuid;
  v_before_day smallint;
  v_before_start smallint;
  v_before_teacher uuid;
  v_before_room uuid;
  v_after_day smallint;
  v_after_start smallint;
  v_after_teacher uuid;
  v_after_room uuid;
  v_changed_count integer;
  v_distinct_count integer;
  v_remove_ids jsonb := '[]'::jsonb;
  v_move_items jsonb := '[]'::jsonb;
  v_place_items jsonb := '[]'::jsonb;
  v_remove_count integer := 0;
  v_move_count integer := 0;
  v_place_count integer := 0;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'WORKSPACE_V1_EDITOR_REQUIRED'
      using errcode = '42501';
  end if;

  if p_schedule_revision_id is null
     or p_requirement_set_id is null
     or p_expected_revision_version is null
     or nullif(p_expected_snapshot_hash, '') is null
     or nullif(p_expected_baseline_hash, '') is null then
    raise exception 'WORKSPACE_V1_COMMIT_IDENTITY_INCOMPLETE';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'WORKSPACE_V1_CHANGES_MUST_BE_ARRAY';
  end if;

  v_changed_count := jsonb_array_length(p_changes);
  if v_changed_count < 1 then
    raise exception 'WORKSPACE_V1_COMMIT_HAS_NO_CHANGES';
  end if;

  if v_changed_count > 72 then
    raise exception 'WORKSPACE_V1_COMMIT_TOO_LARGE';
  end if;

  select
    revision.id,
    revision.requirement_set_id,
    revision.version_number,
    revision.status
  into v_revision
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id
  for update;

  if not found then
    raise exception 'WORKSPACE_V1_REVISION_NOT_FOUND';
  end if;

  if v_revision.status <> 'DRAFT' then
    raise exception 'WORKSPACE_V1_REVISION_NOT_DRAFT';
  end if;

  if v_revision.requirement_set_id <> p_requirement_set_id then
    raise exception 'WORKSPACE_V1_REQUIREMENT_SET_STALE';
  end if;

  if v_revision.version_number <> p_expected_revision_version then
    raise exception 'WORKSPACE_V1_REVISION_VERSION_STALE';
  end if;

  v_current_snapshot :=
    public.management_preview_solver_snapshot(
      p_schedule_revision_id,
      null
    );

  v_current_snapshot_hash := v_current_snapshot ->> 'snapshotHash';
  v_current_baseline_hash := v_current_snapshot ->> 'baselineHash';

  if v_current_snapshot_hash is distinct from p_expected_snapshot_hash then
    raise exception 'WORKSPACE_V1_SNAPSHOT_STALE';
  end if;

  if v_current_baseline_hash is distinct from p_expected_baseline_hash then
    raise exception 'WORKSPACE_V1_BASELINE_STALE';
  end if;

  select count(distinct entry.value ->> 'card_id')::integer
  into v_distinct_count
  from jsonb_array_elements(p_changes) entry(value);

  if v_distinct_count <> v_changed_count then
    raise exception 'WORKSPACE_V1_DUPLICATE_CARD';
  end if;

  for v_change in
    select entry.value
    from jsonb_array_elements(p_changes) entry(value)
    order by entry.value ->> 'card_id'
  loop
    begin
      v_card_id := nullif(v_change ->> 'card_id', '')::uuid;
    exception when others then
      raise exception 'WORKSPACE_V1_INVALID_CARD_ID';
    end;

    if v_card_id is null
       or jsonb_typeof(v_change -> 'before') is distinct from 'object'
       or jsonb_typeof(v_change -> 'after') is distinct from 'object' then
      raise exception 'WORKSPACE_V1_INVALID_CHANGE_SHAPE';
    end if;

    v_before_day :=
      nullif(v_change -> 'before' ->> 'day_of_week', '')::smallint;
    v_before_start :=
      nullif(v_change -> 'before' ->> 'start_period', '')::smallint;
    v_before_teacher :=
      nullif(v_change -> 'before' ->> 'teacher_id', '')::uuid;
    v_before_room :=
      nullif(v_change -> 'before' ->> 'room_id', '')::uuid;

    v_after_day :=
      nullif(v_change -> 'after' ->> 'day_of_week', '')::smallint;
    v_after_start :=
      nullif(v_change -> 'after' ->> 'start_period', '')::smallint;
    v_after_teacher :=
      nullif(v_change -> 'after' ->> 'teacher_id', '')::uuid;
    v_after_room :=
      nullif(v_change -> 'after' ->> 'room_id', '')::uuid;

    if (v_before_day is null) <> (v_before_start is null) then
      raise exception 'WORKSPACE_V1_INVALID_BEFORE_TIME_SHAPE';
    end if;

    if (v_after_day is null) <> (v_after_start is null) then
      raise exception 'WORKSPACE_V1_INVALID_AFTER_TIME_SHAPE';
    end if;

    if v_after_day is null
       and (v_after_teacher is not null or v_after_room is not null) then
      raise exception 'WORKSPACE_V1_REMOVED_CARD_HAS_RESOURCES';
    end if;

    select card.locked
    into v_locked
    from public.schedule_cards card
    where card.id = v_card_id
      and card.schedule_revision_id = p_schedule_revision_id
    for update;

    if not found then
      raise exception 'WORKSPACE_V1_CARD_NOT_IN_REVISION: %', v_card_id;
    end if;

    v_placement_id := null;
    v_current_day := null;
    v_current_start := null;
    v_current_teacher := null;
    v_current_room := null;

    select
      placement.id,
      placement.day_of_week,
      placement.start_period,
      placement.teacher_id,
      placement.room_id
    into
      v_placement_id,
      v_current_day,
      v_current_start,
      v_current_teacher,
      v_current_room
    from public.placements placement
    where placement.card_id = v_card_id
    for update;

    if v_before_day is null then
      if v_placement_id is not null then
        raise exception 'WORKSPACE_V1_BEFORE_STATE_STALE: %', v_card_id;
      end if;
    else
      if v_placement_id is null
         or v_current_day is distinct from v_before_day
         or v_current_start is distinct from v_before_start
         or v_current_teacher is distinct from v_before_teacher
         or v_current_room is distinct from v_before_room then
        raise exception 'WORKSPACE_V1_BEFORE_STATE_STALE: %', v_card_id;
      end if;
    end if;

    if v_locked and (
      v_before_day is distinct from v_after_day
      or v_before_start is distinct from v_after_start
      or v_before_teacher is distinct from v_after_teacher
      or v_before_room is distinct from v_after_room
    ) then
      raise exception 'WORKSPACE_V1_LOCKED_CARD_CHANGED: %', v_card_id;
    end if;

    if v_before_day is not distinct from v_after_day
       and v_before_start is not distinct from v_after_start
       and v_before_teacher is not distinct from v_after_teacher
       and v_before_room is not distinct from v_after_room then
      raise exception 'WORKSPACE_V1_NOOP_CHANGE: %', v_card_id;
    end if;

    if v_after_day is null then
      if v_before_day is null then
        raise exception 'WORKSPACE_V1_REMOVE_REQUIRES_PLACED_CARD: %', v_card_id;
      end if;

      v_remove_ids :=
        v_remove_ids || jsonb_build_array(v_card_id::text);
      v_remove_count := v_remove_count + 1;

    elsif v_before_day is null then
      v_place_items :=
        v_place_items || jsonb_build_array(
          jsonb_build_object(
            'card_id', v_card_id,
            'day_of_week', v_after_day,
            'start_period', v_after_start,
            'teacher_id', v_after_teacher,
            'room_id', v_after_room
          )
        );
      v_place_count := v_place_count + 1;

    else
      v_move_items :=
        v_move_items || jsonb_build_array(
          jsonb_build_object(
            'card_id', v_card_id,
            'day_of_week', v_after_day,
            'start_period', v_after_start,
            'teacher_id', v_after_teacher,
            'room_id', v_after_room
          )
        );
      v_move_count := v_move_count + 1;
    end if;
  end loop;

  -- Keep coordinated operation groups aligned with the workspace's existing
  -- 72-card atomic commit ceiling. The nested bundle validators enforce the
  -- same ceiling, so sibling coordination remains atomic.
  if v_remove_count > 72
     or v_move_count > 72
     or v_place_count > 72 then
    raise exception 'WORKSPACE_V1_OPERATION_GROUP_TOO_LARGE';
  end if;

  -- Ordering matters:
  --   1) release cards removed from the timetable,
  --   2) move already-placed cards simultaneously,
  --   3) place cards from the pool into the now-final occupancy.
  --
  -- These nested function calls run in this RPC's transaction. Any exception
  -- from candidate/hard validation rolls back all preceding nested writes.
  if v_remove_count > 0 then
    perform public.management_remove_card_bundle(v_remove_ids);
  end if;

  if v_move_count > 0 then
    perform public.management_move_card_bundle(v_move_items);
  end if;

  if v_place_count > 0 then
    perform public.management_place_card_bundle(v_place_items);
  end if;

  v_after_snapshot :=
    public.management_preview_solver_snapshot(
      p_schedule_revision_id,
      null
    );

  return jsonb_build_object(
    'committed', true,
    'revisionId', p_schedule_revision_id,
    'changedCardCount', v_changed_count,
    'removeCount', v_remove_count,
    'moveCount', v_move_count,
    'placeCount', v_place_count,
    'previousSnapshotHash', p_expected_snapshot_hash,
    'previousBaselineHash', p_expected_baseline_hash,
    'snapshotHash', v_after_snapshot ->> 'snapshotHash',
    'baselineHash', v_after_snapshot ->> 'baselineHash'
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.management_move_card_bundle(p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  if v_bundle_size < 1 or v_bundle_size > 72 then
    raise exception 'M33.4.1 MOVE bundle requires 1..72 cards';
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
$function$;

CREATE OR REPLACE FUNCTION public.management_place_card_bundle(p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    raise exception 'M26.6 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'M26.8 PLACE bundle requires a JSON array';
  end if;

  v_bundle_size := jsonb_array_length(p_items);
  if v_bundle_size < 1 or v_bundle_size > 72 then
    raise exception 'M26.8 PLACE bundle requires 1..72 cards';
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
    raise exception 'M26.8 PLACE bundle contains duplicate card ids';
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
    raise exception 'M26.8 PLACE bundle requires known cards from one revision';
  end if;

  v_revision_id := v_revision_ids[1];

  perform public.refresh_management_candidate_domain_bundle_subset(
    v_revision_id,
    v_card_ids
  );

  -- Validate every requested member before any placement is written.
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
      and assessment.day_of_week = nullif(v_item ->> 'day_of_week', '')::smallint
      and assessment.start_period = nullif(v_item ->> 'start_period', '')::smallint
      and assessment.teacher_id is not distinct from
        nullif(v_item ->> 'teacher_id', '')::uuid
      and assessment.room_id is not distinct from
        nullif(v_item ->> 'room_id', '')::uuid
    limit 1;

    if v_candidate_status is distinct from 'VALID'
       or coalesce(v_candidate_complete, false) is not true then
      raise exception
        'M26.8 PLACE bundle member is not externally valid: card %, status %',
        v_item ->> 'card_id',
        coalesce(v_candidate_status, 'MISSING');
    end if;
  end loop;

  for v_item, v_index in
    select entry.value, entry.ordinality::integer
    from jsonb_array_elements(p_items) with ordinality
      as entry(value, ordinality)
  loop
    v_transaction_id := public.management_place_bundle_member(
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
$function$;

CREATE OR REPLACE FUNCTION public.management_remove_card_bundle(p_card_ids jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_card_id_text text;
  v_index integer;
  v_bundle_size integer;
  v_distinct_card_count integer;
  v_matched_card_count integer;
  v_bundle_id uuid;
  v_transaction_id uuid;
  v_last_transaction_id uuid;
  v_revision_id uuid;
  v_revision_ids uuid[];
  v_card_ids uuid[];
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M26.4 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_card_ids is null or jsonb_typeof(p_card_ids) <> 'array' then
    raise exception 'M26.4 REMOVE bundle requires a JSON array';
  end if;

  v_bundle_size := jsonb_array_length(p_card_ids);

  if v_bundle_size < 1 or v_bundle_size > 72 then
    raise exception 'M26.4 REMOVE bundle requires 1..72 cards';
  end if;

  select
    count(distinct entry.value),
    array_agg(distinct entry.value::uuid)
  into
    v_distinct_card_count,
    v_card_ids
  from jsonb_array_elements_text(p_card_ids) as entry(value);

  if v_distinct_card_count <> v_bundle_size then
    raise exception 'M26.4 REMOVE bundle contains duplicate card ids';
  end if;

  select
    count(*),
    array_agg(distinct card.schedule_revision_id)
  into
    v_matched_card_count,
    v_revision_ids
  from public.schedule_cards card
  where card.id = any(v_card_ids);

  if v_matched_card_count <> v_bundle_size then
    raise exception 'M26.4 REMOVE bundle contains unknown cards';
  end if;

  if v_revision_ids is null or cardinality(v_revision_ids) <> 1 then
    raise exception 'M26.4 REMOVE bundle requires cards from one revision';
  end if;

  v_revision_id := v_revision_ids[1];

  for v_card_id_text, v_index in
    select entry.value, entry.ordinality::integer
    from jsonb_array_elements_text(p_card_ids) with ordinality
      as entry(value, ordinality)
  loop
    v_transaction_id := public.remove_management_card(
      nullif(v_card_id_text, '')::uuid
    );

    if v_bundle_id is null then
      v_bundle_id := v_transaction_id;
    end if;

    perform public.management_tag_bundle_root(
      v_transaction_id,
      v_bundle_id,
      v_index,
      v_bundle_size,
      p_card_ids
    );

    v_last_transaction_id := v_transaction_id;
  end loop;

  -- Rebuild only the explicit group after every sibling has reached the pool.
  -- This repairs the temporary asymmetric candidate states produced while the
  -- two underlying records are being removed one at a time inside this single
  -- transaction.
  perform public.refresh_management_candidate_domain_subset(
    v_revision_id,
    v_card_ids
  );

  if v_bundle_id is null then
    raise exception 'M26.4 REMOVE bundle produced no transaction';
  end if;

  return coalesce(v_last_transaction_id, v_bundle_id);
end
$function$;
