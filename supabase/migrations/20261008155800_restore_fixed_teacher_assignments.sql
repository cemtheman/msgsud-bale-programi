-- Restore deterministic fixed-teacher assignments in the current DRAFT.
--
-- Scope:
--   * ACTIVE requirements
--   * teacher_mode = FIXED
--   * teacher_requirement = REQUIRED
--   * exactly one requirement teacher
--   * existing DRAFT placement teacher_id IS NULL
--
-- Safety:
--   * preserves day/time/room
--   * does not touch ELIGIBLE_POOL requirements
--   * does not overwrite any existing teacher assignment
--   * removes only TEACHER_ASSIGNMENT_INCONSISTENT warning evidence
--   * preserves unrelated resource warnings such as ROOM_IDENTITY_PROVISIONAL
--
-- Preflight on 2026-10-08:
--   * 172 candidate placements
--   * 38 teachers
--   * 0 teacher-time conflicts against existing assigned placements

begin;

with draft as (
  select revision.id
  from public.schedule_revisions revision
  where revision.status = 'DRAFT'
  order by revision.version_number desc, revision.id
  limit 1
),
single_fixed as (
  select
    requirement.id as requirement_id,
    (array_agg(
      assignment.teacher_id
      order by assignment.teacher_id::text
    ))[1] as teacher_id
  from public.course_requirements requirement
  join public.course_requirement_teachers assignment
    on assignment.requirement_id = requirement.id
  where requirement.term_status = 'ACTIVE'
    and requirement.teacher_mode = 'FIXED'
    and requirement.teacher_requirement = 'REQUIRED'
  group by requirement.id
  having count(*) = 1
),
repair_target as (
  select
    placement.id as placement_id,
    fixed.teacher_id
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  join draft
    on draft.id = card.schedule_revision_id
  join single_fixed fixed
    on fixed.requirement_id = card.requirement_id
  where placement.teacher_id is null
)
update public.placements placement
set
  teacher_id = target.teacher_id,
  teacher_resolution_status = 'RESOLVED',
  resource_warning_codes = array(
    select warning
    from unnest(coalesce(
      placement.resource_warning_codes,
      array[]::text[]
    )) warning
    where warning <> 'TEACHER_ASSIGNMENT_INCONSISTENT'
  ),
  updated_at = now()
from repair_target target
where placement.id = target.placement_id;

commit;
