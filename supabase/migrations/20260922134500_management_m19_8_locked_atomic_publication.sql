-- Management / M19.8
-- Locked atomic publication engine.
--
-- IMPORTANT:
--   * This function performs the complete publication transaction.
--   * It is intentionally NOT granted to authenticated users in M19.8.
--   * The current incomplete draft therefore remains unpublishable.
--   * M19.9 must complete post-publication comparison/client continuity before
--     EXECUTE permission and any UI publication command are enabled.
--
-- Publication transaction responsibilities:
--   1. lock management + public projection write surfaces
--   2. revalidate ADMIN, exact stale-state token, readiness, baseline, write contract
--   3. build the exact period-level public projection with canonical rooms
--   4. verify semantic hashes against the M19.6 read-only builder
--   5. materialize draft resource-name overrides to teachers/rooms
--   6. atomically replace schedule_sessions + session_groups for the academic year
--   7. write durable publication audit/session mapping
--   8. freeze the published requirement set/revision
--   9. clone a clean next DRAFT with requirement lineage, cards and placements
--  10. rebuild the candidate domain for the cloned draft
--  11. atomically disable the legacy runtime schedule overlay

begin;


-- -------------------------------------------------------------------------
-- LIFECYCLE PREVIEW SEMANTICS UPDATE
-- -------------------------------------------------------------------------
-- M19.5 originally described name overrides as cloned to the next DRAFT.
-- Actual publication must materialize those names to the public base resource
-- rows because student/teacher reads resolve teachers.name / rooms.name
-- directly. The next DRAFT therefore starts from the newly published base name
-- and needs no redundant override rows.

alter function public.management_preview_publication_lifecycle(uuid)
  rename to management_preview_publication_lifecycle_m19_5;

