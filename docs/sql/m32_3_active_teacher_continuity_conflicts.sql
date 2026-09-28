-- M32.3 read-only diagnostic
-- Lists only ACTIVE 2026-2027 term-1 DRAFT requirements whose placed blocks
-- currently use more than one resolved teacher.
--
-- Safe to run in Supabase SQL Editor. No writes.

with active_revision as (
  select revision.id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.status = 'DRAFT'
    and requirement_set.status = 'DRAFT'
    and requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
  order by revision.created_at desc
  limit 1
),
conflicting_requirements as (
  select
    card.requirement_id,
    count(distinct placement.teacher_id)::integer as teacher_count
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  join active_revision active
    on active.id = card.schedule_revision_id
  where placement.teacher_id is not null
  group by card.requirement_id
  having count(distinct placement.teacher_id) > 1
)
select
  requirement.id as requirement_id,
  coalesce(
    to_jsonb(subject_row) ->> 'name',
    to_jsonb(subject_row) ->> 'title',
    requirement.subject_id::text
  ) as subject_name,
  instructional_group.name as group_name,
  requirement.teacher_mode,
  conflict.teacher_count,
  card.block_index,
  card.duration_periods,
  case placement.day_of_week
    when 1 then 'Pazartesi'
    when 2 then 'Salı'
    when 3 then 'Çarşamba'
    when 4 then 'Perşembe'
    when 5 then 'Cuma'
    else placement.day_of_week::text
  end as day_name,
  placement.start_period,
  coalesce(
    to_jsonb(teacher_row) ->> 'name',
    to_jsonb(teacher_row) ->> 'full_name',
    to_jsonb(teacher_row) ->> 'display_name',
    placement.teacher_id::text
  ) as teacher_name,
  coalesce(
    to_jsonb(room_row) ->> 'name',
    to_jsonb(room_row) ->> 'label',
    placement.room_id::text
  ) as room_name
from conflicting_requirements conflict
join public.course_requirements requirement
  on requirement.id = conflict.requirement_id
join public.instructional_groups instructional_group
  on instructional_group.id = requirement.instructional_group_id
join public.subjects subject_row
  on subject_row.id = requirement.subject_id
join public.schedule_cards card
  on card.requirement_id = requirement.id
join active_revision active
  on active.id = card.schedule_revision_id
join public.placements placement
  on placement.card_id = card.id
left join public.teachers teacher_row
  on teacher_row.id = placement.teacher_id
left join public.rooms room_row
  on room_row.id = placement.room_id
order by
  group_name,
  subject_name,
  card.block_index;
