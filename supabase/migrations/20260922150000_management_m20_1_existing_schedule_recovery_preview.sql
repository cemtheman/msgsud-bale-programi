-- Management / M20.1
-- Existing-public-schedule placement recovery preview.
--
-- Purpose:
--   Recover the large untouched portion of the DRAFT from its immutable
--   bootstrap source evidence before introducing any heuristic solver.
--
-- Safety:
--   * no placements are created, moved, removed, or locked
--   * no public schedule rows are mutated
--   * no move history is written
--   * current candidate-domain rows are refreshed because they are derived
--   * requirements with ANY existing placement are intentionally skipped
--   * only exact source-block/card partition matches may be RECOVERABLE
--   * every proposed source slot must still be a VALID complete candidate
--   * the full proposal set is checked for pairwise teacher/room/group conflict
--
-- M20.1 is preview only. There is deliberately no apply/recovery endpoint.

begin;

create or replace function public.management_preview_existing_schedule_recovery(
  p_schedule_revision_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision record;

  v_total_cards integer;
  v_placed_cards integer;
  v_unplaced_cards integer;

  v_recoverable_requirements integer;
  v_recoverable_cards integer;
  v_recoverable_periods integer;
  v_skipped_requirements integer;

  v_source_session_count integer;
  v_source_off_grid_count integer;

  v_reason_counts jsonb;
  v_requirements jsonb;
  v_proposals jsonb;
begin
  if not public.has_management_role('VIEWER') then
    raise exception 'M20.1 management VIEWER role required'
      using errcode = '42501';
  end if;

  select
    revision.id,
    revision.requirement_set_id,
    revision.status as revision_status,
    requirement_set.academic_year,
    requirement_set.term,
    requirement_set.status as requirement_set_status
  into v_revision
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_schedule_revision_id;

  if not found then
    raise exception 'M20.1 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision.revision_status <> 'DRAFT'
     or v_revision.requirement_set_status <> 'DRAFT' then
    raise exception
      'M20.1 recovery preview requires a DRAFT revision on a DRAFT requirement set';
  end if;

  -- Candidate rows are derived state. Refresh them before deciding whether an
  -- inherited source slot is still legal under the current draft constraints.
  perform public.refresh_management_candidate_domain(
    p_schedule_revision_id
  );

  drop table if exists pg_temp.m201_source_units;
  drop table if exists pg_temp.m201_source_runs;
  drop table if exists pg_temp.m201_proposals;
  drop table if exists pg_temp.m201_requirement_status;

  -- -----------------------------------------------------------------------
  -- SOURCE UNITS
  -- -----------------------------------------------------------------------
  -- Bootstrap evidence intentionally has no FK to schedule_sessions because a
  -- later managed publication may replace the public projection. M20.1 is for
  -- the pre-first-publication recovery phase, so every source row must still
  -- resolve in the current public baseline.

  create temporary table m201_source_units on commit drop as
  select
    evidence.requirement_id,
    evidence.source_session_id,
    session_row.day_of_week,
    period_map.period_number::smallint as period_number,
    session_row.start_time,
    session_row.end_time,
    session_row.teacher_id,
    coalesce(
      selected_room.canonical_room_id,
      session_row.room_id
    ) as room_id,
    (
      period_map.period_number is null
    ) as off_grid
  from public.course_requirement_source_sessions evidence
  join public.course_requirements requirement
    on requirement.id = evidence.requirement_id
   and requirement.requirement_set_id =
      v_revision.requirement_set_id
  left join public.schedule_sessions session_row
    on session_row.id = evidence.source_session_id
   and session_row.academic_year =
      v_revision.academic_year
  left join public.rooms selected_room
    on selected_room.id = session_row.room_id
  left join lateral (
    select period_number
    from generate_series(1, 12) period_number
    cross join lateral public.management_publication_period_bounds(
      period_number::smallint
    ) bounds
    where bounds.start_time = session_row.start_time
      and bounds.end_time = session_row.end_time
    limit 1
  ) period_map on true;

  select count(*)
  into v_source_session_count
  from m201_source_units;

  select count(*)
  into v_source_off_grid_count
  from m201_source_units
  where off_grid;

  -- -----------------------------------------------------------------------
  -- CONTIGUOUS SOURCE BLOCKS
  -- -----------------------------------------------------------------------
  -- A source block continues only when the next period is adjacent, stays on
  -- the same day/resource pair, and does NOT cross the lunch boundary 5 -> 6.

  create temporary table m201_source_runs on commit drop as
  with ordered as (
    select
      source.*,
      lag(source.day_of_week) over source_order as previous_day,
      lag(source.period_number) over source_order as previous_period,
      lag(source.teacher_id) over source_order as previous_teacher,
      lag(source.room_id) over source_order as previous_room
    from m201_source_units source
    where not source.off_grid
    window source_order as (
      partition by source.requirement_id
      order by
        source.day_of_week,
        source.period_number,
        source.source_session_id
    )
  ),
  marked as (
    select
      ordered.*,
      case
        when ordered.previous_period is null then 1
        when ordered.previous_day is distinct from ordered.day_of_week then 1
        when ordered.previous_teacher is distinct from ordered.teacher_id then 1
        when ordered.previous_room is distinct from ordered.room_id then 1
        when ordered.previous_period = 5
          and ordered.period_number = 6 then 1
        when ordered.period_number <> ordered.previous_period + 1 then 1
        else 0
      end as starts_new_run
    from ordered
  ),
  numbered as (
    select
      marked.*,
      sum(marked.starts_new_run) over (
        partition by marked.requirement_id
        order by
          marked.day_of_week,
          marked.period_number,
          marked.source_session_id
        rows unbounded preceding
      ) as run_number
    from marked
  )
  select
    numbered.requirement_id,
    numbered.run_number::integer,
    min(numbered.day_of_week)::smallint as day_of_week,
    min(numbered.period_number)::smallint as start_period,
    count(*)::smallint as duration_periods,
    min(numbered.teacher_id) as teacher_id,
    min(numbered.room_id) as room_id,
    jsonb_agg(
      numbered.source_session_id
      order by numbered.period_number, numbered.source_session_id
    ) as source_session_ids
  from numbered
  group by
    numbered.requirement_id,
    numbered.run_number;

  -- -----------------------------------------------------------------------
  -- PAIR CARDS TO SAME-DURATION SOURCE BLOCKS
  -- -----------------------------------------------------------------------

  create temporary table m201_proposals on commit drop as
  with
  card_ranked as (
    select
      card.id as card_id,
      card.requirement_id,
      card.block_index,
      card.duration_periods,
      row_number() over (
        partition by card.requirement_id, card.duration_periods
        order by card.block_index, card.id
      ) as duration_ordinal
    from public.schedule_cards card
    where card.schedule_revision_id =
      p_schedule_revision_id
  ),
  run_ranked as (
    select
      source_run.*,
      row_number() over (
        partition by
          source_run.requirement_id,
          source_run.duration_periods
        order by
          source_run.day_of_week,
          source_run.start_period,
          source_run.run_number
      ) as duration_ordinal
    from m201_source_runs source_run
  )
  select
    card.card_id,
    card.requirement_id,
    card.block_index,
    card.duration_periods,
    source_run.day_of_week,
    source_run.start_period,
    source_run.teacher_id,
    source_run.room_id,
    source_run.source_session_ids,
    exists (
      select 1
      from public.schedule_card_candidate_assessments assessment
      where assessment.card_id = card.card_id
        and assessment.day_of_week = source_run.day_of_week
        and assessment.start_period = source_run.start_period
        and assessment.teacher_id is not distinct from source_run.teacher_id
        and assessment.room_id is not distinct from source_run.room_id
        and assessment.status = 'VALID'
        and assessment.is_complete
    ) as candidate_valid
  from card_ranked card
  join run_ranked source_run
    on source_run.requirement_id = card.requirement_id
   and source_run.duration_periods = card.duration_periods
   and source_run.duration_ordinal = card.duration_ordinal;

  alter table m201_proposals
    add column proposal_conflict boolean not null default false;

  -- A current source schedule is conflict-free, but requirement/group/resource
  -- semantics may have changed since bootstrap. Recheck the whole proposed set
  -- against itself rather than relying only on per-card candidate rows.
  update m201_proposals proposal
  set proposal_conflict = true
  where exists (
    select 1
    from m201_proposals other
    join public.course_requirements proposal_requirement
      on proposal_requirement.id = proposal.requirement_id
    join public.course_requirements other_requirement
      on other_requirement.id = other.requirement_id
    where other.card_id <> proposal.card_id
      and other.day_of_week = proposal.day_of_week
      and other.start_period
          <= proposal.start_period + proposal.duration_periods - 1
      and proposal.start_period
          <= other.start_period + other.duration_periods - 1
      and (
        (
          proposal.teacher_id is not null
          and proposal.teacher_id = other.teacher_id
        )
        or (
          proposal.room_id is not null
          and proposal.room_id = other.room_id
        )
        or public.management_instructional_groups_conflict(
          proposal_requirement.instructional_group_id,
          other_requirement.instructional_group_id
        )
      )
  );

  -- -----------------------------------------------------------------------
  -- REQUIREMENT-LEVEL SAFETY CLASSIFICATION
  -- -----------------------------------------------------------------------
  -- If a requirement already has ANY placement, leave all of its remaining
  -- cards to the human workflow. This protects M19.3 reconciliations and any
  -- manual scheduling work from being silently mixed with historical recovery.

  create temporary table m201_requirement_status on commit drop as
  with
  card_stats as (
    select
      requirement.id as requirement_id,
      count(card.id)::integer as card_count,
      count(card.id) filter (
        where placement.id is null
      )::integer as unplaced_card_count,
      count(card.id) filter (
        where placement.id is not null
      )::integer as placed_card_count,
      coalesce(
        array_agg(
          card.duration_periods
          order by card.duration_periods, card.block_index, card.id
        ) filter (where card.id is not null),
        array[]::smallint[]
      ) as card_durations
    from public.course_requirements requirement
    join public.schedule_cards card
      on card.requirement_id = requirement.id
     and card.schedule_revision_id =
        p_schedule_revision_id
    left join public.placements placement
      on placement.card_id = card.id
    where requirement.requirement_set_id =
      v_revision.requirement_set_id
    group by requirement.id
  ),
  source_stats as (
    select
      requirement.id as requirement_id,
      count(source.source_session_id)::integer as source_unit_count,
      count(source.source_session_id) filter (
        where source.off_grid
      )::integer as off_grid_count
    from public.course_requirements requirement
    left join m201_source_units source
      on source.requirement_id = requirement.id
    where requirement.requirement_set_id =
      v_revision.requirement_set_id
    group by requirement.id
  ),
  run_stats as (
    select
      requirement.id as requirement_id,
      coalesce(
        array_agg(
          source_run.duration_periods
          order by
            source_run.duration_periods,
            source_run.day_of_week,
            source_run.start_period
        ) filter (where source_run.requirement_id is not null),
        array[]::smallint[]
      ) as run_durations
    from public.course_requirements requirement
    left join m201_source_runs source_run
      on source_run.requirement_id = requirement.id
    where requirement.requirement_set_id =
      v_revision.requirement_set_id
    group by requirement.id
  ),
  proposal_stats as (
    select
      requirement.id as requirement_id,
      count(proposal.card_id)::integer as proposal_count,
      count(proposal.card_id) filter (
        where not proposal.candidate_valid
      )::integer as invalid_candidate_count,
      bool_or(proposal.proposal_conflict) as has_proposal_conflict
    from public.course_requirements requirement
    left join m201_proposals proposal
      on proposal.requirement_id = requirement.id
    where requirement.requirement_set_id =
      v_revision.requirement_set_id
    group by requirement.id
  )
  select
    requirement.id as requirement_id,
    subject.name as subject_name,
    instructional_group.name as group_name,
    card_stats.card_count,
    card_stats.placed_card_count,
    card_stats.unplaced_card_count,
    source_stats.source_unit_count,
    source_stats.off_grid_count,
    card_stats.card_durations,
    run_stats.run_durations,
    proposal_stats.proposal_count,
    proposal_stats.invalid_candidate_count,
    coalesce(proposal_stats.has_proposal_conflict, false)
      as has_proposal_conflict,
    case
      when card_stats.unplaced_card_count = 0
        then 'ALREADY_COMPLETE'
      when card_stats.placed_card_count > 0
        then 'HAS_EXISTING_PLACEMENT'
      when source_stats.source_unit_count = 0
        then 'NO_SOURCE_EVIDENCE'
      when source_stats.off_grid_count > 0
        then 'SOURCE_OFF_GRID'
      when card_stats.card_durations is distinct from run_stats.run_durations
        then 'PARTITION_MISMATCH'
      when proposal_stats.proposal_count <> card_stats.card_count
        then 'PAIRING_INCOMPLETE'
      when proposal_stats.invalid_candidate_count > 0
        then 'SOURCE_SLOT_NOT_CURRENTLY_VALID'
      when coalesce(proposal_stats.has_proposal_conflict, false)
        then 'PROPOSAL_SET_CONFLICT'
      else 'RECOVERABLE'
    end as recovery_status
  from public.course_requirements requirement
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id =
      requirement.instructional_group_id
  join card_stats
    on card_stats.requirement_id = requirement.id
  join source_stats
    on source_stats.requirement_id = requirement.id
  join run_stats
    on run_stats.requirement_id = requirement.id
  join proposal_stats
    on proposal_stats.requirement_id = requirement.id
  where requirement.requirement_set_id =
    v_revision.requirement_set_id;

  select count(*)
  into v_total_cards
  from public.schedule_cards card
  where card.schedule_revision_id =
    p_schedule_revision_id;

  select count(*)
  into v_placed_cards
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id =
    p_schedule_revision_id;

  v_unplaced_cards := v_total_cards - v_placed_cards;

  select count(*)
  into v_recoverable_requirements
  from m201_requirement_status status
  where status.recovery_status = 'RECOVERABLE';

  select coalesce(sum(status.unplaced_card_count), 0)
  into v_recoverable_cards
  from m201_requirement_status status
  where status.recovery_status = 'RECOVERABLE';

  select coalesce(sum(proposal.duration_periods), 0)
  into v_recoverable_periods
  from m201_proposals proposal
  join m201_requirement_status status
    on status.requirement_id = proposal.requirement_id
   and status.recovery_status = 'RECOVERABLE';

  select count(*)
  into v_skipped_requirements
  from m201_requirement_status status
  where status.unplaced_card_count > 0
    and status.recovery_status <> 'RECOVERABLE';

  select coalesce(
    jsonb_object_agg(reason_counts.recovery_status, reason_counts.count),
    '{}'::jsonb
  )
  into v_reason_counts
  from (
    select
      status.recovery_status,
      count(*)::integer as count
    from m201_requirement_status status
    where status.unplaced_card_count > 0
    group by status.recovery_status
    order by status.recovery_status
  ) reason_counts;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requirementId', status.requirement_id,
        'subjectName', status.subject_name,
        'groupName', status.group_name,
        'status', status.recovery_status,
        'cardCount', status.card_count,
        'placedCardCount', status.placed_card_count,
        'unplacedCardCount', status.unplaced_card_count,
        'sourceUnitCount', status.source_unit_count,
        'offGridCount', status.off_grid_count,
        'cardDurations', to_jsonb(status.card_durations),
        'sourceRunDurations', to_jsonb(status.run_durations),
        'proposalCount', status.proposal_count,
        'invalidCandidateCount', status.invalid_candidate_count,
        'proposalConflict', status.has_proposal_conflict
      )
      order by
        case when status.recovery_status = 'RECOVERABLE' then 0 else 1 end,
        status.subject_name,
        status.group_name,
        status.requirement_id
    ),
    '[]'::jsonb
  )
  into v_requirements
  from m201_requirement_status status
  where status.unplaced_card_count > 0;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', proposal.card_id,
        'requirementId', proposal.requirement_id,
        'blockIndex', proposal.block_index,
        'durationPeriods', proposal.duration_periods,
        'dayOfWeek', proposal.day_of_week,
        'startPeriod', proposal.start_period,
        'teacherId', proposal.teacher_id,
        'roomId', proposal.room_id,
        'sourceSessionIds', proposal.source_session_ids
      )
      order by
        proposal.requirement_id,
        proposal.block_index,
        proposal.card_id
    ),
    '[]'::jsonb
  )
  into v_proposals
  from m201_proposals proposal
  join m201_requirement_status status
    on status.requirement_id = proposal.requirement_id
   and status.recovery_status = 'RECOVERABLE';

  return jsonb_build_object(
    'revisionId', p_schedule_revision_id,
    'academicYear', v_revision.academic_year,
    'term', v_revision.term,
    'previewOnly', true,
    'applyEndpointPresent', false,
    'summary', jsonb_build_object(
      'totalCards', v_total_cards,
      'placedCards', v_placed_cards,
      'unplacedCards', v_unplaced_cards,
      'sourceSessionCount', v_source_session_count,
      'sourceOffGridCount', v_source_off_grid_count,
      'recoverableRequirementCount', v_recoverable_requirements,
      'recoverableCardCount', v_recoverable_cards,
      'recoverablePeriodCount', v_recoverable_periods,
      'remainingAfterExactRecovery',
        greatest(v_unplaced_cards - v_recoverable_cards, 0),
      'skippedRequirementCount', v_skipped_requirements,
      'reasonCounts', v_reason_counts
    ),
    'requirements', v_requirements,
    'proposals', v_proposals
  );
