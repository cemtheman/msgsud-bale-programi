-- M32.3.7 rollback-only coordinated teacher reconciliation QA
--
-- Exercises the complete backend transaction:
--   preview -> apply -> audit -> undo -> audit -> redo -> audit
-- and then ROLLBACKS everything.
--
-- Safe to run in Supabase SQL Editor after M32.3.7 is applied.
-- The script automatically chooses the currently valid coordinated plan with
-- the fewest changed blocks ONLY inside this rollback-only QA transaction.

begin;

do $$
declare
  v_revision_id uuid;
  v_assignments jsonb;
  v_preview jsonb;
  v_apply jsonb;
  v_undo_id uuid;
  v_redo_id uuid;
  v_audit jsonb;
  v_violation_count integer;
begin
  select revision.id
  into v_revision_id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.status = 'DRAFT'
    and requirement_set.status = 'DRAFT'
    and requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
  order by revision.version_number desc
  limit 1;

  if v_revision_id is null then
    raise exception 'M32.3.7 QA active DRAFT revision not found';
  end if;

  with violations as (
    select
      row_number() over (
        order by instructional_group.name, subject.name, requirement.id
      ) as ordinal,
      requirement.id as requirement_id
    from public.schedule_cards card
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    join public.subjects subject
      on subject.id = requirement.subject_id
    join public.instructional_groups instructional_group
      on instructional_group.id = requirement.instructional_group_id
    join public.placements placement
      on placement.card_id = card.id
    where card.schedule_revision_id = v_revision_id
      and requirement.term_status = 'ACTIVE'
      and requirement.teacher_requirement = 'REQUIRED'
      and requirement.teacher_assignment_scope = 'REQUIREMENT'
      and requirement.teacher_continuity = 'REQUIRED'
    group by
      requirement.id,
      instructional_group.name,
      subject.name
    having count(distinct placement.teacher_id) filter (
      where placement.teacher_id is not null
    ) > 1
  ),
  first_requirement as (
    select requirement_id
    from violations
    where ordinal = 1
  ),
  second_requirement as (
    select requirement_id
    from violations
    where ordinal = 2
  ),
  first_options as (
    select
      first_requirement.requirement_id,
      assignment.teacher_id
    from first_requirement
    join public.course_requirement_teachers assignment
      on assignment.requirement_id = first_requirement.requirement_id
  ),
  second_options as (
    select
      second_requirement.requirement_id,
      assignment.teacher_id
    from second_requirement
    join public.course_requirement_teachers assignment
      on assignment.requirement_id = second_requirement.requirement_id
  ),
  plans as (
    select
      jsonb_build_array(
        jsonb_build_object(
          'requirementId', first_options.requirement_id,
          'teacherId', first_options.teacher_id
        ),
        jsonb_build_object(
          'requirementId', second_options.requirement_id,
          'teacherId', second_options.teacher_id
        )
      ) as assignments
    from first_options
    cross join second_options
    where (select count(*) from violations) = 2
  ),
  previews as (
    select
      plans.assignments,
      public.management_preview_coordinated_teacher_reconciliation(
        plans.assignments
      ) as preview
    from plans
  )
  select
    assignments,
    preview
  into
    v_assignments,
    v_preview
  from previews
  where coalesce((preview ->> 'canApply')::boolean, false)
  order by (preview ->> 'changedBlockCount')::integer asc
  limit 1;

  if v_assignments is null or v_preview is null then
    raise exception
      'M32.3.7 QA found no valid coordinated reconciliation plan';
  end if;

  v_apply := public.management_apply_coordinated_teacher_reconciliation(
    v_assignments,
    v_preview ->> 'stateToken'
  );

  v_audit :=
    public.management_diagnose_teacher_assignment_policy(v_revision_id);

  v_violation_count :=
    jsonb_array_length(v_audit -> 'requiredContinuityViolations');

  if v_violation_count <> 0 then
    raise exception
      'M32.3.7 QA apply expected 0 continuity violations, found %',
      v_violation_count;
  end if;

  v_undo_id :=
    public.management_undo_coordinated_teacher_reconciliation(
      (v_apply ->> 'transactionId')::uuid
    );

  v_audit :=
    public.management_diagnose_teacher_assignment_policy(v_revision_id);

  v_violation_count :=
    jsonb_array_length(v_audit -> 'requiredContinuityViolations');

  if v_violation_count <> 2 then
    raise exception
      'M32.3.7 QA undo expected 2 continuity violations, found %',
      v_violation_count;
  end if;

  v_redo_id :=
    public.management_redo_coordinated_teacher_reconciliation(v_undo_id);

  v_audit :=
    public.management_diagnose_teacher_assignment_policy(v_revision_id);

  v_violation_count :=
    jsonb_array_length(v_audit -> 'requiredContinuityViolations');

  if v_violation_count <> 0 then
    raise exception
      'M32.3.7 QA redo expected 0 continuity violations, found %',
      v_violation_count;
  end if;

  raise notice
    'M32.3.7 ROLLBACK QA PASS: changed blocks %, apply %, undo %, redo %',
    v_apply ->> 'changedBlockCount',
    v_apply ->> 'transactionId',
    v_undo_id,
    v_redo_id;
end
$$;

rollback;
