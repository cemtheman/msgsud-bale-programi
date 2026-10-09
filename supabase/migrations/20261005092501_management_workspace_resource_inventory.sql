begin;

CREATE OR REPLACE FUNCTION public.management_commit_workspace_v3(p_schedule_revision_id uuid, p_requirement_set_id uuid, p_expected_revision_version integer, p_expected_snapshot_hash text, p_expected_baseline_hash text, p_changes jsonb, p_requirement_changes jsonb, p_resource_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_revision record;
  v_current_snapshot jsonb;
  v_intermediate_snapshot jsonb;
  v_final_snapshot jsonb;
  v_workspace_result jsonb;

  v_resource_change jsonb;
  v_resource_type text;
  v_resource_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_before_name text;
  v_before_status text;
  v_after_name text;
  v_after_status text;
  v_current_name text;
  v_current_status text;
  v_canonical_room_id uuid;
  v_room_preview jsonb;

  v_resource_count integer;
  v_distinct_resource_count integer;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'WORKSPACE_V3_EDITOR_REQUIRED'
      using errcode = '42501';
  end if;

  p_changes := coalesce(p_changes, '[]'::jsonb);
  p_requirement_changes := coalesce(p_requirement_changes, '[]'::jsonb);
  p_resource_changes := coalesce(p_resource_changes, '[]'::jsonb);

  if jsonb_typeof(p_changes) is distinct from 'array'
     or jsonb_typeof(p_requirement_changes) is distinct from 'array'
     or jsonb_typeof(p_resource_changes) is distinct from 'array' then
    raise exception 'WORKSPACE_V3_INVALID_CHANGE_ARRAY';
  end if;

  v_resource_count := jsonb_array_length(p_resource_changes);

  if v_resource_count > 200 then
    raise exception 'WORKSPACE_V3_RESOURCE_CHANGE_TOO_LARGE';
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

  if (v_current_snapshot ->> 'snapshotHash')
      is distinct from p_expected_snapshot_hash then
    raise exception 'WORKSPACE_V1_SNAPSHOT_STALE';
  end if;

  if (v_current_snapshot ->> 'baselineHash')
      is distinct from p_expected_baseline_hash then
    raise exception 'WORKSPACE_V1_BASELINE_STALE';
  end if;

  select count(
    distinct (
      coalesce(entry.value ->> 'resource_type', '')
      || '|'
      || coalesce(entry.value ->> 'resource_id', '')
    )
  )::integer
  into v_distinct_resource_count
  from jsonb_array_elements(p_resource_changes) entry(value);

  if v_distinct_resource_count <> v_resource_count then
    raise exception 'WORKSPACE_V3_DUPLICATE_RESOURCE';
  end if;

  for v_resource_change in
    select entry.value
    from jsonb_array_elements(p_resource_changes) entry(value)
    order by
      entry.value ->> 'resource_type',
      entry.value ->> 'resource_id'
  loop
    v_resource_type := upper(coalesce(v_resource_change ->> 'resource_type', ''));

    begin
      v_resource_id :=
        nullif(v_resource_change ->> 'resource_id', '')::uuid;
    exception when others then
      raise exception 'WORKSPACE_V3_INVALID_RESOURCE_ID';
    end;

    v_before := v_resource_change -> 'before';
    v_after := v_resource_change -> 'after';

    if v_resource_type not in ('TEACHER', 'ROOM')
       or v_resource_id is null
       or jsonb_typeof(v_before) is distinct from 'object'
       or jsonb_typeof(v_after) is distinct from 'object' then
      raise exception 'WORKSPACE_V3_INVALID_RESOURCE_CHANGE_SHAPE';
    end if;

    v_before_name := btrim(coalesce(v_before ->> 'display_name', ''));
    v_before_status := nullif(v_before ->> 'operational_status', '');
    v_after_name := btrim(coalesce(v_after ->> 'display_name', ''));
    v_after_status := nullif(v_after ->> 'operational_status', '');

    if length(v_after_name) = 0 or length(v_after_name) > 120 then
      raise exception
        'WORKSPACE_V3_RESOURCE_NAME_INVALID: %',
        v_resource_id;
    end if;

    if v_resource_type = 'TEACHER' then
      select
        coalesce(override_row.display_name, teacher.name),
        teacher.operational_status
      into
        v_current_name,
        v_current_status
      from public.teachers teacher
      left join public.management_teacher_name_overrides override_row
        on override_row.schedule_revision_id = p_schedule_revision_id
       and override_row.teacher_id = teacher.id
      where teacher.id = v_resource_id
      for update of teacher;

      if not found then
        raise exception
          'WORKSPACE_V3_RESOURCE_NOT_FOUND: TEACHER %',
          v_resource_id;
      end if;

      if v_after_status not in ('ACTIVE', 'INACTIVE') then
        raise exception
          'WORKSPACE_V3_RESOURCE_STATUS_INVALID: TEACHER %',
          v_resource_id;
      end if;

      if btrim(v_current_name) is distinct from v_before_name
         or v_current_status is distinct from v_before_status then
        raise exception
          'WORKSPACE_V3_RESOURCE_BEFORE_STALE: TEACHER %',
          v_resource_id;
      end if;

      if v_after_name is distinct from btrim(v_current_name) then
        perform public.management_set_teacher_display_name_v2(
          p_schedule_revision_id,
          v_resource_id,
          v_after_name
        );
      end if;

      if v_after_status is distinct from v_current_status then
        perform public.management_set_teacher_operational_status_v2(
          p_schedule_revision_id,
          v_resource_id,
          v_after_status
        );
      end if;

    else
      select
        coalesce(override_row.display_name, room.name),
        room.operational_status,
        room.canonical_room_id
      into
        v_current_name,
        v_current_status,
        v_canonical_room_id
      from public.rooms room
      left join public.management_room_name_overrides override_row
        on override_row.schedule_revision_id = p_schedule_revision_id
       and override_row.room_id = room.id
      where room.id = v_resource_id
      for update of room;

      if not found then
        raise exception
          'WORKSPACE_V3_RESOURCE_NOT_FOUND: ROOM %',
          v_resource_id;
      end if;

      if v_after_status not in (
        'ACTIVE',
        'MAINTENANCE',
        'OUT_OF_SERVICE'
      ) then
        raise exception
          'WORKSPACE_V3_RESOURCE_STATUS_INVALID: ROOM %',
          v_resource_id;
      end if;

      if btrim(v_current_name) is distinct from v_before_name
         or v_current_status is distinct from v_before_status then
        raise exception
          'WORKSPACE_V3_RESOURCE_BEFORE_STALE: ROOM %',
          v_resource_id;
      end if;

      if v_after_name is distinct from btrim(v_current_name) then
        if v_canonical_room_id is not null then
          raise exception
            'WORKSPACE_V3_ROOM_ALIAS_NAME_EDIT_BLOCKED: %',
            v_resource_id;
        end if;

        perform public.management_set_room_display_name_v2(
          p_schedule_revision_id,
          v_resource_id,
          v_after_name
        );
      end if;

      if v_after_status is distinct from v_current_status then
        if v_canonical_room_id is not null then
          raise exception
            'WORKSPACE_V3_ROOM_ALIAS_STATUS_EDIT_BLOCKED: %',
            v_resource_id;
        end if;

        v_room_preview :=
          public.management_preview_room_operational_status(
            p_schedule_revision_id,
            v_resource_id,
            v_after_status
          );

        if coalesce((v_room_preview ->> 'canApply')::boolean, false) is not true then
          raise exception
            'WORKSPACE_V3_ROOM_STATUS_BLOCKED: %',
            v_resource_id;
        end if;

        perform public.management_apply_room_operational_status_v2(
          p_schedule_revision_id,
          v_resource_id,
          v_after_status,
          v_room_preview ->> 'stateToken'
        );
      end if;
    end if;
  end loop;

  v_intermediate_snapshot :=
    public.management_preview_solver_snapshot(
      p_schedule_revision_id,
      null
    );

  v_workspace_result :=
    public.management_commit_workspace_v2(
      p_schedule_revision_id,
      p_requirement_set_id,
      p_expected_revision_version,
      v_intermediate_snapshot ->> 'snapshotHash',
      v_intermediate_snapshot ->> 'baselineHash',
      p_changes,
      p_requirement_changes
    );

  v_final_snapshot :=
    public.management_preview_solver_snapshot(
      p_schedule_revision_id,
      null
    );

  return jsonb_build_object(
    'committed', true,
    'revisionId', p_schedule_revision_id,
    'changedCardCount',
      coalesce((v_workspace_result ->> 'changedCardCount')::integer, 0),
    'changedRequirementCount',
      coalesce((v_workspace_result ->> 'changedRequirementCount')::integer, 0),
    'changedResourceCount', v_resource_count,
    'removeCount',
      coalesce((v_workspace_result ->> 'removeCount')::integer, 0),
    'moveCount',
      coalesce((v_workspace_result ->> 'moveCount')::integer, 0),
    'placeCount',
      coalesce((v_workspace_result ->> 'placeCount')::integer, 0),
    'previousSnapshotHash', p_expected_snapshot_hash,
    'previousBaselineHash', p_expected_baseline_hash,
    'snapshotHash', v_final_snapshot ->> 'snapshotHash',
    'baselineHash', v_final_snapshot ->> 'baselineHash'
  );
end
$function$
;

revoke all
  on function public.management_commit_workspace_v3(
    uuid, uuid, integer, text, text, jsonb, jsonb, jsonb
  )
  from public, anon;

grant execute
  on function public.management_commit_workspace_v3(
    uuid, uuid, integer, text, text, jsonb, jsonb, jsonb
  )
  to authenticated;

comment on function public.management_commit_workspace_v3(
  uuid, uuid, integer, text, text, jsonb, jsonb, jsonb
) is
  'Workspace v3 atomic commit with draft resource inventory name/status changes, requirement plan/policy changes, and placement changes in one transaction.';

commit;
