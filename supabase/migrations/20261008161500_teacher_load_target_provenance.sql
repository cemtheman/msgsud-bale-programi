-- Teacher load target provenance.
-- Distinguish historical auto-seeded suggestions from human-approved targets.
-- Solver objective must only consume EXPLICIT targets.

begin;

alter table public.management_teacher_planning_inputs
  add column if not exists input_source text not null default 'EXPLICIT';

alter table public.management_teacher_planning_inputs
  drop constraint if exists management_teacher_planning_inputs_source_check;

alter table public.management_teacher_planning_inputs
  add constraint management_teacher_planning_inputs_source_check
  check (input_source in ('DEFAULT_SEED', 'EXPLICIT'));

-- The 1/10/20 values inserted by the M40.1 bootstrap were suggestions,
-- not human-approved planning targets. Preserve their numeric values for UI
-- reference but mark untouched rows as DEFAULT_SEED.
update public.management_teacher_planning_inputs planning
set input_source = 'DEFAULT_SEED'
where planning.minimum_load = 1
  and planning.target_load = 10
  and planning.maximum_load = 20
  and planning.updated_at = planning.created_at
  and planning.created_at in (
    '2026-10-01 20:23:27.68376+00'::timestamptz,
    '2026-10-01 20:34:09.104771+00'::timestamptz
  );

create or replace function public.management_list_teacher_load_targets(
  p_schedule_revision_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requirement_set_id uuid;
  v_revision_status text;
  v_result jsonb;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M39.1 management VIEWER role required'
      using errcode = '42501';
  end if;

  select revision.requirement_set_id, revision.status
  into v_requirement_set_id, v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id;

  if v_requirement_set_id is null then
    raise exception 'M39.1 schedule revision not found';
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M39.1 teacher planning audit requires DRAFT revision';
  end if;

  with placed_load as (
    select
      placement.teacher_id,
      count(*)::integer as placed_block_count,
      coalesce(sum(card.duration_periods), 0)::integer as actual_load_periods
    from public.placements placement
    join public.schedule_cards card on card.id = placement.card_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    where card.schedule_revision_id = p_schedule_revision_id
      and requirement.term_status = 'ACTIVE'
      and placement.teacher_id is not null
    group by placement.teacher_id
  ),
  active_requirements as (
    select
      assignment.teacher_id,
      count(distinct assignment.requirement_id)::integer
        as active_requirement_count
    from public.course_requirement_teachers assignment
    join public.course_requirements requirement
      on requirement.id = assignment.requirement_id
    where requirement.requirement_set_id = v_requirement_set_id
      and requirement.term_status = 'ACTIVE'
    group by assignment.teacher_id
  ),
  unavailable as (
    select
      slot.teacher_id,
      count(*)::integer as unavailable_period_count,
      jsonb_agg(
        jsonb_build_object(
          'dayOfWeek', slot.day_of_week,
          'period', slot.period
        )
        order by slot.day_of_week, slot.period
      ) as unavailable_periods
    from public.management_teacher_unavailable_periods slot
    where slot.requirement_set_id = v_requirement_set_id
    group by slot.teacher_id
  ),
  unavailable_placement as (
    select
      placement.teacher_id,
      count(distinct placement.card_id)::integer
        as unavailable_placed_block_count
    from public.placements placement
    join public.schedule_cards card on card.id = placement.card_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    where card.schedule_revision_id = p_schedule_revision_id
      and requirement.term_status = 'ACTIVE'
      and placement.teacher_id is not null
      and exists (
        select 1
        from public.management_teacher_unavailable_periods slot
        where slot.requirement_set_id = v_requirement_set_id
          and slot.teacher_id = placement.teacher_id
          and slot.day_of_week = placement.day_of_week
          and slot.period between placement.start_period
            and placement.start_period + card.duration_periods - 1
      )
    group by placement.teacher_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'teacherId', teacher.id,
        'minimumLoad', planning.minimum_load,
        'targetLoad', planning.target_load,
        'maximumLoad', planning.maximum_load,
        'loadTargetSource', planning.input_source,
        'configured', (
          planning.input_source = 'EXPLICIT'
          and (
            planning.minimum_load is not null
            or planning.target_load is not null
            or planning.maximum_load is not null
          )
        ),
        'actualLoadPeriods', coalesce(placed.actual_load_periods, 0),
        'placedBlockCount', coalesce(placed.placed_block_count, 0),
        'activeRequirementCount', coalesce(active.active_requirement_count, 0),
        'unavailablePeriods',
          coalesce(unavailable.unavailable_periods, '[]'::jsonb),
        'unavailablePeriodCount',
          coalesce(unavailable.unavailable_period_count, 0),
        'availabilityConfigured',
          coalesce(unavailable.unavailable_period_count, 0) > 0,
        'unavailablePlacedBlockCount',
          coalesce(unavailable_placement.unavailable_placed_block_count, 0)
      )
      order by teacher.name, teacher.id
    ),
    '[]'::jsonb
  )
  into v_result
  from public.teachers teacher
  left join public.management_teacher_planning_inputs planning
    on planning.requirement_set_id = v_requirement_set_id
   and planning.teacher_id = teacher.id
  left join placed_load placed on placed.teacher_id = teacher.id
  left join active_requirements active on active.teacher_id = teacher.id
  left join unavailable on unavailable.teacher_id = teacher.id
  left join unavailable_placement
    on unavailable_placement.teacher_id = teacher.id
  where teacher.archived_at is null;

  return v_result;
