-- Management / M25.3
-- Music-A Source Reconciliation Apply
--
-- PURPOSE
--   Apply the normalized (MÜZİK) A ŞUBESİ source to the management DRAFT
--   without touching the current public projection.
--
-- MODEL
--   * 28 source schedules / 94 periods are the same physical MUSIC lessons
--     already represented by the corresponding B-branch requirements.
--     These are reconciled by expanding the existing physical requirement's
--     participant group to include the matching A-branch MUSIC audience.
--     No duplicate card or placement is created for those lessons.
--   * 10A MUSIC / Müzik Teorisi is genuinely distinct in the source:
--       Friday 13:00-13:40 + 13:50-14:30, room A105.
--     It receives one new two-period requirement/card/placement.
--   * Teacher identity for the explicit 10A lesson is not present in source,
--     so teacher_mode remains UNKNOWN. No teacher is invented.
--
-- SAFETY
--   * M25 / M25.1 / M25.2 / M25.2.1 remain immutable.
--   * Public schedule_sessions / session_groups are untouched.
--   * Student headcounts are not used.
--   * UNKNOWN != ABSENT != UNAVAILABLE.
--   * Publication remains locked/incomplete after this pass because the
--     source does not provide a 12B BALLET timetable.

begin;

alter table public.management_source_schedule_evidence
  add column resolved_requirement_id uuid null
    references public.course_requirements(id) on delete set null,
  add column resolution_kind text null
    check (
      resolution_kind is null
      or resolution_kind in (
        'ATTACHED_TO_EXISTING_PHYSICAL_LESSON',
        'CREATED_EXPLICIT_REQUIREMENT'
      )
    ),
  add column resolved_at timestamptz null;

alter table public.management_source_schedule_evidence
  add constraint management_source_schedule_resolution_shape
    check (
      (
        resolved_requirement_id is null
        and resolution_kind is null
        and resolved_at is null
      )
      or (
        resolved_requirement_id is not null
        and resolution_kind is not null
        and resolved_at is not null
      )
    );

create index management_source_schedule_resolved_requirement_idx
  on public.management_source_schedule_evidence (resolved_requirement_id);

do $$
declare
  v_requirement_set_id uuid;
  v_revision_id uuid;

  v_source_count integer;
  v_source_period_count integer;
  v_counterpart_source_count integer;
  v_counterpart_period_count integer;
  v_explicit_source_count integer;
  v_explicit_period_count integer;

  v_bad_candidate_count integer;
  v_map_count integer;
  v_wrapper_count integer;
  v_resolved_counterpart_count integer;

  v_explicit_evidence_id uuid;
  v_explicit_subject_id uuid;
  v_explicit_group_id uuid;
  v_explicit_requirement_id uuid;
  v_explicit_card_id uuid;
  v_a105_room_ids uuid[];
  v_a105_room_id uuid;

  v_resolved_source_count integer;
  v_group_conflict_count integer;
  v_room_conflict_count integer;
  v_missing_summary_count integer;
  v_contradiction_count integer;
  v_projection_session_count integer;
  v_projection_group_count integer;

  v_public_sessions_hash text;
  v_public_groups_hash text;
