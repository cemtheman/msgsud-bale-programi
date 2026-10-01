-- Management / M39.0
-- Teacher planning load foundation.
--
-- This package is additive and does NOT change solver behavior.
-- Load targets are requirement-set/term planning inputs, not permanent teacher
-- attributes. Actual load is derived from placed card duration_periods.

begin;

create table if not exists public.management_teacher_planning_inputs (
  requirement_set_id uuid not null
    references public.requirement_sets(id) on delete cascade,
  teacher_id uuid not null
    references public.teachers(id) on delete cascade,
  minimum_load smallint null,
  target_load smallint null,
  maximum_load smallint null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (requirement_set_id, teacher_id),
  constraint management_teacher_planning_inputs_minimum_range
    check (minimum_load is null or minimum_load between 0 and 60),
  constraint management_teacher_planning_inputs_target_range
    check (target_load is null or target_load between 0 and 60),
  constraint management_teacher_planning_inputs_maximum_range
    check (maximum_load is null or maximum_load between 0 and 60),
  constraint management_teacher_planning_inputs_min_target_order
    check (
      minimum_load is null
      or target_load is null
      or minimum_load <= target_load
    ),
  constraint management_teacher_planning_inputs_target_max_order
    check (
      target_load is null
      or maximum_load is null
      or target_load <= maximum_load
    ),
  constraint management_teacher_planning_inputs_min_max_order
    check (
      minimum_load is null
      or maximum_load is null
      or minimum_load <= maximum_load
    )
);

create index if not exists management_teacher_planning_inputs_teacher_idx
  on public.management_teacher_planning_inputs (teacher_id);

alter table public.management_teacher_planning_inputs
  enable row level security;

revoke all
  on public.management_teacher_planning_inputs
  from public, anon, authenticated;


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
    raise exception 'M39.0 management VIEWER role required'
      using errcode = '42501';
  end if;

  select
    revision.requirement_set_id,
    revision.status
  into
    v_requirement_set_id,
    v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id;

  if v_requirement_set_id is null then
    raise exception 'M39.0 schedule revision not found';
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M39.0 teacher planning audit requires DRAFT revision';
  end if;

  with placed_load as (
    select
      placement.teacher_id,
      count(*)::integer as placed_block_count,
      coalesce(sum(card.duration_periods), 0)::integer as actual_load_periods
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
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
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'teacherId', teacher.id,
        'minimumLoad', planning.minimum_load,
        'targetLoad', planning.target_load,
        'maximumLoad', planning.maximum_load,
        'configured', (
          planning.minimum_load is not null
          or planning.target_load is not null
          or planning.maximum_load is not null
        ),
        'actualLoadPeriods',
          coalesce(placed.actual_load_periods, 0),
        'placedBlockCount',
          coalesce(placed.placed_block_count, 0),
        'activeRequirementCount',
          coalesce(active.active_requirement_count, 0)
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
  left join placed_load placed
    on placed.teacher_id = teacher.id
  left join active_requirements active
    on active.teacher_id = teacher.id
  where teacher.archived_at is null;

  return v_result;
end
$$;

revoke all
  on function public.management_list_teacher_load_targets(uuid)
  from public, anon;

grant execute
  on function public.management_list_teacher_load_targets(uuid)
  to authenticated;


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

  select
    revision.requirement_set_id,
    revision.status
  into
    v_requirement_set_id,
    v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id
  for share;

  if v_requirement_set_id is null then
    raise exception 'M39.0 schedule revision not found';
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M39.0 teacher planning inputs require DRAFT revision';
  end if;

  select teacher.name
  into v_teacher_name
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

  if p_minimum_load is not null
     and p_target_load is not null
     and p_minimum_load > p_target_load then
    raise exception 'M39.0 minimum load cannot exceed target load';
  end if;

  if p_target_load is not null
     and p_maximum_load is not null
     and p_target_load > p_maximum_load then
    raise exception 'M39.0 target load cannot exceed maximum load';
  end if;

  if p_minimum_load is not null
     and p_maximum_load is not null
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
      maximum_load
    )
    values (
      v_requirement_set_id,
      p_teacher_id,
      p_minimum_load::smallint,
      p_target_load::smallint,
      p_maximum_load::smallint
    )
    on conflict (requirement_set_id, teacher_id)
    do update set
      minimum_load = excluded.minimum_load,
      target_load = excluded.target_load,
      maximum_load = excluded.maximum_load,
      updated_at = now();
  end if;

  select entry.value
  into v_result
  from jsonb_array_elements(
    public.management_list_teacher_load_targets(
      p_schedule_revision_id
    )
  ) entry(value)
  where entry.value ->> 'teacherId' = p_teacher_id::text
  limit 1;

  if v_result is null then
    raise exception 'M39.0 teacher planning result not found';
  end if;

  return v_result || jsonb_build_object(
    'teacherName', v_teacher_name,
    'publishedChanged', false,
    'solverBehaviorChanged', false
  );
end
$$;

revoke all
  on function public.management_set_teacher_load_targets(
    uuid, uuid, integer, integer, integer
  )
  from public, anon;

grant execute
  on function public.management_set_teacher_load_targets(
    uuid, uuid, integer, integer, integer
  )
  to authenticated;


comment on table public.management_teacher_planning_inputs is
  'M39.0 requirement-set scoped teacher planning inputs. Load values are weekly timetable periods, not permanent teacher attributes.';

comment on function public.management_list_teacher_load_targets(uuid) is
  'M39.0 read-only teacher load audit for one DRAFT revision. Actual load is the sum of placed active card duration_periods.';

comment on function public.management_set_teacher_load_targets(
  uuid, uuid, integer, integer, integer
) is
  'M39.0 explicit teacher min/target/max weekly load input. Does not change placements, publication state, candidates, or solver behavior.';

commit;
