-- M30.2 / Room Pool Audit
-- READ-ONLY DIAGNOSTIC. Do not mutate production data.
-- Purpose:
--   Detect course_requirement_rooms rows that may have been inserted by the
--   temporary M29.2/M29.3 placement-resource pool-expansion behavior.

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
    assignment.room_id,
    assignment.created_at as assignment_created_at,
    requirement.resource_mode,
    requirement.required_capability,
    subject.name as subject_name,
    instructional_group.name as group_name,
    room.name as room_name,
    context.revision_id,
    (
      select count(*)
      from public.course_requirement_rooms pool
      where pool.requirement_id = assignment.requirement_id
    )::integer as current_pool_size,
    (
      select count(*)
      from public.schedule_cards card
      join public.placements placement
        on placement.card_id = card.id
      where card.schedule_revision_id = context.revision_id
        and card.requirement_id = assignment.requirement_id
        and placement.room_id = assignment.room_id
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
          nullif(tx.payload #>> '{after,room_id}', '')::uuid = assignment.room_id
          or nullif(tx.payload ->> 'room_id', '')::uuid = assignment.room_id
        )
    )::integer as nearby_move_to_room_count
  from active_context context
  join public.course_requirements requirement
    on requirement.requirement_set_id = context.requirement_set_id
  join public.course_requirement_rooms assignment
    on assignment.requirement_id = requirement.id
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  join public.rooms room
    on room.id = assignment.room_id
),
classified as (
  select
    base.*,
    case
      when base.assignment_created_at >= params.suspect_from
       and base.assignment_created_at < params.suspect_to
       and base.nearby_move_to_room_count > 0
       and base.current_placement_use_count = 0
        then 'LIKELY_M29_TEST_ARTIFACT'
      when base.assignment_created_at >= params.suspect_from
       and base.assignment_created_at < params.suspect_to
       and base.nearby_move_to_room_count > 0
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
  resource_mode,
  required_capability,
  room_name,
  current_pool_size,
  current_placement_use_count,
  nearby_move_to_room_count,
  assignment_created_at,
  requirement_id,
  room_id
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
  room_name;

-- Summary.
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
    assignment.room_id,
    assignment.created_at,
    (
      select count(*)
      from public.schedule_cards card
      join public.placements placement on placement.card_id = card.id
      where card.schedule_revision_id = context.revision_id
        and card.requirement_id = assignment.requirement_id
        and placement.room_id = assignment.room_id
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
          nullif(tx.payload #>> '{after,room_id}', '')::uuid = assignment.room_id
          or nullif(tx.payload ->> 'room_id', '')::uuid = assignment.room_id
        )
    )::integer as nearby_move_to_room_count
  from active_context context
  join public.course_requirements requirement
    on requirement.requirement_set_id = context.requirement_set_id
  join public.course_requirement_rooms assignment
    on assignment.requirement_id = requirement.id
  cross join params
  where assignment.created_at >= params.suspect_from
    and assignment.created_at < params.suspect_to
),
classified as (
  select
    case
      when nearby_move_to_room_count > 0 and current_placement_use_count = 0
        then 'LIKELY_M29_TEST_ARTIFACT'
      when nearby_move_to_room_count > 0
        then 'REVIEW_M29_INSERT_CURRENTLY_USED'
      else 'REVIEW_26SEP_INSERT_NO_MOVE_MATCH'
    end as audit_class
  from suspect_assignments
)
select audit_class, count(*)::integer as assignment_count
from classified
group by audit_class
order by audit_class;

-- Requirements whose resource_mode may have been widened by temporary M29.2/M29.3.
with params as (
  select
    timestamptz '2026-09-26 00:00:00+03' as suspect_from,
    timestamptz '2026-09-27 00:00:00+03' as suspect_to
),
active_context as (
  select
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
    requirement.resource_mode,
    requirement.required_capability,
    subject.name as subject_name,
    instructional_group.name as group_name,
    count(assignment.room_id)::integer as current_pool_size,
    count(assignment.room_id) filter (
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
  left join public.course_requirement_rooms assignment
    on assignment.requirement_id = requirement.id
  cross join params
  group by
    requirement.id,
    requirement.resource_mode,
    requirement.required_capability,
    subject.name,
    instructional_group.name
)
select
  subject_name,
  group_name,
  resource_mode,
  required_capability,
  current_pool_size,
  assignments_added_26sep,
  requirement_id
from pool
where assignments_added_26sep > 0
order by assignments_added_26sep desc, subject_name, group_name;
