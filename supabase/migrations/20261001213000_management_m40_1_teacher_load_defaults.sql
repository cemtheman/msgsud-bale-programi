-- Management M40.1
-- Approved teacher-load defaults: minimum 1 / target 10 / maximum 20.
--
-- Product decision:
--   * defaults are explicit institutional starting values, not hidden solver
--     assumptions;
--   * only relevant ACTIVE teachers in requirement sets with an active DRAFT
--     are backfilled;
--   * only teachers with NO existing planning-input row are touched;
--   * any existing custom or partial row is preserved exactly as entered;
--   * the values remain soft planning inputs, never hard placement rules.

begin;

with
draft_requirement_set as materialized (
  select distinct revision.requirement_set_id
  from public.schedule_revisions revision
  where revision.status = 'DRAFT'
),
relevant_teacher as materialized (
  select distinct
    requirement.requirement_set_id,
    assignment.teacher_id
  from public.course_requirement_teachers assignment
  join public.course_requirements requirement
    on requirement.id = assignment.requirement_id
  join draft_requirement_set draft_set
    on draft_set.requirement_set_id = requirement.requirement_set_id
  join public.teachers teacher
    on teacher.id = assignment.teacher_id
  where requirement.term_status = 'ACTIVE'
    and teacher.operational_status = 'ACTIVE'
    and teacher.archived_at is null

  union

  select distinct
    revision.requirement_set_id,
    placement.teacher_id
  from public.schedule_revisions revision
  join public.schedule_cards card
    on card.schedule_revision_id = revision.id
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  join public.placements placement
    on placement.card_id = card.id
  join public.teachers teacher
    on teacher.id = placement.teacher_id
  where revision.status = 'DRAFT'
    and requirement.term_status = 'ACTIVE'
    and placement.teacher_id is not null
    and teacher.operational_status = 'ACTIVE'
    and teacher.archived_at is null
),
missing_planning_input as (
  select
    relevant.requirement_set_id,
    relevant.teacher_id
  from relevant_teacher relevant
  left join public.management_teacher_planning_inputs planning
    on planning.requirement_set_id = relevant.requirement_set_id
   and planning.teacher_id = relevant.teacher_id
  where planning.teacher_id is null
)
insert into public.management_teacher_planning_inputs (
  requirement_set_id,
  teacher_id,
  minimum_load,
  target_load,
  maximum_load
)
select
  missing.requirement_set_id,
  missing.teacher_id,
  1::smallint,
  10::smallint,
  20::smallint
from missing_planning_input missing
on conflict (requirement_set_id, teacher_id) do nothing;

comment on table public.management_teacher_planning_inputs is
  'M40.1 requirement-set scoped teacher load planning inputs. Approved starting defaults for previously unconfigured relevant teachers are 1/10/20 weekly periods; explicit custom values remain authoritative.';

commit;
