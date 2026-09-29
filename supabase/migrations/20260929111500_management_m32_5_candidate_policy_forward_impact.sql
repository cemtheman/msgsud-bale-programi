-- Management M32.5
-- Teacher-policy candidate enforcement + forward-domain impact preview.
--
-- Goals:
--   1. Make REQUIREMENT + REQUIRED teacher continuity part of the persisted
--      candidate domain, not only a frontend read filter.
--   2. Keep history safe: no placement trigger rejects undo/redo snapshots.
--      Candidate rows are reclassified from the CURRENT placement state.
--   3. Give the Placement Assistant a read-only "what would this placement do
--      to the remaining domains?" preview.
--
-- BLOCK + NONE/PREFERRED remains hard-filter neutral.
-- Manual teacher override authority from M32.4.2 is unchanged.

begin;


-- -------------------------------------------------------------------------
-- A. SET-BASED CANDIDATE POLICY ENFORCEMENT
-- -------------------------------------------------------------------------

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
    -- M22's BEFORE UPDATE trigger remains the final certainty classifier.
    -- Feed it VALID for the clean path and INVALID when policy blocks.
    status = case
      when target.policy_reason is null then 'VALID'
      else 'INVALID'
    end,
    is_complete = target.policy_reason is null,
    details = coalesce(assessment.details, '{}'::jsonb)
      || jsonb_build_object(
        'teacher_policy_engine_version', 'M32.5-v1',
        'teacher_policy_scope', target.teacher_assignment_scope,
        'teacher_policy_continuity', target.teacher_continuity,
        'teacher_policy_placed_teacher_count', target.placed_teacher_count,
        'teacher_policy_resolved_teacher_id', target.resolved_teacher_id,
        'teacher_policy_reason', target.policy_reason
      ),
    generated_at = now()
  from target
  where assessment.id = target.assessment_id;

  -- The policy pass may touch non-overlapping cards of the same requirement.
  -- Keep their domain summaries coherent even when the caller's delta-refresh
  -- originally selected only a smaller overlap subset.
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
  insert into public.schedule_card_domain_summaries (
    card_id,
    domain_status,
    valid_count,
    invalid_count,
    unresolved_count,
    complete_candidate_count,
    is_forced,
    is_contradiction,
    generated_at
  )
  select
    aggregate.card_id,
    case
      when aggregate.unresolved_count > 0 then 'UNRESOLVED'
      when aggregate.valid_count = 0 then 'INVALID'
      else 'VALID'
    end,
    aggregate.valid_count,
    aggregate.invalid_count,
    aggregate.unresolved_count,
    aggregate.complete_candidate_count,
    (
      aggregate.valid_count = 1
      and aggregate.unresolved_count = 0
    ),
    (
      aggregate.valid_count = 0
      and aggregate.unresolved_count = 0
    ),
    now()
  from aggregate
  on conflict (card_id) do update
  set
    domain_status = excluded.domain_status,
    valid_count = excluded.valid_count,
    invalid_count = excluded.invalid_count,
    unresolved_count = excluded.unresolved_count,
    complete_candidate_count = excluded.complete_candidate_count,
    is_forced = excluded.is_forced,
    is_contradiction = excluded.is_contradiction,
    generated_at = excluded.generated_at;

  return null;
end
$$;


drop trigger if exists
  zzz_management_teacher_policy_candidate_insert
  on public.schedule_card_candidate_assessments;

create trigger zzz_management_teacher_policy_candidate_insert
after insert
on public.schedule_card_candidate_assessments
referencing new table as changed_rows
for each statement
execute function public.management_apply_teacher_policy_candidate_batch();


drop trigger if exists
  zzz_management_teacher_policy_candidate_update
  on public.schedule_card_candidate_assessments;

create trigger zzz_management_teacher_policy_candidate_update
after update
on public.schedule_card_candidate_assessments
referencing new table as changed_rows
for each statement
execute function public.management_apply_teacher_policy_candidate_batch();


revoke all
  on function public.management_apply_teacher_policy_candidate_batch()
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- B. READ-ONLY FORWARD-DOMAIN IMPACT
-- -------------------------------------------------------------------------

