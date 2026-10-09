begin;

create or replace function public.management_commit_workspace_v5(
  p_schedule_revision_id uuid,
  p_requirement_set_id uuid,
  p_expected_revision_version integer,
  p_expected_snapshot_hash text,
  p_expected_baseline_hash text,
  p_changes jsonb,
  p_requirement_changes jsonb,
  p_resource_changes jsonb,
  p_teacher_planning_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_current_snapshot jsonb;
  v_intermediate_snapshot jsonb;
  v_workspace_result jsonb;

  v_change jsonb;
  v_teacher_id uuid;
  v_before jsonb;
  v_after jsonb;

  v_current_minimum integer;
  v_current_target integer;
  v_current_maximum integer;

  v_after_minimum integer;
  v_after_target integer;
  v_after_maximum integer;

  v_change_count integer;
  v_distinct_count integer;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'WORKSPACE_V5_EDITOR_REQUIRED'
      using errcode = '42501';
  end if;

  p_changes := coalesce(p_changes, '[]'::jsonb);
  p_requirement_changes := coalesce(p_requirement_changes, '[]'::jsonb);
  p_resource_changes := coalesce(p_resource_changes, '[]'::jsonb);
  p_teacher_planning_changes := coalesce(
    p_teacher_planning_changes,
    '[]'::jsonb
  );

  if jsonb_typeof(p_changes) is distinct from 'array'
     or jsonb_typeof(p_requirement_changes) is distinct from 'array'
     or jsonb_typeof(p_resource_changes) is distinct from 'array'
     or jsonb_typeof(p_teacher_planning_changes) is distinct from 'array' then
    raise exception 'WORKSPACE_V5_INVALID_CHANGE_ARRAY';
  end if;

  v_change_count := jsonb_array_length(p_teacher_planning_changes);
  if v_change_count > 200 then
    raise exception 'WORKSPACE_V5_TEACHER_PLANNING_CHANGE_TOO_LARGE';
  end if;

  select count(distinct entry.value ->> 'teacher_id')::integer
  into v_distinct_count
  from jsonb_array_elements(p_teacher_planning_changes) entry(value);

  if v_distinct_count <> v_change_count then
    raise exception 'WORKSPACE_V5_DUPLICATE_TEACHER_PLANNING_CHANGE';
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

  for v_change in
    select entry.value
    from jsonb_array_elements(p_teacher_planning_changes) entry(value)
    order by entry.value ->> 'teacher_id'
  loop
    begin
      v_teacher_id := nullif(v_change ->> 'teacher_id', '')::uuid;
    exception when others then
      raise exception 'WORKSPACE_V5_INVALID_TEACHER_ID';
    end;

    v_before := v_change -> 'before';
    v_after := v_change -> 'after';

    if v_teacher_id is null
       or jsonb_typeof(v_before) is distinct from 'object'
       or jsonb_typeof(v_after) is distinct from 'object' then
      raise exception 'WORKSPACE_V5_INVALID_TEACHER_PLANNING_SHAPE';
    end if;

    if not exists (
      select 1
      from public.teachers teacher
      where teacher.id = v_teacher_id
        and teacher.archived_at is null
    ) then
      raise exception
        'WORKSPACE_V5_TEACHER_NOT_FOUND: %',
        v_teacher_id;
    end if;

    select
      planning.minimum_load::integer,
      planning.target_load::integer,
      planning.maximum_load::integer
    into
      v_current_minimum,
      v_current_target,
      v_current_maximum
    from public.management_teacher_planning_inputs planning
    where planning.requirement_set_id = p_requirement_set_id
      and planning.teacher_id = v_teacher_id;

    if not found then
      v_current_minimum := null;
      v_current_target := null;
      v_current_maximum := null;
    end if;

    begin
      v_after_minimum :=
        nullif(v_after ->> 'minimum_load', '')::integer;
      v_after_target :=
        nullif(v_after ->> 'target_load', '')::integer;
      v_after_maximum :=
        nullif(v_after ->> 'maximum_load', '')::integer;
    exception when others then
      raise exception
        'WORKSPACE_V5_INVALID_TEACHER_PLANNING_VALUE: %',
        v_teacher_id;
    end;

    if v_current_minimum
          is distinct from nullif(v_before ->> 'minimum_load', '')::integer
       or v_current_target
          is distinct from nullif(v_before ->> 'target_load', '')::integer
       or v_current_maximum
          is distinct from nullif(v_before ->> 'maximum_load', '')::integer then
      raise exception
        'WORKSPACE_V5_TEACHER_PLANNING_BEFORE_STALE: %',
        v_teacher_id;
    end if;

    if (v_after_minimum is not null and (v_after_minimum < 0 or v_after_minimum > 60))
       or (v_after_target is not null and (v_after_target < 0 or v_after_target > 60))
       or (v_after_maximum is not null and (v_after_maximum < 0 or v_after_maximum > 60))
       or (
         v_after_minimum is not null
         and v_after_target is not null
         and v_after_minimum > v_after_target
       )
       or (
         v_after_target is not null
         and v_after_maximum is not null
         and v_after_target > v_after_maximum
       )
       or (
         v_after_minimum is not null
         and v_after_maximum is not null
         and v_after_minimum > v_after_maximum
       ) then
      raise exception
        'WORKSPACE_V5_TEACHER_PLANNING_INVALID: %',
        v_teacher_id;
    end if;

    if v_current_minimum is not distinct from v_after_minimum
       and v_current_target is not distinct from v_after_target
       and v_current_maximum is not distinct from v_after_maximum then
      raise exception
        'WORKSPACE_V5_TEACHER_PLANNING_NOOP: %',
        v_teacher_id;
    end if;

    perform public.management_set_teacher_load_targets(
      p_schedule_revision_id,
      v_teacher_id,
      v_after_minimum,
      v_after_target,
      v_after_maximum
    );
  end loop;

  v_intermediate_snapshot :=
    public.management_preview_solver_snapshot(
      p_schedule_revision_id,
      null
    );

  v_workspace_result :=
    public.management_commit_workspace_v4(
      p_schedule_revision_id,
      p_requirement_set_id,
      p_expected_revision_version,
      v_intermediate_snapshot ->> 'snapshotHash',
      v_intermediate_snapshot ->> 'baselineHash',
      p_changes,
      p_requirement_changes,
      p_resource_changes
    );

  return v_workspace_result || jsonb_build_object(
    'changedTeacherPlanningCount',
    v_change_count
  );
end
$function$;

revoke all
  on function public.management_commit_workspace_v5(
    uuid, uuid, integer, text, text, jsonb, jsonb, jsonb, jsonb
  )
  from public, anon;

grant execute
  on function public.management_commit_workspace_v5(
    uuid, uuid, integer, text, text, jsonb, jsonb, jsonb, jsonb
  )
  to authenticated;

comment on function public.management_commit_workspace_v5(
  uuid, uuid, integer, text, text, jsonb, jsonb, jsonb, jsonb
) is
  'Workspace v5 atomic commit. Applies stale-safe teacher load planning changes first, refreshes snapshot identity, then commits placement/requirement/resource/departure deltas through v4 in the same transaction.';

commit;
