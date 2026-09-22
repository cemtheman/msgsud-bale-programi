-- Management / M25
-- Clean Effective Student Schedule Bootstrap
--
-- PURPOSE
--   Retire the test/recovery DRAFT revision and create a clean DRAFT revision
--   from the schedule that students/parents actually see.
--
-- AUTHORITATIVE INPUTS
--   1. Current public schedule_sessions + session_groups baseline.
--   2. Existing requirement/source-evidence model derived from that baseline.
--   3. M19.3 runtime adjustments currently applied by the student app:
--      - Grade-5 B. Uygulama inactive (already structural; no cards)
--      - 5A Monday V. Kondisyon 11:40
--      - 5A Wednesday Piyano groups 15:30-16:15 / 16:20-17:00
--      - 5A Friday K. Bale 13:50 / 14:40 with E. Gemalmaz
--
-- IMPORTANT
--   * Existing test/recovery revision is ARCHIVED, never deleted.
--   * Requirement/group identities are reused, but the test card partition is
--     NOT copied; clean cards are rebuilt from real public source runs.
--   * Existing placements and move history are NOT copied.
--   * New revision starts with zero move_transactions.
--   * Every clean card receives one baseline placement.
--   * Public projection is not changed by this migration.
--   * Publication apply remains locked.
--
-- If any mapping/conflict/readiness invariant fails, the transaction aborts
-- and the existing state is left untouched.

begin;


create table if not exists public.management_clean_effective_bootstrap_runs (
  id uuid primary key default gen_random_uuid(),
  requirement_set_id uuid not null
    references public.requirement_sets(id) on delete restrict,
  source_revision_id uuid not null
    references public.schedule_revisions(id) on delete restrict,
  clean_revision_id uuid not null unique
    references public.schedule_revisions(id) on delete restrict,
  engine_version text not null,
  source_card_count integer not null,
  clean_card_count integer not null,
  target_placement_count integer not null,
  target_period_count integer not null,
  public_source_target_count integer not null,
  runtime_adjustment_target_count integer not null,
  active_source_requirement_count integer not null,
  active_source_unit_count integer not null,
  weekly_load_adjustment_count integer not null,
  weekly_load_adjustments jsonb not null,
  projected_group_row_count integer not null,
  source_public_session_count integer not null,
  source_public_group_count integer not null,
  source_public_sessions_hash text not null,
  source_public_groups_hash text not null,
  readiness jsonb not null,
  created_at timestamptz not null default now(),
  constraint management_clean_effective_bootstrap_counts_nonnegative
    check (
      source_card_count >= 0
      and clean_card_count >= 0
      and target_placement_count >= 0
      and target_period_count >= 0
      and public_source_target_count >= 0
      and runtime_adjustment_target_count >= 0
      and active_source_requirement_count >= 0
      and active_source_unit_count >= 0
      and weekly_load_adjustment_count >= 0
      and projected_group_row_count >= 0
      and source_public_session_count >= 0
      and source_public_group_count >= 0
    )
);

alter table public.management_clean_effective_bootstrap_runs
  enable row level security;

revoke insert, update, delete
  on public.management_clean_effective_bootstrap_runs
  from anon, authenticated;

grant select
  on public.management_clean_effective_bootstrap_runs
  to authenticated;

drop policy if exists management_clean_effective_bootstrap_runs_read
  on public.management_clean_effective_bootstrap_runs;

create policy management_clean_effective_bootstrap_runs_read
  on public.management_clean_effective_bootstrap_runs
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));


do $$
declare
  v_requirement_set_id uuid;
  v_source_revision_id uuid;
  v_clean_revision_id uuid := gen_random_uuid();
  v_next_revision_version integer;

  v_source_card_count integer;
  v_source_placement_count integer;
  v_source_move_count integer;

  v_public_session_count integer;
  v_public_group_count integer;
  v_public_sessions_hash text;
  v_public_groups_hash text;

  v_period_1140 smallint;
  v_period_1350 smallint;
  v_period_1440 smallint;
  v_period_1530 smallint;
  v_period_1620 smallint;

  v_egemalmaz_teacher_id uuid;

  v_active_source_requirement_count integer;
  v_active_source_unit_count integer;
  v_public_source_target_count integer;
  v_overlay_target_count integer;
  v_no_source_card_count integer;
  v_target_count integer;
  v_target_period_count integer;
  v_pair_conflict_count integer;
  v_partition_load_mismatch_count integer;
  v_weekly_load_adjustments jsonb := '[]'::jsonb;

  v_clean_card_count integer;
  v_clean_placement_count integer;
  v_clean_move_count integer;
  v_missing_summary_count integer;
  v_contradiction_count integer;
  v_invalid_period_count integer;
  v_memberless_requirement_count integer;
  v_inactive_room_count integer;
  v_existing_public_notes_count integer;
  v_inconsistent_teacher_count integer;
  v_inconsistent_room_count integer;
  v_projected_group_count integer;
  v_unresolved_inherited_count integer;
  v_provisional_placement_count integer;

  v_runtime_reconciled boolean;
  v_audit_id uuid;
