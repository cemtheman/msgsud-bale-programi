-- Management / M39.1
-- Teacher hard availability foundation.
--
-- Hard unavailable periods are requirement-set/term planning inputs.
-- They are enforced consistently in:
--   * persisted interactive candidate domains
--   * M33 solver snapshots / in-memory feasibility + objective search
--
-- Existing placements are NOT moved automatically. When a newly blocked period
-- overlaps an existing placement, the placement remains visible as a baseline
-- conflict so a human or the solver can repair it explicitly.
--
-- Load targets from M39.0 remain soft-planning inputs and do not become an
-- optimization objective in this package.

begin;


-- -------------------------------------------------------------------------
-- A. TERM-SCOPED HARD UNAVAILABILITY
-- -------------------------------------------------------------------------

create table if not exists public.management_teacher_unavailable_periods (
  requirement_set_id uuid not null
    references public.requirement_sets(id) on delete cascade,
  teacher_id uuid not null
    references public.teachers(id) on delete cascade,
  day_of_week smallint not null,
  period smallint not null,
  created_at timestamptz not null default now(),
  primary key (
    requirement_set_id,
    teacher_id,
    day_of_week,
    period
  ),
  constraint management_teacher_unavailable_day_range
    check (day_of_week between 1 and 5),
  constraint management_teacher_unavailable_period_range
    check (period between 1 and 12)
);

create index if not exists management_teacher_unavailable_teacher_idx
  on public.management_teacher_unavailable_periods (
    teacher_id,
    requirement_set_id
  );

alter table public.management_teacher_unavailable_periods
  enable row level security;

revoke all
  on public.management_teacher_unavailable_periods
  from public, anon, authenticated;

comment on table public.management_teacher_unavailable_periods is
  'M39.1 requirement-set scoped teacher hard-unavailability slots. Absence of rows means no hard-unavailability restriction for that teacher in the term.';


-- -------------------------------------------------------------------------
-- B. EXTEND M39.0 TEACHER PLANNING AUDIT
-- -------------------------------------------------------------------------

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

  select
    revision.requirement_set_id,
    revision.status
  into
    v_requirement_set_id,
    v_revision_status
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
    join public.schedule_cards card
      on card.id = placement.card_id
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
          and slot.period between
            placement.start_period
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
          coalesce(active.active_requirement_count, 0),
        'unavailablePeriods',
          coalesce(unavailable.unavailable_periods, '[]'::jsonb),
        'unavailablePeriodCount',
          coalesce(unavailable.unavailable_period_count, 0),
        'availabilityConfigured',
          coalesce(unavailable.unavailable_period_count, 0) > 0,
        'unavailablePlacedBlockCount',
          coalesce(
            unavailable_placement.unavailable_placed_block_count,
            0
          )
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
  left join unavailable
    on unavailable.teacher_id = teacher.id
  left join unavailable_placement
    on unavailable_placement.teacher_id = teacher.id
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


