-- Management M32.3A
-- Solver-ready teacher assignment policy foundation.
--
-- IMPORTANT:
-- This migration does NOT enforce same-teacher continuity and does NOT rewrite
-- any placement. The previous experimental continuity implementation was never
-- applied to production; it is replaced here because ELIGIBLE_POOL conflated
-- two different concepts:
--   1) choose one eligible teacher for the whole requirement
--   2) choose independently per weekly block
--
-- Existing eligibility model remains authoritative:
--   teacher_mode = FIXED | ELIGIBLE_POOL | UNKNOWN
--   course_requirement_teachers = eligible identities
--
-- New policy answers a different question:
--   teacher_assignment_scope = REQUIREMENT | BLOCK | UNSPECIFIED
--   teacher_continuity = REQUIRED | PREFERRED | NONE
--
-- No publication mutation. No placement mutation. No candidate rebuild.

begin;

alter table public.course_requirements
  add column if not exists teacher_assignment_scope text not null
    default 'UNSPECIFIED',
  add column if not exists teacher_continuity text not null
    default 'NONE';

alter table public.course_requirements
  drop constraint if exists course_requirements_teacher_assignment_scope_check,
  drop constraint if exists course_requirements_teacher_continuity_check,
  drop constraint if exists course_requirements_teacher_policy_combination_check;

alter table public.course_requirements
  add constraint course_requirements_teacher_assignment_scope_check
    check (
      teacher_assignment_scope in (
        'REQUIREMENT',
        'BLOCK',
        'UNSPECIFIED'
      )
    ),
  add constraint course_requirements_teacher_continuity_check
    check (
      teacher_continuity in (
        'REQUIRED',
        'PREFERRED',
        'NONE'
      )
    ),
  add constraint course_requirements_teacher_policy_combination_check
    check (
      (
        teacher_assignment_scope = 'REQUIREMENT'
        and teacher_continuity = 'REQUIRED'
      )
      or (
        teacher_assignment_scope = 'BLOCK'
        and teacher_continuity in ('PREFERRED', 'NONE')
      )
      or (
        teacher_assignment_scope = 'UNSPECIFIED'
        and teacher_continuity = 'NONE'
      )
    );

comment on column public.course_requirements.teacher_assignment_scope is
  'M32.3A teacher decision granularity. REQUIREMENT chooses one teacher for all weekly blocks; BLOCK chooses per card; UNSPECIFIED preserves legacy/manual behavior until policy is confirmed.';

comment on column public.course_requirements.teacher_continuity is
  'M32.3A continuity policy. REQUIRED is a future hard constraint; PREFERRED is a future soft objective; NONE permits independent block teachers.';


-- -------------------------------------------------------------------------
-- BACKFILL ONLY HIGH-CONFIDENCE POLICY
-- -------------------------------------------------------------------------
-- Ballet-program requirements are explicitly block-flexible.
-- Solfege is explicitly block-flexible in the music program.
-- Standard academic SECTION requirements use one teacher per section/course.
-- One-teacher FIXED requirements are semantically safe as REQUIREMENT/REQUIRED.
-- Everything else remains UNSPECIFIED and will be surfaced by policy audit/UI.

with policy_context as materialized (
  select
    requirement.id,
    requirement.teacher_mode,
    requirement.course_character,
    subject.name as subject_name,
    instructional_group.name as group_name,
    instructional_group.group_type
  from public.course_requirements requirement
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
)
update public.course_requirements requirement
set
  teacher_assignment_scope = case
    when context.group_name ilike '%BALLET%'
      then 'BLOCK'
    when lower(context.subject_name) = lower('Solfej')
      then 'BLOCK'
    when context.group_type = 'SECTION'
      and context.course_character = 'ACADEMIC'
      then 'REQUIREMENT'
    when context.teacher_mode = 'FIXED'
      then 'REQUIREMENT'
    else 'UNSPECIFIED'
  end,
  teacher_continuity = case
    when context.group_name ilike '%BALLET%'
      then 'NONE'
    when lower(context.subject_name) = lower('Solfej')
      then 'NONE'
    when context.group_type = 'SECTION'
      and context.course_character = 'ACADEMIC'
      then 'REQUIRED'
    when context.teacher_mode = 'FIXED'
      then 'REQUIRED'
    else 'NONE'
  end
from policy_context context
where context.id = requirement.id;


-- -------------------------------------------------------------------------
-- READ-ONLY AUDIT
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
    raise exception 'M32.3A management VIEWER role required'
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
      'M32.3A revision not found: %',
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
          where requirement.teacher_assignment_scope = 'REQUIREMENT'
        )::integer,
        'blockScoped', count(*) filter (
          where requirement.teacher_assignment_scope = 'BLOCK'
        )::integer,
        'unspecified', count(*) filter (
          where requirement.teacher_assignment_scope = 'UNSPECIFIED'
        )::integer
      )
      from public.course_requirements requirement
      where requirement.requirement_set_id = v_revision.requirement_set_id
    ),

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
        and requirement.teacher_assignment_scope = 'REQUIREMENT'
        and requirement.teacher_continuity = 'REQUIRED'
        and placement_state.teacher_count > 1
    ), '[]'::jsonb),

    'unspecifiedMultiBlockPools', coalesce((
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
        and requirement.teacher_assignment_scope = 'UNSPECIFIED'
        and requirement.teacher_mode = 'ELIGIBLE_POOL'
        and eligibility.teacher_count > 1
        and cards.card_count > 1
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
        and requirement.teacher_assignment_scope = 'BLOCK'
        and placement_state.teacher_count > 1
    ), '[]'::jsonb),

    'fullAutoReady', not exists (
      select 1
      from public.course_requirements requirement
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
        and requirement.teacher_assignment_scope = 'UNSPECIFIED'
        and requirement.teacher_mode = 'ELIGIBLE_POOL'
        and eligibility.teacher_count > 1
        and cards.card_count > 1
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
  'M32.3A read-only audit for teacher assignment scope, continuity violations, unspecified multi-block pools, flexible multi-teacher use, and full-auto readiness.';

commit;
