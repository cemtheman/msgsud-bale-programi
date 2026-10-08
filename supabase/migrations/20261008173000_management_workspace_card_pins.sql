-- M42 workspace v13: persist fine-grained card pins atomically.

create or replace function public.management_commit_workspace_v13(
  p_schedule_revision_id uuid,
  p_requirement_set_id uuid,
  p_expected_revision_version integer,
  p_expected_snapshot_hash text,
  p_expected_baseline_hash text,
  p_changes jsonb,
  p_requirement_changes jsonb,
  p_resource_changes jsonb,
  p_teacher_planning_changes jsonb,
  p_teacher_availability_changes jsonb,
  p_room_profile_changes jsonb,
  p_resource_creates jsonb,
  p_resource_deletes jsonb,
  p_structure_changes jsonb,
  p_time_preference_changes jsonb,
  p_pin_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_current_snapshot jsonb;
  v_final_snapshot jsonb;
  v_workspace_result jsonb;
  v_change jsonb;
  v_card_id uuid;
  v_before_time boolean;
  v_before_teacher boolean;
  v_before_room boolean;
  v_after_time boolean;
  v_after_teacher boolean;
  v_after_room boolean;
  v_current_time boolean;
  v_current_teacher boolean;
  v_current_room boolean;
  v_pin_count integer := 0;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'WORKSPACE_V13_EDITOR_REQUIRED'
      using errcode = '42501';
  end if;

  p_pin_changes := coalesce(p_pin_changes, '[]'::jsonb);

  if jsonb_typeof(p_pin_changes) is distinct from 'array' then
    raise exception 'WORKSPACE_V13_PIN_CHANGES_INVALID';
  end if;

  v_current_snapshot := public.management_preview_solver_snapshot(
    p_schedule_revision_id,
    null
  );

  if (v_current_snapshot ->> 'snapshotHash')
      is distinct from p_expected_snapshot_hash then
    raise exception 'WORKSPACE_V1_SNAPSHOT_STALE';
  end if;

  if (v_current_snapshot ->> 'baselineHash')
      is distinct from p_expected_baseline_hash then
    raise exception 'WORKSPACE_V1_BASELINE_STALE';
  end if;

  -- Delegate the pre-existing workspace changes first using the caller's
  -- original snapshot. This allows structure changes to create cards before
  -- pin updates are applied, while preserving one PostgreSQL transaction.
  v_workspace_result := public.management_commit_workspace_v12(
    p_schedule_revision_id,
    p_requirement_set_id,
    p_expected_revision_version,
    p_expected_snapshot_hash,
    p_expected_baseline_hash,
    coalesce(p_changes, '[]'::jsonb),
    coalesce(p_requirement_changes, '[]'::jsonb),
    coalesce(p_resource_changes, '[]'::jsonb),
    coalesce(p_teacher_planning_changes, '[]'::jsonb),
    coalesce(p_teacher_availability_changes, '[]'::jsonb),
    coalesce(p_room_profile_changes, '[]'::jsonb),
    coalesce(p_resource_creates, '[]'::jsonb),
    coalesce(p_resource_deletes, '[]'::jsonb),
    coalesce(p_structure_changes, '[]'::jsonb),
    coalesce(p_time_preference_changes, '[]'::jsonb)
  );

  for v_change in
    select item.value
    from jsonb_array_elements(p_pin_changes) item(value)
    order by item.value ->> 'card_id'
  loop
    v_card_id := (v_change ->> 'card_id')::uuid;

    select
      card.time_pinned,
      card.teacher_pinned,
      card.room_pinned
    into
      v_current_time,
      v_current_teacher,
      v_current_room
    from public.schedule_cards card
    where card.id = v_card_id
      and card.schedule_revision_id = p_schedule_revision_id
    for update;

    if not found then
      raise exception 'WORKSPACE_V13_CARD_INVALID: %', v_card_id;
    end if;

    v_before_time := coalesce(
      (v_change #>> '{before,time_pinned}')::boolean,
      false
    );
    v_before_teacher := coalesce(
      (v_change #>> '{before,teacher_pinned}')::boolean,
      false
    );
    v_before_room := coalesce(
      (v_change #>> '{before,room_pinned}')::boolean,
      false
    );

    if v_current_time is distinct from v_before_time
       or v_current_teacher is distinct from v_before_teacher
       or v_current_room is distinct from v_before_room then
      raise exception 'WORKSPACE_V13_PIN_STALE: %', v_card_id;
    end if;

    v_after_time := coalesce(
      (v_change #>> '{after,time_pinned}')::boolean,
      false
    );
    v_after_teacher := coalesce(
      (v_change #>> '{after,teacher_pinned}')::boolean,
      false
    );
    v_after_room := coalesce(
      (v_change #>> '{after,room_pinned}')::boolean,
      false
    );

    update public.schedule_cards card
    set
      time_pinned = v_after_time,
      teacher_pinned = v_after_teacher,
      room_pinned = v_after_room
    where card.id = v_card_id;

    v_pin_count := v_pin_count + 1;
  end loop;

  v_final_snapshot := public.management_preview_solver_snapshot(
    p_schedule_revision_id,
    null
  );

  return v_workspace_result || jsonb_build_object(
    'changedPinCount', v_pin_count,
    'previousSnapshotHash', p_expected_snapshot_hash,
    'snapshotHash', v_final_snapshot ->> 'snapshotHash',
    'baselineHash', v_final_snapshot ->> 'baselineHash'
  );
end
$function$;

revoke all on function public.management_commit_workspace_v13(
  uuid, uuid, integer, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;

grant execute on function public.management_commit_workspace_v13(
  uuid, uuid, integer, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;

comment on function public.management_commit_workspace_v13(
  uuid, uuid, integer, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) is
  'Workspace v13 atomic commit. Persists M42 fine-grained card pins before delegating existing v12 workspace semantics in the same transaction.';
