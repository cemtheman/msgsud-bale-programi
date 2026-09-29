-- M32.3.5 read-only reconciliation option diagnostic
-- For every ACTIVE REQUIREMENT+REQUIRED course that currently uses more than
-- one resolved teacher, preview every already-eligible teacher.
--
-- Safe: does not change placements, teacher pools, or publication state.

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
)
select
  violation.group_name,
  violation.subject_name,
  teacher.name as proposed_teacher,
  (preview.value ->> 'canApply')::boolean as can_apply,
  (preview.value ->> 'changedBlockCount')::integer as changed_block_count,
  (preview.value ->> 'placedBlockCount')::integer as placed_block_count,
  preview.value -> 'blockReasons' as block_reasons,
  preview.value -> 'conflicts' as conflicts
from violations violation
join public.course_requirement_teachers assignment
  on assignment.requirement_id = violation.requirement_id
join public.teachers teacher
  on teacher.id = assignment.teacher_id
cross join lateral (
  select public.management_preview_requirement_teacher_reconciliation(
    violation.requirement_id,
    teacher.id
  ) as value
) preview
order by
  violation.group_name,
  violation.subject_name,
  teacher.name;