end
$$;

create or replace function public.management_set_teacher_load_targets(
  p_schedule_revision_id uuid,
  p_teacher_id uuid,
  p_minimum_load integer,
  p_target_load integer,
  p_maximum_load integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requirement_set_id uuid;
  v_revision_status text;
  v_teacher_name text;
  v_result jsonb;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M39.0 management EDITOR role required'
      using errcode = '42501';
  end if;

  select revision.requirement_set_id, revision.status
  into v_requirement_set_id, v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id
  for share;

  if v_requirement_set_id is null then
    raise exception 'M39.0 schedule revision not found';
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M39.0 teacher planning inputs require DRAFT revision';
  end if;

  select teacher.name into v_teacher_name
  from public.teachers teacher
  where teacher.id = p_teacher_id
    and teacher.archived_at is null;

  if v_teacher_name is null then
    raise exception 'M39.0 active teacher resource not found';
  end if;

  if p_minimum_load is not null
     and (p_minimum_load < 0 or p_minimum_load > 60) then
    raise exception 'M39.0 minimum load must be between 0 and 60';
  end if;
  if p_target_load is not null
     and (p_target_load < 0 or p_target_load > 60) then
    raise exception 'M39.0 target load must be between 0 and 60';
  end if;
  if p_maximum_load is not null
     and (p_maximum_load < 0 or p_maximum_load > 60) then
    raise exception 'M39.0 maximum load must be between 0 and 60';
  end if;
  if p_minimum_load is not null and p_target_load is not null
     and p_minimum_load > p_target_load then
    raise exception 'M39.0 minimum load cannot exceed target load';
  end if;
  if p_target_load is not null and p_maximum_load is not null
     and p_target_load > p_maximum_load then
    raise exception 'M39.0 target load cannot exceed maximum load';
  end if;
  if p_minimum_load is not null and p_maximum_load is not null
     and p_minimum_load > p_maximum_load then
    raise exception 'M39.0 minimum load cannot exceed maximum load';
  end if;

  if p_minimum_load is null
     and p_target_load is null
     and p_maximum_load is null then
    delete from public.management_teacher_planning_inputs planning
    where planning.requirement_set_id = v_requirement_set_id
      and planning.teacher_id = p_teacher_id;
  else
    insert into public.management_teacher_planning_inputs (
      requirement_set_id,
      teacher_id,
      minimum_load,
      target_load,
      maximum_load,
      input_source
    )
    values (
      v_requirement_set_id,
      p_teacher_id,
      p_minimum_load::smallint,
      p_target_load::smallint,
      p_maximum_load::smallint,
      'EXPLICIT'
    )
    on conflict (requirement_set_id, teacher_id)
    do update set
      minimum_load = excluded.minimum_load,
      target_load = excluded.target_load,
      maximum_load = excluded.maximum_load,
      input_source = 'EXPLICIT',
      updated_at = now();
  end if;

  select entry.value into v_result
  from jsonb_array_elements(
    public.management_list_teacher_load_targets(p_schedule_revision_id)
  ) entry(value)
  where entry.value ->> 'teacherId' = p_teacher_id::text
  limit 1;

  if v_result is null then
    raise exception 'M39.0 teacher planning result not found';
  end if;

  return v_result || jsonb_build_object(
    'teacherName', v_teacher_name,
    'publishedChanged', false,
    'solverBehaviorChanged', true
  );
end
$$;

-- Workspace v5 must treat DEFAULT_SEED values as logically absent from the
-- explicit objective baseline. This lets a user confirm/edit a suggestion
-- without a false stale/no-op failure.
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
  v_current_source text;
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
  p_teacher_planning_changes :=
    coalesce(p_teacher_planning_changes, '[]'::jsonb);

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
    public.management_preview_solver_snapshot(p_schedule_revision_id, null);

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

    select
      planning.minimum_load::integer,
      planning.target_load::integer,
      planning.maximum_load::integer,
      planning.input_source
    into
      v_current_minimum,
      v_current_target,
      v_current_maximum,
      v_current_source
    from public.management_teacher_planning_inputs planning
    where planning.requirement_set_id = p_requirement_set_id
      and planning.teacher_id = v_teacher_id;

    if not found then
      v_current_minimum := null;
      v_current_target := null;
      v_current_maximum := null;
      v_current_source := null;
    elsif v_current_source = 'DEFAULT_SEED' then
      v_current_minimum := null;
      v_current_target := null;
      v_current_maximum := null;
    end if;

    begin
      v_after_minimum := nullif(v_after ->> 'minimum_load', '')::integer;
      v_after_target := nullif(v_after ->> 'target_load', '')::integer;
      v_after_maximum := nullif(v_after ->> 'maximum_load', '')::integer;
    exception when others then
      raise exception
        'WORKSPACE_V5_INVALID_TEACHER_PLANNING_VALUE: %', v_teacher_id;
    end;

    if v_current_minimum
          is distinct from nullif(v_before ->> 'minimum_load', '')::integer
       or v_current_target
          is distinct from nullif(v_before ->> 'target_load', '')::integer
       or v_current_maximum
          is distinct from nullif(v_before ->> 'maximum_load', '')::integer then
      raise exception
        'WORKSPACE_V5_TEACHER_PLANNING_BEFORE_STALE: %', v_teacher_id;
    end if;

    if (v_after_minimum is not null and (v_after_minimum < 0 or v_after_minimum > 60))
       or (v_after_target is not null and (v_after_target < 0 or v_after_target > 60))
       or (v_after_maximum is not null and (v_after_maximum < 0 or v_after_maximum > 60))
       or (v_after_minimum is not null and v_after_target is not null
           and v_after_minimum > v_after_target)
       or (v_after_target is not null and v_after_maximum is not null
           and v_after_target > v_after_maximum)
       or (v_after_minimum is not null and v_after_maximum is not null
           and v_after_minimum > v_after_maximum) then
      raise exception
        'WORKSPACE_V5_TEACHER_PLANNING_INVALID: %', v_teacher_id;
    end if;

    if v_current_minimum is not distinct from v_after_minimum
       and v_current_target is not distinct from v_after_target
       and v_current_maximum is not distinct from v_after_maximum then
      raise exception
        'WORKSPACE_V5_TEACHER_PLANNING_NOOP: %', v_teacher_id;
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
    public.management_preview_solver_snapshot(p_schedule_revision_id, null);

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
    'changedTeacherPlanningCount', v_change_count
  );
end
$function$;

comment on column public.management_teacher_planning_inputs.input_source is
  'DEFAULT_SEED = historical bootstrap suggestion, excluded from teacherLoadBalance; EXPLICIT = human-approved target used by solver.';

comment on function public.management_list_teacher_load_targets(uuid) is
  'Teacher planning audit with provenance. configured=true only for EXPLICIT targets; DEFAULT_SEED numeric suggestions remain visible but are excluded from solver objective input.';

commit;
