-- M32.5 rollback-only candidate policy + forward impact QA
--
-- Safe production diagnostic:
--   * temporarily removes one placed block from a fully placed
--     REQUIREMENT+REQUIRED course whose planning pool has >1 teacher,
--   * rebuilds that card's candidates,
--   * verifies the persisted candidate domain follows the teacher already
--     resolved by the remaining placed blocks,
--   * previews the removed block's original placement through the forward
--     impact engine,
--   * rolls everything back.
--
-- No production state survives this script.

begin;

do $$
declare
  v_revision_id uuid;
  v_requirement_id uuid;
  v_card_id uuid;
  v_day smallint;
  v_start smallint;
  v_teacher_id uuid;
  v_room_id uuid;
  v_resolved_teacher_id uuid;
  v_policy_reason_count integer;
  v_wrong_valid_count integer;
  v_forward jsonb;
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
    raise exception 'M32.5 QA active DRAFT revision not found';
  end if;

  with candidate_requirement as (
    select
      requirement.id as requirement_id,
      count(card.id)::integer as card_count,
      count(placement.id)::integer as placed_count,
      count(distinct placement.teacher_id) filter (
        where placement.teacher_id is not null
      )::integer as placed_teacher_count,
      (
        select count(*)::integer
        from public.course_requirement_teachers assignment
        where assignment.requirement_id = requirement.id
      ) as pool_size
    from public.course_requirements requirement
    join public.schedule_cards card
      on card.requirement_id = requirement.id
     and card.schedule_revision_id = v_revision_id
    left join public.placements placement
      on placement.card_id = card.id
    where requirement.term_status = 'ACTIVE'
      and requirement.teacher_requirement = 'REQUIRED'
      and requirement.teacher_assignment_scope = 'REQUIREMENT'
      and requirement.teacher_continuity = 'REQUIRED'
    group by requirement.id
  )
  select candidate.requirement_id
  into v_requirement_id
  from candidate_requirement candidate
  where candidate.card_count > 1
    and candidate.placed_count = candidate.card_count
    and candidate.placed_teacher_count = 1
    and candidate.pool_size > 1
  order by candidate.card_count desc, candidate.requirement_id
  limit 1;

  if v_requirement_id is null then
    raise exception
      'M32.5 QA suitable fully placed REQUIREMENT+REQUIRED course not found';
  end if;

  select
    card.id,
    placement.day_of_week,
    placement.start_period,
    placement.teacher_id,
    placement.room_id
  into
    v_card_id,
    v_day,
    v_start,
    v_teacher_id,
    v_room_id
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = v_requirement_id
  order by card.block_index, card.id
  limit 1;

  delete from public.placements
  where card_id = v_card_id;

  select (
    array_agg(
      distinct placement.teacher_id
      order by placement.teacher_id
    ) filter (
      where placement.teacher_id is not null
    )
  )[1]
  into v_resolved_teacher_id
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = v_requirement_id;

  if v_resolved_teacher_id is null then
    raise exception
      'M32.5 QA remaining blocks did not resolve one teacher';
  end if;

  perform public.refresh_management_candidate_domain_subset(
    v_revision_id,
    array[v_card_id]::uuid[]
  );

  select count(*)::integer
  into v_policy_reason_count
  from public.schedule_card_candidate_assessments assessment
  where assessment.card_id = v_card_id
    and assessment.teacher_id is distinct from v_resolved_teacher_id
    and 'REQUIREMENT_TEACHER_MISMATCH' = any(
      coalesce(assessment.reason_codes, array[]::text[])
    );

  if v_policy_reason_count = 0 then
    raise exception
      'M32.5 QA expected persisted REQUIREMENT_TEACHER_MISMATCH candidates';
  end if;

  select count(*)::integer
  into v_wrong_valid_count
  from public.schedule_card_candidate_assessments assessment
  where assessment.card_id = v_card_id
    and assessment.status = 'VALID'
    and assessment.is_complete
    and assessment.teacher_id is distinct from v_resolved_teacher_id;

  if v_wrong_valid_count <> 0 then
    raise exception
      'M32.5 QA found % VALID candidates outside resolved requirement teacher',
      v_wrong_valid_count;
  end if;

  if not exists (
    select 1
    from public.schedule_card_candidate_assessments assessment
    where assessment.card_id = v_card_id
      and assessment.day_of_week = v_day
      and assessment.start_period = v_start
      and assessment.teacher_id is not distinct from v_teacher_id
      and assessment.room_id is not distinct from v_room_id
      and assessment.status = 'VALID'
      and assessment.is_complete
  ) then
    raise exception
      'M32.5 QA original placement did not rebuild as a VALID candidate';
  end if;

  v_forward := public.management_preview_candidate_forward_impact(
    jsonb_build_array(
      jsonb_build_object(
        'cardId', v_card_id,
        'dayOfWeek', v_day,
        'startPeriod', v_start,
        'teacherId', v_teacher_id,
        'roomId', v_room_id
      )
    )
  );

  if coalesce((v_forward ->> 'previewOnly')::boolean, false) is not true then
    raise exception 'M32.5 QA forward impact is not preview-only';
  end if;

  if (v_forward ->> 'itemCount')::integer <> 1 then
    raise exception
      'M32.5 QA forward impact itemCount expected 1, got %',
      v_forward ->> 'itemCount';
  end if;

  if jsonb_array_length(
    coalesce(v_forward -> 'scenarioBlockReasons', '[]'::jsonb)
  ) <> 0 then
    raise exception
      'M32.5 QA original placement has scenario blockers: %',
      v_forward -> 'scenarioBlockReasons';
  end if;

  raise notice
    'M32.5 ROLLBACK QA PASS: requirement %, card %, policy rows %, forward loss %, forced %, contradictions %',
    v_requirement_id,
    v_card_id,
    v_policy_reason_count,
    v_forward ->> 'domainLossCount',
    v_forward ->> 'newForcedCount',
    v_forward ->> 'newContradictionCount';
end
$$;

rollback;
