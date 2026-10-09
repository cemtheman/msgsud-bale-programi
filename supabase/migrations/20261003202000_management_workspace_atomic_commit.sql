-- Management Workspace v1
-- Atomic persistence boundary for local timetable editing.
--
-- Contract:
--   immutable snapshot -> local working copy -> deterministic diff -> one RPC
--
-- The RPC rejects stale snapshot/baseline/version state before writing,
-- verifies every submitted "before" placement against the database, and then
-- applies REMOVE -> MOVE -> PLACE within this single PostgreSQL transaction.
-- Existing accepted bundle functions remain the authoritative server-side
-- candidate/hard-rule validation path for target placements. Any exception
-- rolls back every nested operation.

begin;

create or replace function public.management_commit_workspace_v1(
  p_schedule_revision_id uuid,
  p_requirement_set_id uuid,
  p_expected_revision_version integer,
  p_expected_snapshot_hash text,
  p_expected_baseline_hash text,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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

  -- Accepted bundle validators currently cap one coordinated operation at 24.
  -- Keep v1 explicit rather than silently chunking and weakening sibling
  -- coordination semantics.
  if v_remove_count > 24
     or v_move_count > 24
     or v_place_count > 24 then
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
$$;

revoke all
  on function public.management_commit_workspace_v1(
    uuid, uuid, integer, text, text, jsonb
  )
  from public, anon;

grant execute
  on function public.management_commit_workspace_v1(
    uuid, uuid, integer, text, text, jsonb
  )
  to authenticated;

comment on function public.management_commit_workspace_v1(
  uuid, uuid, integer, text, text, jsonb
) is
  'Workspace v1 atomic placement commit. Rejects stale revision/snapshot/baseline/before-state input and applies REMOVE->MOVE->PLACE using accepted server bundle validators in one transaction.';

commit;
