-- M32.3.5 read-only reconciliation option diagnostic
--
-- Lists every already-eligible teacher for ACTIVE REQUIREMENT+REQUIRED courses
-- that currently use more than one resolved teacher.
--
-- IMPORTANT:
-- This SQL intentionally does NOT call the management reconciliation RPCs.
-- Supabase SQL Editor does not carry the application's authenticated management
-- role context, while those RPCs correctly require EDITOR access.
--
-- This query reproduces the teacher-side preview checks read-only:
--   * selected teacher is already in the requirement pool
--   * teacher is operationally ACTIVE
--   * changed placed cards are not locked
--   * teacher has no overlapping placement outside the requirement's cards
--   * current day/start/room are preserved conceptually
--
-- Safe: no writes, no RPC side effects, no placement/publication mutation.

with active_revision as (
  select
    revision.id,
    revision.requirement_set_id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.status = 'DRAFT'
    and requirement_set.status = 'DRAFT'
    and requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
  order by revision.version_number desc
  limit 1
),
violations as (
  select
    active.id as revision_id,
    requirement.id as requirement_id,
    subject.name as subject_name,
    instructional_group.name as group_name
  from active_revision active
  join public.course_requirements requirement
    on requirement.requirement_set_id = active.requirement_set_id
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  join lateral (
    select count(distinct placement.teacher_id) filter (
      where placement.teacher_id is not null
    )::integer as teacher_count
    from public.schedule_cards card
    join public.placements placement
      on placement.card_id = card.id
    where card.schedule_revision_id = active.id
      and card.requirement_id = requirement.id
  ) placement_state on true
  where requirement.term_status = 'ACTIVE'
    and requirement.teacher_requirement = 'REQUIRED'
    and requirement.teacher_assignment_scope = 'REQUIREMENT'
    and requirement.teacher_continuity = 'REQUIRED'
    and placement_state.teacher_count > 1
),
options as (
  select
    violation.revision_id,
    violation.requirement_id,
    violation.group_name,
    violation.subject_name,
    teacher.id as proposed_teacher_id,
    teacher.name as proposed_teacher,
    teacher.operational_status,
    (
      select count(*)::integer
      from public.schedule_cards card
      join public.placements placement
        on placement.card_id = card.id
      where card.schedule_revision_id = violation.revision_id
        and card.requirement_id = violation.requirement_id
    ) as placed_block_count,
    (
      select count(*)::integer
      from public.schedule_cards card
      join public.placements placement
        on placement.card_id = card.id
      where card.schedule_revision_id = violation.revision_id
        and card.requirement_id = violation.requirement_id
        and placement.teacher_id is distinct from teacher.id
    ) as changed_block_count,
    exists (
      select 1
      from public.schedule_cards card
      join public.placements placement
        on placement.card_id = card.id
      where card.schedule_revision_id = violation.revision_id
        and card.requirement_id = violation.requirement_id
        and placement.teacher_id is distinct from teacher.id
        and card.locked
    ) as has_locked_changed_block,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'cardId', target.card_id,
          'blockIndex', target.block_index,
          'dayOfWeek', target.day_of_week,
          'startPeriod', target.start_period,
          'durationPeriods', target.duration_periods,
          'blockingCardId', occupied.id,
          'blockingSubject', blocking_subject.name,
          'blockingGroup', blocking_group.name,
          'blockingStartPeriod', occupied_placement.start_period
        )
        order by
          target.day_of_week,
          target.start_period,
          occupied_placement.start_period,
          occupied.id
      )
      from (
        select
          card.id as card_id,
          card.block_index,
          card.duration_periods,
          placement.day_of_week,
          placement.start_period,
          (
            placement.start_period + card.duration_periods - 1
          )::smallint as end_period
        from public.schedule_cards card
        join public.placements placement
          on placement.card_id = card.id
        where card.schedule_revision_id = violation.revision_id
          and card.requirement_id = violation.requirement_id
          and placement.teacher_id is distinct from teacher.id
      ) target
      join public.placements occupied_placement
        on occupied_placement.teacher_id = teacher.id
       and occupied_placement.day_of_week = target.day_of_week
      join public.schedule_cards occupied
        on occupied.id = occupied_placement.card_id
       and occupied.schedule_revision_id = violation.revision_id
      join public.course_requirements blocking_requirement
        on blocking_requirement.id = occupied.requirement_id
      join public.subjects blocking_subject
        on blocking_subject.id = blocking_requirement.subject_id
      join public.instructional_groups blocking_group
        on blocking_group.id = blocking_requirement.instructional_group_id
      where occupied.requirement_id <> violation.requirement_id
        and occupied_placement.start_period <= target.end_period
        and (
          occupied_placement.start_period + occupied.duration_periods - 1
        ) >= target.start_period
    ), '[]'::jsonb) as conflicts
  from violations violation
  join public.course_requirement_teachers assignment
    on assignment.requirement_id = violation.requirement_id
  join public.teachers teacher
    on teacher.id = assignment.teacher_id
)
select
  group_name,
  subject_name,
  proposed_teacher,
  (
    operational_status = 'ACTIVE'
    and changed_block_count > 0
    and not has_locked_changed_block
    and jsonb_array_length(conflicts) = 0
  ) as can_apply,
  changed_block_count,
  placed_block_count,
  case
    when operational_status <> 'ACTIVE' then
      jsonb_build_array('RESOURCE_INACTIVE')
    when changed_block_count = 0 then
      jsonb_build_array('NO_CHANGES')
    when has_locked_changed_block then
      jsonb_build_array('CARD_LOCKED')
    when jsonb_array_length(conflicts) > 0 then
      jsonb_build_array('TEACHER_CONFLICT')
    else
      '[]'::jsonb
  end as block_reasons,
  conflicts
from options
order by
  group_name,
  subject_name,
  proposed_teacher;
