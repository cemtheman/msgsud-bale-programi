-- Management M32.3.3
-- Teacher requirement semantics.
--
-- M32.3A separated teacher eligibility from assignment scope.
-- This migration separates a third concept:
--   is a teacher required for this requirement at all?
--
-- This is necessary because teacher_mode = UNKNOWN previously represented both:
--   * required teacher identity is not known yet
--   * no teacher is required (for example KULÜP DERSLERİ)
--
-- No placement mutation. No candidate rebuild. No publication mutation.

begin;

alter table public.course_requirements
  add column if not exists teacher_requirement text not null
    default 'UNSPECIFIED';

alter table public.course_requirements
  drop constraint if exists course_requirements_teacher_requirement_check;

alter table public.course_requirements
  add constraint course_requirements_teacher_requirement_check
    check (
      teacher_requirement in (
        'REQUIRED',
        'OPTIONAL',
        'NONE',
        'UNSPECIFIED'
      )
    );

comment on column public.course_requirements.teacher_requirement is
  'M32.3.3 whether a teacher is required at all: REQUIRED, OPTIONAL, NONE, or UNSPECIFIED. Independent from teacher eligibility and assignment scope.';


-- -------------------------------------------------------------------------
-- HIGH-CONFIDENCE BACKFILL
-- -------------------------------------------------------------------------

-- Club lessons are intentionally teacherless in the current product model.
-- Their assignment scope is therefore not applicable.
update public.course_requirements requirement
set
  teacher_requirement = 'NONE',
  teacher_assignment_scope = 'UNSPECIFIED',
  teacher_continuity = 'NONE'
from public.subjects subject
where subject.id = requirement.subject_id
  and upper(subject.name) = 'KULÜP DERSLERİ';

-- A resolved teacher/pool proves that the requirement is teacher-bearing.
update public.course_requirements requirement
set teacher_requirement = 'REQUIRED'
where requirement.teacher_requirement = 'UNSPECIFIED'
  and requirement.teacher_mode in ('FIXED', 'ELIGIBLE_POOL');

-- A previously classified assignment policy also proves teacher presence is
-- required even if teacher identity is still UNKNOWN.
update public.course_requirements requirement
set teacher_requirement = 'REQUIRED'
where requirement.teacher_requirement = 'UNSPECIFIED'
  and requirement.teacher_assignment_scope in ('REQUIREMENT', 'BLOCK');


-- -------------------------------------------------------------------------
-- CROSS-POLICY CONSISTENCY
-- -------------------------------------------------------------------------

alter table public.course_requirements
  drop constraint if exists course_requirements_teacher_requirement_policy_check;

alter table public.course_requirements
  add constraint course_requirements_teacher_requirement_policy_check
    check (
      (
        teacher_requirement in ('NONE', 'UNSPECIFIED')
        and teacher_assignment_scope = 'UNSPECIFIED'
        and teacher_continuity = 'NONE'
      )
      or
      (
        teacher_requirement in ('REQUIRED', 'OPTIONAL')
        and (
          (
            teacher_assignment_scope = 'REQUIREMENT'
            and teacher_continuity = 'REQUIRED'
          )
          or
          (
            teacher_assignment_scope = 'BLOCK'
            and teacher_continuity in ('PREFERRED', 'NONE')
          )
          or
          (
            teacher_assignment_scope = 'UNSPECIFIED'
            and teacher_continuity = 'NONE'
          )
        )
      )
    );


-- -------------------------------------------------------------------------
-- POLICY AUDIT V2 (same public RPC name)
-- -------------------------------------------------------------------------

