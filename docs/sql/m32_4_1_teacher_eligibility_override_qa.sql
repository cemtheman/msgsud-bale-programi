-- M32.4.1 teacher eligibility override QA
--
-- Read-only SQL Editor smoke:
-- 1. finds an ACTIVE placed BLOCK-scoped requirement with an eligible teacher pool
-- 2. picks one ACTIVE teacher outside that pool
-- 3. verifies v2 placement override preview rejects the teacher with
--    TEACHER_NOT_ELIGIBLE
-- 4. when an alternate eligible teacher exists, verifies that eligibility
--    itself does not block that teacher (other timetable conflicts may still do so)
--
-- No writes.

do $$
declare
  v_revision_id uuid;
  v_requirement_id uuid;
  v_card_id uuid;
  v_current_teacher_id uuid;
  v_outside_teacher_id uuid;
  v_alternate_eligible_teacher_id uuid;
  v_outside_preview jsonb;
  v_eligible_preview jsonb;
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
    raise exception 'M32.4.1 QA active DRAFT revision not found';
  end if;

  select
    requirement.id,
    card.id,
    placement.teacher_id
  into
    v_requirement_id,
    v_card_id,
    v_current_teacher_id
  from public.course_requirements requirement
  join public.schedule_cards card
    on card.requirement_id = requirement.id
   and card.schedule_revision_id = v_revision_id
  join public.placements placement
    on placement.card_id = card.id
  where requirement.term_status = 'ACTIVE'
    and requirement.teacher_requirement in ('REQUIRED', 'OPTIONAL')
    and requirement.teacher_assignment_scope = 'BLOCK'
    and exists (
      select 1
      from public.course_requirement_teachers assignment
      where assignment.requirement_id = requirement.id
    )
    and exists (
      select 1
      from public.teachers teacher
      where teacher.operational_status = 'ACTIVE'
        and not exists (
          select 1
          from public.course_requirement_teachers assignment
          where assignment.requirement_id = requirement.id
            and assignment.teacher_id = teacher.id
        )
    )
  order by
    case when exists (
      select 1
      from public.subjects subject
      where subject.id = requirement.subject_id
        and lower(subject.name) = lower('Solfej')
    ) then 0 else 1 end,
    requirement.id,
    card.block_index
  limit 1;

  if v_requirement_id is null or v_card_id is null then
    raise exception 'M32.4.1 QA suitable BLOCK requirement not found';
  end if;

  select teacher.id
  into v_outside_teacher_id
  from public.teachers teacher
  where teacher.operational_status = 'ACTIVE'
    and not exists (
      select 1
      from public.course_requirement_teachers assignment
      where assignment.requirement_id = v_requirement_id
        and assignment.teacher_id = teacher.id
    )
  order by teacher.name, teacher.id
  limit 1;

  if v_outside_teacher_id is null then
    raise exception 'M32.4.1 QA outside-pool teacher not found';
  end if;

  v_outside_preview :=
    public.management_preview_placement_resource_change_v2(
      array[v_card_id],
      'TEACHER',
      v_outside_teacher_id
    );

  if coalesce((v_outside_preview ->> 'canApply')::boolean, true) then
    raise exception
      'M32.4.1 QA outside-pool teacher unexpectedly canApply=true';
  end if;

  if not (
    (v_outside_preview -> 'blockReasons')
      @> '["TEACHER_NOT_ELIGIBLE"]'::jsonb
  ) then
    raise exception
      'M32.4.1 QA outside-pool teacher missing TEACHER_NOT_ELIGIBLE: %',
      v_outside_preview -> 'blockReasons';
  end if;

  select assignment.teacher_id
  into v_alternate_eligible_teacher_id
  from public.course_requirement_teachers assignment
  join public.teachers teacher
    on teacher.id = assignment.teacher_id
  where assignment.requirement_id = v_requirement_id
    and teacher.operational_status = 'ACTIVE'
    and assignment.teacher_id is distinct from v_current_teacher_id
  order by teacher.name, teacher.id
  limit 1;

  if v_alternate_eligible_teacher_id is not null then
    v_eligible_preview :=
      public.management_preview_placement_resource_change_v2(
        array[v_card_id],
        'TEACHER',
        v_alternate_eligible_teacher_id
      );

    if (
      (v_eligible_preview -> 'blockReasons')
        @> '["TEACHER_NOT_ELIGIBLE"]'::jsonb
    ) then
      raise exception
        'M32.4.1 QA eligible teacher was incorrectly rejected by eligibility gate';
    end if;
  end if;

  raise notice
    'M32.4.1 eligibility QA PASS: requirement %, card %, outside teacher %, alternate eligible teacher %',
    v_requirement_id,
    v_card_id,
    v_outside_teacher_id,
    v_alternate_eligible_teacher_id;
end
$$;
