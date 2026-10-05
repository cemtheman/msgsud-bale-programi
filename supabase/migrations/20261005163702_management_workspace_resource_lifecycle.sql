create or replace function public.management_commit_workspace_v9(
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
  p_resource_deletes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_current_snapshot jsonb;
  v_intermediate_snapshot jsonb;
  v_final_snapshot jsonb;
  v_workspace_result jsonb;

  v_entry jsonb;
  v_resource_type text;
  v_resource_id uuid;
  v_name text;
  v_status text;
  v_planning jsonb;
  v_availability jsonb;
  v_profile jsonb;
  v_before jsonb;
  v_after jsonb;

  v_create_count integer;
  v_delete_count integer;
  v_distinct_create_count integer;
  v_distinct_delete_count integer;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'WORKSPACE_V9_EDITOR_REQUIRED'
      using errcode = '42501';
  end if;

  p_resource_creates := coalesce(p_resource_creates, '[]'::jsonb);
  p_resource_deletes := coalesce(p_resource_deletes, '[]'::jsonb);

  if jsonb_typeof(p_resource_creates) is distinct from 'array'
     or jsonb_typeof(p_resource_deletes) is distinct from 'array' then
    raise exception 'WORKSPACE_V9_INVALID_LIFECYCLE_ARRAY';
  end if;

  v_create_count := jsonb_array_length(p_resource_creates);
  v_delete_count := jsonb_array_length(p_resource_deletes);

  if v_create_count > 100 or v_delete_count > 100 then
    raise exception 'WORKSPACE_V9_LIFECYCLE_CHANGE_TOO_LARGE';
  end if;

  select count(distinct (
    coalesce(entry.value ->> 'resource_type', '')
    || ':'
    || coalesce(entry.value ->> 'resource_id', '')
  ))::integer
  into v_distinct_create_count
  from jsonb_array_elements(p_resource_creates) entry(value);

  select count(distinct (
    coalesce(entry.value ->> 'resource_type', '')
    || ':'
    || coalesce(entry.value ->> 'resource_id', '')
  ))::integer
  into v_distinct_delete_count
  from jsonb_array_elements(p_resource_deletes) entry(value);

  if v_distinct_create_count <> v_create_count then
    raise exception 'WORKSPACE_V9_DUPLICATE_RESOURCE_CREATE';
  end if;

  if v_distinct_delete_count <> v_delete_count then
    raise exception 'WORKSPACE_V9_DUPLICATE_RESOURCE_DELETE';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_resource_creates) created(value)
    join jsonb_array_elements(p_resource_deletes) deleted(value)
      on created.value ->> 'resource_type'
           = deleted.value ->> 'resource_type'
     and created.value ->> 'resource_id'
           = deleted.value ->> 'resource_id'
  ) then
    raise exception 'WORKSPACE_V9_CREATE_DELETE_OVERLAP';
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

  for v_entry in
    select entry.value
    from jsonb_array_elements(p_resource_creates) entry(value)
    order by
      entry.value ->> 'resource_type',
      entry.value ->> 'resource_id'
  loop
    v_resource_type := upper(coalesce(v_entry ->> 'resource_type', ''));
    begin
      v_resource_id := nullif(v_entry ->> 'resource_id', '')::uuid;
    exception when others then
      raise exception 'WORKSPACE_V9_INVALID_RESOURCE_ID';
    end;
    v_name := btrim(coalesce(v_entry ->> 'display_name', ''));
    v_status := upper(coalesce(v_entry ->> 'operational_status', ''));

    if v_resource_type not in ('TEACHER', 'ROOM')
       or v_resource_id is null
       or length(v_name) = 0
       or length(v_name) > 120 then
      raise exception 'WORKSPACE_V9_INVALID_RESOURCE_CREATE';
    end if;

    if exists (
      select 1 from public.teachers where id = v_resource_id
      union all
      select 1 from public.rooms where id = v_resource_id
    ) then
      raise exception 'WORKSPACE_V9_RESOURCE_CREATE_CONFLICT: %', v_resource_id;
    end if;

    if v_resource_type = 'TEACHER' then
      if v_status not in ('ACTIVE', 'INACTIVE') then
        raise exception 'WORKSPACE_V9_INVALID_RESOURCE_CREATE';
      end if;

      if exists (
        select 1
        from public.teachers
        where lower(btrim(name)) = lower(v_name)
      ) then
        raise exception 'WORKSPACE_V9_RESOURCE_NAME_CONFLICT: %', v_name;
      end if;

      insert into public.teachers (
        id,
        name,
        operational_status
      )
      values (
        v_resource_id,
        v_name,
        v_status
      );

      v_planning := coalesce(
        v_entry -> 'teacher_planning',
        jsonb_build_object(
          'minimum_load', null,
          'target_load', null,
          'maximum_load', null
        )
      );

      perform public.management_set_teacher_load_targets(
        p_schedule_revision_id,
        v_resource_id,
        nullif(v_planning ->> 'minimum_load', '')::integer,
        nullif(v_planning ->> 'target_load', '')::integer,
        nullif(v_planning ->> 'maximum_load', '')::integer
      );

      v_availability := coalesce(
        v_entry -> 'teacher_availability',
        '[]'::jsonb
      );

      perform public.management_set_teacher_unavailable_periods(
        p_schedule_revision_id,
        v_resource_id,
        (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'dayOfWeek',
                (slot.value ->> 'day_of_week')::integer,
                'period',
                (slot.value ->> 'period')::integer
              )
              order by
                (slot.value ->> 'day_of_week')::integer,
                (slot.value ->> 'period')::integer
            ),
            '[]'::jsonb
          )
          from jsonb_array_elements(v_availability) slot(value)
        )
      );

      v_after := public.management_resource_history_state(
        p_schedule_revision_id,
        'TEACHER',
        v_resource_id
      );

      perform public.management_record_resource_history(
        p_schedule_revision_id,
        'TEACHER_CREATE',
        'TEACHER',
        v_resource_id,
        jsonb_build_object('exists', false),
        v_after
      );
    else
      if v_status not in ('ACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE') then
        raise exception 'WORKSPACE_V9_INVALID_RESOURCE_CREATE';
      end if;

      if exists (
        select 1
        from public.rooms
        where canonical_room_id is null
          and lower(btrim(name)) = lower(v_name)
      ) then
        raise exception 'WORKSPACE_V9_RESOURCE_NAME_CONFLICT: %', v_name;
      end if;

      v_profile := coalesce(
        v_entry -> 'room_profile',
        jsonb_build_object(
          'capabilities', '[]'::jsonb,
          'knowledge_status', 'UNKNOWN'
        )
      );

      if coalesce(v_profile ->> 'knowledge_status', 'UNKNOWN')
           not in ('CONFIRMED', 'OBSERVED', 'UNKNOWN') then
        raise exception 'WORKSPACE_V9_INVALID_RESOURCE_CREATE';
      end if;

      insert into public.rooms (
        id,
        name,
        canonical_room_id,
        capabilities,
        knowledge_status,
        operational_status
      )
      values (
        v_resource_id,
        v_name,
        null,
        array(
          select value
          from jsonb_array_elements_text(
            coalesce(v_profile -> 'capabilities', '[]'::jsonb)
          ) capability(value)
          order by value
        ),
        coalesce(v_profile ->> 'knowledge_status', 'UNKNOWN'),
        v_status
      );

      v_after := public.management_resource_history_state(
        p_schedule_revision_id,
        'ROOM',
        v_resource_id
      );

      perform public.management_record_resource_history(
        p_schedule_revision_id,
        'ROOM_CREATE',
        'ROOM',
        v_resource_id,
        jsonb_build_object('exists', false),
        v_after
      );
    end if;
  end loop;

  v_intermediate_snapshot := public.management_preview_solver_snapshot(
    p_schedule_revision_id,
    null
  );

  v_workspace_result := public.management_commit_workspace_v8(
    p_schedule_revision_id,
    p_requirement_set_id,
    p_expected_revision_version,
    v_intermediate_snapshot ->> 'snapshotHash',
    v_intermediate_snapshot ->> 'baselineHash',
    p_changes,
    p_requirement_changes,
    p_resource_changes,
    p_teacher_planning_changes,
    p_teacher_availability_changes,
    p_room_profile_changes
  );

  for v_entry in
    select entry.value
    from jsonb_array_elements(p_resource_deletes) entry(value)
    order by
      entry.value ->> 'resource_type',
      entry.value ->> 'resource_id'
  loop
    v_resource_type := upper(coalesce(v_entry ->> 'resource_type', ''));
    begin
      v_resource_id := nullif(v_entry ->> 'resource_id', '')::uuid;
    exception when others then
      raise exception 'WORKSPACE_V9_INVALID_RESOURCE_ID';
    end;

    if v_resource_type not in ('TEACHER', 'ROOM')
       or v_resource_id is null then
      raise exception 'WORKSPACE_V9_INVALID_RESOURCE_DELETE';
    end if;

    v_before := public.management_resource_history_state(
      p_schedule_revision_id,
      v_resource_type,
      v_resource_id
    );

    if not coalesce((v_before ->> 'exists')::boolean, false) then
      raise exception 'WORKSPACE_V9_RESOURCE_DELETE_STALE: %', v_resource_id;
    end if;

    begin
      if v_resource_type = 'TEACHER' then
        perform public.management_delete_teacher_resource(v_resource_id);
      else
        perform public.management_delete_room_resource(v_resource_id);
      end if;
    exception when others then
      raise exception 'WORKSPACE_V9_RESOURCE_DELETE_REFERENCED: %',
        v_resource_id;
    end;

    v_after := public.management_resource_history_state(
      p_schedule_revision_id,
      v_resource_type,
      v_resource_id
    );

    perform public.management_record_resource_history(
      p_schedule_revision_id,
      case
        when v_resource_type = 'TEACHER' then 'TEACHER_DELETE'
        else 'ROOM_DELETE'
      end,
      v_resource_type,
      v_resource_id,
      v_before,
      v_after
    );
  end loop;

  v_final_snapshot := public.management_preview_solver_snapshot(
    p_schedule_revision_id,
    null
  );

  return v_workspace_result || jsonb_build_object(
    'changedResourceCount',
      coalesce((v_workspace_result ->> 'changedResourceCount')::integer, 0)
      + v_create_count
      + v_delete_count,
    'changedResourceLifecycleCount', v_create_count + v_delete_count,
    'previousSnapshotHash', p_expected_snapshot_hash,
    'previousBaselineHash', p_expected_baseline_hash,
    'snapshotHash', v_final_snapshot ->> 'snapshotHash',
    'baselineHash', v_final_snapshot ->> 'baselineHash'
  );
end
$function$;

revoke all
  on function public.management_commit_workspace_v9(
    uuid, uuid, integer, text, text,
    jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
  )
  from public, anon;

grant execute
  on function public.management_commit_workspace_v9(
    uuid, uuid, integer, text, text,
    jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
  )
  to authenticated;

comment on function public.management_commit_workspace_v9(
  uuid, uuid, integer, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) is
  'Workspace v9 atomic commit. Creates local-staged resources with client UUIDs, commits all existing workspace deltas through v8, then physically deletes staged unused resources, preserving M34 history in one transaction.';