create or replace function public.management_set_teacher_unavailable_periods(
  p_schedule_revision_id uuid,
  p_teacher_id uuid,
  p_unavailable_periods jsonb
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
  v_requested_count integer;
  v_distinct_count integer;
  v_candidate_reclassified_card_count integer := 0;
  v_result jsonb;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M39.1 management EDITOR role required'
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
    raise exception 'M39.1 schedule revision not found';
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception
      'M39.1 teacher hard availability requires DRAFT revision';
  end if;

  select teacher.name
  into v_teacher_name
  from public.teachers teacher
  where teacher.id = p_teacher_id
    and teacher.archived_at is null
    and teacher.operational_status = 'ACTIVE'
  for share;

  if v_teacher_name is null then
    raise exception 'M39.1 active teacher resource not found';
  end if;

  if p_unavailable_periods is null
     or jsonb_typeof(p_unavailable_periods) <> 'array' then
    raise exception
      'M39.1 unavailable periods must be a JSON array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_unavailable_periods) item(value)
    where jsonb_typeof(item.value) <> 'object'
       or coalesce(item.value ->> 'dayOfWeek', '') !~ '^[0-9]+$'
       or coalesce(item.value ->> 'period', '') !~ '^[0-9]+$'
       or (item.value ->> 'dayOfWeek')::integer not between 1 and 5
       or (item.value ->> 'period')::integer not between 1 and 12
  ) then
    raise exception
      'M39.1 unavailable period must use day 1..5 and period 1..12';
  end if;

  select
    count(*)::integer,
    count(distinct (
      (item.value ->> 'dayOfWeek')::integer::text
      || ':'
      || (item.value ->> 'period')::integer::text
    ))::integer
  into
    v_requested_count,
    v_distinct_count
  from jsonb_array_elements(p_unavailable_periods) item(value);

  if v_requested_count <> v_distinct_count then
    raise exception 'M39.1 unavailable periods contain duplicates';
  end if;

  delete from public.management_teacher_unavailable_periods slot
  where slot.requirement_set_id = v_requirement_set_id
    and slot.teacher_id = p_teacher_id;

  insert into public.management_teacher_unavailable_periods (
    requirement_set_id,
    teacher_id,
    day_of_week,
    period
  )
  select
    v_requirement_set_id,
    p_teacher_id,
    (item.value ->> 'dayOfWeek')::integer::smallint,
    (item.value ->> 'period')::integer::smallint
  from jsonb_array_elements(p_unavailable_periods) item(value)
  order by
    (item.value ->> 'dayOfWeek')::integer,
    (item.value ->> 'period')::integer;

  select count(distinct assessment.card_id)::integer
  into v_candidate_reclassified_card_count
  from public.schedule_card_candidate_assessments assessment
  join public.schedule_cards card
    on card.id = assessment.card_id
  join public.schedule_revisions revision
    on revision.id = card.schedule_revision_id
  where revision.requirement_set_id = v_requirement_set_id
    and assessment.teacher_id = p_teacher_id;

  -- No candidate combinations are rebuilt. Existing rows for this teacher are
  -- re-run through M22 + M32.5 + M39.1 classification in one set-based update.
  update public.schedule_card_candidate_assessments assessment
  set generated_at = now()
  from public.schedule_cards card
  join public.schedule_revisions revision
    on revision.id = card.schedule_revision_id
  where assessment.card_id = card.id
    and revision.requirement_set_id = v_requirement_set_id
    and assessment.teacher_id = p_teacher_id;

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
    raise exception 'M39.1 teacher planning result not found';
  end if;

  return v_result || jsonb_build_object(
    'teacherName', v_teacher_name,
    'candidateReclassifiedCardCount',
      coalesce(v_candidate_reclassified_card_count, 0),
    'publishedChanged', false,
    'placementsChanged', false,
    'solverBehaviorChanged', true
  );
end
$$;

revoke all
  on function public.management_set_teacher_unavailable_periods(
    uuid, uuid, jsonb
  )
  from public, anon;

grant execute
  on function public.management_set_teacher_unavailable_periods(
    uuid, uuid, jsonb
  )
  to authenticated;


-- -------------------------------------------------------------------------
-- C. PERSISTED CANDIDATE DOMAIN HARD FILTER
-- -------------------------------------------------------------------------