create or replace function public.management_preview_candidate_forward_impact(
  p_items jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item_count integer;
  v_distinct_card_count integer;
  v_revision_id uuid;
  v_revision_count integer;
  v_matched_card_count integer;
  v_invalid_candidate_count integer;
  v_already_placed_count integer;
  v_scenario_block_reasons text[] := array[]::text[];
  v_impact_rows jsonb := '[]'::jsonb;
  v_affected_card_count integer := 0;
  v_domain_loss_count integer := 0;
  v_new_forced_count integer := 0;
  v_new_contradiction_count integer := 0;
  v_state_token text;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M32.5 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'M32.5 forward impact requires a JSON array';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 24 then
    raise exception 'M32.5 forward impact requires 1..24 items';
  end if;

  with input as (
    select
      nullif(entry.value ->> 'cardId', '')::uuid as card_id
    from jsonb_array_elements(p_items) entry(value)
  )
  select
    count(distinct input.card_id),
    count(card.id),
    count(distinct card.schedule_revision_id),
    (array_agg(
      distinct card.schedule_revision_id
      order by card.schedule_revision_id
    ))[1]
  into
    v_distinct_card_count,
    v_matched_card_count,
    v_revision_count,
    v_revision_id
  from input
  left join public.schedule_cards card
    on card.id = input.card_id;

  if v_distinct_card_count <> v_item_count
     or v_matched_card_count <> v_item_count
     or v_revision_count <> 1
     or v_revision_id is null then
    raise exception
      'M32.5 forward impact items must be distinct known cards from one revision';
  end if;

  if not exists (
    select 1
    from public.schedule_revisions revision
    where revision.id = v_revision_id
      and revision.status = 'DRAFT'
  ) then
    raise exception 'M32.5 forward impact requires DRAFT revision';
  end if;

  with input as (
    select
      nullif(entry.value ->> 'cardId', '')::uuid as card_id
    from jsonb_array_elements(p_items) entry(value)
  )
  select count(*)::integer
  into v_already_placed_count
  from input
  join public.placements placement
    on placement.card_id = input.card_id;

  if v_already_placed_count <> 0 then
    raise exception
      'M32.5 forward impact currently accepts unplaced cards only';
  end if;

  with input as (
    select
      nullif(entry.value ->> 'cardId', '')::uuid as card_id,
      nullif(entry.value ->> 'dayOfWeek', '')::smallint as day_of_week,
      nullif(entry.value ->> 'startPeriod', '')::smallint as start_period,
      nullif(entry.value ->> 'teacherId', '')::uuid as teacher_id,
      nullif(entry.value ->> 'roomId', '')::uuid as room_id
    from jsonb_array_elements(p_items) entry(value)
  )
  select count(*)::integer
  into v_invalid_candidate_count
  from input
  where not exists (
    select 1
    from public.schedule_card_candidate_assessments assessment
    where assessment.card_id = input.card_id
      and assessment.day_of_week = input.day_of_week
      and assessment.start_period = input.start_period
      and assessment.teacher_id is not distinct from input.teacher_id
      and assessment.room_id is not distinct from input.room_id
      and assessment.status = 'VALID'
      and assessment.is_complete
  );

  if v_invalid_candidate_count <> 0 then
    raise exception
      'M32.5 forward impact requires current VALID complete candidates';
  end if;

  -- Internal scenario safety. Candidate rows are individually valid against
  -- current occupancy, but a multi-card scenario must also be valid against
  -- the other proposed items.
  with input as materialized (
    select
      entry.ordinality::integer as ordinal,
      nullif(entry.value ->> 'cardId', '')::uuid as card_id,
      nullif(entry.value ->> 'dayOfWeek', '')::smallint as day_of_week,
      nullif(entry.value ->> 'startPeriod', '')::smallint as start_period,
      nullif(entry.value ->> 'teacherId', '')::uuid as teacher_id,
      nullif(entry.value ->> 'roomId', '')::uuid as room_id
    from jsonb_array_elements(p_items) with ordinality
      entry(value, ordinality)
  ),
  target as materialized (
    select
      input.*,
      card.duration_periods,
      card.requirement_id,
      requirement.instructional_group_id,
      requirement.teacher_assignment_scope,
      requirement.teacher_continuity
    from input
    join public.schedule_cards card
      on card.id = input.card_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
  ),
  pair_conflict as materialized (
    select
      bool_or(
        left_target.day_of_week = right_target.day_of_week
        and left_target.start_period
          <= right_target.start_period + right_target.duration_periods - 1
        and right_target.start_period
          <= left_target.start_period + left_target.duration_periods - 1
        and left_target.teacher_id is not null
        and left_target.teacher_id = right_target.teacher_id
      ) as teacher_conflict,
      bool_or(
        left_target.day_of_week = right_target.day_of_week
        and left_target.start_period
          <= right_target.start_period + right_target.duration_periods - 1
        and right_target.start_period
          <= left_target.start_period + left_target.duration_periods - 1
        and left_target.room_id is not null
        and left_target.room_id = right_target.room_id
      ) as room_conflict,
      bool_or(
        left_target.day_of_week = right_target.day_of_week
        and left_target.start_period
          <= right_target.start_period + right_target.duration_periods - 1
        and right_target.start_period
          <= left_target.start_period + left_target.duration_periods - 1
        and public.management_instructional_groups_conflict(
          left_target.instructional_group_id,
          right_target.instructional_group_id
        )
      ) as group_conflict
    from target left_target
    join target right_target
      on right_target.ordinal > left_target.ordinal
  ),
  target_requirement as materialized (
    select distinct
      target.requirement_id,
      target.teacher_assignment_scope,
      target.teacher_continuity
    from target
  ),
  scenario_teacher as materialized (
    select
      target_requirement.requirement_id,
      placement.teacher_id
    from target_requirement
    join public.schedule_cards placed_card
      on placed_card.schedule_revision_id = v_revision_id
     and placed_card.requirement_id = target_requirement.requirement_id
    join public.placements placement
      on placement.card_id = placed_card.id
    where placement.teacher_id is not null

    union all

    select
      target.requirement_id,
      target.teacher_id
    from target
    where target.teacher_id is not null
  ),
  requirement_policy_conflict as materialized (
    select bool_or(
      target_requirement.teacher_assignment_scope = 'REQUIREMENT'
      and target_requirement.teacher_continuity = 'REQUIRED'
      and (
        select count(distinct scenario_teacher.teacher_id)
        from scenario_teacher
        where scenario_teacher.requirement_id =
          target_requirement.requirement_id
      ) > 1
    ) as has_conflict
    from target_requirement
  )
  select coalesce(
    array_agg(reason order by reason),
    array[]::text[]
  )
  into v_scenario_block_reasons
  from (
    select 'SCENARIO_TEACHER_CONFLICT'::text as reason
    from pair_conflict
    where coalesce(pair_conflict.teacher_conflict, false)

    union all

    select 'SCENARIO_ROOM_CONFLICT'::text
    from pair_conflict
    where coalesce(pair_conflict.room_conflict, false)

    union all

    select 'SCENARIO_GROUP_CONFLICT'::text
    from pair_conflict
    where coalesce(pair_conflict.group_conflict, false)

    union all

    select 'PROPOSED_REQUIREMENT_TEACHER_CONFLICT'::text
    from requirement_policy_conflict
    where coalesce(requirement_policy_conflict.has_conflict, false)
  ) reason_rows;

  with input as materialized (
    select
      nullif(entry.value ->> 'cardId', '')::uuid as card_id,
      nullif(entry.value ->> 'dayOfWeek', '')::smallint as day_of_week,
      nullif(entry.value ->> 'startPeriod', '')::smallint as start_period,
      nullif(entry.value ->> 'teacherId', '')::uuid as teacher_id,
      nullif(entry.value ->> 'roomId', '')::uuid as room_id
    from jsonb_array_elements(p_items) entry(value)
  ),
  target as materialized (
    select
      input.*,
      card.duration_periods,
      card.requirement_id,
      requirement.instructional_group_id
    from input
    join public.schedule_cards card
      on card.id = input.card_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
  ),
  target_requirement as materialized (
    select distinct target.requirement_id
    from target
  ),
  scenario_teacher as materialized (
    select
      target_requirement.requirement_id,
      placement.teacher_id
    from target_requirement
    join public.schedule_cards placed_card
      on placed_card.schedule_revision_id = v_revision_id
     and placed_card.requirement_id = target_requirement.requirement_id
    join public.placements placement
      on placement.card_id = placed_card.id
    where placement.teacher_id is not null

    union all

    select
      target.requirement_id,
      target.teacher_id
    from target
    where target.teacher_id is not null
  ),
  scenario_policy as materialized (
    select
      target_requirement.requirement_id,
      requirement.teacher_assignment_scope,
      requirement.teacher_continuity,
      count(distinct scenario_teacher.teacher_id)::integer
        as teacher_count,
      (
        array_agg(
          distinct scenario_teacher.teacher_id
          order by scenario_teacher.teacher_id
        ) filter (
          where scenario_teacher.teacher_id is not null
        )
      )[1] as resolved_teacher_id
    from target_requirement
    join public.course_requirements requirement
      on requirement.id = target_requirement.requirement_id
    left join scenario_teacher
      on scenario_teacher.requirement_id =
        target_requirement.requirement_id
    group by
      target_requirement.requirement_id,
      requirement.teacher_assignment_scope,
      requirement.teacher_continuity
  ),
  candidate_base as materialized (
    select
      assessment.id as assessment_id,
      assessment.card_id,
      assessment.day_of_week,
      assessment.start_period,
      assessment.teacher_id,
      assessment.room_id,
      assessment.teacher_resolution_status,
      assessment.room_resolution_status,
      assessment.warning_codes,
      card.duration_periods,
      card.requirement_id,
      requirement.instructional_group_id,
      subject.name as subject_name,
      instructional_group.name as group_name,
      summary.is_forced as current_is_forced,
      summary.is_contradiction as current_is_contradiction,
      summary.unresolved_count as current_unresolved_count,
      (
        exists (
          select 1
          from target
          where target.day_of_week = assessment.day_of_week
            and target.start_period
              <= assessment.start_period + card.duration_periods - 1
            and assessment.start_period
              <= target.start_period + target.duration_periods - 1
            and (
              (
                target.teacher_id is not null
                and assessment.teacher_id is not null
                and target.teacher_id = assessment.teacher_id
              )
              or (
                target.room_id is not null
                and assessment.room_id is not null
                and target.room_id = assessment.room_id
              )
              or public.management_instructional_groups_conflict(
                target.instructional_group_id,
                requirement.instructional_group_id
              )
            )
        )
        or (
          scenario_policy.requirement_id is not null
          and scenario_policy.teacher_assignment_scope = 'REQUIREMENT'
          and scenario_policy.teacher_continuity = 'REQUIRED'
          and (
            scenario_policy.teacher_count > 1
            or (
              scenario_policy.teacher_count = 1
              and assessment.teacher_id
                is distinct from scenario_policy.resolved_teacher_id
            )
          )
        )
      ) as would_be_lost
    from public.schedule_card_candidate_assessments assessment
    join public.schedule_cards card
      on card.id = assessment.card_id
     and card.schedule_revision_id = v_revision_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    join public.subjects subject
      on subject.id = requirement.subject_id
    join public.instructional_groups instructional_group
      on instructional_group.id = requirement.instructional_group_id
    join public.schedule_card_domain_summaries summary
      on summary.card_id = card.id
    left join scenario_policy
      on scenario_policy.requirement_id = card.requirement_id
    where assessment.status = 'VALID'
      and assessment.is_complete
      and not exists (
        select 1
        from target
        where target.card_id = assessment.card_id
      )
      and not exists (
        select 1
        from public.placements placement
        where placement.card_id = assessment.card_id
      )
  ),
  card_impact as materialized (
    select
      candidate.card_id,
      max(candidate.subject_name) as subject_name,
      max(candidate.group_name) as group_name,
      count(*)::integer as current_valid_count,
      count(*) filter (
        where candidate.would_be_lost
      )::integer as lost_valid_count,
      count(*) filter (
        where not candidate.would_be_lost
      )::integer as remaining_valid_count,
      count(*) filter (
        where not candidate.would_be_lost
          and (
            candidate.teacher_resolution_status <> 'RESOLVED'
            or candidate.room_resolution_status <> 'RESOLVED'
            or cardinality(candidate.warning_codes) > 0
          )
      )::integer as remaining_provisional_count,
      bool_or(candidate.current_is_forced) as current_is_forced,
      bool_or(candidate.current_is_contradiction)
        as current_is_contradiction,
      max(candidate.current_unresolved_count)::integer
        as current_unresolved_count
    from candidate_base candidate
    group by candidate.card_id
  ),
  classified as materialized (
    select
      impact.*,
      (
        impact.lost_valid_count > 0
        and impact.remaining_valid_count = 1
        and impact.remaining_provisional_count = 0
        and impact.current_unresolved_count = 0
        and not impact.current_is_forced
      ) as new_forced,
      (
        impact.lost_valid_count > 0
        and impact.remaining_valid_count = 0
        and impact.current_unresolved_count = 0
        and not impact.current_is_contradiction
      ) as new_contradiction
    from card_impact impact
    where impact.lost_valid_count > 0
  )
  select
    count(*)::integer,
    coalesce(sum(classified.lost_valid_count), 0)::integer,
    count(*) filter (where classified.new_forced)::integer,
    count(*) filter (where classified.new_contradiction)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cardId', classified.card_id,
          'subjectName', classified.subject_name,
          'groupName', classified.group_name,
          'currentValidCount', classified.current_valid_count,
          'lostValidCount', classified.lost_valid_count,
          'remainingValidCount', classified.remaining_valid_count,
          'newForced', classified.new_forced,
          'newContradiction', classified.new_contradiction
        )
        order by
          classified.new_contradiction desc,
          classified.new_forced desc,
          classified.lost_valid_count desc,
          classified.subject_name,
          classified.group_name,
          classified.card_id
      ),
      '[]'::jsonb
    )
  into
    v_affected_card_count,
    v_domain_loss_count,
    v_new_forced_count,
    v_new_contradiction_count,
    v_impact_rows
  from classified;

  select md5(
    jsonb_build_object(
      'revisionId', v_revision_id,
      'items', p_items,
      'candidateGeneratedAt', (
        select max(assessment.generated_at)
        from public.schedule_card_candidate_assessments assessment
        join public.schedule_cards card
          on card.id = assessment.card_id
        where card.schedule_revision_id = v_revision_id
      ),
      'placementUpdatedAt', (
        select max(placement.updated_at)
        from public.placements placement
        join public.schedule_cards card
          on card.id = placement.card_id
        where card.schedule_revision_id = v_revision_id
      )
    )::text
  )
  into v_state_token;

  return jsonb_build_object(
    'revisionId', v_revision_id,
    'itemCount', v_item_count,
    'safeToApply', (
      cardinality(v_scenario_block_reasons) = 0
      and v_new_contradiction_count = 0
    ),
    'scenarioBlockReasons', to_jsonb(v_scenario_block_reasons),
    'affectedCardCount', v_affected_card_count,
    'domainLossCount', v_domain_loss_count,
    'newForcedCount', v_new_forced_count,
    'newContradictionCount', v_new_contradiction_count,
    'impactRows', v_impact_rows,
    'stateToken', v_state_token,
    'previewOnly', true,
    'engineVersion', 'M32.5-v1'
  );
