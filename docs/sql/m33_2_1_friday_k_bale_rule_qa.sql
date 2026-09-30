-- M33.2.1 read-only verification
-- Expected after 20260930110000_management_m33_2_1_friday_k_bale_consecutive_rule.sql:
-- - exactly one active 5A Friday K. Bale requirement
-- - max_consecutive_periods = 2
-- - two one-period cards in active DRAFT
-- - both remain placed Friday periods 7 and 8
-- - E. Gemalmaz remains the teacher for both placements

with target as (
  select
    requirement.id as requirement_id,
    requirement.max_consecutive_periods,
    revision.id as revision_id
  from public.course_requirements requirement
  join public.requirement_sets requirement_set
    on requirement_set.id = requirement.requirement_set_id
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  join public.schedule_revisions revision
    on revision.requirement_set_id = requirement.requirement_set_id
   and revision.status = 'DRAFT'
  where requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
    and requirement.term_status = 'ACTIVE'
    and subject.name = 'K. Bale'
    and instructional_group.name =
      'STANDARD • 5A BALLET • Cuma ek dersi'
  order by revision.version_number desc
  limit 1
),
cards as (
  select
    card.id,
    card.block_index,
    card.duration_periods,
    placement.day_of_week,
    placement.start_period,
    teacher.name as teacher_name
  from target
  join public.schedule_cards card
    on card.schedule_revision_id = target.revision_id
   and card.requirement_id = target.requirement_id
  left join public.placements placement
    on placement.card_id = card.id
  left join public.teachers teacher
    on teacher.id = placement.teacher_id
)
select
  target.requirement_id,
  target.max_consecutive_periods,
  count(cards.id)::integer as card_count,
  count(cards.id) filter (
    where cards.duration_periods = 1
  )::integer as one_period_card_count,
  count(cards.id) filter (
    where cards.day_of_week = 5
  )::integer as friday_placed_count,
  min(cards.start_period) filter (
    where cards.day_of_week = 5
  ) as friday_min_period,
  max(cards.start_period) filter (
    where cards.day_of_week = 5
  ) as friday_max_period,
  array_agg(
    distinct cards.teacher_name
  ) filter (
    where cards.teacher_name is not null
  ) as teacher_names,
  case
    when target.max_consecutive_periods = 2
     and count(cards.id) = 2
     and count(cards.id) filter (
       where cards.duration_periods = 1
     ) = 2
     and count(cards.id) filter (
       where cards.day_of_week = 5
     ) = 2
     and min(cards.start_period) filter (
       where cards.day_of_week = 5
     ) = 7
     and max(cards.start_period) filter (
       where cards.day_of_week = 5
     ) = 8
     and array_agg(
       distinct cards.teacher_name
     ) filter (
       where cards.teacher_name is not null
     ) = array['E. Gemalmaz']::text[]
      then 'PASS'
    else 'FAIL'
  end as qa_status
from target
left join cards on true
group by
  target.requirement_id,
  target.max_consecutive_periods;