create or replace function
  public.management_apply_teacher_availability_candidate_batch()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  with target as materialized (
    select
      assessment.id as assessment_id,
      assessment.card_id,
      exists (
        select 1
        from public.management_teacher_unavailable_periods slot
        where slot.requirement_set_id = revision.requirement_set_id
          and slot.teacher_id = assessment.teacher_id
          and slot.day_of_week = assessment.day_of_week
          and slot.period between
            assessment.start_period
            and assessment.start_period + card.duration_periods - 1
      ) as teacher_unavailable
    from changed_rows changed
    join public.schedule_card_candidate_assessments assessment
      on assessment.id = changed.id
    join public.schedule_cards card
      on card.id = assessment.card_id
    join public.schedule_revisions revision
      on revision.id = card.schedule_revision_id
  )
  update public.schedule_card_candidate_assessments assessment
  set
    reason_codes = (
      select coalesce(
        array_agg(distinct reason order by reason),
        array[]::text[]
      )
      from (
        select existing.reason
        from unnest(
          coalesce(assessment.reason_codes, array[]::text[])
        ) existing(reason)
        where existing.reason <> 'TEACHER_UNAVAILABLE'

        union all

        select 'TEACHER_UNAVAILABLE'
        where target.teacher_unavailable
      ) combined(reason)
    ),
    status = case
      when target.teacher_unavailable then 'INVALID'
      else 'VALID'
    end,
    is_complete = not target.teacher_unavailable,
    details = coalesce(assessment.details, '{}'::jsonb)
      || jsonb_build_object(
        'teacher_availability_engine_version', 'M39.1-v1',
        'teacher_unavailable', target.teacher_unavailable
      ),
    generated_at = now()
  from target
  where assessment.id = target.assessment_id;

  with impacted_card as materialized (
    select distinct changed.card_id
    from changed_rows changed
  ),
  aggregate as materialized (
    select
      assessment.card_id,
      count(*) filter (
        where assessment.status = 'VALID'
      )::integer as valid_count,
      count(*) filter (
        where assessment.status = 'INVALID'
      )::integer as invalid_count,
      count(*) filter (
        where assessment.status = 'UNRESOLVED'
      )::integer as unresolved_count,
      count(*) filter (
        where assessment.is_complete
      )::integer as complete_candidate_count
    from public.schedule_card_candidate_assessments assessment
    join impacted_card card
      on card.card_id = assessment.card_id
    group by assessment.card_id
  )
  insert into public.schedule_card_domain_summaries (
    card_id,
    domain_status,
    valid_count,
    invalid_count,
    unresolved_count,
    complete_candidate_count,
    is_forced,
    is_contradiction,
    generated_at
  )
  select
    aggregate.card_id,
    case
      when aggregate.unresolved_count > 0 then 'UNRESOLVED'
      when aggregate.valid_count = 0 then 'INVALID'
      else 'VALID'
    end,
    aggregate.valid_count,
    aggregate.invalid_count,
    aggregate.unresolved_count,
    aggregate.complete_candidate_count,
    (
      aggregate.valid_count = 1
      and aggregate.unresolved_count = 0
    ),
    (
      aggregate.valid_count = 0
      and aggregate.unresolved_count = 0
    ),
    now()
  from aggregate
  on conflict (card_id) do update
  set
    domain_status = excluded.domain_status,
    valid_count = excluded.valid_count,
    invalid_count = excluded.invalid_count,
    unresolved_count = excluded.unresolved_count,
    complete_candidate_count = excluded.complete_candidate_count,
    is_forced = excluded.is_forced,
    is_contradiction = excluded.is_contradiction,
    generated_at = excluded.generated_at;

  return null;
end
$$;

drop trigger if exists
  zzzz_management_teacher_availability_candidate_insert
  on public.schedule_card_candidate_assessments;

create trigger zzzz_management_teacher_availability_candidate_insert
after insert
on public.schedule_card_candidate_assessments
referencing new table as changed_rows
for each statement
execute function
  public.management_apply_teacher_availability_candidate_batch();

drop trigger if exists
  zzzz_management_teacher_availability_candidate_update
  on public.schedule_card_candidate_assessments;

create trigger zzzz_management_teacher_availability_candidate_update
after update
on public.schedule_card_candidate_assessments
referencing new table as changed_rows
for each statement
execute function
  public.management_apply_teacher_availability_candidate_batch();

revoke all
  on function public.management_apply_teacher_availability_candidate_batch()
  from public, anon, authenticated;


-- Reclassify existing candidate rows once under the new rule.
update public.schedule_card_candidate_assessments assessment
set generated_at = now()
where assessment.teacher_id is not null;


-- -------------------------------------------------------------------------
-- D. M33 SNAPSHOT: SAME HARD RULE FOR SOLVER / OPTIMIZER
-- -------------------------------------------------------------------------
-- Preserve the established M33 snapshot builder as a private base and wrap it
-- instead of copying the large, already accepted structural contract.

alter function public.management_preview_solver_snapshot(uuid, uuid)
  rename to management_preview_solver_snapshot_m39_base;

