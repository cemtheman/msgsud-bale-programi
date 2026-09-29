-- M32.3.6 coordinated teacher-reconciliation option diagnostic
--
-- Current active draft has two REQUIREMENT+REQUIRED continuity violations
-- (10A and 10B Mathematics). Enumerate every eligible teacher pairing and let
-- the M32.3.6 FINAL_COORDINATED_STATE preview evaluate the pair atomically.
--
-- Safe: preview-only. No writes.

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
    row_number() over (
      order by instructional_group.name, subject.name, requirement.id
    ) as ordinal,
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
first_requirement as (
  select *
  from violations
  where ordinal = 1
),
second_requirement as (
  select *
  from violations
  where ordinal = 2
),
first_options as (
  select
    first_requirement.requirement_id,
    first_requirement.group_name,
    first_requirement.subject_name,
    teacher.id as teacher_id,
    teacher.name as teacher_name
  from first_requirement
  join public.course_requirement_teachers assignment
    on assignment.requirement_id = first_requirement.requirement_id
  join public.teachers teacher
    on teacher.id = assignment.teacher_id
),
second_options as (
  select
    second_requirement.requirement_id,
    second_requirement.group_name,
    second_requirement.subject_name,
    teacher.id as teacher_id,
    teacher.name as teacher_name
  from second_requirement
  join public.course_requirement_teachers assignment
    on assignment.requirement_id = second_requirement.requirement_id
  join public.teachers teacher
    on teacher.id = assignment.teacher_id
),
plans as (
  select
    first_options.group_name as first_group,
    first_options.teacher_name as first_teacher,
    second_options.group_name as second_group,
    second_options.teacher_name as second_teacher,
    public.management_preview_coordinated_teacher_reconciliation(
      jsonb_build_array(
        jsonb_build_object(
          'requirementId', first_options.requirement_id,
          'teacherId', first_options.teacher_id
        ),
        jsonb_build_object(
          'requirementId', second_options.requirement_id,
          'teacherId', second_options.teacher_id
        )
      )
    ) as preview
  from first_options
  cross join second_options
  where (select count(*) from violations) = 2
)
select
  first_group,
  first_teacher,
  second_group,
  second_teacher,
  (preview ->> 'canApply')::boolean as can_apply,
  (preview ->> 'changedBlockCount')::integer as changed_block_count,
  preview -> 'blockReasons' as block_reasons,
  preview -> 'conflicts' as conflicts,
  preview -> 'assignments' as assignments
from plans
order by
  can_apply desc,
  changed_block_count asc,
  first_teacher,
  second_teacher;
