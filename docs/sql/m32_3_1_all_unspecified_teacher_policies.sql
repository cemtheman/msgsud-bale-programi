-- M32.3.1 read-only diagnostic
-- Lists every active-draft requirement whose teacher assignment policy
-- is still UNSPECIFIED, including single-card cases.
--
-- Safe to run in Supabase SQL Editor. No writes.

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
  order by revision.created_at desc
  limit 1
)
select
  requirement.id as requirement_id,
  subject.name as subject_name,
  instructional_group.name as group_name,
  instructional_group.group_type,
  requirement.course_character,
  requirement.delivery_mode,
  requirement.teacher_mode,
  requirement.teacher_assignment_scope,
  requirement.teacher_continuity,
  count(distinct assignment.teacher_id)::integer as eligible_teacher_count,
  count(distinct card.id)::integer as card_count,
  count(distinct placement.id)::integer as placed_block_count,
  count(distinct placement.teacher_id) filter (
    where placement.teacher_id is not null
  )::integer as distinct_resolved_teacher_count
from active_revision active
join public.course_requirements requirement
  on requirement.requirement_set_id = active.requirement_set_id
join public.subjects subject
  on subject.id = requirement.subject_id
join public.instructional_groups instructional_group
  on instructional_group.id = requirement.instructional_group_id
left join public.course_requirement_teachers assignment
  on assignment.requirement_id = requirement.id
left join public.schedule_cards card
  on card.schedule_revision_id = active.id
 and card.requirement_id = requirement.id
left join public.placements placement
  on placement.card_id = card.id
where requirement.teacher_assignment_scope = 'UNSPECIFIED'
group by
  requirement.id,
  subject.name,
  instructional_group.name,
  instructional_group.group_type,
  requirement.course_character,
  requirement.delivery_mode,
  requirement.teacher_mode,
  requirement.teacher_assignment_scope,
  requirement.teacher_continuity
order by
  instructional_group.group_type,
  instructional_group.name,
  subject.name;
