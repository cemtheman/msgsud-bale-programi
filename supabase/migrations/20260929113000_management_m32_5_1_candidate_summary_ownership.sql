-- Management M32.5.1
-- Candidate-policy summary ownership fix.
--
-- M32.5 added an AFTER-statement candidate trigger that reclassifies every
-- candidate row in an affected REQUIREMENT+REQUIRED course. Its summary pass
-- used INSERT ... ON CONFLICT. During a full/subset candidate-domain rebuild,
-- the caller intentionally deletes the target card's summary first, inserts
-- candidate rows, and only then creates the fresh summary. The M32.5 trigger
-- therefore created that summary too early, and the caller's final INSERT hit
-- the schedule_card_domain_summaries primary key.
--
-- Ownership rule:
--   * candidate-domain builders own creation of a missing summary row;
--   * the M32.5 policy trigger may only UPDATE summaries that already exist.
--
-- This keeps same-requirement non-overlap summaries coherent without racing
-- the domain builder that is currently rebuilding a card.

begin;


create or replace function public.management_apply_teacher_policy_candidate_batch()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- The policy pass updates candidate rows itself. Prevent recursive work from
  -- the nested UPDATE while still letting the existing M22 BEFORE trigger
  -- normalize resource certainty/reason semantics.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  with impacted_requirement as materialized (
    select distinct
      card.schedule_revision_id,
      card.requirement_id
    from changed_rows changed
    join public.schedule_cards card
      on card.id = changed.card_id
  ),
  policy_state as materialized (
    select
      impacted.schedule_revision_id,
      impacted.requirement_id,
      requirement.teacher_assignment_scope,
      requirement.teacher_continuity,
      count(distinct placement.teacher_id) filter (
        where placement.teacher_id is not null
      )::integer as placed_teacher_count,
      (
        array_agg(
          distinct placement.teacher_id
          order by placement.teacher_id
        ) filter (
          where placement.teacher_id is not null
        )
      )[1] as resolved_teacher_id
    from impacted_requirement impacted
    join public.course_requirements requirement
      on requirement.id = impacted.requirement_id
    left join public.schedule_cards placed_card
      on placed_card.schedule_revision_id = impacted.schedule_revision_id
     and placed_card.requirement_id = impacted.requirement_id
    left join public.placements placement
      on placement.card_id = placed_card.id
    group by
      impacted.schedule_revision_id,
      impacted.requirement_id,
      requirement.teacher_assignment_scope,
      requirement.teacher_continuity
  ),
  target as materialized (
    select
      assessment.id as assessment_id,
      state.schedule_revision_id,
      state.requirement_id,
      state.teacher_assignment_scope,
      state.teacher_continuity,
      state.placed_teacher_count,
      state.resolved_teacher_id,
      case
        when state.teacher_assignment_scope = 'REQUIREMENT'
         and state.teacher_continuity = 'REQUIRED'
         and state.placed_teacher_count > 1
          then 'REQUIREMENT_TEACHER_CONFLICT'
        when state.teacher_assignment_scope = 'REQUIREMENT'
         and state.teacher_continuity = 'REQUIRED'
         and state.placed_teacher_count = 1
         and assessment.teacher_id is distinct from state.resolved_teacher_id
          then 'REQUIREMENT_TEACHER_MISMATCH'
        else null
      end as policy_reason
    from policy_state state
    join public.schedule_cards card
      on card.schedule_revision_id = state.schedule_revision_id
     and card.requirement_id = state.requirement_id
    join public.schedule_card_candidate_assessments assessment
      on assessment.card_id = card.id
  )
  update public.schedule_card_candidate_assessments assessment
  set
    reason_codes = (
      select coalesce(
        array_agg(distinct reason order by reason),
        array[]::text[]
      )
      from (
        select existing.reason
        from unnest(
          coalesce(assessment.reason_codes, array[]::text[])
        ) existing(reason)
        where existing.reason not in (
          'REQUIREMENT_TEACHER_MISMATCH',
          'REQUIREMENT_TEACHER_CONFLICT'
        )

        union all

        select target.policy_reason
        where target.policy_reason is not null
      ) combined
    ),
    status = case
      when target.policy_reason is null then 'VALID'
      else 'INVALID'
    end,
    is_complete = target.policy_reason is null,
    details = coalesce(assessment.details, '{}'::jsonb)
      || jsonb_build_object(
        'teacher_policy_engine_version', 'M32.5.1-v1',
        'teacher_policy_scope', target.teacher_assignment_scope,
        'teacher_policy_continuity', target.teacher_continuity,
        'teacher_policy_placed_teacher_count', target.placed_teacher_count,
        'teacher_policy_resolved_teacher_id', target.resolved_teacher_id,
        'teacher_policy_reason', target.policy_reason
      ),
    generated_at = now()
  from target
  where assessment.id = target.assessment_id;

  -- Only UPDATE summary rows that already exist. A candidate-domain builder
  -- may have deliberately deleted the summary while rebuilding the card; in
  -- that case the builder owns the later INSERT.
  with impacted_requirement as materialized (
    select distinct
      card.schedule_revision_id,
      card.requirement_id
    from changed_rows changed
    join public.schedule_cards card
      on card.id = changed.card_id
  ),
  impacted_card as materialized (
    select card.id
    from impacted_requirement impacted
    join public.schedule_cards card
      on card.schedule_revision_id = impacted.schedule_revision_id
     and card.requirement_id = impacted.requirement_id
  ),
  aggregate as materialized (
    select
      assessment.card_id,
      count(*) filter (
        where assessment.status = 'VALID'
      )::integer as valid_count,
      count(*) filter (
        where assessment.status = 'INVALID'
      )::integer as invalid_count,
      count(*) filter (
        where assessment.status = 'UNRESOLVED'
      )::integer as unresolved_count,
      count(*) filter (
        where assessment.is_complete
      )::integer as complete_candidate_count
    from public.schedule_card_candidate_assessments assessment
    join impacted_card card
      on card.id = assessment.card_id
    group by assessment.card_id
  )
  update public.schedule_card_domain_summaries summary
  set
    domain_status = case
      when aggregate.unresolved_count > 0 then 'UNRESOLVED'
      when aggregate.valid_count = 0 then 'INVALID'
      else 'VALID'
    end,
    valid_count = aggregate.valid_count,
    invalid_count = aggregate.invalid_count,
    unresolved_count = aggregate.unresolved_count,
    complete_candidate_count = aggregate.complete_candidate_count,
    is_forced = (
      aggregate.valid_count = 1
      and aggregate.unresolved_count = 0
    ),
    is_contradiction = (
      aggregate.valid_count = 0
      and aggregate.unresolved_count = 0
    ),
    generated_at = now()
  from aggregate
  where summary.card_id = aggregate.card_id;

  return null;
end
$$;


revoke all
  on function public.management_apply_teacher_policy_candidate_batch()
  from public, anon, authenticated;

comment on function public.management_apply_teacher_policy_candidate_batch() is
  'M32.5.1 set-based teacher-policy candidate enforcement. Reclassifies same-requirement candidate rows and updates only pre-existing domain summaries; candidate-domain builders retain ownership of summary creation during rebuilds.';

commit;
