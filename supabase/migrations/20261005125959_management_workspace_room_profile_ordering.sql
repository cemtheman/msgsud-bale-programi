begin;

create or replace function public.management_commit_workspace_v8(
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
  p_room_profile_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_workspace_result jsonb;
  v_final_snapshot jsonb;
  v_change jsonb;
  v_room_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_preview jsonb;
  v_after_capabilities text[];
  v_after_knowledge_status text;
  v_before_capabilities jsonb;
  v_preview_capabilities jsonb;
  v_change_count integer;
  v_distinct_count integer;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'WORKSPACE_V8_EDITOR_REQUIRED'
      using errcode = '42501';
  end if;

  p_changes := coalesce(p_changes, '[]'::jsonb);
  p_requirement_changes := coalesce(p_requirement_changes, '[]'::jsonb);
  p_resource_changes := coalesce(p_resource_changes, '[]'::jsonb);
  p_teacher_planning_changes := coalesce(p_teacher_planning_changes, '[]'::jsonb);
  p_teacher_availability_changes := coalesce(p_teacher_availability_changes, '[]'::jsonb);
  p_room_profile_changes := coalesce(p_room_profile_changes, '[]'::jsonb);

  if jsonb_typeof(p_changes) is distinct from 'array'
     or jsonb_typeof(p_requirement_changes) is distinct from 'array'
     or jsonb_typeof(p_resource_changes) is distinct from 'array'
     or jsonb_typeof(p_teacher_planning_changes) is distinct from 'array'
     or jsonb_typeof(p_teacher_availability_changes) is distinct from 'array'
     or jsonb_typeof(p_room_profile_changes) is distinct from 'array' then
    raise exception 'WORKSPACE_V8_INVALID_CHANGE_ARRAY';
  end if;

  v_change_count := jsonb_array_length(p_room_profile_changes);
  if v_change_count > 100 then
    raise exception 'WORKSPACE_V8_ROOM_PROFILE_CHANGE_TOO_LARGE';
  end if;

  select count(distinct entry.value ->> 'room_id')::integer
  into v_distinct_count
  from jsonb_array_elements(p_room_profile_changes) entry(value);

  if v_distinct_count <> v_change_count then
    raise exception 'WORKSPACE_V8_DUPLICATE_ROOM_PROFILE_CHANGE';
  end if;

  v_workspace_result := public.management_commit_workspace_v7(
    p_schedule_revision_id,
    p_requirement_set_id,
    p_expected_revision_version,
    p_expected_snapshot_hash,
    p_expected_baseline_hash,
    p_changes,
    p_requirement_changes,
    p_resource_changes,
    p_teacher_planning_changes,
    p_teacher_availability_changes
  );

  for v_change in
    select entry.value
    from jsonb_array_elements(p_room_profile_changes) entry(value)
    order by entry.value ->> 'room_id'
  loop
    begin
      v_room_id := nullif(v_change ->> 'room_id', '')::uuid;
    exception when others then
      raise exception 'WORKSPACE_V8_INVALID_ROOM_ID';
    end;

    v_before := v_change -> 'before';
    v_after := v_change -> 'after';

    if v_room_id is null
       or jsonb_typeof(v_before) is distinct from 'object'
       or jsonb_typeof(v_after) is distinct from 'object'
       or jsonb_typeof(v_before -> 'capabilities') is distinct from 'array'
       or jsonb_typeof(v_after -> 'capabilities') is distinct from 'array' then
      raise exception 'WORKSPACE_V8_INVALID_ROOM_PROFILE';
    end if;

    if not exists (
      select 1
      from public.rooms room
      where room.id = v_room_id
        and room.canonical_room_id is null
        and room.archived_at is null
    ) then
      raise exception 'WORKSPACE_V8_ROOM_NOT_FOUND: %', v_room_id;
    end if;

    v_after_knowledge_status := v_after ->> 'knowledge_status';
    if v_after_knowledge_status not in ('CONFIRMED', 'OBSERVED', 'UNKNOWN') then
      raise exception 'WORKSPACE_V8_INVALID_ROOM_PROFILE';
    end if;

    select coalesce(array_agg(value order by value), array[]::text[])
    into v_after_capabilities
    from jsonb_array_elements_text(v_after -> 'capabilities') item(value);

    v_preview := public.management_preview_room_profile(
      p_schedule_revision_id,
      v_room_id,
      v_after_capabilities,
      v_after_knowledge_status
    );

    select coalesce(jsonb_agg(value order by value), '[]'::jsonb)
    into v_before_capabilities
    from jsonb_array_elements_text(v_before -> 'capabilities') item(value);

    select coalesce(jsonb_agg(value order by value), '[]'::jsonb)
    into v_preview_capabilities
    from jsonb_array_elements_text(
      coalesce(v_preview -> 'current' -> 'capabilities', '[]'::jsonb)
    ) item(value);

    if v_preview_capabilities is distinct from v_before_capabilities
       or (v_preview -> 'current' ->> 'knowledgeStatus')
            is distinct from (v_before ->> 'knowledge_status') then
      raise exception 'WORKSPACE_V8_ROOM_PROFILE_BEFORE_STALE: %', v_room_id;
    end if;

    if coalesce((v_preview ->> 'canApply')::boolean, false) is not true then
      raise exception 'WORKSPACE_V8_ROOM_PROFILE_BLOCKED: %', v_room_id;
    end if;

    perform public.management_apply_room_profile_v2(
      p_schedule_revision_id,
      v_room_id,
      v_after_capabilities,
      v_after_knowledge_status,
      v_preview ->> 'stateToken'
    );
  end loop;

  v_final_snapshot := public.management_preview_solver_snapshot(
    p_schedule_revision_id,
    null
  );

  return v_workspace_result || jsonb_build_object(
    'changedRoomProfileCount', v_change_count,
    'snapshotHash', v_final_snapshot ->> 'snapshotHash',
    'baselineHash', v_final_snapshot ->> 'baselineHash'
  );
end
$function$;

comment on function public.management_commit_workspace_v8(
  uuid, uuid, integer, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) is
  'Workspace v8 atomic commit, hardened ordering. Commits non-profile workspace deltas through v7 first, then validates/applies room profiles against the final placement state and returns final snapshot identity.';

commit;
