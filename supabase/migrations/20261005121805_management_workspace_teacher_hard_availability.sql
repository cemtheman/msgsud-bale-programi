begin;

create or replace function public.management_commit_workspace_v6(
  p_schedule_revision_id uuid,
  p_requirement_set_id uuid,
  p_expected_revision_version integer,
  p_expected_snapshot_hash text,
  p_expected_baseline_hash text,
  p_changes jsonb,
  p_requirement_changes jsonb,
  p_resource_changes jsonb,
  p_teacher_planning_changes jsonb,
  p_teacher_availability_changes jsonb
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
  v_current jsonb;
  v_requested jsonb;
  v_change_count integer;
  v_distinct_count integer;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'WORKSPACE_V6_EDITOR_REQUIRED'
      using errcode = '42501';
  end if;

  p_changes := coalesce(p_changes, '[]'::jsonb);
  p_requirement_changes := coalesce(p_requirement_changes, '[]'::jsonb);
  p_resource_changes := coalesce(p_resource_changes, '[]'::jsonb);
  p_teacher_planning_changes := coalesce(
    p_teacher_planning_changes,
    '[]'::jsonb
  );
  p_teacher_availability_changes := coalesce(
    p_teacher_availability_changes,
    '[]'::jsonb
  );

  if jsonb_typeof(p_changes) is distinct from 'array'
     or jsonb_typeof(p_requirement_changes) is distinct from 'array'
     or jsonb_typeof(p_resource_changes) is distinct from 'array'
     or jsonb_typeof(p_teacher_planning_changes) is distinct from 'array'
     or jsonb_typeof(p_teacher_availability_changes) is distinct from 'array' then
    raise exception 'WORKSPACE_V6_INVALID_CHANGE_ARRAY';
  end if;

  v_change_count := jsonb_array_length(p_teacher_availability_changes);
  if v_change_count > 200 then
    raise exception 'WORKSPACE_V6_TEACHER_AVAILABILITY_CHANGE_TOO_LARGE';
  end if;

  select count(distinct entry.value ->> 'teacher_id')::integer
  into v_distinct_count
  from jsonb_array_elements(p_teacher_availability_changes) entry(value);

  if v_distinct_count <> v_change_count then
    raise exception 'WORKSPACE_V6_DUPLICATE_TEACHER_AVAILABILITY_CHANGE';
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
    from jsonb_array_elements(p_teacher_availability_changes) entry(value)
    order by entry.value ->> 'teacher_id'
  loop
    begin
      v_teacher_id := nullif(v_change ->> 'teacher_id', '')::uuid;
    exception when others then
      raise exception 'WORKSPACE_V6_INVALID_TEACHER_ID';
    end;

    v_before := v_change -> 'before';
    v_after := v_change -> 'after';

    if v_teacher_id is null
       or jsonb_typeof(v_before) is distinct from 'array'
       or jsonb_typeof(v_after) is distinct from 'array' then
      raise exception 'WORKSPACE_V6_INVALID_TEACHER_AVAILABILITY_SHAPE';
    end if;

    if not exists (
      select 1
      from public.teachers teacher
      where teacher.id = v_teacher_id
        and teacher.archived_at is null
    ) then
      raise exception
        'WORKSPACE_V6_TEACHER_NOT_FOUND: %',
        v_teacher_id;
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_after) item(value)
      where jsonb_typeof(item.value) <> 'object'
         or coalesce(item.value ->> 'day_of_week', '') !~ '^[0-9]+$'
         or coalesce(item.value ->> 'period', '') !~ '^[0-9]+$'
         or (item.value ->> 'day_of_week')::integer not between 1 and 5
         or (item.value ->> 'period')::integer not between 1 and 12
    ) then
      raise exception
        'WORKSPACE_V6_TEACHER_AVAILABILITY_INVALID: %',
        v_teacher_id;
    end if;

    if (
      select count(*) <> count(distinct (
        (item.value ->> 'day_of_week') || ':' || (item.value ->> 'period')
      ))
      from jsonb_array_elements(v_after) item(value)
    ) then
      raise exception
        'WORKSPACE_V6_TEACHER_AVAILABILITY_INVALID: %',
        v_teacher_id;
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'day_of_week', slot.day_of_week,
          'period', slot.period
        )
        order by slot.day_of_week, slot.period
      ),
      '[]'::jsonb
    )
    into v_current
    from public.management_teacher_unavailable_periods slot
    where slot.requirement_set_id = p_requirement_set_id
      and slot.teacher_id = v_teacher_id;

    select coalesce(
      jsonb_agg(item.value order by
        (item.value ->> 'day_of_week')::integer,
        (item.value ->> 'period')::integer
      ),
      '[]'::jsonb
    )
    into v_before
    from jsonb_array_elements(v_before) item(value);

    if v_current is distinct from v_before then
      raise exception
        'WORKSPACE_V6_TEACHER_AVAILABILITY_BEFORE_STALE: %',
        v_teacher_id;
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'dayOfWeek', (item.value ->> 'day_of_week')::integer,
          'period', (item.value ->> 'period')::integer
        )
        order by
          (item.value ->> 'day_of_week')::integer,
          (item.value ->> 'period')::integer
      ),
      '[]'::jsonb
    )
    into v_requested
    from jsonb_array_elements(v_after) item(value);

    perform public.management_set_teacher_unavailable_periods(
      p_schedule_revision_id,
      v_teacher_id,
      v_requested
    );
  end loop;

  v_intermediate_snapshot :=
    public.management_preview_solver_snapshot(
      p_schedule_revision_id,
      null
    );

  v_workspace_result :=
    public.management_commit_workspace_v5(
      p_schedule_revision_id,
      p_requirement_set_id,
      p_expected_revision_version,
      v_intermediate_snapshot ->> 'snapshotHash',
      v_intermediate_snapshot ->> 'baselineHash',
      p_changes,
      p_requirement_changes,
      p_resource_changes,
      p_teacher_planning_changes
    );

  return v_workspace_result || jsonb_build_object(
    'changedTeacherAvailabilityCount',
    v_change_count
  );
end
$function$;

revoke all
  on function public.management_commit_workspace_v6(
    uuid, uuid, integer, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
  )
  from public, anon;

grant execute
  on function public.management_commit_workspace_v6(
    uuid, uuid, integer, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
  )
  to authenticated;

comment on function public.management_commit_workspace_v6(
  uuid, uuid, integer, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) is
  'Workspace v6 atomic commit. Applies stale-safe hard teacher availability changes through M39.1.2, refreshes snapshot identity, then commits teacher planning and all remaining workspace changes through v5 in the same transaction.';

commit;
