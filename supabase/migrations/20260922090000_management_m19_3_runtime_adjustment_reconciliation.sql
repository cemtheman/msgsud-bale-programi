-- Management / M19.3
-- Runtime adjustment reconciliation into the management draft.
--
-- Goal:
--   Move the effective 5A/5B timetable rules currently implemented by
--   data/scheduleAdjustments.ts into the management domain without touching the
--   current public schedule_sessions/session_groups projection.
--
-- Reconciled rules:
--   1. Grade-5 B. Uygulama remains inactive in management.
--   2. 5A V. Kondisyon becomes a 5A-only Monday 11:40 STANDARD lesson while
--      the historical SHARED 5A+6A requirement is narrowed to 6A and retains
--      the raw 6A Monday 16:20 source placement.
--   3. 5A Piyano 1. Grup / 2. Grup are introduced on Wednesday at
--      15:30-16:15 and 16:20-17:00.
--   4. 5A Friday K. Bale supplemental lessons are introduced at 13:50 and
--      14:40 with E. Gemalmaz.
--
-- Public projection remains untouched. The M19.2 runtime-adjustment safety
-- blocker is cleared only after all management-side reconciliation invariants
-- pass in this same transaction.

begin;

-- -------------------------------------------------------------------------
-- PUBLICATION-TIME END OVERRIDE
-- -------------------------------------------------------------------------
-- The management grid is period-based, but the current effective 5A Piyano
-- Group 1 lesson ends at 16:15 rather than the standard 16:10 period boundary.
-- Keep scheduling occupancy on period 9 while preserving the exact public end
-- time for publication.

alter table public.schedule_cards
  add column if not exists publication_end_time_override time null;

alter table public.schedule_cards
  drop constraint if exists schedule_cards_publication_end_override_single_period;

alter table public.schedule_cards
  add constraint schedule_cards_publication_end_override_single_period
  check (
    publication_end_time_override is null
    or duration_periods = 1
  );

comment on column public.schedule_cards.publication_end_time_override is
  'Optional exact public end time for a one-period card when the effective timetable differs from the standard management period boundary.';


-- -------------------------------------------------------------------------
-- FIX PUBLIC AUDIENCE PROJECTION SEMANTICS
-- -------------------------------------------------------------------------
-- A concrete SECTION/BALLET/MUSIC/SUBGROUP requirement publishes exactly its
-- own audience row. Only a COMPOSITE wrapper expands through CONTAINS, and it
-- stops at the first non-composite member. This prevents a full 5A BALLET
-- requirement from being multiplied into every subgroup after M19.3 adds
-- Piyano subgroups.

