-- M32.4 read-only teacher-policy runtime audit
--
-- SQL Editor safe. No writes.
-- Confirms:
--   * REQUIREMENT+REQUIRED active requirements resolve to <= 1 placed teacher
--   * shows unplaced cards and raw VALID candidates that would be rejected by
--     the runtime teacher-continuity read filter
--   * keeps BLOCK-scoped lessons visible as independent controls

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
requirement_state as (
  select
    requirement.id as requirement_id,
    subject.name as subject_name,
    instructional_group.name as group_name,
    requirement.teacher_assignment_scope,
    requirement.teacher_continuity,
    count(card.id)::integer as card_count,
    count(placement.id)::integer as placed_block_count,
    count(card.id) filter (
      where placement.id is null
    )::integer as unplaced_block_count,
    count(distinct placement.teacher_id) filter (
      where placement.teacher_id is not null
    )::integer as distinct_resolved_teacher_count,
    case
      when count(distinct placement.teacher_id) filter (
        where placement.teacher_id is not null
      ) = 1
      then min(placement.teacher_id::text)::uuid
      else null
    end as resolved_teacher_id
  from active_revision active
  join public.course_requirements requirement
    on requirement.requirement_set_id = active.requirement_set_id
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  join public.schedule_cards card
    on card.schedule_revision_id = active.id
   and card.requirement_id = requirement.id
  left join public.placements placement
    on placement.card_id = card.id
  where requirement.term_status = 'ACTIVE'
    and requirement.teacher_requirement in ('REQUIRED', 'OPTIONAL')
  group by
    requirement.id,
    subject.name,
    instructional_group.name,
    requirement.teacher_assignment_scope,
    requirement.teacher_continuity
),
policy_rows as (
  select
    state.*,
    coalesce((
      select count(*)::integer
      from active_revision active
      join public.schedule_cards card
        on card.schedule_revision_id = active.id
       and card.requirement_id = state.requirement_id
      join public.schedule_card_candidate_assessments assessment
        on assessment.card_id = card.id
      where not exists (
        select 1
        from public.placements placement
        where placement.card_id = card.id
      )
        and assessment.status = 'VALID'
        and assessment.is_complete
        and state.teacher_assignment_scope = 'REQUIREMENT'
        and state.teacher_continuity = 'REQUIRED'
        and state.resolved_teacher_id is not null
        and assessment.teacher_id is not null
        and assessment.teacher_id <> state.resolved_teacher_id
    ), 0) as raw_valid_candidates_filtered_by_continuity
  from requirement_state state
)
select
  group_name,
  subject_name,
  teacher_assignment_scope,
  teacher_continuity,
  card_count,
  placed_block_count,
  unplaced_block_count,
  distinct_resolved_teacher_count,
  resolved_teacher_id,
  raw_valid_candidates_filtered_by_continuity,
  (
    teacher_assignment_scope = 'REQUIREMENT'
    and teacher_continuity = 'REQUIRED'
    and distinct_resolved_teacher_count > 1
  ) as continuity_violation
from policy_rows
where (
  teacher_assignment_scope = 'REQUIREMENT'
  and teacher_continuity = 'REQUIRED'
)
or teacher_assignment_scope = 'BLOCK'
order by
  continuity_violation desc,
  group_name,
  subject_name;