end
$$;

revoke all
  on function public.management_preview_existing_schedule_recovery(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_preview_existing_schedule_recovery(uuid)
  to authenticated;

comment on function public.management_preview_existing_schedule_recovery(uuid) is
  'M20.1 preview-only exact historical placement recovery. Reconstructs contiguous source blocks from bootstrap public evidence, pairs them with same-duration untouched draft cards, validates current candidates and proposal-set conflicts, and reports what could be inherited without guessing.';


-- Installing M20.1 must not change schedule/publication state.
do $$
declare
  v_sessions integer;
  v_groups integer;
  v_publications integer;
begin
  select count(*)
  into v_sessions
  from public.schedule_sessions
  where academic_year = '2026-2027';

  select count(*)
  into v_groups
  from public.session_groups group_row
  join public.schedule_sessions session_row
    on session_row.id = group_row.session_id
  where session_row.academic_year = '2026-2027';

  select count(*)
  into v_publications
  from public.management_publications;

  if v_sessions <> 517 or v_groups <> 609 then
    raise exception
      'M20.1 installation modified public projection: sessions %, groups %',
      v_sessions,
      v_groups;
  end if;

  if v_publications <> 0 then
    raise exception
      'M20.1 expected no managed publication before recovery preview';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M20.1 must not unlock the publication engine';
  end if;
end
$$;

commit;