end
$$;


create or replace function public.management_preview_candidate_forward_impacts(
  p_scenarios jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_scenario jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_count integer;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M32.5 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_scenarios is null or jsonb_typeof(p_scenarios) <> 'array' then
    raise exception 'M32.5 scenarios must be a JSON array';
  end if;

  v_count := jsonb_array_length(p_scenarios);
  if v_count < 1 or v_count > 60 then
    raise exception 'M32.5 requires 1..60 scenarios';
  end if;

  for v_scenario in
    select entry.value
    from jsonb_array_elements(p_scenarios) entry(value)
  loop
    if coalesce(v_scenario ->> 'id', '') = '' then
      raise exception 'M32.5 scenario id is required';
    end if;

    v_result := public.management_preview_candidate_forward_impact(
      v_scenario -> 'items'
    );

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'id', v_scenario ->> 'id'
      ) || v_result
    );
  end loop;

  return v_results;
end
$$;


revoke all
  on function public.management_preview_candidate_forward_impact(jsonb)
  from public, anon, authenticated;

revoke all
  on function public.management_preview_candidate_forward_impacts(jsonb)
  from public, anon;

grant execute
  on function public.management_preview_candidate_forward_impacts(jsonb)
  to authenticated;

comment on function public.management_apply_teacher_policy_candidate_batch() is
  'M32.5 set-based candidate-domain teacher continuity enforcement. Runs after candidate writes, preserves history by reclassifying candidates from current placement state, and refreshes all same-requirement summaries.';

comment on function public.management_preview_candidate_forward_impact(jsonb) is
  'M32.5 internal read-only forward-domain simulation for one unplaced placement scenario. Calculates candidate loss, newly forced cards and newly contradictory cards without mutating the draft.';

comment on function public.management_preview_candidate_forward_impacts(jsonb) is
  'M32.5 authenticated batch wrapper for up to 60 read-only placement scenarios used by the Placement Assistant.';

commit;
