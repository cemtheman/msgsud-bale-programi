-- Management M32.3.6
-- Coordinated requirement-teacher reconciliation preview.
--
-- M32.3.5 previews one requirement at a time. That is intentionally local,
-- but local previews can report false conflicts when two REQUIREMENT+REQUIRED
-- courses need to swap/complement teachers at the same time.
--
-- M32.3.6 adds a read-only multi-requirement preview that evaluates the FINAL
-- proposed teacher state atomically. It does not apply anything yet.
--
-- Input JSON:
-- [
--   {"requirementId":"<uuid>","teacherId":"<uuid>"},
--   ...
-- ]
--
-- Guarantees:
--   * 1..24 distinct requirements
--   * all requirements belong to one DRAFT revision
--   * ACTIVE + teacher-bearing + REQUIREMENT/REQUIRED policy
--   * chosen teachers already belong to each requirement pool and are ACTIVE
--   * current day/start/room are preserved conceptually
--   * conflicts are evaluated against the FINAL coordinated teacher state
--   * locked changed cards block the plan
--   * no placement/candidate/publication mutation
--
-- SQL Editor may execute the preview as postgres for diagnostics. Authenticated
-- application callers still require management EDITOR.

begin;

create or replace function public.management_preview_coordinated_teacher_reconciliation(
  p_assignments jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_assignment_count integer;
  v_distinct_requirement_count integer;
  v_known_requirement_count integer;
  v_revision_count integer;
  v_revision_id uuid;
  v_invalid_policy_count integer;
  v_ineligible_count integer;
  v_inactive_teacher_count integer;
  v_locked_changed_count integer;
  v_changed_card_count integer;
  v_placed_card_count integer;
  v_unplaced_card_count integer;
  v_conflicts jsonb := '[]'::jsonb;
  v_assignment_summary jsonb := '[]'::jsonb;
  v_block_reasons text[] := array[]::text[];
  v_state_token text;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M32.3.6 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_assignments is null
     or jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'M32.3.6 assignments must be a JSON array';
  end if;

  v_assignment_count := jsonb_array_length(p_assignments);

  if v_assignment_count < 1 or v_assignment_count > 24 then
    raise exception 'M32.3.6 requires 1..24 requirement assignments';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_assignments) entry(value)
    where jsonb_typeof(entry.value) <> 'object'
      or nullif(entry.value ->> 'requirementId', '') is null
      or nullif(entry.value ->> 'teacherId', '') is null
  ) then
    raise exception 'M32.3.6 every assignment requires requirementId and teacherId';
  end if;

  select count(distinct input.requirement_id)
  into v_distinct_requirement_count
  from (
    select
      (entry.value ->> 'requirementId')::uuid as requirement_id
    from jsonb_array_elements(p_assignments) entry(value)
  ) input;

  if v_distinct_requirement_count <> v_assignment_count then
    raise exception 'M32.3.6 assignments contain duplicate requirement ids';
  end if;

  select
    count(*)::integer,
    count(distinct revision.id)::integer,
    min(revision.id)
  into
    v_known_requirement_count,
    v_revision_count,
    v_revision_id
  from (
    select
      (entry.value ->> 'requirementId')::uuid as requirement_id
    from jsonb_array_elements(p_assignments) entry(value)
  ) input
  join public.course_requirements requirement
    on requirement.id = input.requirement_id
  join public.schedule_revisions revision
    on revision.requirement_set_id = requirement.requirement_set_id
   and revision.status = 'DRAFT';

  if v_known_requirement_count <> v_assignment_count then
    raise exception 'M32.3.6 one or more requirements are unknown or outside a DRAFT revision';
  end if;

  if v_revision_count <> 1 or v_revision_id is null then
    raise exception 'M32.3.6 assignments must belong to one DRAFT revision';
  end if;

  select count(*)::integer
  into v_invalid_policy_count
  from (
    select
      (entry.value ->> 'requirementId')::uuid as requirement_id
    from jsonb_array_elements(p_assignments) entry(value)
  ) input
  join public.course_requirements requirement
    on requirement.id = input.requirement_id
  where requirement.term_status <> 'ACTIVE'
     or requirement.teacher_requirement not in ('REQUIRED', 'OPTIONAL')
     or requirement.teacher_assignment_scope <> 'REQUIREMENT'
     or requirement.teacher_continuity <> 'REQUIRED';

  if v_invalid_policy_count > 0 then
    v_block_reasons := array_append(
      v_block_reasons,
      'POLICY_NOT_REQUIREMENT_REQUIRED'
    );
  end if;

  select count(*)::integer
  into v_ineligible_count
  from (
    select
      (entry.value ->> 'requirementId')::uuid as requirement_id,
      (entry.value ->> 'teacherId')::uuid as teacher_id
    from jsonb_array_elements(p_assignments) entry(value)
  ) input
  where not exists (
    select 1
    from public.course_requirement_teachers assignment
    where assignment.requirement_id = input.requirement_id
      and assignment.teacher_id = input.teacher_id
  );

  if v_ineligible_count > 0 then
    v_block_reasons := array_append(
      v_block_reasons,
      'TEACHER_NOT_ELIGIBLE'
    );
  end if;

  select count(*)::integer
  into v_inactive_teacher_count
  from (
    select distinct
      (entry.value ->> 'teacherId')::uuid as teacher_id
    from jsonb_array_elements(p_assignments) entry(value)
  ) input
  left join public.teachers teacher
    on teacher.id = input.teacher_id
  where teacher.id is null
     or teacher.operational_status <> 'ACTIVE';

  if v_inactive_teacher_count > 0 then
    v_block_reasons := array_append(
      v_block_reasons,
      'RESOURCE_INACTIVE'
    );
  end if;

  with plan as materialized (
    select
      (entry.value ->> 'requirementId')::uuid as requirement_id,
      (entry.value ->> 'teacherId')::uuid as teacher_id
    from jsonb_array_elements(p_assignments) entry(value)
  ),
  target_cards as materialized (
    select
      card.id as card_id,
      card.requirement_id,
      card.block_index,
      card.duration_periods,
      card.locked,
      placement.id as placement_id,
      placement.day_of_week,
      placement.start_period,
      placement.teacher_id as current_teacher_id,
      placement.room_id,
      plan.teacher_id as proposed_teacher_id,
      (
        placement.id is not null
        and placement.teacher_id is distinct from plan.teacher_id
      ) as will_change
    from plan
    join public.schedule_cards card
      on card.requirement_id = plan.requirement_id
     and card.schedule_revision_id = v_revision_id
    left join public.placements placement
      on placement.card_id = card.id
  )
  select
    count(*) filter (where placement_id is not null)::integer,
    count(*) filter (where placement_id is null)::integer,
    count(*) filter (where will_change)::integer,
    count(*) filter (where will_change and locked)::integer
  into
    v_placed_card_count,
    v_unplaced_card_count,
    v_changed_card_count,
    v_locked_changed_count
  from target_cards;

  if v_changed_card_count = 0 then
    v_block_reasons := array_append(v_block_reasons, 'NO_CHANGES');
  end if;

  if v_locked_changed_count > 0 then
    v_block_reasons := array_append(v_block_reasons, 'CARD_LOCKED');
  end if;

  with plan as materialized (
    select
      (entry.value ->> 'requirementId')::uuid as requirement_id,
      (entry.value ->> 'teacherId')::uuid as teacher_id
    from jsonb_array_elements(p_assignments) entry(value)
  ),
  final_state as materialized (
    select
      card.id as card_id,
      card.requirement_id,
      card.block_index,
      card.duration_periods,
      placement.day_of_week,
      placement.start_period,
      placement.room_id,
      placement.teacher_id as current_teacher_id,
      coalesce(plan.teacher_id, placement.teacher_id) as final_teacher_id,
      plan.requirement_id is not null as in_plan,
      (
        plan.requirement_id is not null
        and placement.teacher_id is distinct from plan.teacher_id
      ) as will_change,
      subject.name as subject_name,
      instructional_group.name as group_name
    from public.schedule_cards card
    join public.placements placement
      on placement.card_id = card.id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    join public.subjects subject
      on subject.id = requirement.subject_id
    join public.instructional_groups instructional_group
      on instructional_group.id = requirement.instructional_group_id
    left join plan
      on plan.requirement_id = card.requirement_id
    where card.schedule_revision_id = v_revision_id
  ),
  conflict_pairs as materialized (
    select
      left_state.card_id as left_card_id,
      left_state.requirement_id as left_requirement_id,
      left_state.subject_name as left_subject_name,
      left_state.group_name as left_group_name,
      left_state.day_of_week,
      left_state.start_period as left_start_period,
      left_state.duration_periods as left_duration_periods,
      right_state.card_id as right_card_id,
      right_state.requirement_id as right_requirement_id,
      right_state.subject_name as right_subject_name,
      right_state.group_name as right_group_name,
      right_state.start_period as right_start_period,
      right_state.duration_periods as right_duration_periods,
      left_state.final_teacher_id as teacher_id
    from final_state left_state
    join final_state right_state
      on left_state.card_id::text < right_state.card_id::text
     and left_state.final_teacher_id is not null
     and right_state.final_teacher_id = left_state.final_teacher_id
     and right_state.day_of_week = left_state.day_of_week
     and right_state.start_period <= (
       left_state.start_period + left_state.duration_periods - 1
     )
     and (
       right_state.start_period + right_state.duration_periods - 1
     ) >= left_state.start_period
    where left_state.in_plan or right_state.in_plan
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'teacherId', conflict.teacher_id,
        'dayOfWeek', conflict.day_of_week,
        'leftCardId', conflict.left_card_id,
        'leftRequirementId', conflict.left_requirement_id,
        'leftSubjectName', conflict.left_subject_name,
        'leftGroupName', conflict.left_group_name,
        'leftStartPeriod', conflict.left_start_period,
        'leftDurationPeriods', conflict.left_duration_periods,
        'rightCardId', conflict.right_card_id,
        'rightRequirementId', conflict.right_requirement_id,
        'rightSubjectName', conflict.right_subject_name,
        'rightGroupName', conflict.right_group_name,
        'rightStartPeriod', conflict.right_start_period,
        'rightDurationPeriods', conflict.right_duration_periods,
        'conflictType', 'TEACHER_CONFLICT'
      )
      order by
        conflict.day_of_week,
        least(conflict.left_start_period, conflict.right_start_period),
        conflict.left_card_id,
        conflict.right_card_id
    ),
    '[]'::jsonb
  )
  into v_conflicts
  from conflict_pairs conflict;

  if jsonb_array_length(v_conflicts) > 0 then
    v_block_reasons := array_append(v_block_reasons, 'TEACHER_CONFLICT');
  end if;

  with plan as materialized (
    select
      (entry.value ->> 'requirementId')::uuid as requirement_id,
      (entry.value ->> 'teacherId')::uuid as teacher_id
    from jsonb_array_elements(p_assignments) entry(value)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requirementId', requirement.id,
        'subjectName', subject.name,
        'groupName', instructional_group.name,
        'teacherId', teacher.id,
        'teacherName', teacher.name,
        'placedBlockCount', card_state.placed_count,
        'unplacedBlockCount', card_state.unplaced_count,
        'changedBlockCount', card_state.changed_count,
        'currentDistinctTeacherCount', card_state.current_teacher_count
      )
      order by instructional_group.name, subject.name, requirement.id
    ),
    '[]'::jsonb
  )
  into v_assignment_summary
  from plan
  join public.course_requirements requirement
    on requirement.id = plan.requirement_id
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  join public.teachers teacher
    on teacher.id = plan.teacher_id
  join lateral (
    select
      count(*) filter (where placement.id is not null)::integer as placed_count,
      count(*) filter (where placement.id is null)::integer as unplaced_count,
      count(*) filter (
        where placement.id is not null
          and placement.teacher_id is distinct from plan.teacher_id
      )::integer as changed_count,
      count(distinct placement.teacher_id) filter (
        where placement.teacher_id is not null
      )::integer as current_teacher_count
    from public.schedule_cards card
    left join public.placements placement
      on placement.card_id = card.id
    where card.schedule_revision_id = v_revision_id
      and card.requirement_id = requirement.id
  ) card_state on true;

  select md5(
    jsonb_build_object(
      'revisionId', v_revision_id,
      'assignments', (
        select jsonb_agg(
          jsonb_build_object(
            'requirementId', input.requirement_id,
            'teacherId', input.teacher_id,
            'teacherStatus', teacher.operational_status,
            'teacherRequirement', requirement.teacher_requirement,
            'teacherMode', requirement.teacher_mode,
            'assignmentScope', requirement.teacher_assignment_scope,
            'continuity', requirement.teacher_continuity,
            'eligible', exists (
              select 1
              from public.course_requirement_teachers eligibility
              where eligibility.requirement_id = input.requirement_id
                and eligibility.teacher_id = input.teacher_id
            )
          )
          order by input.requirement_id
        )
        from (
          select
            (entry.value ->> 'requirementId')::uuid as requirement_id,
            (entry.value ->> 'teacherId')::uuid as teacher_id
          from jsonb_array_elements(p_assignments) entry(value)
        ) input
        join public.course_requirements requirement
          on requirement.id = input.requirement_id
        left join public.teachers teacher
          on teacher.id = input.teacher_id
      ),
      'targetCards', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'cardId', card.id,
              'requirementId', card.requirement_id,
              'locked', card.locked,
              'dayOfWeek', placement.day_of_week,
              'startPeriod', placement.start_period,
              'teacherId', placement.teacher_id,
              'roomId', placement.room_id
            )
            order by card.id
          ),
          '[]'::jsonb
        )
        from public.schedule_cards card
        left join public.placements placement
          on placement.card_id = card.id
        where card.schedule_revision_id = v_revision_id
          and card.requirement_id in (
            select
              (entry.value ->> 'requirementId')::uuid
            from jsonb_array_elements(p_assignments) entry(value)
          )
      )
    )::text
  )
  into v_state_token;

  select coalesce(
    array_agg(distinct reason order by reason),
    array[]::text[]
  )
  into v_block_reasons
  from unnest(v_block_reasons) reason;

  return jsonb_build_object(
    'revisionId', v_revision_id,
    'assignmentCount', v_assignment_count,
    'assignments', v_assignment_summary,
    'placedBlockCount', v_placed_card_count,
    'unplacedBlockCount', v_unplaced_card_count,
    'changedBlockCount', v_changed_card_count,
    'canApply', (
      v_changed_card_count > 0
      and cardinality(v_block_reasons) = 0
    ),
    'blockReasons', to_jsonb(v_block_reasons),
    'conflicts', v_conflicts,
    'stateToken', v_state_token,
    'preservesTime', true,
    'preservesRoom', true,
    'changesTeacherPools', false,
    'evaluationMode', 'FINAL_COORDINATED_STATE',
    'previewOnly', true
  );
end
$$;

revoke all
  on function public.management_preview_coordinated_teacher_reconciliation(jsonb)
  from public, anon;

grant execute
  on function public.management_preview_coordinated_teacher_reconciliation(jsonb)
  to authenticated;

comment on function public.management_preview_coordinated_teacher_reconciliation(jsonb) is
  'M32.3.6 read-only final-state preview for multiple requirement-level teacher choices. Resolves false local conflicts by evaluating all proposed teacher changes together; no apply yet.';

commit;