begin
  select
    revision.requirement_set_id,
    revision.id
  into
    v_requirement_set_id,
    v_revision_id
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

  if v_revision_id is null then
    raise exception 'M25.3 requires the active 2026-2027 term-1 DRAFT';
  end if;

  if v_revision_id <>
       '02a42aa9-b6e1-47e2-8e4d-188d5dcfd0b5'::uuid then
    raise exception
      'M25.3 unexpected active DRAFT revision: %',
      v_revision_id;
  end if;

  if coalesce(
    (
      select revision.validation_summary
        ->> 'm25_2_1_period_index_correction'
      from public.schedule_revisions revision
      where revision.id = v_revision_id
    ),
    ''
  ) <> 'PASS' then
    raise exception 'M25.3 requires M25.2.1 PASS';
  end if;

  if (
    select count(*)
    from public.schedule_cards card
    where card.schedule_revision_id = v_revision_id
  ) <> 299
  or (
    select count(*)
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    where card.schedule_revision_id = v_revision_id
  ) <> 299
  or (
    select count(*)
    from public.move_transactions move
    where move.schedule_revision_id = v_revision_id
  ) <> 0 then
    raise exception 'M25.3 clean DRAFT baseline drift';
  end if;

  v_public_sessions_hash :=
    public.management_public_sessions_hash('2026-2027');
  v_public_groups_hash :=
    public.management_public_groups_hash('2026-2027');

  if v_public_sessions_hash <>
       'a0bb49d37440119271457d0f678456d4'
     or v_public_groups_hash <>
       'e9ff78dfe6bc55cc98c5aa589a80142e' then
    raise exception 'M25.3 public baseline drift';
  end if;

  create temporary table m25_3_source
  on commit drop
  as
  select evidence.*
  from public.management_source_schedule_evidence evidence
  where evidence.requirement_set_id = v_requirement_set_id
    and evidence.source_document =
      '(MÜZİK) A ŞUBESİ DERS PROGRAMI.pdf';

  select
    count(*)::integer,
    coalesce(sum(source_period_count), 0)::integer,
    count(*) filter (
      where reconciliation_strategy = 'COUNTERPART_SCHEDULE'
    )::integer,
    coalesce(sum(source_period_count) filter (
      where reconciliation_strategy = 'COUNTERPART_SCHEDULE'
    ), 0)::integer,
    count(*) filter (
      where reconciliation_strategy = 'EXPLICIT_SCHEDULE'
    )::integer,
    coalesce(sum(source_period_count) filter (
      where reconciliation_strategy = 'EXPLICIT_SCHEDULE'
    ), 0)::integer
  into
    v_source_count,
    v_source_period_count,
    v_counterpart_source_count,
    v_counterpart_period_count,
    v_explicit_source_count,
    v_explicit_period_count
  from m25_3_source;

  if v_source_count <> 29
     or v_source_period_count <> 96
     or v_counterpart_source_count <> 28
     or v_counterpart_period_count <> 94
     or v_explicit_source_count <> 1
     or v_explicit_period_count <> 2 then
    raise exception
      'M25.3 source scope mismatch: source %/%, counterpart %/%, explicit %/%',
      v_source_count,
      v_source_period_count,
      v_counterpart_source_count,
      v_counterpart_period_count,
      v_explicit_source_count,
      v_explicit_period_count;
  end if;

  if exists (
    select 1
    from m25_3_source source
    where source.resolved_requirement_id is not null
       or source.resolution_kind is not null
       or source.resolved_at is not null
  ) then
    raise exception 'M25.3 source rows are already resolved';
  end if;

  -- ---------------------------------------------------------------------
  -- EXACT COUNTERPART REQUIREMENT MAP
  -- ---------------------------------------------------------------------

  create temporary table m25_3_group_tree
  on commit drop
  as
  with recursive tree(requirement_id, group_id, path) as (
    select
      requirement.id,
      requirement.instructional_group_id,
      array[requirement.instructional_group_id]::uuid[]
    from public.course_requirements requirement
    where requirement.requirement_set_id = v_requirement_set_id

    union all

    select
      tree.requirement_id,
      relation.right_group_id,
      tree.path || relation.right_group_id
    from tree
    join public.instructional_group_relations relation
      on relation.left_group_id = tree.group_id
     and relation.relation = 'CONTAINS'
    where not relation.right_group_id = any(tree.path)
  )
  select requirement_id, group_id
  from tree;

  create temporary table m25_3_requirement_schedules
  on commit drop
  as
  with units as (
    select
      card.requirement_id,
      placement.day_of_week::integer as day_of_week,
      period.period_number::integer as period_number,
      case
        when placement.room_id is null then null::text
        else regexp_replace(
          upper(coalesce(canonical_room.name, selected_room.name)),
          '[^A-Z0-9]',
          '',
          'g'
        )
      end as room_key
    from public.schedule_cards card
    join public.placements placement
      on placement.card_id = card.id
    cross join lateral generate_series(
      placement.start_period::integer,
      placement.start_period::integer + card.duration_periods::integer - 1
    ) period(period_number)
    left join public.rooms selected_room
      on selected_room.id = placement.room_id
    left join public.rooms canonical_room
      on canonical_room.id = coalesce(
        selected_room.canonical_room_id,
        selected_room.id
      )
    where card.schedule_revision_id = v_revision_id
  )
  select
    unit.requirement_id,
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'd', unit.day_of_week,
          'p', unit.period_number,
          'r', unit.room_key
        )
      )
      order by
        unit.day_of_week,
        unit.period_number,
        unit.room_key nulls first
    ) as schedule
  from units unit
  group by unit.requirement_id;

  create temporary table m25_3_counterpart_candidates
  on commit drop
  as
  select distinct
    source.id as evidence_id,
    source.grade,
    source.subject_name,
    requirement.id as requirement_id
  from m25_3_source source
  join public.subjects subject
    on subject.name = source.subject_name
  join public.course_requirements requirement
    on requirement.requirement_set_id = v_requirement_set_id
   and requirement.subject_id = subject.id
  join m25_3_requirement_schedules requirement_schedule
    on requirement_schedule.requirement_id = requirement.id
   and requirement_schedule.schedule = source.source_schedule
  where source.reconciliation_strategy = 'COUNTERPART_SCHEDULE'
    and exists (
      select 1
      from m25_3_group_tree tree
      join public.instructional_groups member_group
        on member_group.id = tree.group_id
      join public.class_groups class_group
        on class_group.id = member_group.class_group_id
      where tree.requirement_id = requirement.id
        and class_group.academic_year = '2026-2027'
        and class_group.grade = source.grade
        and class_group.section = source.reference_section
        and member_group.audience_target = 'MUSIC'
    );

  select count(*)
  into v_bad_candidate_count
  from m25_3_source source
  where source.reconciliation_strategy = 'COUNTERPART_SCHEDULE'
    and (
      select count(*)
      from m25_3_counterpart_candidates candidate
      where candidate.evidence_id = source.id
    ) <> 1;

  if v_bad_candidate_count <> 0 then
    raise exception
      'M25.3 found % counterpart source rows without exactly one physical requirement match',
      v_bad_candidate_count;
  end if;

  create temporary table m25_3_counterpart_map
  on commit drop
  as
  select *
  from m25_3_counterpart_candidates;

  select count(*)
  into v_map_count
  from m25_3_counterpart_map;

  if v_map_count <> 28 then
    raise exception
      'M25.3 expected 28 exact counterpart mappings, found %',
      v_map_count;
  end if;

  create temporary table m25_3_target_a_groups
  on commit drop
  as
  select
    mapped.evidence_id,
    mapped.requirement_id,
    mapped.grade,
    mapped.subject_name,
    instructional_group.id as target_group_id,
    instructional_group.name as target_group_name
  from m25_3_counterpart_map mapped
  join public.class_groups class_group
    on class_group.academic_year = '2026-2027'
   and class_group.grade = mapped.grade
   and class_group.section = 'A'
  join public.instructional_groups instructional_group
    on instructional_group.requirement_set_id = v_requirement_set_id
   and instructional_group.class_group_id = class_group.id
   and instructional_group.group_type = 'MUSIC'
   and instructional_group.audience_target = 'MUSIC'
   and instructional_group.subgroup_label is null;

  if (
    select count(*)
    from m25_3_target_a_groups
  ) <> 28 then
    raise exception 'M25.3 A-MUSIC target group mapping is incomplete';
  end if;

  if exists (
    select 1
    from m25_3_target_a_groups target
    join public.management_requirement_public_members(
      target.requirement_id
    ) member
      on member.class_group_id = (
        select instructional_group.class_group_id
        from public.instructional_groups instructional_group
        where instructional_group.id = target.target_group_id
      )
     and member.target = 'MUSIC'
  ) then
    raise exception
      'M25.3 counterpart requirement already contains an A-MUSIC target';
  end if;

  -- ---------------------------------------------------------------------
  -- EXPAND EXISTING PHYSICAL MUSIC LESSONS TO A-BRANCH MUSIC AUDIENCES
  -- ---------------------------------------------------------------------

  create temporary table m25_3_wrapper_plan
  on commit drop
  as
  select
    mapped.requirement_id,
    requirement.instructional_group_id as old_group_id,
    min(mapped.subject_name) as subject_name,
    'SHARED • ' ||
      min(mapped.subject_name) ||
      ' • ' ||
      old_group.name ||
      ' + ' ||
      string_agg(
        distinct target.target_group_name,
        ' + '
        order by target.target_group_name
      ) as wrapper_name
  from m25_3_counterpart_map mapped
  join public.course_requirements requirement
    on requirement.id = mapped.requirement_id
  join public.instructional_groups old_group
    on old_group.id = requirement.instructional_group_id
  join m25_3_target_a_groups target
    on target.requirement_id = mapped.requirement_id
  group by
    mapped.requirement_id,
    requirement.instructional_group_id,
    old_group.name;

  if exists (
    select 1
    from m25_3_wrapper_plan plan
    group by plan.requirement_id
    having count(*) <> 1
  ) then
    raise exception 'M25.3 wrapper plan is not one-to-one with requirements';
  end if;

  if exists (
    select 1
    from m25_3_wrapper_plan plan
    join public.instructional_groups existing
      on existing.requirement_set_id = v_requirement_set_id
     and existing.name = plan.wrapper_name
  ) then
    raise exception 'M25.3 wrapper group name already exists';
  end if;

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
  select
    v_requirement_set_id,
    null,
    plan.wrapper_name,
    'COMPOSITE',
    'ACTIVE',
    'CONFIRMED',
    null,
    null
  from m25_3_wrapper_plan plan
  order by plan.wrapper_name;

  get diagnostics v_wrapper_count = row_count;

  if v_wrapper_count <> (
    select count(*)
    from m25_3_wrapper_plan
  ) then
    raise exception
      'M25.3 wrapper insert mismatch: expected %, inserted %',
      (select count(*) from m25_3_wrapper_plan),
      v_wrapper_count;
  end if;

  insert into public.instructional_group_relations (
    left_group_id,
    right_group_id,
    relation
  )
  select
    wrapper.id,
    plan.old_group_id,
    'CONTAINS'
  from m25_3_wrapper_plan plan
  join public.instructional_groups wrapper
    on wrapper.requirement_set_id = v_requirement_set_id
   and wrapper.name = plan.wrapper_name;

  insert into public.instructional_group_relations (
    left_group_id,
    right_group_id,
    relation
  )
  select distinct
    wrapper.id,
    target.target_group_id,
    'CONTAINS'
  from m25_3_wrapper_plan plan
  join public.instructional_groups wrapper
    on wrapper.requirement_set_id = v_requirement_set_id
   and wrapper.name = plan.wrapper_name
  join m25_3_target_a_groups target
    on target.requirement_id = plan.requirement_id;

  update public.course_requirements requirement
  set instructional_group_id = wrapper.id
  from m25_3_wrapper_plan plan
  join public.instructional_groups wrapper
    on wrapper.requirement_set_id = v_requirement_set_id
   and wrapper.name = plan.wrapper_name
  where requirement.id = plan.requirement_id;

  update public.management_source_schedule_evidence evidence
  set
    resolved_requirement_id = mapped.requirement_id,
    resolution_kind = 'ATTACHED_TO_EXISTING_PHYSICAL_LESSON',
    resolved_at = now()
  from m25_3_counterpart_map mapped
  where evidence.id = mapped.evidence_id;

  get diagnostics v_resolved_counterpart_count = row_count;

  if v_resolved_counterpart_count <> 28 then
    raise exception
      'M25.3 expected 28 resolved counterpart source rows, updated %',
      v_resolved_counterpart_count;
  end if;

  -- ---------------------------------------------------------------------
  -- CREATE THE ONE DISTINCT 10A MUSIC / MÜZİK TEORİSİ LESSON
  -- ---------------------------------------------------------------------

  select source.id
  into v_explicit_evidence_id
  from m25_3_source source
  where source.reconciliation_strategy = 'EXPLICIT_SCHEDULE'
    and source.grade = 10
    and source.section = 'A'
    and source.audience_target = 'MUSIC'
    and source.subject_name = 'Müzik Teorisi'
    and source.source_schedule =
      '[{"d":5,"p":6,"r":"A105"},{"d":5,"p":7,"r":"A105"}]'::jsonb;

  if v_explicit_evidence_id is null then
    raise exception
      'M25.3 explicit 10A MUSIC / Müzik Teorisi evidence is missing';
  end if;

  select subject.id
  into v_explicit_subject_id
  from public.subjects subject
  where subject.name = 'Müzik Teorisi'
  limit 1;

  select instructional_group.id
  into v_explicit_group_id
  from public.class_groups class_group
  join public.instructional_groups instructional_group
    on instructional_group.requirement_set_id = v_requirement_set_id
   and instructional_group.class_group_id = class_group.id
   and instructional_group.group_type = 'MUSIC'
   and instructional_group.audience_target = 'MUSIC'
   and instructional_group.subgroup_label is null
  where class_group.academic_year = '2026-2027'
    and class_group.grade = 10
    and class_group.section = 'A'
  limit 1;

  if v_explicit_subject_id is null
     or v_explicit_group_id is null then
    raise exception
      'M25.3 explicit 10A MUSIC subject/group identity is incomplete';
  end if;

  if exists (
    select 1
    from public.course_requirements requirement
    join public.management_requirement_public_members(
      requirement.id
    ) member
      on true
    join public.class_groups class_group
      on class_group.id = member.class_group_id
    where requirement.requirement_set_id = v_requirement_set_id
      and requirement.subject_id = v_explicit_subject_id
      and class_group.academic_year = '2026-2027'
      and class_group.grade = 10
      and class_group.section = 'A'
      and member.target = 'MUSIC'
  ) then
    raise exception
      'M25.3 10A MUSIC / Müzik Teorisi is already represented';
  end if;

  select array_agg(distinct room_id order by room_id)
  into v_a105_room_ids
  from (
    select coalesce(room.canonical_room_id, room.id) as room_id
    from public.rooms room
    left join public.rooms canonical_room
      on canonical_room.id = coalesce(
        room.canonical_room_id,
        room.id
      )
    where regexp_replace(
      upper(coalesce(canonical_room.name, room.name)),
      '[^A-Z0-9]',
      '',
      'g'
    ) = 'A105'
  ) candidates;

  if coalesce(cardinality(v_a105_room_ids), 0) <> 1 then
    raise exception
      'M25.3 expected one canonical A105 room, found %',
      coalesce(cardinality(v_a105_room_ids), 0);
  end if;

  v_a105_room_id := v_a105_room_ids[1];

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
    v_explicit_subject_id,
    v_explicit_group_id,
    2,
    '[2]'::jsonb,
    '[[2]]'::jsonb,
    1,
    1,
    2,
    'OTHER',
    'ACTIVE',
    'CONFIRMED',
    'UNKNOWN',
    'FIXED',
    null,
    'STANDARD'
  )
  returning id into v_explicit_requirement_id;

  insert into public.course_requirement_rooms (
    requirement_id,
    room_id,
    knowledge_status
  )
  values (
    v_explicit_requirement_id,
    v_a105_room_id,
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
    v_explicit_requirement_id,
    1,
    2,
    false,
    null
  )
  returning id into v_explicit_card_id;

  insert into public.placements (
    card_id,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    move_transaction_id
  )
  values (
    v_explicit_card_id,
    5,
    6,
    null,
    v_a105_room_id,
    null
  );

  update public.management_source_schedule_evidence evidence
  set
    resolved_requirement_id = v_explicit_requirement_id,
    resolution_kind = 'CREATED_EXPLICIT_REQUIREMENT',
    resolved_at = now()
  where evidence.id = v_explicit_evidence_id;

  if not found then
    raise exception
      'M25.3 explicit source evidence resolution update failed';
  end if;

  -- ---------------------------------------------------------------------
  -- POST-APPLY INVARIANTS
  -- ---------------------------------------------------------------------

  select count(*)
  into v_resolved_source_count
  from public.management_source_schedule_evidence evidence
  where evidence.requirement_set_id = v_requirement_set_id
    and evidence.source_document =
      '(MÜZİK) A ŞUBESİ DERS PROGRAMI.pdf'
    and evidence.resolved_requirement_id is not null
    and evidence.resolution_kind is not null
    and evidence.resolved_at is not null;

  if v_resolved_source_count <> 29 then
    raise exception
      'M25.3 expected all 29 Music-A source rows resolved, found %',
      v_resolved_source_count;
  end if;

  -- Every source row must now project the matching A-branch MUSIC audience.
  if exists (
    select 1
    from public.management_source_schedule_evidence evidence
    join public.class_groups class_group
      on class_group.academic_year = '2026-2027'
     and class_group.grade = evidence.grade
     and class_group.section = 'A'
    where evidence.requirement_set_id = v_requirement_set_id
      and evidence.source_document =
        '(MÜZİK) A ŞUBESİ DERS PROGRAMI.pdf'
      and not exists (
        select 1
        from public.management_requirement_public_members(
          evidence.resolved_requirement_id
        ) member
        where member.class_group_id = class_group.id
          and member.target = 'MUSIC'
      )
  ) then
    raise exception
      'M25.3 resolved source coverage is missing an A-MUSIC public member';
  end if;

  -- Exact explicit schedule proof after insertion.
  if (
    select jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'd', placement.day_of_week,
          'p', period.period_number,
          'r', regexp_replace(
            upper(coalesce(canonical_room.name, selected_room.name)),
            '[^A-Z0-9]',
            '',
            'g'
          )
        )
      )
      order by placement.day_of_week, period.period_number
    )
    from public.schedule_cards card
    join public.placements placement
      on placement.card_id = card.id
    cross join lateral generate_series(
      placement.start_period::integer,
      placement.start_period::integer + card.duration_periods::integer - 1
    ) period(period_number)
    left join public.rooms selected_room
      on selected_room.id = placement.room_id
    left join public.rooms canonical_room
      on canonical_room.id = coalesce(
        selected_room.canonical_room_id,
        selected_room.id
      )
    where card.schedule_revision_id = v_revision_id
      and card.requirement_id = v_explicit_requirement_id
  ) <> '[{"d":5,"p":6,"r":"A105"},{"d":5,"p":7,"r":"A105"}]'::jsonb then
    raise exception
      'M25.3 explicit 10A MUSIC / Müzik Teorisi schedule proof failed';
  end if;

  if (
    select count(*)
    from public.schedule_cards card
    where card.schedule_revision_id = v_revision_id
  ) <> 300
  or (
    select count(*)
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    where card.schedule_revision_id = v_revision_id
  ) <> 300
  or (
    select count(*)
    from public.move_transactions move
    where move.schedule_revision_id = v_revision_id
  ) <> 0 then
    raise exception
      'M25.3 expected 300 cards / 300 placements / 0 moves';
  end if;

  -- The newly expanded participant graph must not create overlapping students.
  select count(*)
  into v_group_conflict_count
  from public.schedule_cards left_card
  join public.placements left_placement
    on left_placement.card_id = left_card.id
  join public.course_requirements left_requirement
    on left_requirement.id = left_card.requirement_id
  join public.schedule_cards right_card
    on right_card.schedule_revision_id = left_card.schedule_revision_id
   and right_card.id > left_card.id
  join public.placements right_placement
    on right_placement.card_id = right_card.id
   and right_placement.day_of_week = left_placement.day_of_week
   and right_placement.start_period
      <= left_placement.start_period + left_card.duration_periods - 1
   and left_placement.start_period
      <= right_placement.start_period + right_card.duration_periods - 1
  join public.course_requirements right_requirement
    on right_requirement.id = right_card.requirement_id
  where left_card.schedule_revision_id = v_revision_id
    and public.management_instructional_groups_conflict(
      left_requirement.instructional_group_id,
      right_requirement.instructional_group_id
    );

  if v_group_conflict_count <> 0 then
    raise exception
      'M25.3 introduced % participant-group placement conflicts',
      v_group_conflict_count;
  end if;

  -- No new duplicate room occupancy is permitted.
  select count(*)
  into v_room_conflict_count
  from public.schedule_cards left_card
  join public.placements left_placement
    on left_placement.card_id = left_card.id
   and left_placement.room_id is not null
  join public.schedule_cards right_card
    on right_card.schedule_revision_id = left_card.schedule_revision_id
   and right_card.id > left_card.id
  join public.placements right_placement
    on right_placement.card_id = right_card.id
   and right_placement.room_id = left_placement.room_id
   and right_placement.day_of_week = left_placement.day_of_week
   and right_placement.start_period
      <= left_placement.start_period + left_card.duration_periods - 1
   and left_placement.start_period
      <= right_placement.start_period + right_card.duration_periods - 1
  where left_card.schedule_revision_id = v_revision_id;

  if v_room_conflict_count <> 0 then
    raise exception
      'M25.3 introduced % room placement conflicts',
      v_room_conflict_count;
  end if;

  perform public.refresh_management_candidate_domain(v_revision_id);

  select count(*)
  into v_missing_summary_count
  from public.schedule_cards card
  left join public.schedule_card_domain_summaries summary
    on summary.card_id = card.id
  where card.schedule_revision_id = v_revision_id
    and summary.card_id is null;

  select count(*)
  into v_contradiction_count
  from public.schedule_cards card
  join public.schedule_card_domain_summaries summary
    on summary.card_id = card.id
  where card.schedule_revision_id = v_revision_id
    and summary.is_contradiction;

  if v_missing_summary_count <> 0
     or v_contradiction_count <> 0 then
    raise exception
      'M25.3 candidate-domain health failed: missing %, contradictions %',
      v_missing_summary_count,
      v_contradiction_count;
  end if;

  -- 299 cards represented 519 public session units. The explicit two-period
  -- lesson adds exactly two units. The 94 counterpart periods each gain one
  -- A-MUSIC audience row, and the explicit lesson contributes two more rows.
  select coalesce(sum(card.duration_periods), 0)::integer
  into v_projection_session_count
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id;

  select coalesce(
    sum(
      card.duration_periods * (
        select count(*)
        from public.management_requirement_public_members(
          card.requirement_id
        )
      )
    ),
    0
  )::integer
  into v_projection_group_count
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id;

  if v_projection_session_count <> 521
     or v_projection_group_count <> 706 then
    raise exception
      'M25.3 projection cardinality mismatch: sessions %, groups %',
      v_projection_session_count,
      v_projection_group_count;
  end if;

  if public.management_public_sessions_hash('2026-2027')
       <> v_public_sessions_hash
     or public.management_public_groups_hash('2026-2027')
       <> v_public_groups_hash then
    raise exception 'M25.3 modified the public projection unexpectedly';
  end if;

  update public.schedule_revisions revision
  set validation_summary =
    coalesce(revision.validation_summary, '{}'::jsonb)
    || jsonb_build_object(
      'm25_3_music_a_reconciliation_apply', 'PASS',
      'music_a_source_rows_resolved', 29,
      'music_a_counterpart_rows_attached', 28,
      'music_a_counterpart_periods_attached', 94,
      'music_a_explicit_requirements_created', 1,
      'music_a_explicit_periods_created', 2,
      'music_a_wrapper_groups_created', v_wrapper_count,
      'music_a_apply_status', 'PASS',
      'draft_card_count', 300,
      'draft_placement_count', 300,
      'projected_session_count', v_projection_session_count,
      'projected_group_count', v_projection_group_count,
      'participant_conflict_count', v_group_conflict_count,
      'room_conflict_count', v_room_conflict_count,
      'publication_source_complete', false,
      'remaining_source_gap', '12B_BALLET_TIMETABLE_NOT_PROVIDED',
      'public_projection_changed', false
    )
  where revision.id = v_revision_id;
end
$$;

commit;
