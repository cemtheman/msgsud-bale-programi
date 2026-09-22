-- Management / M20.4
-- Historical resource resolution diagnostic.
--
-- Purpose:
--   Quantify why M20.1 historical placement proposals fail current candidate
--   validation when the published source schedule has incomplete teacher/room
--   metadata.
--
-- Product rule:
--   Historical schedule evidence supplies TIME / SHAPE.
--   Current Ders Plani resource assignments remain authoritative when they are
--   explicitly and uniquely resolved.
--
-- Safety:
--   * diagnostic only; no schedule/resource/placement mutation
--   * does not invoke M20.3 alignment
--   * does not refresh candidate-domain rows
--   * does not publish or unlock publication
--   * exposes no apply endpoint

begin;

create or replace function public.management_diagnose_historical_resource_resolution(
  p_schedule_revision_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision record;
  v_result jsonb;
begin
  -- Direct database diagnostics may be run by the linked postgres role.
  -- API callers still require the normal management VIEWER gate.
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M20.4 management VIEWER role required'
      using errcode = '42501';
  end if;

  select
    revision.id,
    revision.requirement_set_id,
    revision.status as revision_status,
    requirement_set.academic_year,
    requirement_set.term,
    requirement_set.status as requirement_set_status
  into v_revision
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_schedule_revision_id;

  if not found then
    raise exception 'M20.4 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision.revision_status <> 'DRAFT'
     or v_revision.requirement_set_status <> 'DRAFT' then
    raise exception
      'M20.4 diagnostic requires a DRAFT revision on a DRAFT requirement set';
  end if;

  with
  scoped_requirements as (
    select
      requirement.id,
      requirement.subject_id,
      requirement.instructional_group_id,
      requirement.teacher_mode,
      requirement.resource_mode,
      requirement.required_capability,
      subject.name as subject_name,
      instructional_group.name as group_name
    from public.course_requirements requirement
    join public.subjects subject
      on subject.id = requirement.subject_id
    join public.instructional_groups instructional_group
      on instructional_group.id = requirement.instructional_group_id
    where requirement.requirement_set_id =
      v_revision.requirement_set_id
  ),
  source_rows as (
    select
      evidence.requirement_id,
      evidence.source_session_id,
      evidence.evidence,
      nullif(evidence.evidence ->> 'teacher_id', '')::uuid
        as evidence_teacher_id,
      nullif(evidence.evidence ->> 'room_id', '')::uuid
        as evidence_room_id,
      session_row.id is null as source_session_missing,
      session_row.teacher_id as live_teacher_id,
      session_row.room_id as live_room_raw_id,
      coalesce(
        live_room.canonical_room_id,
        session_row.room_id
      ) as live_room_id
    from public.course_requirement_source_sessions evidence
    join scoped_requirements requirement
      on requirement.id = evidence.requirement_id
    left join public.schedule_sessions session_row
      on session_row.id = evidence.source_session_id
     and session_row.academic_year = v_revision.academic_year
    left join public.rooms live_room
      on live_room.id = session_row.room_id
  ),
  teacher_assignment_stats as (
    select
      requirement.id as requirement_id,
      count(teacher_link.teacher_id)::integer as teacher_count,
      coalesce(
        array_agg(
          teacher_link.teacher_id
          order by teacher_link.teacher_id::text
        ) filter (where teacher_link.teacher_id is not null),
        array[]::uuid[]
      ) as teacher_ids,
      (
        array_agg(
          teacher_link.teacher_id
          order by teacher_link.teacher_id::text
        ) filter (where teacher_link.teacher_id is not null)
      )[1] as sole_teacher_id
    from scoped_requirements requirement
    left join public.course_requirement_teachers teacher_link
      on teacher_link.requirement_id = requirement.id
    group by requirement.id
  ),
  room_assignment_rows as (
    select
      requirement.id as requirement_id,
      room_link.room_id as selected_room_id,
      coalesce(
        selected_room.canonical_room_id,
        room_link.room_id
      ) as effective_room_id
    from scoped_requirements requirement
    left join public.course_requirement_rooms room_link
      on room_link.requirement_id = requirement.id
    left join public.rooms selected_room
      on selected_room.id = room_link.room_id
  ),
  room_assignment_stats as (
    select
      requirement_id,
      count(selected_room_id)::integer as selected_room_count,
      count(distinct effective_room_id) filter (
        where effective_room_id is not null
      )::integer as canonical_room_count,
      coalesce(
        array_agg(
          selected_room_id
          order by selected_room_id::text
        ) filter (where selected_room_id is not null),
        array[]::uuid[]
      ) as selected_room_ids,
      coalesce(
        array_agg(
          effective_room_id
          order by effective_room_id::text
        ) filter (where effective_room_id is not null),
        array[]::uuid[]
      ) as effective_room_ids,
      (
        array_agg(
          effective_room_id
          order by effective_room_id::text
        ) filter (where effective_room_id is not null)
      )[1] as sole_effective_room_id
    from room_assignment_rows
    group by requirement_id
  ),
  requirement_stats as (
    select
      requirement.id as requirement_id,
      requirement.subject_name,
      requirement.group_name,
      requirement.teacher_mode,
      requirement.resource_mode,
      requirement.required_capability,

      count(source.source_session_id)::integer as source_row_count,
      count(source.source_session_id) filter (
        where source.source_session_missing
      )::integer as missing_source_session_count,

      count(source.source_session_id) filter (
        where source.evidence_teacher_id is null
      )::integer as evidence_teacher_null_count,
      count(source.source_session_id) filter (
        where not source.source_session_missing
          and source.live_teacher_id is null
      )::integer as live_teacher_null_count,
      count(source.source_session_id) filter (
        where not source.source_session_missing
          and source.evidence_teacher_id is distinct from source.live_teacher_id
      )::integer as teacher_snapshot_mismatch_count,
      count(source.source_session_id) filter (
        where not source.source_session_missing
          and source.evidence_teacher_id is null
          and source.live_teacher_id is null
      )::integer as teacher_both_null_count,

      count(source.source_session_id) filter (
        where source.evidence_room_id is null
      )::integer as evidence_room_null_count,
      count(source.source_session_id) filter (
        where not source.source_session_missing
          and source.live_room_raw_id is null
      )::integer as live_room_null_count,
      count(source.source_session_id) filter (
        where not source.source_session_missing
          and source.evidence_room_id is distinct from source.live_room_raw_id
      )::integer as room_snapshot_mismatch_count,
      count(source.source_session_id) filter (
        where not source.source_session_missing
          and source.evidence_room_id is null
          and source.live_room_raw_id is null
      )::integer as room_both_null_count,

      coalesce(teacher_assignment.teacher_count, 0)
        as current_teacher_count,
      coalesce(
        teacher_assignment.teacher_ids,
        array[]::uuid[]
      ) as current_teacher_ids,
      teacher_assignment.sole_teacher_id,

      coalesce(room_assignment.selected_room_count, 0)
        as current_selected_room_count,
      coalesce(room_assignment.canonical_room_count, 0)
        as current_canonical_room_count,
      coalesce(
        room_assignment.selected_room_ids,
        array[]::uuid[]
      ) as current_selected_room_ids,
      coalesce(
        room_assignment.effective_room_ids,
        array[]::uuid[]
      ) as current_effective_room_ids,
      room_assignment.sole_effective_room_id,

      count(source.source_session_id) filter (
        where teacher_assignment.teacher_count = 1
          and (
            (
              source.evidence_teacher_id is not null
              and source.evidence_teacher_id
                <> teacher_assignment.sole_teacher_id
            )
            or (
              not source.source_session_missing
              and source.live_teacher_id is not null
              and source.live_teacher_id
                <> teacher_assignment.sole_teacher_id
            )
          )
      )::integer as current_teacher_historical_conflict_count,

      count(source.source_session_id) filter (
        where room_assignment.canonical_room_count = 1
          and (
            (
              source.evidence_room_id is not null
              and coalesce(
                evidence_room.canonical_room_id,
                source.evidence_room_id
              ) <> room_assignment.sole_effective_room_id
            )
            or (
              not source.source_session_missing
              and source.live_room_id is not null
              and source.live_room_id
                <> room_assignment.sole_effective_room_id
            )
          )
      )::integer as current_room_historical_conflict_count

    from scoped_requirements requirement
    left join source_rows source
      on source.requirement_id = requirement.id
    left join teacher_assignment_stats teacher_assignment
      on teacher_assignment.requirement_id = requirement.id
    left join room_assignment_stats room_assignment
      on room_assignment.requirement_id = requirement.id
    left join public.rooms evidence_room
      on evidence_room.id = source.evidence_room_id
    group by
      requirement.id,
      requirement.subject_name,
      requirement.group_name,
      requirement.teacher_mode,
      requirement.resource_mode,
      requirement.required_capability,
      teacher_assignment.teacher_count,
      teacher_assignment.teacher_ids,
      teacher_assignment.sole_teacher_id,
      room_assignment.selected_room_count,
      room_assignment.canonical_room_count,
      room_assignment.selected_room_ids,
      room_assignment.effective_room_ids,
      room_assignment.sole_effective_room_id
  ),
  classified as (
    select
      stats.*,

      (
        stats.live_teacher_null_count > 0
        and stats.missing_source_session_count = 0
        and stats.teacher_mode = 'FIXED'
        and stats.current_teacher_count = 1
        and stats.current_teacher_historical_conflict_count = 0
      ) as teacher_current_fixed_safe,

      case
        when stats.live_teacher_null_count = 0
          then 'NOT_AFFECTED'
        when stats.missing_source_session_count > 0
          then 'SOURCE_SESSION_MISSING'
        when stats.teacher_mode = 'FIXED'
          and stats.current_teacher_count = 1
          and stats.current_teacher_historical_conflict_count = 0
          then 'CURRENT_FIXED_UNIQUE_SAFE'
        when stats.teacher_mode = 'UNKNOWN'
          then 'CURRENT_UNKNOWN'
        when stats.current_teacher_count = 0
          then 'NO_CURRENT_ASSIGNMENT'
        when stats.current_teacher_count = 1
          then 'SINGLE_CURRENT_ASSIGNMENT_NOT_SAFE'
        else 'MULTIPLE_CURRENT_ASSIGNMENTS'
      end as teacher_resolution_class,

      (
        stats.live_room_null_count > 0
        and stats.missing_source_session_count = 0
        and stats.resource_mode = 'FIXED'
        and stats.current_canonical_room_count = 1
        and stats.current_room_historical_conflict_count = 0
      ) as room_current_fixed_safe,

      case
        when stats.live_room_null_count = 0
          then 'NOT_AFFECTED'
        when stats.missing_source_session_count > 0
          then 'SOURCE_SESSION_MISSING'
        when stats.resource_mode = 'FIXED'
          and stats.current_canonical_room_count = 1
          and stats.current_room_historical_conflict_count = 0
          then 'CURRENT_FIXED_UNIQUE_SAFE'
        when stats.resource_mode = 'CAPABILITY'
          then 'CURRENT_CAPABILITY'
        when stats.resource_mode = 'UNKNOWN'
          then 'CURRENT_UNKNOWN'
        when stats.current_canonical_room_count = 0
          then 'NO_CURRENT_ASSIGNMENT'
        when stats.current_canonical_room_count = 1
          then 'SINGLE_CURRENT_ASSIGNMENT_NOT_SAFE'
        else 'MULTIPLE_CURRENT_ASSIGNMENTS'
      end as room_resolution_class

    from requirement_stats stats
  ),
  affected as (
    select *
    from classified
    where live_teacher_null_count > 0
       or live_room_null_count > 0
       or missing_source_session_count > 0
  )
  select jsonb_build_object(
    'revisionId', p_schedule_revision_id,
    'academicYear', v_revision.academic_year,
    'term', v_revision.term,
    'diagnosticOnly', true,
    'applyEndpointPresent', false,

    'summary', jsonb_build_object(
      'sourceSessionRows',
        (select count(*) from source_rows),
      'distinctSourceSessions',
        (select count(distinct source_session_id) from source_rows),
      'sourceSessionsMissingFromPublic',
        (
          select count(*)
          from source_rows
          where source_session_missing
        ),

      'sourceRowsWithEvidenceTeacherNull',
        (
          select count(*)
          from source_rows
          where evidence_teacher_id is null
        ),
      'sourceRowsWithLiveTeacherNull',
        (
          select count(*)
          from source_rows
          where not source_session_missing
            and live_teacher_id is null
        ),
      'sourceRowsWithTeacherSnapshotMismatch',
        (
          select count(*)
          from source_rows
          where not source_session_missing
            and evidence_teacher_id is distinct from live_teacher_id
        ),
      'requirementsWithLiveTeacherNull',
        (
          select count(*)
          from classified
          where live_teacher_null_count > 0
        ),
      'historicalTeacherGenuinelyAbsentRequirements',
        (
          select count(*)
          from classified
          where source_row_count > 0
            and missing_source_session_count = 0
            and evidence_teacher_null_count = source_row_count
        ),
      'liveAndEvidenceTeacherBothNullRequirements',
        (
          select count(*)
          from classified
          where source_row_count > 0
            and missing_source_session_count = 0
            and teacher_both_null_count = source_row_count
        ),
      'teacherNullRequirementsFixed',
        (
          select count(*)
          from classified
          where live_teacher_null_count > 0
            and teacher_mode = 'FIXED'
        ),
      'teacherNullRequirementsEligiblePool',
        (
          select count(*)
          from classified
          where live_teacher_null_count > 0
            and teacher_mode = 'ELIGIBLE_POOL'
        ),
      'teacherNullRequirementsUnknown',
        (
          select count(*)
          from classified
          where live_teacher_null_count > 0
            and teacher_mode = 'UNKNOWN'
        ),
      'teacherNullRequirementsExactlyOneCurrentAssignment',
        (
          select count(*)
          from classified
          where live_teacher_null_count > 0
            and current_teacher_count = 1
        ),
      'teacherNullRequirementsSafeCurrentFixedResolution',
        (
          select count(*)
          from classified
          where teacher_current_fixed_safe
        ),

      'sourceRowsWithEvidenceRoomNull',
        (
          select count(*)
          from source_rows
          where evidence_room_id is null
        ),
      'sourceRowsWithLiveRoomNull',
        (
          select count(*)
          from source_rows
          where not source_session_missing
            and live_room_raw_id is null
        ),
      'sourceRowsWithRoomSnapshotMismatch',
        (
          select count(*)
          from source_rows
          where not source_session_missing
            and evidence_room_id is distinct from live_room_raw_id
        ),
      'requirementsWithLiveRoomNull',
        (
          select count(*)
          from classified
          where live_room_null_count > 0
        ),
      'roomNullRequirementsFixed',
        (
          select count(*)
          from classified
          where live_room_null_count > 0
            and resource_mode = 'FIXED'
        ),
      'roomNullRequirementsEligiblePool',
        (
          select count(*)
          from classified
          where live_room_null_count > 0
            and resource_mode = 'ELIGIBLE_POOL'
        ),
      'roomNullRequirementsCapability',
        (
          select count(*)
          from classified
          where live_room_null_count > 0
            and resource_mode = 'CAPABILITY'
        ),
      'roomNullRequirementsUnknown',
        (
          select count(*)
          from classified
          where live_room_null_count > 0
            and resource_mode = 'UNKNOWN'
        ),
      'roomNullRequirementsExactlyOneCurrentCanonicalRoom',
        (
          select count(*)
          from classified
          where live_room_null_count > 0
            and current_canonical_room_count = 1
        ),
      'roomNullRequirementsSafeCurrentFixedResolution',
        (
          select count(*)
          from classified
          where room_current_fixed_safe
        )
    ),

    'teacherResolutionClasses',
      coalesce(
        (
          select jsonb_object_agg(
            grouped.teacher_resolution_class,
            grouped.requirement_count
          )
          from (
            select
              teacher_resolution_class,
              count(*)::integer as requirement_count
            from classified
            where live_teacher_null_count > 0
            group by teacher_resolution_class
          ) grouped
        ),
        '{}'::jsonb
      ),

    'roomResolutionClasses',
      coalesce(
        (
          select jsonb_object_agg(
            grouped.room_resolution_class,
            grouped.requirement_count
          )
          from (
            select
              room_resolution_class,
              count(*)::integer as requirement_count
            from classified
            where live_room_null_count > 0
            group by room_resolution_class
          ) grouped
        ),
        '{}'::jsonb
      ),

    'affectedRequirements',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'requirementId', item.requirement_id,
              'subjectName', item.subject_name,
              'groupName', item.group_name,
              'sourceRowCount', item.source_row_count,
              'missingSourceSessionCount',
                item.missing_source_session_count,

              'teacherMode', item.teacher_mode,
              'evidenceTeacherNullCount',
                item.evidence_teacher_null_count,
              'liveTeacherNullCount',
                item.live_teacher_null_count,
              'teacherSnapshotMismatchCount',
                item.teacher_snapshot_mismatch_count,
              'currentTeacherCount',
                item.current_teacher_count,
              'currentTeacherIds',
                to_jsonb(item.current_teacher_ids),
              'currentTeacherHistoricalConflictCount',
                item.current_teacher_historical_conflict_count,
              'teacherResolutionClass',
                item.teacher_resolution_class,
              'teacherCurrentFixedSafe',
                item.teacher_current_fixed_safe,

              'resourceMode', item.resource_mode,
              'requiredCapability', item.required_capability,
              'evidenceRoomNullCount',
                item.evidence_room_null_count,
              'liveRoomNullCount',
                item.live_room_null_count,
              'roomSnapshotMismatchCount',
                item.room_snapshot_mismatch_count,
              'currentSelectedRoomCount',
                item.current_selected_room_count,
              'currentCanonicalRoomCount',
                item.current_canonical_room_count,
              'currentSelectedRoomIds',
                to_jsonb(item.current_selected_room_ids),
              'currentEffectiveRoomIds',
                to_jsonb(item.current_effective_room_ids),
              'currentRoomHistoricalConflictCount',
                item.current_room_historical_conflict_count,
              'roomResolutionClass',
                item.room_resolution_class,
              'roomCurrentFixedSafe',
                item.room_current_fixed_safe
            )
            order by
              case
                when item.live_teacher_null_count > 0 then 0
                else 1
              end,
              item.subject_name,
              item.group_name,
              item.requirement_id
          )
          from affected item
        ),
        '[]'::jsonb
      )
  )
  into v_result;

  return v_result;
end
$$;

revoke all
  on function public.management_diagnose_historical_resource_resolution(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_diagnose_historical_resource_resolution(uuid)
  to authenticated;

comment on function public.management_diagnose_historical_resource_resolution(uuid) is
  'M20.4 read-only diagnostic. Compares immutable M2.2 source evidence, the still-published source sessions, and current Ders Plani teacher/room authority. Identifies null historical resources that can be deterministically resolved by one current FIXED assignment without guessing.';

-- Installation must preserve the accepted public baseline and publication lock.
do $$
declare
  v_sessions integer;
  v_groups integer;
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

  if v_sessions <> 517 or v_groups <> 609 then
    raise exception
      'M20.4 installation modified or found unexpected public projection: sessions %, groups %',
      v_sessions,
      v_groups;
  end if;

  if exists (
    select 1
    from public.management_publications
  ) then
    raise exception
      'M20.4 expected no managed publication during historical recovery';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M20.4 must not unlock publication engine';
  end if;
end
$$;

commit;
