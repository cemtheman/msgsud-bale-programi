-- M30 / Teacher Pool Audit
-- READ-ONLY DIAGNOSTIC. This file must not mutate database state.
-- Purpose:
--   Identify course_requirement_teachers rows that may have been introduced
--   by the temporary M29.2/M29.3 pool-expansion behavior on 26 Sep 2026.
--
-- Run in Supabase SQL Editor against the production project.
-- Do NOT convert this file into a migration.
-- Do NOT DELETE/UPDATE based on this output alone.

-- Istanbul-local test window for the M29.2/M29.3 work.
-- The window is intentionally broad; classification also uses placement use
-- and nearby MOVE history, not timestamp alone.
with params as (
  select
    timestamptz '2026-09-26 00:00:00+03' as suspect_from,
    timestamptz '2026-09-27 00:00:00+03' as suspect_to
),
active_context as (
  select
    revision.id as revision_id,
    revision.requirement_set_id,
    requirement_set.academic_year,
    requirement_set.term
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.status = 'DRAFT'
    and requirement_set.status = 'DRAFT'
  order by revision.version_number desc
  limit 1
),
assignment_base as (
  select
    assignment.requirement_id,
    assignment.teacher_id,
    assignment.created_at as assignment_created_at,
    requirement.teacher_mode,
    subject.name as subject_name,
    instructional_group.name as group_name,
    teacher.name as teacher_name,
    context.revision_id,
    context.academic_year,
    context.term,
    (
      select count(*)
      from public.course_requirement_teachers pool
      where pool.requirement_id = assignment.requirement_id
    )::integer as current_pool_size,
    (
      select count(*)
      from public.schedule_cards card
      join public.placements placement
        on placement.card_id = card.id
      where card.schedule_revision_id = context.revision_id
        and card.requirement_id = assignment.requirement_id
        and placement.teacher_id = assignment.teacher_id
    )::integer as current_placement_use_count,
    (
      select count(*)
      from public.schedule_cards card
      join public.placements placement
        on placement.card_id = card.id
      where card.schedule_revision_id = context.revision_id
        and card.requirement_id = assignment.requirement_id
        and placement.teacher_id is not null
    )::integer as requirement_placed_card_count,
    (
      select count(*)
      from public.move_transactions tx
      where tx.schedule_revision_id = context.revision_id
        and tx.action = 'MOVE'
        and tx.created_at between
          assignment.created_at - interval '2 minutes'
          and assignment.created_at + interval '15 minutes'
        and (
          nullif(tx.payload #>> '{after,teacher_id}', '')::uuid = assignment.teacher_id
          or nullif(tx.payload ->> 'teacher_id', '')::uuid = assignment.teacher_id
        )
    )::integer as nearby_move_to_teacher_count,
    (
      select min(tx.created_at)
      from public.move_transactions tx
      where tx.schedule_revision_id = context.revision_id
        and tx.action = 'MOVE'
        and (
          nullif(tx.payload #>> '{after,teacher_id}', '')::uuid = assignment.teacher_id
          or nullif(tx.payload ->> 'teacher_id', '')::uuid = assignment.teacher_id
        )
        and tx.created_at >= assignment.created_at - interval '2 minutes'
    ) as first_move_to_teacher_at
  from active_context context
  join public.course_requirements requirement
    on requirement.requirement_set_id = context.requirement_set_id
  join public.course_requirement_teachers assignment
    on assignment.requirement_id = requirement.id
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  join public.teachers teacher
    on teacher.id = assignment.teacher_id
),
classified as (
  select
    base.*,
    case
      when base.assignment_created_at >= params.suspect_from
       and base.assignment_created_at < params.suspect_to
       and base.nearby_move_to_teacher_count > 0
       and base.current_placement_use_count = 0
        then 'LIKELY_M29_TEST_ARTIFACT'
      when base.assignment_created_at >= params.suspect_from
       and base.assignment_created_at < params.suspect_to
       and base.nearby_move_to_teacher_count > 0
        then 'REVIEW_M29_INSERT_CURRENTLY_USED'
      when base.assignment_created_at >= params.suspect_from
       and base.assignment_created_at < params.suspect_to
        then 'REVIEW_26SEP_INSERT_NO_MOVE_MATCH'
      else 'PRE_26SEP_OR_NORMAL'
    end as audit_class
  from assignment_base base
  cross join params
)
select
  audit_class,
  subject_name,
  group_name,
  teacher_name,
  teacher_mode,
  current_pool_size,
  current_placement_use_count,
  requirement_placed_card_count,
  nearby_move_to_teacher_count,
  assignment_created_at,
  first_move_to_teacher_at,
  requirement_id,
  teacher_id
from classified
where audit_class <> 'PRE_26SEP_OR_NORMAL'
order by
  case audit_class
    when 'LIKELY_M29_TEST_ARTIFACT' then 1
    when 'REVIEW_M29_INSERT_CURRENTLY_USED' then 2
    else 3
  end,
  subject_name,
  group_name,
  assignment_created_at,
  teacher_name;

-- Summary by classification.
with params as (
  select
    timestamptz '2026-09-26 00:00:00+03' as suspect_from,
    timestamptz '2026-09-27 00:00:00+03' as suspect_to
),
active_context as (
  select
    revision.id as revision_id,
    revision.requirement_set_id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.status = 'DRAFT'
    and requirement_set.status = 'DRAFT'
  order by revision.version_number desc
  limit 1
),
suspect_assignments as (
  select
    assignment.requirement_id,
    assignment.teacher_id,
    assignment.created_at,
    (
      select count(*)
      from public.schedule_cards card
      join public.placements placement on placement.card_id = card.id
      where card.schedule_revision_id = context.revision_id
        and card.requirement_id = assignment.requirement_id
        and placement.teacher_id = assignment.teacher_id
    )::integer as current_placement_use_count,
    (
      select count(*)
      from public.move_transactions tx
      where tx.schedule_revision_id = context.revision_id
        and tx.action = 'MOVE'
        and tx.created_at between
          assignment.created_at - interval '2 minutes'
          and assignment.created_at + interval '15 minutes'
        and (
          nullif(tx.payload #>> '{after,teacher_id}', '')::uuid = assignment.teacher_id
          or nullif(tx.payload ->> 'teacher_id', '')::uuid = assignment.teacher_id
        )
    )::integer as nearby_move_to_teacher_count
  from active_context context
  join public.course_requirements requirement
    on requirement.requirement_set_id = context.requirement_set_id
  join public.course_requirement_teachers assignment
    on assignment.requirement_id = requirement.id
  cross join params
  where assignment.created_at >= params.suspect_from
    and assignment.created_at < params.suspect_to
),
classified as (
  select
    case
      when nearby_move_to_teacher_count > 0 and current_placement_use_count = 0
        then 'LIKELY_M29_TEST_ARTIFACT'
      when nearby_move_to_teacher_count > 0
        then 'REVIEW_M29_INSERT_CURRENTLY_USED'
      else 'REVIEW_26SEP_INSERT_NO_MOVE_MATCH'
    end as audit_class
  from suspect_assignments
)
select audit_class, count(*)::integer as assignment_count
from classified
group by audit_class
order by audit_class;

-- Requirements whose teacher_mode may have been widened by the temporary
-- M29.2/M29.3 behavior. This is diagnostic only.
with params as (
  select
    timestamptz '2026-09-26 00:00:00+03' as suspect_from,
    timestamptz '2026-09-27 00:00:00+03' as suspect_to
),
active_context as (
  select
    revision.id as revision_id,
    revision.requirement_set_id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.status = 'DRAFT'
    and requirement_set.status = 'DRAFT'
  order by revision.version_number desc
  limit 1
),
pool as (
  select
    requirement.id as requirement_id,
    requirement.teacher_mode,
    subject.name as subject_name,
    instructional_group.name as group_name,
    count(assignment.teacher_id)::integer as current_pool_size,
    count(assignment.teacher_id) filter (
      where assignment.created_at >= params.suspect_from
        and assignment.created_at < params.suspect_to
    )::integer as assignments_added_26sep
  from active_context context
  join public.course_requirements requirement
    on requirement.requirement_set_id = context.requirement_set_id
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  left join public.course_requirement_teachers assignment
    on assignment.requirement_id = requirement.id
  cross join params
  group by
    requirement.id,
    requirement.teacher_mode,
    subject.name,
    instructional_group.name
)
select
  subject_name,
  group_name,
  teacher_mode,
  current_pool_size,
  assignments_added_26sep,
  requirement_id
from pool
where assignments_added_26sep > 0
order by assignments_added_26sep desc, subject_name, group_name;