create or replace function public.management_diagnose_teacher_assignment_policy(
  p_schedule_revision_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision record;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M32.3.3 management VIEWER role required'
      using errcode = '42501';
  end if;

  select
    revision.id,
    revision.requirement_set_id,
    requirement_set.academic_year,
    requirement_set.term,
    revision.status
  into v_revision
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_schedule_revision_id;

  if not found then
    raise exception
      'M32.3.3 revision not found: %',
      p_schedule_revision_id;
  end if;

  return jsonb_build_object(
    'revisionId', p_schedule_revision_id,
    'academicYear', v_revision.academic_year,
    'term', v_revision.term,
    'revisionStatus', v_revision.status,

    'summary', (
      select jsonb_build_object(
        'requirements', count(*)::integer,
        'requirementScoped', count(*) filter (
          where requirement.teacher_requirement in ('REQUIRED', 'OPTIONAL')
            and requirement.teacher_assignment_scope = 'REQUIREMENT'
        )::integer,
        'blockScoped', count(*) filter (
          where requirement.teacher_requirement in ('REQUIRED', 'OPTIONAL')
            and requirement.teacher_assignment_scope = 'BLOCK'
        )::integer,
        'teacherNotRequired', count(*) filter (
          where requirement.teacher_requirement = 'NONE'
        )::integer,
        'teacherRequirementUnspecified', count(*) filter (
          where requirement.teacher_requirement = 'UNSPECIFIED'
        )::integer,
        'assignmentPolicyUnspecified', count(*) filter (
          where requirement.teacher_requirement in ('REQUIRED', 'OPTIONAL')
            and requirement.teacher_assignment_scope = 'UNSPECIFIED'
        )::integer
      )
      from public.course_requirements requirement
      where requirement.requirement_set_id = v_revision.requirement_set_id
    ),

    'teacherRequirementUnspecified', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'requirementId', requirement.id,
          'subjectName', subject.name,
          'groupName', instructional_group.name,
          'teacherMode', requirement.teacher_mode,
          'cardCount', card_state.card_count
        )
        order by instructional_group.name, subject.name
      )
      from public.course_requirements requirement
      join public.subjects subject
        on subject.id = requirement.subject_id
      join public.instructional_groups instructional_group
        on instructional_group.id = requirement.instructional_group_id
      join lateral (
        select count(*)::integer as card_count
        from public.schedule_cards card
        where card.schedule_revision_id = p_schedule_revision_id
          and card.requirement_id = requirement.id
      ) card_state on true
      where requirement.requirement_set_id = v_revision.requirement_set_id
        and requirement.teacher_requirement = 'UNSPECIFIED'
    ), '[]'::jsonb),

    'teacherNotRequiredRequirements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'requirementId', requirement.id,
          'subjectName', subject.name,
          'groupName', instructional_group.name,
          'cardCount', card_state.card_count,
          'placedBlockCount', card_state.placed_count
        )
        order by instructional_group.name, subject.name
      )
      from public.course_requirements requirement
      join public.subjects subject
        on subject.id = requirement.subject_id
      join public.instructional_groups instructional_group
        on instructional_group.id = requirement.instructional_group_id
      join lateral (
        select
          count(*)::integer as card_count,
          count(placement.id)::integer as placed_count
        from public.schedule_cards card
        left join public.placements placement
          on placement.card_id = card.id
        where card.schedule_revision_id = p_schedule_revision_id
          and card.requirement_id = requirement.id
      ) card_state on true
      where requirement.requirement_set_id = v_revision.requirement_set_id
        and requirement.teacher_requirement = 'NONE'
    ), '[]'::jsonb),

    'requiredTeacherMissingEligibility', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'requirementId', requirement.id,
          'subjectName', subject.name,
          'groupName', instructional_group.name,
          'teacherMode', requirement.teacher_mode
        )
        order by instructional_group.name, subject.name
      )
      from public.course_requirements requirement
      join public.subjects subject
        on subject.id = requirement.subject_id
      join public.instructional_groups instructional_group
        on instructional_group.id = requirement.instructional_group_id
      where requirement.requirement_set_id = v_revision.requirement_set_id
        and requirement.teacher_requirement = 'REQUIRED'
        and (
          requirement.teacher_mode = 'UNKNOWN'
          or not exists (
            select 1
            from public.course_requirement_teachers assignment
            where assignment.requirement_id = requirement.id
          )
        )
    ), '[]'::jsonb),

    'requiredContinuityViolations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'requirementId', requirement.id,
          'subjectName', subject.name,
          'groupName', instructional_group.name,
          'distinctResolvedTeachers', placement_state.teacher_count,
          'placedBlocks', placement_state.placed_count
        )
        order by instructional_group.name, subject.name
      )
      from public.course_requirements requirement
      join public.subjects subject
        on subject.id = requirement.subject_id
      join public.instructional_groups instructional_group
        on instructional_group.id = requirement.instructional_group_id
      join lateral (
        select
          count(*)::integer as placed_count,
          count(distinct placement.teacher_id) filter (
            where placement.teacher_id is not null
          )::integer as teacher_count
        from public.schedule_cards card
        join public.placements placement
          on placement.card_id = card.id
        where card.schedule_revision_id = p_schedule_revision_id
          and card.requirement_id = requirement.id
      ) placement_state on true
      where requirement.requirement_set_id = v_revision.requirement_set_id
        and requirement.teacher_requirement in ('REQUIRED', 'OPTIONAL')
        and requirement.teacher_assignment_scope = 'REQUIREMENT'
        and requirement.teacher_continuity = 'REQUIRED'
        and placement_state.teacher_count > 1
    ), '[]'::jsonb),

    'assignmentPolicyUnspecified', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'requirementId', requirement.id,
          'subjectName', subject.name,
          'groupName', instructional_group.name,
          'teacherMode', requirement.teacher_mode,
          'eligibleTeacherCount', eligibility.teacher_count,
          'cardCount', cards.card_count
        )
        order by instructional_group.name, subject.name
      )
      from public.course_requirements requirement
      join public.subjects subject
        on subject.id = requirement.subject_id
      join public.instructional_groups instructional_group
        on instructional_group.id = requirement.instructional_group_id
      join lateral (
        select count(*)::integer as teacher_count
        from public.course_requirement_teachers assignment
        where assignment.requirement_id = requirement.id
      ) eligibility on true
      join lateral (
        select count(*)::integer as card_count
        from public.schedule_cards card
        where card.schedule_revision_id = p_schedule_revision_id
          and card.requirement_id = requirement.id
      ) cards on true
      where requirement.requirement_set_id = v_revision.requirement_set_id
        and requirement.teacher_requirement in ('REQUIRED', 'OPTIONAL')
        and requirement.teacher_assignment_scope = 'UNSPECIFIED'
    ), '[]'::jsonb),

    'flexibleMultiTeacherRequirements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'requirementId', requirement.id,
          'subjectName', subject.name,
          'groupName', instructional_group.name,
          'continuity', requirement.teacher_continuity,
          'distinctResolvedTeachers', placement_state.teacher_count
        )
        order by instructional_group.name, subject.name
      )
      from public.course_requirements requirement
      join public.subjects subject
        on subject.id = requirement.subject_id
      join public.instructional_groups instructional_group
        on instructional_group.id = requirement.instructional_group_id
      join lateral (
        select
          count(distinct placement.teacher_id) filter (
            where placement.teacher_id is not null
          )::integer as teacher_count
        from public.schedule_cards card
        join public.placements placement
          on placement.card_id = card.id
        where card.schedule_revision_id = p_schedule_revision_id
          and card.requirement_id = requirement.id
      ) placement_state on true
      where requirement.requirement_set_id = v_revision.requirement_set_id
        and requirement.teacher_requirement in ('REQUIRED', 'OPTIONAL')
        and requirement.teacher_assignment_scope = 'BLOCK'
        and placement_state.teacher_count > 1
    ), '[]'::jsonb),

    'fullAutoReady',
      not exists (
        select 1
        from public.course_requirements requirement
        where requirement.requirement_set_id = v_revision.requirement_set_id
          and requirement.teacher_requirement = 'UNSPECIFIED'
      )
      and not exists (
        select 1
        from public.course_requirements requirement
        where requirement.requirement_set_id = v_revision.requirement_set_id
          and requirement.teacher_requirement in ('REQUIRED', 'OPTIONAL')
          and requirement.teacher_assignment_scope = 'UNSPECIFIED'
      )
      and not exists (
        select 1
        from public.course_requirements requirement
        where requirement.requirement_set_id = v_revision.requirement_set_id
          and requirement.teacher_requirement = 'REQUIRED'
          and (
            requirement.teacher_mode = 'UNKNOWN'
            or not exists (
              select 1
              from public.course_requirement_teachers assignment
              where assignment.requirement_id = requirement.id
            )
          )
      )
      and not exists (
        select 1
        from public.course_requirements requirement
        join lateral (
          select count(distinct placement.teacher_id) filter (
            where placement.teacher_id is not null
          )::integer as teacher_count
          from public.schedule_cards card
          join public.placements placement
            on placement.card_id = card.id
          where card.schedule_revision_id = p_schedule_revision_id
            and card.requirement_id = requirement.id
        ) placement_state on true
        where requirement.requirement_set_id = v_revision.requirement_set_id
          and requirement.teacher_requirement in ('REQUIRED', 'OPTIONAL')
          and requirement.teacher_assignment_scope = 'REQUIREMENT'
          and requirement.teacher_continuity = 'REQUIRED'
          and placement_state.teacher_count > 1
      )
  );
end
$$;

revoke all
  on function public.management_diagnose_teacher_assignment_policy(uuid)
  from public, anon;

grant execute
  on function public.management_diagnose_teacher_assignment_policy(uuid)
  to authenticated;

comment on function public.management_diagnose_teacher_assignment_policy(uuid) is
  'M32.3.3 read-only audit of teacher requirement, assignment scope, continuity, missing eligibility, flexible multi-teacher use, and full-auto readiness.';

commit;