create or replace function public.management_requirement_public_members(
  p_requirement_id uuid
)
returns table (
  class_group_id uuid,
  target text,
  subgroup text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with recursive
  root as (
    select
      instructional_group.id,
      instructional_group.group_type,
      instructional_group.class_group_id,
      instructional_group.audience_target,
      instructional_group.subgroup_label
    from public.course_requirements requirement
    join public.instructional_groups instructional_group
      on instructional_group.id = requirement.instructional_group_id
    where requirement.id = p_requirement_id
  ),
  composite_tree as (
    select
      root.id as group_id,
      root.group_type,
      array[root.id]::uuid[] as path
    from root
    where root.group_type = 'COMPOSITE'

    union all

    select
      child.id,
      child.group_type,
      tree.path || child.id
    from composite_tree tree
    join public.instructional_group_relations relation
      on relation.left_group_id = tree.group_id
     and relation.relation = 'CONTAINS'
    join public.instructional_groups child
      on child.id = relation.right_group_id
    where tree.group_type = 'COMPOSITE'
      and not child.id = any(tree.path)
  ),
  effective_groups as (
    -- Non-composite roots publish themselves only.
    select
      root.id as group_id
    from root
    where root.group_type <> 'COMPOSITE'

    union

    -- Composite roots publish the first concrete members reached.
    select
      tree.group_id
    from composite_tree tree
    where tree.group_type <> 'COMPOSITE'
  )
  select distinct
    instructional_group.class_group_id,
    instructional_group.audience_target::text,
    instructional_group.subgroup_label
  from effective_groups effective
  join public.instructional_groups instructional_group
    on instructional_group.id = effective.group_id
  where instructional_group.class_group_id is not null
    and instructional_group.audience_target::text
      in ('SECTION', 'BALLET', 'MUSIC')
$$;

revoke all
  on function public.management_requirement_public_members(uuid)
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- EFFECTIVE SCHEDULE RECONCILIATION
-- -------------------------------------------------------------------------

do $$
declare
  v_revision_id uuid;
  v_requirement_set_id uuid;

  v_5a_class_id uuid;
  v_5b_class_id uuid;
  v_6a_class_id uuid;

  v_5a_ballet_group_id uuid;
  v_6a_ballet_group_id uuid;

  v_vcond_subject_id uuid;
  v_piano_subject_id uuid;
  v_kbale_subject_id uuid;
  v_buyg_subject_id uuid;
  v_egemalmaz_teacher_id uuid;

  v_vcond_shared_requirement_id uuid;
  v_vcond_shared_card_id uuid;
  v_vcond_source_session_id uuid;
  v_vcond_source_teacher_id uuid;
  v_vcond_source_room_id uuid;
  v_vcond_source_start time;
  v_vcond_source_end time;
  v_vcond_source_day smallint;

  v_vcond_5a_requirement_id uuid;
  v_vcond_5a_card_id uuid;

  v_piano_group_1_id uuid;
  v_piano_group_2_id uuid;
  v_piano_requirement_1_id uuid;
  v_piano_requirement_2_id uuid;
  v_piano_card_1_id uuid;
  v_piano_card_2_id uuid;

  v_kbale_supplement_group_id uuid;
  v_kbale_requirement_id uuid;
  v_kbale_card_1_id uuid;
  v_kbale_card_2_id uuid;

  v_count integer;
  v_period_1120 smallint;
  v_period_1350 smallint;
  v_period_1440 smallint;
  v_period_1530 smallint;
  v_period_1620 smallint;

  v_public_sessions integer;
  v_public_groups integer;
begin
  -- Lock the one active draft revision for the entire reconciliation.
  select
    revision.id,
    revision.requirement_set_id
  into
    v_revision_id,
    v_requirement_set_id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.status = 'DRAFT'
    and requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
  order by revision.version_number desc
  limit 1
  for update of revision;

  if v_revision_id is null then
    raise exception 'M19.3 requires the 2026-2027 term-1 DRAFT revision';
  end if;

  if not coalesce(
    (
      public.management_publication_baseline_status('2026-2027')
      ->> 'healthy'
    )::boolean,
    false
  ) then
    raise exception 'M19.3 public baseline drift detected before reconciliation';
  end if;

  -- Resolve the standard management periods used by the effective overlays.
  select period_number
  into v_period_1120
  from generate_series(1, 12) period_number
  cross join lateral public.management_publication_period_bounds(
    period_number::smallint
  ) bounds
  where bounds.start_time = '11:40'::time;

  select period_number
  into v_period_1350
  from generate_series(1, 12) period_number
  cross join lateral public.management_publication_period_bounds(
    period_number::smallint
  ) bounds
  where bounds.start_time = '13:50'::time;

  select period_number
  into v_period_1440
  from generate_series(1, 12) period_number
  cross join lateral public.management_publication_period_bounds(
    period_number::smallint
  ) bounds
  where bounds.start_time = '14:40'::time;

  select period_number
  into v_period_1530
  from generate_series(1, 12) period_number
  cross join lateral public.management_publication_period_bounds(
    period_number::smallint
  ) bounds
  where bounds.start_time = '15:30'::time;

  select period_number
  into v_period_1620
  from generate_series(1, 12) period_number
  cross join lateral public.management_publication_period_bounds(
    period_number::smallint
  ) bounds
  where bounds.start_time = '16:20'::time;

  if v_period_1120 is null
     or v_period_1350 is null
     or v_period_1440 is null
     or v_period_1530 is null
     or v_period_1620 is null then
    raise exception 'M19.3 required management period mapping is incomplete';
  end if;

  -- Resolve class groups.
  select id into v_5a_class_id
  from public.class_groups
  where academic_year = '2026-2027'
    and grade = 5
    and section = 'A';

  select id into v_5b_class_id
  from public.class_groups
  where academic_year = '2026-2027'
    and grade = 5
    and section = 'B';

  select id into v_6a_class_id
  from public.class_groups
  where academic_year = '2026-2027'
    and grade = 6
    and section = 'A';

  if v_5a_class_id is null
     or v_5b_class_id is null
     or v_6a_class_id is null then
    raise exception 'M19.3 required 5A/5B/6A class groups are missing';
  end if;

  -- Resolve canonical ballet participant groups.
  select id into v_5a_ballet_group_id
  from public.instructional_groups
  where requirement_set_id = v_requirement_set_id
    and class_group_id = v_5a_class_id
    and group_type = 'BALLET'
    and audience_target = 'BALLET'
    and subgroup_label is null
  order by name
  limit 1;

  select id into v_6a_ballet_group_id
  from public.instructional_groups
  where requirement_set_id = v_requirement_set_id
    and class_group_id = v_6a_class_id
    and group_type = 'BALLET'
    and audience_target = 'BALLET'
    and subgroup_label is null
  order by name
  limit 1;

  if v_5a_ballet_group_id is null
     or v_6a_ballet_group_id is null then
    raise exception 'M19.3 required 5A/6A BALLET groups are missing';
  end if;

  -- Resolve subjects / teacher.
  select id into v_vcond_subject_id
  from public.subjects
  where name = 'V. Kondisyon'
  limit 1;

  select id into v_piano_subject_id
  from public.subjects
  where name = 'Piyano'
  limit 1;

  select id into v_kbale_subject_id
  from public.subjects
  where name = 'K. Bale'
  limit 1;

  select id into v_buyg_subject_id
  from public.subjects
  where name = 'B. Uygulama'
  limit 1;

  select id into v_egemalmaz_teacher_id
  from public.teachers
  where name = 'E. Gemalmaz'
  limit 1;

  if v_vcond_subject_id is null
     or v_piano_subject_id is null
     or v_kbale_subject_id is null
     or v_buyg_subject_id is null
     or v_egemalmaz_teacher_id is null then
    raise exception 'M19.3 required subject/teacher reference data is missing';
  end if;


  -- -----------------------------------------------------------------------
  -- 1. GRADE-5 B. UYGULAMA MUST ALREADY BE INACTIVE
  -- -----------------------------------------------------------------------

  if exists (
    select 1
    from public.course_requirements requirement
    where requirement.requirement_set_id = v_requirement_set_id
      and requirement.subject_id = v_buyg_subject_id
      and exists (
        select 1
        from public.management_requirement_public_members(requirement.id) member
        where member.class_group_id in (v_5a_class_id, v_5b_class_id)
      )
      and (
        requirement.term_status = 'ACTIVE'
        or exists (
          select 1
          from public.schedule_cards card
          where card.schedule_revision_id = v_revision_id
            and card.requirement_id = requirement.id
        )
      )
  ) then
    raise exception
      'M19.3 grade-5 B. Uygulama is not fully inactive in management';
  end if;


  -- -----------------------------------------------------------------------
  -- 2. SPLIT EFFECTIVE 5A / 6A V. KONDİSYON
  -- -----------------------------------------------------------------------

  select requirement.id
  into v_vcond_shared_requirement_id
  from public.course_requirements requirement
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  where requirement.requirement_set_id = v_requirement_set_id
    and requirement.subject_id = v_vcond_subject_id
    and instructional_group.name = 'SHARED • 5A BALLET + 6A BALLET'
  limit 1;

  if v_vcond_shared_requirement_id is null then
    raise exception
      'M19.3 expected SHARED • 5A BALLET + 6A BALLET V. Kondisyon requirement';
  end if;

  if exists (
    select 1
    from public.course_requirements requirement
    where requirement.requirement_set_id = v_requirement_set_id
      and requirement.subject_id = v_vcond_subject_id
      and requirement.instructional_group_id = v_6a_ballet_group_id
      and requirement.id <> v_vcond_shared_requirement_id
  ) then
    raise exception
      'M19.3 cannot narrow V. Kondisyon: a separate 6A requirement already exists';
  end if;

  select count(*), min(card.id)
  into v_count, v_vcond_shared_card_id
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = v_vcond_shared_requirement_id;

  if v_count <> 1 then
    raise exception
      'M19.3 expected one shared V. Kondisyon card, found %',
      v_count;
  end if;

  if exists (
    select 1
    from public.placements placement
    where placement.card_id = v_vcond_shared_card_id
  ) then
    raise exception
      'M19.3 expected shared V. Kondisyon card to be unplaced';
  end if;

  select count(*), min(evidence.source_session_id)
  into v_count, v_vcond_source_session_id
  from public.course_requirement_source_sessions evidence
  where evidence.requirement_id = v_vcond_shared_requirement_id;

  if v_count <> 1 then
    raise exception
      'M19.3 expected one V. Kondisyon source session, found %',
      v_count;
  end if;

  select
    session.day_of_week,
    session.start_time,
    session.end_time,
    session.teacher_id,
    coalesce(room.canonical_room_id, session.room_id)
  into
    v_vcond_source_day,
    v_vcond_source_start,
    v_vcond_source_end,
    v_vcond_source_teacher_id,
    v_vcond_source_room_id
  from public.schedule_sessions session
  left join public.rooms room
    on room.id = session.room_id
  where session.id = v_vcond_source_session_id
    and session.academic_year = '2026-2027';

  if v_vcond_source_day <> 1
     or v_vcond_source_start <> '16:20'::time
     or v_vcond_source_end <> '17:00'::time then
    raise exception
      'M19.3 V. Kondisyon source session no longer matches Monday 16:20-17:00';
  end if;

  -- Existing historical shared requirement becomes the effective 6A-only row.
  update public.course_requirements
  set
    instructional_group_id = v_6a_ballet_group_id,
    weekly_load = 1,
    preferred_partition = '[1]'::jsonb,
    allowed_partitions = '[[1]]'::jsonb,
    term_status = 'ACTIVE'
  where id = v_vcond_shared_requirement_id;

  update public.schedule_cards
  set
    block_index = 1,
    duration_periods = 1,
    publication_end_time_override = null
  where id = v_vcond_shared_card_id;

  insert into public.placements (
    card_id,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    move_transaction_id
  )
  values (
    v_vcond_shared_card_id,
    v_vcond_source_day,
    v_period_1620,
    v_vcond_source_teacher_id,
    v_vcond_source_room_id,
    null
  );

  -- Effective 5A-only runtime overlay becomes its own STANDARD requirement.
  insert into public.course_requirements (
    requirement_set_id,
    subject_id,
    instructional_group_id,
    weekly_load,
    preferred_partition,
    allowed_partitions,
    min_distinct_days,
    max_blocks_per_day,
    max_consecutive_periods,
    course_character,
    term_status,
    knowledge_status,
    teacher_mode,
    resource_mode,
    required_capability,
    delivery_mode
  )
  values (
    v_requirement_set_id,
    v_vcond_subject_id,
    v_5a_ballet_group_id,
    1,
    '[1]'::jsonb,
    '[[1]]'::jsonb,
    null,
    null,
    null,
    'TECHNIQUE',
    'ACTIVE',
    'CONFIRMED',
    'UNKNOWN',
    'UNKNOWN',
    null,
    'STANDARD'
  )
  returning id into v_vcond_5a_requirement_id;

  insert into public.schedule_cards (
    schedule_revision_id,
    requirement_id,
    block_index,
    duration_periods,
    locked,
    publication_end_time_override
  )
  values (
    v_revision_id,
    v_vcond_5a_requirement_id,
    1,
    1,
    false,
    null
  )
  returning id into v_vcond_5a_card_id;

  insert into public.placements (
    card_id,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    move_transaction_id
  )
  values (
    v_vcond_5a_card_id,
    1,
    v_period_1120,
    null,
    null,
    null
  );


  -- -----------------------------------------------------------------------
  -- 3. 5A WEDNESDAY PIYANO GROUPS
  -- -----------------------------------------------------------------------

  insert into public.instructional_groups (
    requirement_set_id,
    class_group_id,
    name,
    group_type,
    term_status,
    knowledge_status,
    audience_target,
    subgroup_label
  )
  values
    (
      v_requirement_set_id,
      v_5a_class_id,
      '5A BALLET / 1. Grup',
      'SUBGROUP',
      'ACTIVE',
      'CONFIRMED',
      'BALLET',
      '1. Grup'
    ),
    (
      v_requirement_set_id,
      v_5a_class_id,
      '5A BALLET / 2. Grup',
      'SUBGROUP',
      'ACTIVE',
      'CONFIRMED',
      'BALLET',
      '2. Grup'
    )
  on conflict (requirement_set_id, name) do nothing;

  select id into v_piano_group_1_id
  from public.instructional_groups
  where requirement_set_id = v_requirement_set_id
    and name = '5A BALLET / 1. Grup';

  select id into v_piano_group_2_id
  from public.instructional_groups
  where requirement_set_id = v_requirement_set_id
    and name = '5A BALLET / 2. Grup';

  if v_piano_group_1_id is null
     or v_piano_group_2_id is null then
    raise exception 'M19.3 failed to resolve 5A Piyano subgroup IDs';
  end if;

  insert into public.instructional_group_relations (
    left_group_id,
    right_group_id,
    relation
  )
  values
    (v_5a_ballet_group_id, v_piano_group_1_id, 'CONTAINS'),
    (v_5a_ballet_group_id, v_piano_group_2_id, 'CONTAINS'),
    (v_piano_group_1_id, v_piano_group_2_id, 'DISJOINT')
  on conflict do nothing;

  if exists (
    select 1
    from public.course_requirements requirement
    where requirement.requirement_set_id = v_requirement_set_id
      and requirement.subject_id = v_piano_subject_id
      and requirement.instructional_group_id
        in (v_piano_group_1_id, v_piano_group_2_id)
  ) then
    raise exception
      'M19.3 5A Piyano reconciliation requirements already exist';
  end if;

  insert into public.course_requirements (
    requirement_set_id,
    subject_id,
    instructional_group_id,
    weekly_load,
    preferred_partition,
    allowed_partitions,
    min_distinct_days,
    max_blocks_per_day,
    max_consecutive_periods,
    course_character,
    term_status,
    knowledge_status,
    teacher_mode,
    resource_mode,
    required_capability,
    delivery_mode
  )
  values (
    v_requirement_set_id,
    v_piano_subject_id,
    v_piano_group_1_id,
    1,
    '[1]'::jsonb,
    '[[1]]'::jsonb,
    null,
    null,
    null,
    'OTHER',
    'ACTIVE',
    'CONFIRMED',
    'UNKNOWN',
    'UNKNOWN',
    null,
    'PARALLEL'
  )
  returning id into v_piano_requirement_1_id;

  insert into public.course_requirements (
    requirement_set_id,
    subject_id,
    instructional_group_id,
    weekly_load,
    preferred_partition,
    allowed_partitions,
    min_distinct_days,
    max_blocks_per_day,
    max_consecutive_periods,
    course_character,
    term_status,
    knowledge_status,
    teacher_mode,
    resource_mode,
    required_capability,
    delivery_mode
  )
  values (
    v_requirement_set_id,
    v_piano_subject_id,
    v_piano_group_2_id,
    1,
    '[1]'::jsonb,
    '[[1]]'::jsonb,
    null,
    null,
    null,
    'OTHER',
    'ACTIVE',
    'CONFIRMED',
    'UNKNOWN',
    'UNKNOWN',
    null,
    'PARALLEL'
  )
  returning id into v_piano_requirement_2_id;

  insert into public.schedule_cards (
    schedule_revision_id,
    requirement_id,
    block_index,
    duration_periods,
    locked,
    publication_end_time_override
  )
  values (
    v_revision_id,
    v_piano_requirement_1_id,
    1,
    1,
    false,
    '16:15'::time
  )
  returning id into v_piano_card_1_id;

  insert into public.schedule_cards (
    schedule_revision_id,
    requirement_id,
    block_index,
    duration_periods,
    locked,
    publication_end_time_override
  )
  values (
    v_revision_id,
    v_piano_requirement_2_id,
    1,
    1,
    false,
    null
  )
  returning id into v_piano_card_2_id;

  insert into public.placements (
    card_id,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    move_transaction_id
  )
  values
    (
      v_piano_card_1_id,
      3,
      v_period_1530,
      null,
      null,
      null
    ),
    (
      v_piano_card_2_id,
      3,
      v_period_1620,
      null,
      null,
      null
    );


  -- -----------------------------------------------------------------------
  -- 4. 5A FRIDAY K. BALE SUPPLEMENT
  -- -----------------------------------------------------------------------
  -- Use an explicit COMPOSITE delivery wrapper around the existing 5A BALLET
  -- participant set. This permits a separate teacher/resource strategy while
  -- publishing the same BALLET / no-subgroup audience semantics.

  insert into public.instructional_groups (
    requirement_set_id,
    class_group_id,
    name,
    group_type,
    term_status,
    knowledge_status,
    audience_target,
    subgroup_label
  )
  values (
    v_requirement_set_id,
    null,
    'STANDARD • 5A BALLET • Cuma ek dersi',
    'COMPOSITE',
    'ACTIVE',
    'CONFIRMED',
    null,
    null
  )
  on conflict (requirement_set_id, name) do nothing;

  select id
  into v_kbale_supplement_group_id
  from public.instructional_groups
  where requirement_set_id = v_requirement_set_id
    and name = 'STANDARD • 5A BALLET • Cuma ek dersi';

  if v_kbale_supplement_group_id is null then
    raise exception 'M19.3 failed to resolve supplemental K. Bale group';
  end if;

  insert into public.instructional_group_relations (
    left_group_id,
    right_group_id,
    relation
  )
  values (
    v_kbale_supplement_group_id,
    v_5a_ballet_group_id,
    'CONTAINS'
  )
  on conflict do nothing;

  if exists (
    select 1
    from public.course_requirements requirement
    where requirement.requirement_set_id = v_requirement_set_id
      and requirement.subject_id = v_kbale_subject_id
      and requirement.instructional_group_id =
        v_kbale_supplement_group_id
  ) then
    raise exception
      'M19.3 supplemental K. Bale requirement already exists';
  end if;

  insert into public.course_requirements (
    requirement_set_id,
    subject_id,
    instructional_group_id,
    weekly_load,
    preferred_partition,
    allowed_partitions,
    min_distinct_days,
    max_blocks_per_day,
    max_consecutive_periods,
    course_character,
    term_status,
    knowledge_status,
    teacher_mode,
    resource_mode,
    required_capability,
    delivery_mode
  )
  values (
    v_requirement_set_id,
    v_kbale_subject_id,
    v_kbale_supplement_group_id,
    2,
    '[1,1]'::jsonb,
    '[[1,1]]'::jsonb,
    null,
    2,
    1,
    'TECHNIQUE',
    'ACTIVE',
    'CONFIRMED',
    'FIXED',
    'UNKNOWN',
    null,
    'STANDARD'
  )
  returning id into v_kbale_requirement_id;

  insert into public.course_requirement_teachers (
    requirement_id,
    teacher_id,
    knowledge_status
  )
  values (
    v_kbale_requirement_id,
    v_egemalmaz_teacher_id,
    'CONFIRMED'
  );

  insert into public.schedule_cards (
    schedule_revision_id,
    requirement_id,
    block_index,
    duration_periods,
    locked,
    publication_end_time_override
  )
  values (
    v_revision_id,
    v_kbale_requirement_id,
    1,
    1,
    false,
    null
  )
  returning id into v_kbale_card_1_id;

  insert into public.schedule_cards (
    schedule_revision_id,
    requirement_id,
    block_index,
    duration_periods,
    locked,
    publication_end_time_override
  )
  values (
    v_revision_id,
    v_kbale_requirement_id,
    2,
    1,
    false,
    null
  )
  returning id into v_kbale_card_2_id;

  insert into public.placements (
    card_id,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    move_transaction_id
  )
  values
    (
      v_kbale_card_1_id,
      5,
      v_period_1350,
      v_egemalmaz_teacher_id,
      null,
      null
    ),
    (
      v_kbale_card_2_id,
      5,
      v_period_1440,
      v_egemalmaz_teacher_id,
      null,
      null
    );


  -- -----------------------------------------------------------------------
  -- REBUILD CANDIDATE DOMAINS + PERMANENT HISTORY BARRIER
  -- -----------------------------------------------------------------------

  perform public.refresh_management_candidate_domain(v_revision_id);

  insert into public.move_transactions (
    schedule_revision_id,
    root_transaction_id,
    parent_transaction_id,
    actor_type,
    action,
    payload
  )
  values (
    v_revision_id,
    null,
    null,
    'USER',
    'STRUCTURE',
    jsonb_build_object(
      'source', 'STRUCTURE_APPLY',
      'engine_version', 'M19.3-v0.1',
      'revertible', false,
      'reason', 'RUNTIME_ADJUSTMENT_RECONCILIATION',
      'rules', jsonb_build_array(
        'GRADE5_B_UYGULAMA_INACTIVE',
        '5A_V_KONDISYON_11_40',
        '5A_PIYANO_GROUPS',
        '5A_FRIDAY_K_BALE_E_GEMALMAZ'
      )
    )
  );

  -- The management draft now explicitly represents every runtime overlay.
  update public.management_publication_controls
  set
    runtime_adjustments_reconciled = true,
    note = 'M19.3 PASS: effective schedule adjustments are explicitly represented by the management draft; frontend compatibility overlay may remain until first controlled publication.',
    updated_at = now()
  where academic_year = '2026-2027';


  -- -----------------------------------------------------------------------
  -- INVARIANTS
  -- -----------------------------------------------------------------------

  -- Exact Piyano publication-time end override.
  if not exists (
    select 1
    from public.schedule_cards card
    join public.placements placement
      on placement.card_id = card.id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    where card.id = v_piano_card_1_id
      and placement.day_of_week = 3
      and placement.start_period = v_period_1530
      and card.publication_end_time_override = '16:15'::time
      and requirement.delivery_mode = 'PARALLEL'
  ) then
    raise exception 'M19.3 Piyano Group 1 exact-time invariant failed';
  end if;

  if (
    select count(*)
    from public.schedule_cards card
    join public.placements placement
      on placement.card_id = card.id
    where card.id in (v_kbale_card_1_id, v_kbale_card_2_id)
      and placement.day_of_week = 5
      and placement.start_period in (v_period_1350, v_period_1440)
      and placement.teacher_id = v_egemalmaz_teacher_id
  ) <> 2 then
    raise exception 'M19.3 Friday K. Bale placement invariant failed';
  end if;

  if not exists (
    select 1
    from public.schedule_cards card
    join public.placements placement
      on placement.card_id = card.id
    where card.id = v_vcond_5a_card_id
      and placement.day_of_week = 1
      and placement.start_period = v_period_1120
      and placement.teacher_id is null
      and placement.room_id is null
  ) then
    raise exception 'M19.3 5A V. Kondisyon placement invariant failed';
  end if;

  if not exists (
    select 1
    from public.schedule_cards card
    join public.placements placement
      on placement.card_id = card.id
    where card.id = v_vcond_shared_card_id
      and placement.day_of_week = 1
      and placement.start_period = v_period_1620
  ) then
    raise exception 'M19.3 6A V. Kondisyon source-placement invariant failed';
  end if;

  -- Public projection MUST remain untouched.
  select count(*)
  into v_public_sessions
  from public.schedule_sessions
  where academic_year = '2026-2027';

  select count(*)
  into v_public_groups
  from public.session_groups session_group
  join public.schedule_sessions session
    on session.id = session_group.session_id
  where session.academic_year = '2026-2027';

  if v_public_sessions <> 517 or v_public_groups <> 609 then
    raise exception
      'M19.3 modified public projection unexpectedly: sessions %, groups %',
      v_public_sessions,
      v_public_groups;
  end if;

  if not coalesce(
    (
      public.management_publication_baseline_status('2026-2027')
      ->> 'healthy'
    )::boolean,
    false
  ) then
    raise exception 'M19.3 public baseline drifted during reconciliation';
  end if;

  update public.schedule_revisions
  set validation_summary =
    coalesce(validation_summary, '{}'::jsonb)
    || jsonb_build_object(
      'm19_3_runtime_adjustment_reconciliation', 'PASS',
      'runtime_adjustments_reconciled', true,
      'public_projection_changed', false
    )
  where id = v_revision_id;
end
$$;

commit;
