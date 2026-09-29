-- M32.4.2 manual teacher override QA
--
-- Read-only SQL Editor diagnostic.
-- Confirms that course_requirement_teachers is treated as an automatic planning
-- pool rather than a hard qualification whitelist for explicit manual edits.
--
-- Checks:
--   1. BLOCK scoped placed lesson may preview an ACTIVE teacher outside the
--      planning pool without TEACHER_NOT_ELIGIBLE.
--   2. REQUIREMENT+REQUIRED single-card request expands to every placed block of
--      the requirement.
--   3. Manual override does not silently mutate the planning pool.
--   4. Existing timetable conflicts may still block canApply; that is expected.
--
-- No writes.

do $$
declare
  v_revision_id uuid;

  v_block_requirement_id uuid;
  v_block_card_id uuid;
  v_block_outside_teacher_id uuid;
  v_block_preview jsonb;

  v_requirement_id uuid;
  v_requirement_card_id uuid;
  v_requirement_placed_count integer;
  v_requirement_outside_teacher_id uuid;
  v_requirement_preview jsonb;
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
    raise exception 'M32.4.2 QA active DRAFT revision not found';
  end if;

  -- Prefer Solfej, then any BLOCK-scoped placed requirement.
  select
    requirement.id,
    card.id
  into
    v_block_requirement_id,
    v_block_card_id
  from public.course_requirements requirement
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.schedule_cards card
    on card.requirement_id = requirement.id
   and card.schedule_revision_id = v_revision_id
  join public.placements placement
    on placement.card_id = card.id
  where requirement.term_status = 'ACTIVE'
    and requirement.teacher_requirement in ('REQUIRED', 'OPTIONAL')
    and requirement.teacher_assignment_scope = 'BLOCK'
  order by
    case when lower(subject.name) = lower('Solfej') then 0 else 1 end,
    requirement.id,
    card.block_index
  limit 1;

  if v_block_requirement_id is null then
    raise exception 'M32.4.2 QA BLOCK-scoped placed requirement not found';
  end if;

  select teacher.id
  into v_block_outside_teacher_id
  from public.teachers teacher
  where teacher.operational_status = 'ACTIVE'
    and not exists (
      select 1
      from public.course_requirement_teachers assignment
      where assignment.requirement_id = v_block_requirement_id
        and assignment.teacher_id = teacher.id
    )
  order by teacher.name, teacher.id
  limit 1;

  if v_block_outside_teacher_id is null then
    raise exception 'M32.4.2 QA outside-pool BLOCK teacher not found';
  end if;

  v_block_preview :=
    public.management_preview_placement_resource_change_v2(
      array[v_block_card_id],
      'TEACHER',
      v_block_outside_teacher_id
    );

  if (
    v_block_preview -> 'blockReasons'
      @> '["TEACHER_NOT_ELIGIBLE"]'::jsonb
  ) then
    raise exception
      'M32.4.2 QA BLOCK manual teacher incorrectly treated as ineligible: %',
      v_block_preview -> 'blockReasons';
  end if;

  if coalesce((v_block_preview ->> 'outsidePlanningPoolCount')::integer, 0) < 1 then
    raise exception
      'M32.4.2 QA BLOCK preview did not report outside planning pool';
  end if;

  if coalesce((v_block_preview ->> 'planningPoolChanged')::boolean, true) then
    raise exception
      'M32.4.2 QA BLOCK preview unexpectedly reports planning pool mutation';
  end if;

  if (v_block_preview ->> 'affectedCardCount')::integer <> 1 then
    raise exception
      'M32.4.2 QA BLOCK preview should affect exactly one card, got %',
      v_block_preview ->> 'affectedCardCount';
  end if;


  -- Pick a fully placed REQUIREMENT+REQUIRED course with multiple blocks.
  select
    requirement.id,
    min(card.id::text)::uuid,
    count(*)::integer
  into
    v_requirement_id,
    v_requirement_card_id,
    v_requirement_placed_count
  from public.course_requirements requirement
  join public.schedule_cards card
    on card.requirement_id = requirement.id
   and card.schedule_revision_id = v_revision_id
  join public.placements placement
    on placement.card_id = card.id
  where requirement.term_status = 'ACTIVE'
    and requirement.teacher_requirement = 'REQUIRED'
    and requirement.teacher_assignment_scope = 'REQUIREMENT'
    and requirement.teacher_continuity = 'REQUIRED'
    and not exists (
      select 1
      from public.schedule_cards missing_card
      where missing_card.schedule_revision_id = v_revision_id
        and missing_card.requirement_id = requirement.id
        and not exists (
          select 1
          from public.placements missing_placement
          where missing_placement.card_id = missing_card.id
        )
    )
  group by requirement.id
  having count(*) > 1
  order by count(*) desc, requirement.id
  limit 1;

  if v_requirement_id is null then
    raise exception
      'M32.4.2 QA fully placed REQUIREMENT+REQUIRED course not found';
  end if;

  select teacher.id
  into v_requirement_outside_teacher_id
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

  if v_requirement_outside_teacher_id is null then
    raise exception
      'M32.4.2 QA outside-pool requirement teacher not found';
  end if;

  v_requirement_preview :=
    public.management_preview_placement_resource_change_v2(
      array[v_requirement_card_id],
      'TEACHER',
      v_requirement_outside_teacher_id
    );

  if (
    v_requirement_preview -> 'blockReasons'
      @> '["TEACHER_NOT_ELIGIBLE"]'::jsonb
  ) then
    raise exception
      'M32.4.2 QA requirement-wide manual teacher incorrectly treated as ineligible';
  end if;

  if (
    v_requirement_preview -> 'blockReasons'
      @> '["REQUIREMENT_TEACHER_MISMATCH"]'::jsonb
  ) then
    raise exception
      'M32.4.2 QA requirement-wide expansion still produced continuity mismatch';
  end if;

  if (v_requirement_preview ->> 'affectedCardCount')::integer
     <> v_requirement_placed_count then
    raise exception
      'M32.4.2 QA expected % requirement cards, preview affected %',
      v_requirement_placed_count,
      v_requirement_preview ->> 'affectedCardCount';
  end if;

  if coalesce(
    (v_requirement_preview ->> 'requirementWideExpansionCount')::integer,
    0
  ) < 1 then
    raise exception
      'M32.4.2 QA requirement-wide expansion flag missing';
  end if;

  if coalesce(
    (v_requirement_preview ->> 'outsidePlanningPoolCount')::integer,
    0
  ) < 1 then
    raise exception
      'M32.4.2 QA requirement preview did not report manual outside-pool teacher';
  end if;

  if coalesce(
    (v_requirement_preview ->> 'planningPoolChanged')::boolean,
    true
  ) then
    raise exception
      'M32.4.2 QA requirement preview unexpectedly reports planning pool mutation';
  end if;

  raise notice
    'M32.4.2 QA PASS: BLOCK card %, requirement % expanded from 1 to % placed cards',
    v_block_card_id,
    v_requirement_id,
    v_requirement_placed_count;
end
$$;