revoke all
  on function public.management_preview_solver_snapshot_m39_base(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.management_preview_solver_snapshot(
  p_schedule_revision_id uuid,
  p_objective_profile_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_base jsonb;
  v_core jsonb;
  v_requirement_set_id uuid;
  v_unavailable jsonb;
  v_rules jsonb;
  v_snapshot_hash text;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M39.1 management VIEWER role required'
      using errcode = '42501';
  end if;

  v_base :=
    public.management_preview_solver_snapshot_m39_base(
      p_schedule_revision_id,
      p_objective_profile_id
    );

  v_requirement_set_id :=
    (v_base -> 'meta' ->> 'requirementSetId')::uuid;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'teacherId', slot.teacher_id,
        'dayOfWeek', slot.day_of_week,
        'period', slot.period
      )
      order by slot.teacher_id, slot.day_of_week, slot.period
    ),
    '[]'::jsonb
  )
  into v_unavailable
  from public.management_teacher_unavailable_periods slot
  where slot.requirement_set_id = v_requirement_set_id;

  v_core :=
    (v_base - 'snapshotHash' - 'baselineHash')
    || jsonb_build_object(
      'snapshotVersion', 'M39.1-v1',
      'teacherUnavailablePeriods', v_unavailable
    );

  v_rules :=
    coalesce(
      v_core #> '{hardConstraintContract,rules}',
      '[]'::jsonb
    );

  if not v_rules @> '["TEACHER_HARD_UNAVAILABLE"]'::jsonb then
    v_rules := v_rules || '["TEACHER_HARD_UNAVAILABLE"]'::jsonb;
  end if;

  v_core := jsonb_set(
    v_core,
    '{hardConstraintContract,rules}',
    v_rules,
    true
  );

  v_snapshot_hash := md5(v_core::text);

  return v_core || jsonb_build_object(
    'snapshotHash', v_snapshot_hash,
    'baselineHash', v_base ->> 'baselineHash'
  );
end
$$;

revoke all
  on function public.management_preview_solver_snapshot(uuid, uuid)
  from public, anon;

grant execute
  on function public.management_preview_solver_snapshot(uuid, uuid)
  to authenticated;


-- Rebind capture to the wrapped preview and persist its dynamic version.
create or replace function public.management_capture_solver_snapshot(
  p_schedule_revision_id uuid,
  p_objective_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot jsonb;
  v_snapshot_hash text;
  v_baseline_hash text;
  v_snapshot_version text;
  v_snapshot_id uuid;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M39.1 management EDITOR role required'
      using errcode = '42501';
  end if;

  perform 1
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id
    and revision.status = 'DRAFT'
  for share;

  if not found then
    raise exception 'M39.1 capture requires DRAFT revision';
  end if;

  v_snapshot :=
    public.management_preview_solver_snapshot(
      p_schedule_revision_id,
      p_objective_profile_id
    );

  v_snapshot_hash := v_snapshot ->> 'snapshotHash';
  v_baseline_hash := v_snapshot ->> 'baselineHash';
  v_snapshot_version := v_snapshot ->> 'snapshotVersion';

  if not coalesce(
    ((v_snapshot -> 'readiness') ->> 'hardInputReady')::boolean,
    false
  ) then
    raise exception
      'M39.1 snapshot capture blocked by hard input readiness: %',
      (v_snapshot -> 'readiness' -> 'hardBlockers')::text;
  end if;

  insert into public.management_solver_snapshots (
    schedule_revision_id,
    objective_profile_id,
    snapshot_version,
    snapshot_hash,
    baseline_hash,
    snapshot,
    readiness
  )
  values (
    p_schedule_revision_id,
    p_objective_profile_id,
    v_snapshot_version,
    v_snapshot_hash,
    v_baseline_hash,
    v_snapshot,
    v_snapshot -> 'readiness'
  )
  on conflict (schedule_revision_id, snapshot_hash)
  do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    select snapshot.id
    into v_snapshot_id
    from public.management_solver_snapshots snapshot
    where snapshot.schedule_revision_id = p_schedule_revision_id
      and snapshot.snapshot_hash = v_snapshot_hash;
  end if;

  return jsonb_build_object(
    'snapshotId', v_snapshot_id,
    'revisionId', p_schedule_revision_id,
    'objectiveProfileId', p_objective_profile_id,
    'snapshotVersion', v_snapshot_version,
    'snapshotHash', v_snapshot_hash,
    'baselineHash', v_baseline_hash,
    'readiness', v_snapshot -> 'readiness',
    'baselineMetrics', v_snapshot -> 'baselineMetrics',
    'solverEngineStatus', 'SNAPSHOT_ONLY',
    'captured', true
  );
end
$$;

revoke all
  on function public.management_capture_solver_snapshot(uuid, uuid)
  from public, anon;

grant execute
  on function public.management_capture_solver_snapshot(uuid, uuid)
  to authenticated;


comment on function public.management_set_teacher_unavailable_periods(
  uuid, uuid, jsonb
) is
  'M39.1 replaces one active teacher hard-unavailability set for the term, reclassifies persisted candidate rows, and leaves current placements/publication unchanged.';

comment on function public.management_preview_solver_snapshot(uuid, uuid) is
  'M39.1 M33 snapshot wrapper that adds term-scoped teacher hard-unavailability slots to structural solver input and snapshot hashing.';

commit;
