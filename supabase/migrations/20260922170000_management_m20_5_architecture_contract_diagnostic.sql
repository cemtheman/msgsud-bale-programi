-- Management / M20.5
-- Architecture contract diagnostic before term lifecycle, provisional resources,
-- curriculum compliance, and historical recovery v2.
--
-- SAFETY:
--   * read-only diagnostic only
--   * does not invoke M20.3
--   * does not refresh candidate domains
--   * does not mutate requirements, resources, cards, placements, public rows
--   * does not publish or unlock publication
--
-- Product contracts being measured:
--   1. A schedule belongs to academic_year + term.
--   2. UNKNOWN resource identity is not the same as unavailable resource.
--   3. Curriculum compliance is independent from resource completeness.
--   4. Published terms must be preservable and reusable as future templates.

begin;

create or replace function public.management_diagnose_architecture_contract(
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
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M20.5 management VIEWER role required'
      using errcode = '42501';
  end if;

  select
    revision.id,
    revision.requirement_set_id,
    revision.version_number as revision_version,
    revision.status as revision_status,
    revision.base_revision_id,
    requirement_set.academic_year,
    requirement_set.term,
    requirement_set.version_number as requirement_set_version,
    requirement_set.status as requirement_set_status,
    requirement_set.parent_id
  into v_revision
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_schedule_revision_id;

  if not found then
    raise exception 'M20.5 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision.revision_status <> 'DRAFT'
     or v_revision.requirement_set_status <> 'DRAFT' then
    raise exception
      'M20.5 diagnostic requires a DRAFT revision on a DRAFT requirement set';
  end if;

  with
  scoped_requirements as (
    select
      requirement.id,
      requirement.subject_id,
      requirement.instructional_group_id,
      requirement.weekly_load,
      requirement.teacher_mode,
      requirement.resource_mode,
      requirement.required_capability,
      subject.name as subject_name,
      instructional_group.name as group_name,
      instructional_group.class_group_id
    from public.course_requirements requirement
    join public.subjects subject
      on subject.id = requirement.subject_id
    join public.instructional_groups instructional_group
      on instructional_group.id = requirement.instructional_group_id
    where requirement.requirement_set_id = v_revision.requirement_set_id
  ),
  requirement_resource as (
    select
      requirement.*,
      (
        select count(*)::integer
        from public.course_requirement_teachers teacher_link
        where teacher_link.requirement_id = requirement.id
      ) as teacher_assignment_count,
      (
        select count(*)::integer
        from public.course_requirement_rooms room_link
        where room_link.requirement_id = requirement.id
      ) as room_assignment_count
    from scoped_requirements requirement
  ),
  card_state as (
    select
      card.id as card_id,
      card.requirement_id,
      placement.id is not null as placed,
      placement.teacher_id,
      placement.room_id,
      summary.domain_status,
      coalesce(summary.unresolved_count, 0) as unresolved_count,
      coalesce(summary.is_contradiction, false) as is_contradiction
    from public.schedule_cards card
    left join public.placements placement
      on placement.card_id = card.id
    left join public.schedule_card_domain_summaries summary
      on summary.card_id = card.id
    where card.schedule_revision_id = p_schedule_revision_id
  ),
  source_state as (
    select
      evidence.requirement_id,
      count(*)::integer as source_session_count,
      count(*) filter (
        where session_row.teacher_id is null
      )::integer as source_teacher_null_count,
      count(*) filter (
        where session_row.room_id is null
      )::integer as source_room_null_count
    from public.course_requirement_source_sessions evidence
    join scoped_requirements requirement
      on requirement.id = evidence.requirement_id
    left join public.schedule_sessions session_row
      on session_row.id = evidence.source_session_id
     and session_row.academic_year = v_revision.academic_year
    group by evidence.requirement_id
  ),
  resource_summary as (
    select
      count(*)::integer as requirement_count,
      count(*) filter (
        where teacher_mode = 'UNKNOWN'
      )::integer as teacher_unknown_requirement_count,
      count(*) filter (
        where teacher_mode = 'UNKNOWN'
          and teacher_assignment_count = 0
      )::integer as teacher_unknown_without_assignment_count,
      count(*) filter (
        where resource_mode = 'UNKNOWN'
      )::integer as room_unknown_requirement_count,
      count(*) filter (
        where resource_mode = 'UNKNOWN'
          and room_assignment_count = 0
      )::integer as room_unknown_without_assignment_count,
      count(*) filter (
        where resource_mode = 'CAPABILITY'
      )::integer as room_capability_requirement_count,
      count(*) filter (
        where resource_mode = 'CAPABILITY'
          and required_capability is not null
      )::integer as room_capability_declared_count
    from requirement_resource
  ),
  card_summary as (
    select
      count(*)::integer as total_cards,
      count(*) filter (where placed)::integer as placed_cards,
      count(*) filter (where not placed)::integer as unplaced_cards,
      count(*) filter (
        where placed and teacher_id is null
      )::integer as placed_teacher_null_cards,
      count(*) filter (
        where placed and room_id is null
      )::integer as placed_room_null_cards,
      count(*) filter (
        where unresolved_count > 0
      )::integer as unresolved_cards,
      count(*) filter (
        where is_contradiction
      )::integer as contradiction_cards
    from card_state
  ),
  source_summary as (
    select
      coalesce(sum(source_session_count), 0)::integer as source_sessions,
      coalesce(sum(source_teacher_null_count), 0)::integer
        as source_teacher_null_sessions,
      coalesce(sum(source_room_null_count), 0)::integer
        as source_room_null_sessions,
      count(*) filter (
        where source_teacher_null_count > 0
      )::integer as requirements_with_source_teacher_null,
      count(*) filter (
        where source_room_null_count > 0
      )::integer as requirements_with_source_room_null
    from source_state
  ),
  lifecycle_summary as (
    select
      count(*) filter (
        where requirement_set.academic_year = v_revision.academic_year
          and requirement_set.term = v_revision.term
      )::integer as same_term_requirement_set_versions,
      count(*) filter (
        where requirement_set.academic_year = v_revision.academic_year
          and requirement_set.term = v_revision.term
          and requirement_set.status = 'DRAFT'
      )::integer as same_term_draft_sets,
      count(*) filter (
        where requirement_set.academic_year = v_revision.academic_year
          and requirement_set.term = v_revision.term
          and requirement_set.status = 'PUBLISHED'
      )::integer as same_term_published_sets,
      count(*) filter (
        where requirement_set.academic_year = v_revision.academic_year
          and requirement_set.term = v_revision.term
          and requirement_set.status = 'ARCHIVED'
      )::integer as same_term_archived_sets,
      count(*) filter (
        where requirement_set.academic_year = v_revision.academic_year
          and requirement_set.term <> v_revision.term
      )::integer as other_term_sets_same_year,
      count(*) filter (
        where requirement_set.parent_id is not null
      )::integer as requirement_sets_with_parent
    from public.requirement_sets requirement_set
  ),
  schema_capabilities as (
    select
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'schedule_sessions'
          and column_name = 'term'
      ) as public_sessions_have_term,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'schedule_projection_metadata'
          and column_name = 'term'
      ) as projection_metadata_has_term,
      exists (
        select 1 from information_schema.tables
        where table_schema = 'public'
          and table_name in (
            'curriculum_rule_sets',
            'curriculum_rules',
            'curriculum_requirements'
          )
      ) as curriculum_rule_table_present,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'placements'
          and column_name in (
            'teacher_resolution_status',
            'teacher_assignment_status',
            'teacher_is_provisional'
          )
      ) as placement_teacher_provisional_field_present,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'placements'
          and column_name in (
            'room_resolution_status',
            'room_assignment_status',
            'room_is_provisional'
          )
      ) as placement_room_provisional_field_present
  )
  select jsonb_build_object(
    'revisionId', p_schedule_revision_id,
    'academicYear', v_revision.academic_year,
    'term', v_revision.term,
    'revisionVersion', v_revision.revision_version,
    'requirementSetVersion', v_revision.requirement_set_version,
    'diagnosticOnly', true,
    'mutationPerformed', false,

    'termLifecycle', jsonb_build_object(
      'identityAlreadyModeledByRequirementSet', true,
      'requirementSetParentId', v_revision.parent_id,
      'scheduleBaseRevisionId', v_revision.base_revision_id,
      'sameTermRequirementSetVersions',
        lifecycle.same_term_requirement_set_versions,
      'sameTermDraftSets', lifecycle.same_term_draft_sets,
      'sameTermPublishedSets', lifecycle.same_term_published_sets,
      'sameTermArchivedSets', lifecycle.same_term_archived_sets,
      'otherTermSetsSameAcademicYear',
        lifecycle.other_term_sets_same_year,
      'requirementSetsWithParent',
        lifecycle.requirement_sets_with_parent,
      'publicSessionsHaveTerm',
        schema.public_sessions_have_term,
      'projectionMetadataHasTerm',
        schema.projection_metadata_has_term,
      'termProjectionGap',
        not schema.public_sessions_have_term
        or not schema.projection_metadata_has_term
    ),

    'provisionalResources', jsonb_build_object(
      'requirementCount', resource.requirement_count,
      'teacherUnknownRequirementCount',
        resource.teacher_unknown_requirement_count,
      'teacherUnknownWithoutAssignmentCount',
        resource.teacher_unknown_without_assignment_count,
      'roomUnknownRequirementCount',
        resource.room_unknown_requirement_count,
      'roomUnknownWithoutAssignmentCount',
        resource.room_unknown_without_assignment_count,
      'roomCapabilityRequirementCount',
        resource.room_capability_requirement_count,
      'roomCapabilityDeclaredCount',
        resource.room_capability_declared_count,
      'placedTeacherNullCardCount',
        cards.placed_teacher_null_cards,
      'placedRoomNullCardCount',
        cards.placed_room_null_cards,
      'unresolvedCardCount', cards.unresolved_cards,
      'contradictionCardCount', cards.contradiction_cards,
      'sourceTeacherNullSessionCount',
        source.source_teacher_null_sessions,
      'sourceRoomNullSessionCount',
        source.source_room_null_sessions,
      'requirementsWithSourceTeacherNull',
        source.requirements_with_source_teacher_null,
      'requirementsWithSourceRoomNull',
        source.requirements_with_source_room_null,
      'placementTeacherProvisionalFieldPresent',
        schema.placement_teacher_provisional_field_present,
      'placementRoomProvisionalFieldPresent',
        schema.placement_room_provisional_field_present,
      'currentEngineTreatsUnknownAsSchedulable', false,
      'targetContract',
        'UNKNOWN_IDENTITY_IS_SCHEDULABLE_BUT_UNAVAILABLE_RESOURCE_IS_BLOCKING'
    ),

    'curriculumCompliance', jsonb_build_object(
      'curriculumRuleTablePresent',
        schema.curriculum_rule_table_present,
      'requirementRowsAvailableForComparison',
        resource.requirement_count,
      'currentRuleEngineReady', false,
      'targetContract',
        'VERSIONED_RULE_SET_COMPARE_REQUIRED_WEEKLY_LOAD_TO_TERM_REQUIREMENTS'
    ),

    'draft', jsonb_build_object(
      'totalCards', cards.total_cards,
      'placedCards', cards.placed_cards,
      'unplacedCards', cards.unplaced_cards
    ),

    'recommendedSequence', jsonb_build_array(
      'M21_TERM_AND_SCHEDULE_LIFECYCLE',
      'M22_PROVISIONAL_RESOURCE_SEMANTICS',
      'M23_CURRICULUM_COMPLIANCE',
      'M24_HISTORICAL_RECOVERY_V2'
    )
  )
  into v_result
  from resource_summary resource
  cross join card_summary cards
  cross join source_summary source
  cross join lifecycle_summary lifecycle
  cross join schema_capabilities schema;

  return v_result;
end
$$;

revoke all
  on function public.management_diagnose_architecture_contract(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_diagnose_architecture_contract(uuid)
  to authenticated;

comment on function public.management_diagnose_architecture_contract(uuid) is
  'M20.5 read-only architecture contract diagnostic. Measures term/public-projection gaps, provisional-resource pressure, and curriculum-rule readiness before M21-M24.';


-- Installing M20.5 must not change the accepted public baseline or unlock
-- publication.
do $$
declare
  v_sessions integer;
  v_groups integer;
  v_publications integer;
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
  into v_publications
  from public.management_publications;

  if v_sessions <> 517 or v_groups <> 609 then
    raise exception
      'M20.5 installation modified public projection: sessions %, groups %',
      v_sessions,
      v_groups;
  end if;

  if v_publications <> 0 then
    raise exception
      'M20.5 expected no managed publication before architecture transition';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M20.5 must not unlock the publication engine';
  end if;
end
$$;

commit;