create or replace function public.management_preview_publication_lifecycle(
  p_schedule_revision_id uuid
)
returns jsonb
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  with base as (
    select public.management_preview_publication_lifecycle_m19_5(
      p_schedule_revision_id
    ) as value
  )
  select
    jsonb_set(
      jsonb_set(
        jsonb_set(
          base.value,
          '{strategies,nameOverrides}',
          to_jsonb('APPLY_TO_BASE_AND_RESET'::text),
          true
        ),
        '{clonePlan,teacherNameOverrides}',
        '0'::jsonb,
        true
      ),
      '{clonePlan,roomNameOverrides}',
      '0'::jsonb,
      true
    )
    || jsonb_build_object(
      'resourceNamePublication',
      jsonb_build_object(
        'teacherNameOverrideCount',
          coalesce(
            (base.value #>> '{clonePlan,teacherNameOverrides}')::integer,
            0
          ),
        'roomNameOverrideCount',
          coalesce(
            (base.value #>> '{clonePlan,roomNameOverrides}')::integer,
            0
          ),
        'strategy',
          'APPLY_TO_BASE_AND_RESET'
      )
    )
  from base
$$;

revoke all
  on function public.management_preview_publication_lifecycle(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_preview_publication_lifecycle(uuid)
  to authenticated;

comment on function public.management_preview_publication_lifecycle(uuid) is
  'M19.8 lifecycle preview. Published resource-name overrides are materialized to base teacher/room rows and the cloned next DRAFT starts with no redundant name overrides.';


-- -------------------------------------------------------------------------
-- LOCKED APPLY FUNCTION
-- -------------------------------------------------------------------------

create or replace function public.management_apply_publication(
  p_schedule_revision_id uuid,
  p_expected_state_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor uuid := auth.uid();

  v_revision record;
  v_control record;
  v_metadata record;

  v_current_token text;
  v_gate jsonb;
  v_projection_preview jsonb;
  v_write_contract jsonb;

  v_preview_session_hash text;
  v_preview_group_hash text;
  v_built_session_hash text;
  v_built_group_hash text;

  v_before_session_count integer;
  v_before_group_count integer;
  v_before_sessions_hash text;
  v_before_groups_hash text;

  v_after_session_count integer;
  v_after_group_count integer;
  v_after_sessions_hash text;
  v_after_groups_hash text;

  v_publication_id uuid := gen_random_uuid();
  v_publication_number integer;

  v_next_requirement_set_id uuid := gen_random_uuid();
  v_next_requirement_set_version integer;
  v_next_revision_id uuid := gen_random_uuid();
  v_next_revision_version integer;

  v_teacher_name_count integer;
  v_room_name_count integer;

  v_projection_session_count integer;
  v_projection_group_count integer;
  v_projection_version integer;
begin
  if not public.has_management_role('ADMIN') then
    raise exception 'M19.8 management ADMIN role required'
      using errcode = '42501';
  end if;

  if p_expected_state_token is null
     or length(btrim(p_expected_state_token)) = 0 then
    raise exception 'M19.8 expected publication state token is required';
  end if;

  -- Serialize all publication-relevant writes while allowing ordinary readers.
  lock table
    public.requirement_sets,
    public.schedule_revisions,
    public.instructional_groups,
    public.instructional_group_relations,
    public.course_requirements,
    public.course_requirement_teachers,
    public.course_requirement_rooms,
    public.schedule_cards,
    public.placements,
    public.move_transactions,
    public.schedule_card_domain_summaries,
    public.schedule_card_candidate_assessments,
    public.management_teacher_name_overrides,
    public.management_room_name_overrides,
    public.management_publication_controls,
    public.management_publications,
    public.management_publication_sessions,
    public.management_requirement_lineage,
    public.schedule_projection_metadata,
    public.teachers,
    public.rooms,
    public.subjects,
    public.class_groups,
    public.schedule_sessions,
    public.session_groups
  in share row exclusive mode;

  select
    revision.id,
    revision.requirement_set_id,
    revision.version_number as revision_version,
    revision.status as revision_status,
    requirement_set.academic_year,
    requirement_set.term,
    requirement_set.version_number as requirement_set_version,
    requirement_set.status as requirement_set_status
  into v_revision
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_schedule_revision_id
  for update of revision, requirement_set;

  if not found then
    raise exception 'M19.8 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision.revision_status <> 'DRAFT'
     or v_revision.requirement_set_status <> 'DRAFT' then
    raise exception
      'M19.8 publication requires a DRAFT revision on a DRAFT requirement set';
  end if;

  select *
  into v_control
  from public.management_publication_controls control
  where control.academic_year = v_revision.academic_year
  for update;

  if not found then
    raise exception 'M19.8 publication control missing for %',
      v_revision.academic_year;
  end if;

  select *
  into v_metadata
  from public.schedule_projection_metadata metadata
  where metadata.academic_year = v_revision.academic_year
  for update;

  if not found then
    raise exception 'M19.8 projection metadata missing for %',
      v_revision.academic_year;
  end if;

  v_current_token :=
    public.management_publication_state_token(
      p_schedule_revision_id
    );

  if v_current_token is distinct from p_expected_state_token then
    raise exception 'M19.8 publication preview is stale';
  end if;

  v_gate :=
    public.management_preview_publication(
      p_schedule_revision_id
    );

  if not coalesce(
    (v_gate ->> 'canCurrentUserPublish')::boolean,
    false
  ) then
    raise exception
      'M19.8 publication blocked: %',
      coalesce(v_gate -> 'blockReasons', '[]'::jsonb)::text;
  end if;

  v_write_contract :=
    public.management_preview_public_write_contract(
      v_revision.academic_year
    );

  if not coalesce(
    (v_write_contract ->> 'writeShapeSupported')::boolean,
    false
  ) then
    raise exception
      'M19.8 public write contract is not supported';
  end if;

  v_projection_preview :=
    public.management_preview_public_projection(
      p_schedule_revision_id
    );

  if not coalesce(
    (v_projection_preview ->> 'canPublish')::boolean,
    false
  ) then
    raise exception
      'M19.8 public projection builder is not publishable';
  end if;

  if (
    v_projection_preview
    -> 'safety'
    ->> 'notesPreservationReady'
  )::boolean is distinct from true then
    raise exception
      'M19.8 public notes preservation is unresolved';
  end if;

  v_preview_session_hash :=
    v_projection_preview ->> 'sessionProjectionHash';
  v_preview_group_hash :=
    v_projection_preview ->> 'groupProjectionHash';

  -- Rebuild deterministic projection rows inside the publication transaction.
  drop table if exists pg_temp.m198_projection_groups;
  drop table if exists pg_temp.m198_projection_sessions;

  create temporary table m198_projection_sessions (
    projection_session_ordinal integer primary key,
    session_id uuid not null unique,
    card_id uuid not null,
    requirement_id uuid not null,
    block_index smallint not null,
    unit_index smallint not null,
    academic_year text not null,
    day_of_week smallint not null,
    start_time time not null,
    end_time time not null,
    session_type public.schedule_session_type not null,
    subject_id uuid not null,
    teacher_id uuid null,
    room_id uuid null,
    notes text null
  ) on commit drop;

  insert into m198_projection_sessions (
    projection_session_ordinal,
    session_id,
    card_id,
    requirement_id,
    block_index,
    unit_index,
    academic_year,
    day_of_week,
    start_time,
    end_time,
    session_type,
    subject_id,
    teacher_id,
    room_id,
    notes
  )
  select
    row_number() over (
      order by
        card.requirement_id,
        card.block_index,
        unit.unit_offset,
        card.id
    )::integer,
    gen_random_uuid(),
    card.id,
    card.requirement_id,
    card.block_index,
    (unit.unit_offset + 1)::smallint,
    v_revision.academic_year,
    placement.day_of_week,
    period_bounds.start_time,
    case
      when unit.unit_offset = card.duration_periods - 1
        and card.publication_end_time_override is not null
      then card.publication_end_time_override
      else period_bounds.end_time
    end,
    requirement.delivery_mode::public.schedule_session_type,
    requirement.subject_id,
    placement.teacher_id,
    coalesce(
      selected_room.canonical_room_id,
      placement.room_id
    ),
    null::text
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  join public.placements placement
    on placement.card_id = card.id
  cross join lateral generate_series(
    0,
    card.duration_periods - 1
  ) as unit(unit_offset)
  cross join lateral public.management_publication_period_bounds(
    (placement.start_period + unit.unit_offset)::smallint
  ) period_bounds
  left join public.rooms selected_room
    on selected_room.id = placement.room_id
  where card.schedule_revision_id = p_schedule_revision_id;

  create temporary table m198_projection_groups (
    group_id uuid primary key,
    projection_session_ordinal integer not null,
    session_id uuid not null,
    card_id uuid not null,
    requirement_id uuid not null,
    class_group_id uuid not null,
    target public.schedule_group_target not null,
    subgroup text null
  ) on commit drop;

  insert into m198_projection_groups (
    group_id,
    projection_session_ordinal,
    session_id,
    card_id,
    requirement_id,
    class_group_id,
    target,
    subgroup
  )
  select
    gen_random_uuid(),
    session.projection_session_ordinal,
    session.session_id,
    session.card_id,
    session.requirement_id,
    member.class_group_id,
    member.target::public.schedule_group_target,
    member.subgroup
  from m198_projection_sessions session
  join lateral public.management_requirement_public_members(
    session.requirement_id
  ) member
    on true;

  select count(*)
  into v_projection_session_count
  from m198_projection_sessions;

  select count(*)
  into v_projection_group_count
  from m198_projection_groups;

  if v_projection_session_count <>
     (v_projection_preview ->> 'sessionCount')::integer then
    raise exception
      'M19.8 projection session count changed after preview';
  end if;

  if v_projection_group_count <>
     (v_projection_preview ->> 'groupCount')::integer then
    raise exception
      'M19.8 projection group count changed after preview';
  end if;

  select md5(
    coalesce(
      string_agg(
        jsonb_build_object(
          'ordinal', session.projection_session_ordinal,
          'cardId', session.card_id,
          'requirementId', session.requirement_id,
          'dayOfWeek', session.day_of_week,
          'startTime', session.start_time,
          'endTime', session.end_time,
          'sessionType', session.session_type::text,
          'subjectId', session.subject_id,
          'teacherId', session.teacher_id,
          'roomId', session.room_id,
          'notes', session.notes
        )::text,
        '|'
        order by session.projection_session_ordinal
      ),
      ''
    )
  )
  into v_built_session_hash
  from m198_projection_sessions session;

  select md5(
    coalesce(
      string_agg(
        jsonb_build_object(
          'sessionOrdinal', member.projection_session_ordinal,
          'classGroupId', member.class_group_id,
          'target', member.target::text,
          'subgroup', member.subgroup
        )::text,
        '|'
        order by
          member.projection_session_ordinal,
          member.class_group_id,
          member.target,
          member.subgroup nulls first
      ),
      ''
    )
  )
  into v_built_group_hash
  from m198_projection_groups member;

  if v_built_session_hash is distinct from v_preview_session_hash then
    raise exception
      'M19.8 session projection semantic hash mismatch';
  end if;

  if v_built_group_hash is distinct from v_preview_group_hash then
    raise exception
      'M19.8 group projection semantic hash mismatch';
  end if;

  -- Capture the exact public baseline before mutation.
  select count(*)
  into v_before_session_count
  from public.schedule_sessions
  where academic_year = v_revision.academic_year;

  select count(*)
  into v_before_group_count
  from public.session_groups group_row
  join public.schedule_sessions session_row
    on session_row.id = group_row.session_id
  where session_row.academic_year = v_revision.academic_year;

  v_before_sessions_hash :=
    public.management_public_sessions_hash(
      v_revision.academic_year
    );

  v_before_groups_hash :=
    public.management_public_groups_hash(
      v_revision.academic_year
    );

  -- The gate already checked the latest durable baseline, but reassert it
  -- inside the locked transaction immediately before replacement.
  if not coalesce(
    (
      public.management_publication_baseline_status(
        v_revision.academic_year
      )
      ->> 'healthy'
    )::boolean,
    false
  ) then
    raise exception 'M19.8 public baseline drifted before apply';
  end if;

  -- Materialize draft-only resource display names at the publication boundary.
  select count(*)
  into v_teacher_name_count
  from public.management_teacher_name_overrides name_override
  where name_override.schedule_revision_id =
    p_schedule_revision_id;

  select count(*)
  into v_room_name_count
  from public.management_room_name_overrides name_override
  where name_override.schedule_revision_id =
    p_schedule_revision_id;

  update public.teachers teacher
  set name = name_override.display_name
  from public.management_teacher_name_overrides name_override
  where name_override.schedule_revision_id =
      p_schedule_revision_id
    and name_override.teacher_id = teacher.id;

  update public.rooms room
  set name = name_override.display_name
  from public.management_room_name_overrides name_override
  where name_override.schedule_revision_id =
      p_schedule_revision_id
    and name_override.room_id = room.id
    and room.canonical_room_id is null;

  -- Replace only the target academic-year public projection. session_groups
  -- rows cascade from schedule_sessions.
  delete from public.schedule_sessions
  where academic_year = v_revision.academic_year;

  insert into public.schedule_sessions (
    id,
    academic_year,
    day_of_week,
    start_time,
    end_time,
    subject_id,
    teacher_id,
    room_id,
    session_type,
    notes
  )
  select
    session.session_id,
    session.academic_year,
    session.day_of_week,
    session.start_time,
    session.end_time,
    session.subject_id,
    session.teacher_id,
    session.room_id,
    session.session_type,
    session.notes
  from m198_projection_sessions session
  order by session.projection_session_ordinal;

  -- Keep the legacy student-group overlap trigger ENABLED. It acts as a
  -- publication invariant and validates every inserted audience row.
  insert into public.session_groups (
    id,
    session_id,
    class_group_id,
    target,
    subgroup
  )
  select
    member.group_id,
    member.session_id,
    member.class_group_id,
    member.target,
    member.subgroup
  from m198_projection_groups member
  order by
    member.projection_session_ordinal,
    member.class_group_id,
    member.target,
    member.subgroup nulls first;

  select count(*)
  into v_after_session_count
  from public.schedule_sessions
  where academic_year = v_revision.academic_year;

  select count(*)
  into v_after_group_count
  from public.session_groups group_row
  join public.schedule_sessions session_row
    on session_row.id = group_row.session_id
  where session_row.academic_year = v_revision.academic_year;

  if v_after_session_count <> v_projection_session_count
     or v_after_group_count <> v_projection_group_count then
    raise exception
      'M19.8 applied projection count mismatch: sessions %/%, groups %/%',
      v_after_session_count,
      v_projection_session_count,
      v_after_group_count,
      v_projection_group_count;
  end if;

  v_after_sessions_hash :=
    public.management_public_sessions_hash(
      v_revision.academic_year
    );

  v_after_groups_hash :=
    public.management_public_groups_hash(
      v_revision.academic_year
    );

  select coalesce(max(publication.publication_number), 0) + 1
  into v_publication_number
  from public.management_publications publication
  where publication.academic_year =
    v_revision.academic_year;

  insert into public.management_publications (
    id,
    schedule_revision_id,
    requirement_set_id,
    academic_year,
    publication_number,
    state_token,
    readiness,
    before_session_count,
    before_group_count,
    after_session_count,
    after_group_count,
    before_sessions_hash,
    before_groups_hash,
    after_sessions_hash,
    after_groups_hash,
    published_by,
    published_at
  )
  values (
    v_publication_id,
    p_schedule_revision_id,
    v_revision.requirement_set_id,
    v_revision.academic_year,
    v_publication_number,
    v_current_token,
    jsonb_build_object(
      'gate', v_gate,
      'projection', jsonb_build_object(
        'sessionCount', v_projection_session_count,
        'groupCount', v_projection_group_count,
        'sessionProjectionHash', v_built_session_hash,
        'groupProjectionHash', v_built_group_hash
      ),
      'writeContractChecks',
        v_write_contract -> 'checks',
      'resourceNames', jsonb_build_object(
        'teacherNameOverrideCount', v_teacher_name_count,
        'roomNameOverrideCount', v_room_name_count
      )
    ),
    v_before_session_count,
    v_before_group_count,
    v_after_session_count,
    v_after_group_count,
    v_before_sessions_hash,
    v_before_groups_hash,
    v_after_sessions_hash,
    v_after_groups_hash,
    v_actor,
    v_now
  );

  insert into public.management_publication_sessions (
    publication_id,
    requirement_id,
    session_id,
    card_id,
    unit_index,
    evidence
  )
  select
    v_publication_id,
    session.requirement_id,
    session.session_id,
    session.card_id,
    session.unit_index,
    jsonb_build_object(
      'block_index', session.block_index,
      'academic_year', session.academic_year,
      'day_of_week', session.day_of_week,
      'start_time', session.start_time,
      'end_time', session.end_time,
      'session_type', session.session_type,
      'subject_id', session.subject_id,
      'teacher_id', session.teacher_id,
      'room_id', session.room_id
    )
  from m198_projection_sessions session;

  -- Archive any previously published management version for the same term.
  update public.schedule_revisions previous_revision
  set status = 'ARCHIVED'
  where previous_revision.requirement_set_id in (
    select previous_set.id
    from public.requirement_sets previous_set
    where previous_set.academic_year =
        v_revision.academic_year
      and previous_set.term = v_revision.term
      and previous_set.status = 'PUBLISHED'
      and previous_set.id <>
        v_revision.requirement_set_id
  )
    and previous_revision.status = 'PUBLISHED';

  update public.requirement_sets previous_set
  set status = 'ARCHIVED'
  where previous_set.academic_year =
      v_revision.academic_year
    and previous_set.term = v_revision.term
    and previous_set.status = 'PUBLISHED'
    and previous_set.id <>
      v_revision.requirement_set_id;

  update public.requirement_sets
  set
    status = 'PUBLISHED',
    published_at = v_now
  where id = v_revision.requirement_set_id;

  update public.schedule_revisions
  set
    status = 'PUBLISHED',
    published_at = v_now,
    validation_summary =
      coalesce(validation_summary, '{}'::jsonb)
      || jsonb_build_object(
        'm19_8_publication', 'PASS',
        'publication_id', v_publication_id,
        'publication_number', v_publication_number,
        'published_session_count', v_after_session_count,
        'published_group_count', v_after_group_count
      )
  where id = p_schedule_revision_id;

  -- Create a new editable requirement-set version.
  select coalesce(max(requirement_set.version_number), 0) + 1
  into v_next_requirement_set_version
  from public.requirement_sets requirement_set
  where requirement_set.academic_year =
      v_revision.academic_year
    and requirement_set.term = v_revision.term;

  select coalesce(max(revision.version_number), 0) + 1
  into v_next_revision_version
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where requirement_set.academic_year =
      v_revision.academic_year
    and requirement_set.term = v_revision.term;

  insert into public.requirement_sets (
    id,
    academic_year,
    term,
    version_number,
    status,
    parent_id
  )
  values (
    v_next_requirement_set_id,
    v_revision.academic_year,
    v_revision.term,
    v_next_requirement_set_version,
    'DRAFT',
    v_revision.requirement_set_id
  );

  -- Old -> new instructional-group IDs.
  drop table if exists pg_temp.m198_group_map;

  create temporary table m198_group_map (
    old_id uuid primary key,
    new_id uuid not null unique
  ) on commit drop;

  insert into m198_group_map (old_id, new_id)
  select
    instructional_group.id,
    gen_random_uuid()
  from public.instructional_groups instructional_group
  where instructional_group.requirement_set_id =
    v_revision.requirement_set_id;

  insert into public.instructional_groups (
    id,
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
    mapping.new_id,
    v_next_requirement_set_id,
    source_group.class_group_id,
    source_group.name,
    source_group.group_type,
    source_group.term_status,
    source_group.knowledge_status,
    source_group.audience_target,
    source_group.subgroup_label
  from m198_group_map mapping
  join public.instructional_groups source_group
    on source_group.id = mapping.old_id;

  insert into public.instructional_group_relations (
    left_group_id,
    right_group_id,
    relation
  )
  select
    left_mapping.new_id,
    right_mapping.new_id,
    relation.relation
  from public.instructional_group_relations relation
  join m198_group_map left_mapping
    on left_mapping.old_id = relation.left_group_id
  join m198_group_map right_mapping
    on right_mapping.old_id = relation.right_group_id;

  -- Old -> new course-requirement IDs.
  drop table if exists pg_temp.m198_requirement_map;

  create temporary table m198_requirement_map (
    old_id uuid primary key,
    new_id uuid not null unique
  ) on commit drop;

  insert into m198_requirement_map (old_id, new_id)
  select
    requirement.id,
    gen_random_uuid()
  from public.course_requirements requirement
  where requirement.requirement_set_id =
    v_revision.requirement_set_id;

  insert into public.course_requirements (
    id,
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
  select
    requirement_mapping.new_id,
    v_next_requirement_set_id,
    source_requirement.subject_id,
    group_mapping.new_id,
    source_requirement.weekly_load,
    source_requirement.preferred_partition,
    source_requirement.allowed_partitions,
    source_requirement.min_distinct_days,
    source_requirement.max_blocks_per_day,
    source_requirement.max_consecutive_periods,
    source_requirement.course_character,
    source_requirement.term_status,
    source_requirement.knowledge_status,
    source_requirement.teacher_mode,
    source_requirement.resource_mode,
    source_requirement.required_capability,
    source_requirement.delivery_mode
  from m198_requirement_map requirement_mapping
  join public.course_requirements source_requirement
    on source_requirement.id = requirement_mapping.old_id
  join m198_group_map group_mapping
    on group_mapping.old_id =
      source_requirement.instructional_group_id;

  insert into public.course_requirement_teachers (
    requirement_id,
    teacher_id,
    knowledge_status
  )
  select
    requirement_mapping.new_id,
    assignment.teacher_id,
    assignment.knowledge_status
  from public.course_requirement_teachers assignment
  join m198_requirement_map requirement_mapping
    on requirement_mapping.old_id =
      assignment.requirement_id;

  insert into public.course_requirement_rooms (
    requirement_id,
    room_id,
    knowledge_status
  )
  select
    requirement_mapping.new_id,
    assignment.room_id,
    assignment.knowledge_status
  from public.course_requirement_rooms assignment
  join m198_requirement_map requirement_mapping
    on requirement_mapping.old_id =
      assignment.requirement_id;

  insert into public.management_requirement_lineage (
    child_requirement_id,
    parent_requirement_id,
    publication_id
  )
  select
    requirement_mapping.new_id,
    requirement_mapping.old_id,
    v_publication_id
  from m198_requirement_map requirement_mapping;

  insert into public.schedule_revisions (
    id,
    requirement_set_id,
    version_number,
    status,
    base_revision_id,
    validation_summary
  )
  values (
    v_next_revision_id,
    v_next_requirement_set_id,
    v_next_revision_version,
    'DRAFT',
    p_schedule_revision_id,
    jsonb_build_object(
      'phase', 'M19.8',
      'cloned_from_publication_id', v_publication_id,
      'cloned_from_revision_id', p_schedule_revision_id,
      'move_history', 'RESET',
      'candidate_domain', 'REBUILD_PENDING',
      'resource_name_overrides', 'RESET_TO_PUBLISHED_BASE'
    )
  );

  -- Old -> new schedule-card IDs.
  drop table if exists pg_temp.m198_card_map;

  create temporary table m198_card_map (
    old_id uuid primary key,
    new_id uuid not null unique
  ) on commit drop;

  insert into m198_card_map (old_id, new_id)
  select
    card.id,
    gen_random_uuid()
  from public.schedule_cards card
  where card.schedule_revision_id =
    p_schedule_revision_id;

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
    card_mapping.new_id,
    v_next_revision_id,
    requirement_mapping.new_id,
    source_card.block_index,
    source_card.duration_periods,
    source_card.locked,
    source_card.publication_end_time_override
  from m198_card_map card_mapping
  join public.schedule_cards source_card
    on source_card.id = card_mapping.old_id
  join m198_requirement_map requirement_mapping
    on requirement_mapping.old_id =
      source_card.requirement_id;

  insert into public.placements (
    id,
    card_id,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    move_transaction_id
  )
  select
    gen_random_uuid(),
    card_mapping.new_id,
    source_placement.day_of_week,
    source_placement.start_period,
    source_placement.teacher_id,
    source_placement.room_id,
    null
  from public.placements source_placement
  join m198_card_map card_mapping
    on card_mapping.old_id =
      source_placement.card_id;

  -- Candidate-domain state is derived and must be rebuilt for the new IDs.
  perform public.refresh_management_candidate_domain(
    v_next_revision_id
  );

  update public.schedule_revisions
  set validation_summary =
    coalesce(validation_summary, '{}'::jsonb)
    || jsonb_build_object(
      'candidate_domain', 'REBUILT',
      'publication_session_count', v_after_session_count,
      'publication_group_count', v_after_group_count
    )
  where id = v_next_revision_id;

  -- Switch frontend projection behavior in the SAME transaction as the public
  -- row replacement. Clients use this metadata to stop applying the legacy
  -- scheduleAdjustments.ts compatibility layer.
  update public.schedule_projection_metadata
  set
    projection_version = projection_version + 1,
    runtime_adjustments_required = false,
    published_at = v_now,
    updated_at = v_now
  where academic_year = v_revision.academic_year
  returning projection_version
  into v_projection_version;

  update public.management_publication_controls
  set
    runtime_adjustments_reconciled = true,
    note = 'M19.8 managed publication active: runtime schedule overlays are materialized in the public projection.',
    updated_at = v_now,
    updated_by = v_actor
  where academic_year = v_revision.academic_year;

  if not coalesce(
    (
      public.management_publication_baseline_status(
        v_revision.academic_year
      )
      ->> 'healthy'
    )::boolean,
    false
  ) then
    raise exception
      'M19.8 post-publication baseline verification failed';
  end if;

  return jsonb_build_object(
    'published', true,
    'publicationId', v_publication_id,
    'publicationNumber', v_publication_number,
    'publishedRevisionId', p_schedule_revision_id,
    'publishedRequirementSetId',
      v_revision.requirement_set_id,
    'nextDraftRevisionId', v_next_revision_id,
    'nextDraftRequirementSetId',
      v_next_requirement_set_id,
    'nextRequirementSetVersion',
      v_next_requirement_set_version,
    'nextRevisionVersion', v_next_revision_version,
    'sessionCount', v_after_session_count,
    'groupCount', v_after_group_count,
    'sessionProjectionHash', v_built_session_hash,
    'groupProjectionHash', v_built_group_hash,
    'teacherNamesApplied', v_teacher_name_count,
    'roomNamesApplied', v_room_name_count,
    'projectionVersion', v_projection_version,
    'runtimeAdjustmentsRequired', false
  );
end
$$;

-- Deliberately locked in M19.8. Do NOT grant authenticated EXECUTE yet.
revoke all
  on function public.management_apply_publication(uuid, text)
  from public, anon, authenticated;

comment on function public.management_apply_publication(uuid, text) is
  'M19.8 LOCKED atomic publication engine. Performs guarded public replacement + audit + next-DRAFT clone, but has no authenticated EXECUTE grant until M19.9 continuity validation is complete.';


-- -------------------------------------------------------------------------
-- MIGRATION INVARIANTS
-- -------------------------------------------------------------------------
-- Merely installing the locked engine must not change production data.

do $$
declare
  v_sessions integer;
  v_groups integer;
  v_publication_count integer;
  v_lineage_count integer;
  v_runtime_required boolean;
begin
  select count(*)
  into v_sessions
  from public.schedule_sessions
  where academic_year = '2026-2027';

  select count(*)
  into v_groups
  from public.session_groups group_row
  join public.schedule_sessions session_row
    on session_row.id = group_row.session_id
  where session_row.academic_year = '2026-2027';

  select count(*)
  into v_publication_count
  from public.management_publications;

  select count(*)
  into v_lineage_count
  from public.management_requirement_lineage;

  select runtime_adjustments_required
  into v_runtime_required
  from public.schedule_projection_metadata
  where academic_year = '2026-2027';

  if v_sessions <> 517 or v_groups <> 609 then
    raise exception
      'M19.8 installation modified public projection: sessions %, groups %',
      v_sessions,
      v_groups;
  end if;

  if v_publication_count <> 0 then
    raise exception
      'M19.8 installation must not create publication audit rows';
  end if;

  if v_lineage_count <> 0 then
    raise exception
      'M19.8 installation must not create requirement lineage rows';
  end if;

  if v_runtime_required is distinct from true then
    raise exception
      'M19.8 installation must not disable runtime adjustments';
  end if;
end
$$;

commit;