begin
  -- -----------------------------------------------------------------------
  -- TRUSTED START
  -- -----------------------------------------------------------------------

  select
    revision.requirement_set_id,
    revision.id
  into
    v_requirement_set_id,
    v_source_revision_id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
    and requirement_set.status = 'DRAFT'
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1
  for update of revision, requirement_set;

  if v_source_revision_id is null then
    raise exception
      'M25 requires the active 2026-2027 term-1 DRAFT';
  end if;

  -- Pin the restart to the exact test/recovery revision we intentionally retire.
  if v_source_revision_id <>
       '1ed832d1-99ee-4ba7-a97e-5795354c18e1'::uuid then
    raise exception
      'M25 unexpected active DRAFT revision: %',
      v_source_revision_id;
  end if;

  select count(*)
  into v_source_card_count
  from public.schedule_cards card
  where card.schedule_revision_id = v_source_revision_id;

  select count(*)
  into v_source_placement_count
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = v_source_revision_id;

  select count(*)
  into v_source_move_count
  from public.move_transactions move
  where move.schedule_revision_id = v_source_revision_id;

  if v_source_card_count <> 292
     or v_source_placement_count <> 256
     or v_source_move_count <> 372 then
    raise exception
      'M25 source test DRAFT baseline drift: cards %, placements %, moves %',
      v_source_card_count,
      v_source_placement_count,
      v_source_move_count;
  end if;

  if not coalesce(
    (
      public.management_publication_baseline_status('2026-2027')
      ->> 'healthy'
    )::boolean,
    false
  ) then
    raise exception
      'M25 public baseline is not healthy';
  end if;

  select count(*)
  into v_public_session_count
  from public.schedule_sessions session_row
  where session_row.academic_year = '2026-2027'
    and session_row.term = 1;

  select count(*)
  into v_public_group_count
  from public.session_groups group_row
  join public.schedule_sessions session_row
    on session_row.id = group_row.session_id
  where session_row.academic_year = '2026-2027'
    and session_row.term = 1;

  if v_public_session_count <> 517
     or v_public_group_count <> 609 then
    raise exception
      'M25 public source baseline drift: sessions %, groups %',
      v_public_session_count,
      v_public_group_count;
  end if;

  v_public_sessions_hash :=
    public.management_public_sessions_hash('2026-2027');

  v_public_groups_hash :=
    public.management_public_groups_hash('2026-2027');

  select control.runtime_adjustments_reconciled
  into v_runtime_reconciled
  from public.management_publication_controls control
  where control.academic_year = '2026-2027';

  if v_runtime_reconciled is distinct from true then
    raise exception
      'M25 runtime-adjustment reconciliation is not marked complete';
  end if;

  -- -----------------------------------------------------------------------
  -- PERIODS + RUNTIME RESOURCE IDS
  -- -----------------------------------------------------------------------

  select period.period_number
  into v_period_1140
  from generate_series(1, 12) period(period_number)
  cross join lateral public.management_publication_period_bounds(
    period.period_number::smallint
  ) bounds
  where bounds.start_time = '11:40'::time;

  select period.period_number
  into v_period_1350
  from generate_series(1, 12) period(period_number)
  cross join lateral public.management_publication_period_bounds(
    period.period_number::smallint
  ) bounds
  where bounds.start_time = '13:50'::time;

  select period.period_number
  into v_period_1440
  from generate_series(1, 12) period(period_number)
  cross join lateral public.management_publication_period_bounds(
    period.period_number::smallint
  ) bounds
  where bounds.start_time = '14:40'::time;

  select period.period_number
  into v_period_1530
  from generate_series(1, 12) period(period_number)
  cross join lateral public.management_publication_period_bounds(
    period.period_number::smallint
  ) bounds
  where bounds.start_time = '15:30'::time;

  select period.period_number
  into v_period_1620
  from generate_series(1, 12) period(period_number)
  cross join lateral public.management_publication_period_bounds(
    period.period_number::smallint
  ) bounds
  where bounds.start_time = '16:20'::time;

  if v_period_1140 is null
     or v_period_1350 is null
     or v_period_1440 is null
     or v_period_1530 is null
     or v_period_1620 is null then
    raise exception
      'M25 standard period mapping is incomplete';
  end if;

  select teacher.id
  into v_egemalmaz_teacher_id
  from public.teachers teacher
  where teacher.name = 'E. Gemalmaz'
  order by teacher.id
  limit 1;

  if v_egemalmaz_teacher_id is null then
    raise exception
      'M25 teacher E. Gemalmaz is missing';
  end if;

  -- -----------------------------------------------------------------------
  -- REBUILD THE CLEAN CARD GRAPH FROM THE EFFECTIVE STUDENT PROGRAM
  -- -----------------------------------------------------------------------
  -- The test DRAFT has 292 cards, but the public source evidence contains
  -- fewer real contiguous teaching blocks. Current cards are used only to
  -- decide which requirements are active; their old partition is not copied.

  drop table if exists pg_temp.m25_active_source_requirements;
  drop table if exists pg_temp.m25_source_units;
  drop table if exists pg_temp.m25_source_runs;
  drop table if exists pg_temp.m25_partitions;
  drop table if exists pg_temp.m25_targets;

  create temporary table m25_active_source_requirements
  on commit drop
  as
  select distinct card.requirement_id
  from public.schedule_cards card
  where card.schedule_revision_id = v_source_revision_id
    and exists (
      select 1
      from public.course_requirement_source_sessions evidence
      where evidence.requirement_id = card.requirement_id
    );

  select count(*)
  into v_active_source_requirement_count
  from m25_active_source_requirements;

  create temporary table m25_source_units
  on commit drop
  as
  select
    evidence.requirement_id,
    evidence.source_session_id,
    session_row.day_of_week,
    period_map.period_number::smallint as period_number,
    session_row.teacher_id,
    coalesce(
      selected_room.canonical_room_id,
      session_row.room_id
    ) as room_id,
    period_map.period_number is null as off_grid
  from public.course_requirement_source_sessions evidence
  join m25_active_source_requirements active_requirement
    on active_requirement.requirement_id = evidence.requirement_id
  left join public.schedule_sessions session_row
    on session_row.id = evidence.source_session_id
   and session_row.academic_year = '2026-2027'
   and session_row.term = 1
  left join public.rooms selected_room
    on selected_room.id = session_row.room_id
  left join lateral (
    select period.period_number
    from generate_series(1, 12) period(period_number)
    cross join lateral public.management_publication_period_bounds(
      period.period_number::smallint
    ) bounds
    where bounds.start_time = session_row.start_time
      and bounds.end_time = session_row.end_time
    limit 1
  ) period_map on true;

  if exists (
    select 1
    from m25_source_units source
    where source.off_grid
  ) then
    raise exception
      'M25 active public source contains off-grid sessions';
  end if;

  select count(*)
  into v_active_source_unit_count
  from m25_source_units;

  create temporary table m25_source_runs
  on commit drop
  as
  with ordered as (
    select
      source.*,
      lag(source.day_of_week) over source_order as previous_day,
      lag(source.period_number) over source_order as previous_period,
      lag(source.teacher_id) over source_order as previous_teacher,
      lag(source.room_id) over source_order as previous_room
    from m25_source_units source
    window source_order as (
      partition by source.requirement_id
      order by
        source.day_of_week,
        source.period_number,
        source.source_session_id
    )
  ),
  marked as (
    select
      ordered.*,
      case
        when ordered.previous_period is null then 1
        when ordered.previous_day is distinct from ordered.day_of_week then 1
        when ordered.previous_teacher is distinct from ordered.teacher_id then 1
        when ordered.previous_room is distinct from ordered.room_id then 1
        when ordered.previous_period = 5
         and ordered.period_number = 6 then 1
        when ordered.period_number <> ordered.previous_period + 1 then 1
        else 0
      end as starts_new_run
    from ordered
  ),
  numbered as (
    select
      marked.*,
      sum(marked.starts_new_run) over (
        partition by marked.requirement_id
        order by
          marked.day_of_week,
          marked.period_number,
          marked.source_session_id
        rows unbounded preceding
      )::integer as run_number
    from marked
  )
  select
    numbered.requirement_id,
    numbered.run_number,
    min(numbered.day_of_week)::smallint as day_of_week,
    min(numbered.period_number)::smallint as start_period,
    count(*)::smallint as duration_periods,
    (
      array_agg(
        numbered.teacher_id
        order by numbered.period_number, numbered.source_session_id
      )
    )[1] as teacher_id,
    (
      array_agg(
        numbered.room_id
        order by numbered.period_number, numbered.source_session_id
      )
    )[1] as room_id,
    jsonb_agg(
      numbered.source_session_id
      order by numbered.period_number, numbered.source_session_id
    ) as source_session_ids
  from numbered
  group by
    numbered.requirement_id,
    numbered.run_number;

  create temporary table m25_partitions
  on commit drop
  as
  select
    source_run.requirement_id,
    jsonb_agg(
      source_run.duration_periods
      order by
        source_run.day_of_week,
        source_run.start_period,
        source_run.run_number
    ) as partition_json,
    sum(source_run.duration_periods)::integer as source_period_count
  from m25_source_runs source_run
  group by source_run.requirement_id;

  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'requirementId', requirement.id,
          'subjectName', subject.name,
          'groupName', instructional_group.name,
          'weeklyLoadBefore', requirement.weekly_load,
          'weeklyLoadAfter', partition_row.source_period_count,
          'sourcePartition', partition_row.partition_json,
          'basis', 'EFFECTIVE_PUBLIC_SOURCE'
        )
        order by
          subject.name,
          instructional_group.name,
          requirement.id
      ) filter (
        where partition_row.source_period_count <> requirement.weekly_load
      ),
      '[]'::jsonb
    )
  into
    v_partition_load_mismatch_count,
    v_weekly_load_adjustments
  from m25_partitions partition_row
  join public.course_requirements requirement
    on requirement.id = partition_row.requirement_id
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  where partition_row.source_period_count <> requirement.weekly_load;

  -- The effective student schedule is the authoritative baseline for M25.
  -- If an active requirement's legacy weekly_load disagrees with the exact
  -- public source evidence, align the management load to that evidence and
  -- retain a complete audit record above. Curriculum-reference checks remain
  -- advisory and can still report any official/local composition difference.
  update public.course_requirements requirement
  set weekly_load = partition_row.source_period_count::smallint
  from m25_partitions partition_row
  where requirement.id = partition_row.requirement_id
    and requirement.weekly_load is distinct from
      partition_row.source_period_count::smallint;

  create temporary table m25_targets (
    target_card_id uuid primary key,
    requirement_id uuid not null,
    block_index smallint not null,
    duration_periods smallint not null,
    day_of_week smallint not null,
    start_period smallint not null,
    teacher_id uuid null,
    room_id uuid null,
    publication_end_time_override time null,
    source_kind text not null,
    source_session_ids jsonb not null default '[]'::jsonb,
    unique (requirement_id, block_index)
  ) on commit drop;

  -- One clean card per real contiguous public source run.
  insert into m25_targets (
    target_card_id,
    requirement_id,
    block_index,
    duration_periods,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    publication_end_time_override,
    source_kind,
    source_session_ids
  )
  select
    gen_random_uuid(),
    source_run.requirement_id,
    row_number() over (
      partition by source_run.requirement_id
      order by
        source_run.day_of_week,
        source_run.start_period,
        source_run.run_number
    )::smallint,
    source_run.duration_periods,
    source_run.day_of_week,
    source_run.start_period,
    source_run.teacher_id,
    source_run.room_id,
    null::time,
    'PUBLIC_BASELINE',
    source_run.source_session_ids
  from m25_source_runs source_run;

  get diagnostics v_public_source_target_count = row_count;

  -- Every active current card with no source evidence must be one of the five
  -- explicitly modeled effective runtime overlays.
  select count(*)
  into v_no_source_card_count
  from public.schedule_cards card
  where card.schedule_revision_id = v_source_revision_id
    and not exists (
      select 1
      from public.course_requirement_source_sessions evidence
      where evidence.requirement_id = card.requirement_id
    );

  if v_no_source_card_count <> 5 then
    raise exception
      'M25 expected exactly 5 active no-source runtime cards, found %',
      v_no_source_card_count;
  end if;

  -- 5A Monday V. Kondisyon.
  insert into m25_targets (
    target_card_id,
    requirement_id,
    block_index,
    duration_periods,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    publication_end_time_override,
    source_kind,
    source_session_ids
  )
  select
    gen_random_uuid(),
    card.requirement_id,
    card.block_index,
    card.duration_periods,
    1,
    v_period_1140,
    null,
    null,
    card.publication_end_time_override,
    'RUNTIME_ADJUSTMENT',
    '[]'::jsonb
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  where card.schedule_revision_id = v_source_revision_id
    and subject.name = 'V. Kondisyon'
    and instructional_group.name = '5A BALLET'
    and not exists (
      select 1
      from public.course_requirement_source_sessions evidence
      where evidence.requirement_id = requirement.id
    );

  -- 5A Wednesday Piyano groups.
  insert into m25_targets (
    target_card_id,
    requirement_id,
    block_index,
    duration_periods,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    publication_end_time_override,
    source_kind,
    source_session_ids
  )
  select
    gen_random_uuid(),
    card.requirement_id,
    card.block_index,
    card.duration_periods,
    3,
    case instructional_group.name
      when '5A BALLET / 1. Grup' then v_period_1530
      when '5A BALLET / 2. Grup' then v_period_1620
    end,
    null,
    null,
    card.publication_end_time_override,
    'RUNTIME_ADJUSTMENT',
    '[]'::jsonb
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  where card.schedule_revision_id = v_source_revision_id
    and subject.name = 'Piyano'
    and instructional_group.name in (
      '5A BALLET / 1. Grup',
      '5A BALLET / 2. Grup'
    );

  -- 5A Friday K. Bale supplemental blocks.
  insert into m25_targets (
    target_card_id,
    requirement_id,
    block_index,
    duration_periods,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    publication_end_time_override,
    source_kind,
    source_session_ids
  )
  select
    gen_random_uuid(),
    card.requirement_id,
    card.block_index,
    card.duration_periods,
    5,
    case card.block_index
      when 1 then v_period_1350
      when 2 then v_period_1440
    end,
    v_egemalmaz_teacher_id,
    null,
    card.publication_end_time_override,
    'RUNTIME_ADJUSTMENT',
    '[]'::jsonb
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  where card.schedule_revision_id = v_source_revision_id
    and subject.name = 'K. Bale'
    and instructional_group.name =
      'STANDARD • 5A BALLET • Cuma ek dersi'
    and card.block_index in (1, 2);

  select count(*)
  into v_overlay_target_count
  from m25_targets target
  where target.source_kind = 'RUNTIME_ADJUSTMENT';

  if v_overlay_target_count <> 5 then
    raise exception
      'M25 expected 5 runtime-adjustment targets, found %',
      v_overlay_target_count;
  end if;

  select
    count(*),
    coalesce(sum(target.duration_periods), 0)
  into
    v_target_count,
    v_target_period_count
  from m25_targets target;

  if v_target_count <>
       v_public_source_target_count + v_overlay_target_count then
    raise exception
      'M25 target accounting mismatch: total %, public %, overlay %',
      v_target_count,
      v_public_source_target_count,
      v_overlay_target_count;
  end if;

  if exists (
    select 1
    from m25_targets target
    where target.day_of_week not between 1 and 5
       or target.start_period < 1
       or target.start_period + target.duration_periods - 1 > 12
       or (
         target.start_period <= 5
         and target.start_period + target.duration_periods - 1 >= 6
       )
  ) then
    raise exception
      'M25 target plan contains invalid period/lunch crossing';
  end if;

  -- Complete effective target set must be internally conflict-free.
  select count(*)
  into v_pair_conflict_count
  from m25_targets left_target
  join m25_targets right_target
    on right_target.target_card_id > left_target.target_card_id
   and right_target.day_of_week = left_target.day_of_week
   and right_target.start_period
      <= left_target.start_period + left_target.duration_periods - 1
   and left_target.start_period
      <= right_target.start_period + right_target.duration_periods - 1
  join public.course_requirements left_requirement
    on left_requirement.id = left_target.requirement_id
  join public.course_requirements right_requirement
    on right_requirement.id = right_target.requirement_id
  where
    (
      left_target.teacher_id is not null
      and left_target.teacher_id = right_target.teacher_id
    )
    or (
      left_target.room_id is not null
      and left_target.room_id = right_target.room_id
    )
    or public.management_instructional_groups_conflict(
      left_requirement.instructional_group_id,
      right_requirement.instructional_group_id
    );

  if v_pair_conflict_count <> 0 then
    raise exception
      'M25 effective student schedule target set has % pairwise conflicts',
      v_pair_conflict_count;
  end if;

  -- Bring requirement partition metadata in line with the actual source runs.
  -- The archived test revision is intentionally no longer authoritative.
  update public.course_requirements requirement
  set
    preferred_partition = partition_row.partition_json,
    allowed_partitions = (
      select
        case
          when exists (
            select 1
            from jsonb_array_elements(
              case
                when jsonb_typeof(requirement.allowed_partitions) = 'array'
                  then requirement.allowed_partitions
                else '[]'::jsonb
              end
            ) alternative
            where alternative = partition_row.partition_json
          )
            then case
              when jsonb_typeof(requirement.allowed_partitions) = 'array'
                then requirement.allowed_partitions
              else '[]'::jsonb
            end
          else
            (
              case
                when jsonb_typeof(requirement.allowed_partitions) = 'array'
                  then requirement.allowed_partitions
                else '[]'::jsonb
              end
            )
            || jsonb_build_array(partition_row.partition_json)
        end
    )
  from m25_partitions partition_row
  where requirement.id = partition_row.requirement_id;

  -- -----------------------------------------------------------------------
  -- CREATE THE CLEAN REVISION
  -- -----------------------------------------------------------------------

  select coalesce(max(revision.version_number), 0) + 1
  into v_next_revision_version
  from public.schedule_revisions revision
  where revision.requirement_set_id = v_requirement_set_id;

  update public.schedule_revisions
  set
    status = 'ARCHIVED',
    validation_summary =
      coalesce(validation_summary, '{}'::jsonb)
      || jsonb_build_object(
        'm25_retired_as_test_revision', true,
        'm25_replacement_revision_id', v_clean_revision_id,
        'm25_retired_at', now()
      )
  where id = v_source_revision_id;

  insert into public.schedule_revisions (
    id,
    requirement_set_id,
    version_number,
    status,
    base_revision_id,
    validation_summary
  )
  values (
    v_clean_revision_id,
    v_requirement_set_id,
    v_next_revision_version,
    'DRAFT',
    v_source_revision_id,
    jsonb_build_object(
      'phase', 'M25',
      'engine_version', 'M25-v2.1',
      'bootstrap_source', 'EFFECTIVE_STUDENT_SCHEDULE',
      'source_test_card_count', v_source_card_count,
      'clean_card_count', v_target_count,
      'public_source_block_count', v_public_source_target_count,
      'runtime_adjustment_card_count', v_overlay_target_count,
      'public_baseline', jsonb_build_object(
        'academicYear', '2026-2027',
        'term', 1,
        'sessionCount', v_public_session_count,
        'groupCount', v_public_group_count,
        'sessionsHash', v_public_sessions_hash,
        'groupsHash', v_public_groups_hash
      ),
      'runtime_adjustments_materialized', jsonb_build_array(
        'GRADE5_B_UYGULAMA_INACTIVE',
        '5A_V_KONDISYON_11_40',
        '5A_PIYANO_GROUPS',
        '5A_FRIDAY_K_BALE_E_GEMALMAZ'
      ),
      'move_history', 'EMPTY_BASELINE',
      'test_placements_copied', false,
      'test_card_partition_copied', false,
      'candidate_domain', 'REBUILD_PENDING'
    )
  );

  insert into public.schedule_cards (
    id,
    schedule_revision_id,
    requirement_id,
    block_index,
    duration_periods,
    locked,
    publication_end_time_override
  )
  select
    target.target_card_id,
    v_clean_revision_id,
    target.requirement_id,
    target.block_index,
    target.duration_periods,
    false,
    target.publication_end_time_override
  from m25_targets target
  order by
    target.requirement_id,
    target.block_index;

  insert into public.placements (
    card_id,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    move_transaction_id
  )
  select
    target.target_card_id,
    target.day_of_week,
    target.start_period,
    target.teacher_id,
    target.room_id,
    null
  from m25_targets target
  order by
    target.day_of_week,
    target.start_period,
    target.requirement_id,
    target.block_index;

  if exists (
    select 1
    from public.move_transactions move
    where move.schedule_revision_id = v_clean_revision_id
  ) then
    raise exception
      'M25 clean revision unexpectedly created move history';
  end if;

  perform public.refresh_management_candidate_domain(
    v_clean_revision_id
  );

  -- -----------------------------------------------------------------------
  -- PUBLISH-READINESS INVARIANTS
  -- -----------------------------------------------------------------------

  select count(*)
  into v_clean_card_count
  from public.schedule_cards card
  where card.schedule_revision_id = v_clean_revision_id;

  select count(*)
  into v_clean_placement_count
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = v_clean_revision_id;

  select count(*)
  into v_clean_move_count
  from public.move_transactions move
  where move.schedule_revision_id = v_clean_revision_id;

  if v_clean_card_count <> v_target_count
     or v_clean_placement_count <> v_target_count
     or v_clean_move_count <> 0 then
    raise exception
      'M25 clean revision cardinality mismatch: planned %, cards %, placements %, moves %',
      v_target_count,
      v_clean_card_count,
      v_clean_placement_count,
      v_clean_move_count;
  end if;

  select count(*)
  into v_missing_summary_count
  from public.schedule_cards card
  left join public.schedule_card_domain_summaries summary
    on summary.card_id = card.id
  where card.schedule_revision_id = v_clean_revision_id
    and summary.card_id is null;

  select count(*)
  into v_contradiction_count
  from public.schedule_cards card
  join public.schedule_card_domain_summaries summary
    on summary.card_id = card.id
  where card.schedule_revision_id = v_clean_revision_id
    and summary.is_contradiction;

  select count(*)
  into v_invalid_period_count
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id = v_clean_revision_id
    and (
      placement.start_period < 1
      or placement.start_period + card.duration_periods - 1 > 12
    );

  select count(distinct requirement.id)
  into v_memberless_requirement_count
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.schedule_revision_id = v_clean_revision_id
    and not exists (
      select 1
      from public.management_requirement_public_members(
        requirement.id
      )
    );

  select count(*)
  into v_inactive_room_count
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  join public.rooms selected_room
    on selected_room.id = placement.room_id
  join public.rooms canonical_room
    on canonical_room.id = coalesce(
      selected_room.canonical_room_id,
      selected_room.id
    )
  where card.schedule_revision_id = v_clean_revision_id
    and canonical_room.operational_status <> 'ACTIVE';

  -- M19.6 refuses publication while existing public notes would be dropped,
  -- because notes are not represented in the management projection.
  select count(*)
  into v_existing_public_notes_count
  from public.schedule_sessions session_row
  where session_row.academic_year = '2026-2027'
    and session_row.term = 1
    and session_row.notes is not null
    and length(btrim(session_row.notes)) > 0;

  select
    count(*) filter (
      where placement.teacher_resolution_status = 'INCONSISTENT'
    ),
    count(*) filter (
      where placement.room_resolution_status = 'INCONSISTENT'
    ),
    count(*) filter (
      where placement.teacher_resolution_status <> 'RESOLVED'
         or placement.room_resolution_status <> 'RESOLVED'
         or cardinality(placement.resource_warning_codes) > 0
    )
  into
    v_inconsistent_teacher_count,
    v_inconsistent_room_count,
    v_provisional_placement_count
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = v_clean_revision_id;

  -- With zero move history, all unresolved candidate-domain uncertainty is
  -- inherited baseline uncertainty, never user-touched uncertainty.
  select count(*)
  into v_unresolved_inherited_count
  from public.schedule_cards card
  join public.schedule_card_domain_summaries summary
    on summary.card_id = card.id
  where card.schedule_revision_id = v_clean_revision_id
    and summary.unresolved_count > 0
    and not summary.is_contradiction;

  select coalesce(
    sum(
      card.duration_periods
      * (
        select count(*)
        from public.management_requirement_public_members(
          card.requirement_id
        )
      )
    ),
    0
  )::integer
  into v_projected_group_count
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id = v_clean_revision_id;

  if v_missing_summary_count <> 0
     or v_contradiction_count <> 0
     or v_invalid_period_count <> 0
     or v_memberless_requirement_count <> 0
     or v_inactive_room_count <> 0
     or v_existing_public_notes_count <> 0
     or v_inconsistent_teacher_count <> 0
     or v_inconsistent_room_count <> 0 then
    raise exception
      'M25 publish-readiness blocker: missing summaries %, contradictions %, invalid periods %, memberless %, inactive rooms %, public notes %, inconsistent teachers %, inconsistent rooms %',
      v_missing_summary_count,
      v_contradiction_count,
      v_invalid_period_count,
      v_memberless_requirement_count,
      v_inactive_room_count,
      v_existing_public_notes_count,
      v_inconsistent_teacher_count,
      v_inconsistent_room_count;
  end if;

  if not coalesce(
    (
      public.management_publication_baseline_status('2026-2027')
      ->> 'healthy'
    )::boolean,
    false
  ) then
    raise exception
      'M25 public baseline drifted during clean bootstrap';
  end if;

  if (
    select count(*)
    from public.schedule_sessions session_row
    where session_row.academic_year = '2026-2027'
      and session_row.term = 1
  ) <> 517 then
    raise exception
      'M25 modified public sessions unexpectedly';
  end if;

  if (
    select count(*)
    from public.session_groups group_row
    join public.schedule_sessions session_row
      on session_row.id = group_row.session_id
    where session_row.academic_year = '2026-2027'
      and session_row.term = 1
  ) <> 609 then
    raise exception
      'M25 modified public groups unexpectedly';
  end if;

  if public.management_public_sessions_hash('2026-2027')
       is distinct from v_public_sessions_hash
     or public.management_public_groups_hash('2026-2027')
       is distinct from v_public_groups_hash then
    raise exception
      'M25 changed public projection hashes unexpectedly';
  end if;

  update public.schedule_revisions
  set validation_summary =
    coalesce(validation_summary, '{}'::jsonb)
    || jsonb_build_object(
      'm25_clean_effective_bootstrap', 'PASS',
      'engine_version', 'M25-v2.1',
      'source_test_card_count', v_source_card_count,
      'clean_card_count', v_clean_card_count,
      'placement_count', v_clean_placement_count,
      'move_transaction_count', v_clean_move_count,
      'projected_session_count', v_target_period_count,
      'projected_group_count', v_projected_group_count,
      'active_source_requirement_count',
        v_active_source_requirement_count,
      'active_source_unit_count',
        v_active_source_unit_count,
      'weekly_load_adjustment_count',
        v_partition_load_mismatch_count,
      'weekly_load_adjustments',
        v_weekly_load_adjustments,
      'public_source_target_count',
        v_public_source_target_count,
      'runtime_adjustment_target_count', v_overlay_target_count,
      'unresolved_inherited_count', v_unresolved_inherited_count,
      'provisional_placement_count', v_provisional_placement_count,
      'official_publication_preview_required', true
    )
  where id = v_clean_revision_id;

  insert into public.management_clean_effective_bootstrap_runs (
    requirement_set_id,
    source_revision_id,
    clean_revision_id,
    engine_version,
    source_card_count,
    clean_card_count,
    target_placement_count,
    target_period_count,
    public_source_target_count,
    runtime_adjustment_target_count,
    active_source_requirement_count,
    active_source_unit_count,
    weekly_load_adjustment_count,
    weekly_load_adjustments,
    projected_group_row_count,
    source_public_session_count,
    source_public_group_count,
    source_public_sessions_hash,
    source_public_groups_hash,
    readiness
  )
  values (
    v_requirement_set_id,
    v_source_revision_id,
    v_clean_revision_id,
    'M25-v2.1',
    v_source_card_count,
    v_clean_card_count,
    v_clean_placement_count,
    v_target_period_count,
    v_public_source_target_count,
    v_overlay_target_count,
    v_active_source_requirement_count,
    v_active_source_unit_count,
    v_partition_load_mismatch_count,
    v_weekly_load_adjustments,
    v_projected_group_count,
    v_public_session_count,
    v_public_group_count,
    v_public_sessions_hash,
    v_public_groups_hash,
    jsonb_build_object(
      'allCardsPlaced', v_clean_placement_count = v_clean_card_count,
      'moveHistoryEmpty', v_clean_move_count = 0,
      'testCardPartitionCopied', false,
      'weeklyLoadAlignedToEffectivePublicSource',
        v_partition_load_mismatch_count,
      'weeklyLoadAdjustments',
        v_weekly_load_adjustments,
      'missingDomainSummaryCount', v_missing_summary_count,
      'contradictionCount', v_contradiction_count,
      'invalidPeriodCount', v_invalid_period_count,
      'memberlessRequirementCount', v_memberless_requirement_count,
      'inactiveRoomPlacementCount', v_inactive_room_count,
      'existingPublicNotesCount', v_existing_public_notes_count,
      'notesPreservationReady', v_existing_public_notes_count = 0,
      'inconsistentTeacherPlacementCount',
        v_inconsistent_teacher_count,
      'inconsistentRoomPlacementCount',
        v_inconsistent_room_count,
      'unresolvedInheritedCount',
        v_unresolved_inherited_count,
      'provisionalPlacementCount',
        v_provisional_placement_count,
      'runtimeAdjustmentsReconciled',
        v_runtime_reconciled,
      'publicBaselineHealthy', true,
      'officialPublicationPreviewRequired', true
    )
  )
  returning id into v_audit_id;

  update public.schedule_revisions
  set validation_summary =
    validation_summary
    || jsonb_build_object(
      'm25_bootstrap_audit_id', v_audit_id
    )
  where id = v_clean_revision_id;
end
$$;


-- The migration creates a clean DRAFT but never unlocks publication or template
-- mutation endpoints.
do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M25 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M25 must not unlock term template apply';
  end if;
end
$$;

commit;
