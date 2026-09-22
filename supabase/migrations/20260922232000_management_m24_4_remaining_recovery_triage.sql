-- Management / M24.4
-- Remaining 64 Recovery Triage
--
-- Read-only triage after the successful M24.3 historical recovery.
--
-- Goals:
--   * explain every one of the remaining 64 unplaced cards,
--   * preserve the 228 current placements,
--   * distinguish exact historical-slot salvage from resource/time relocation,
--   * expose hard conflict reasons and the currently blocking placements,
--   * identify partial-recovery opportunities inside requirements that already
--     have one or more placements,
--   * make no scheduling decision and expose no apply endpoint.

begin;


-- -------------------------------------------------------------------------
-- CARD-LEVEL TRIAGE ENGINE
-- -------------------------------------------------------------------------

create or replace function public.management_remaining_recovery_triage_rows_internal(
  p_schedule_revision_id uuid
)
returns table (
  card_id uuid,
  requirement_id uuid,
  block_index smallint,
  duration_periods smallint,
  subject_name text,
  group_name text,
  requirement_context text,
  source_day smallint,
  source_start_period smallint,
  source_teacher_id uuid,
  source_room_id uuid,
  source_session_ids jsonb,
  exact_source_candidate_status text,
  exact_source_reason_codes text[],
  exact_source_warning_codes text[],
  exact_source_teacher_resolution text,
  exact_source_room_resolution text,
  same_time_valid_count integer,
  same_time_resolved_valid_count integer,
  same_time_provisional_valid_count integer,
  same_day_valid_count integer,
  anywhere_valid_count integer,
  anywhere_resolved_valid_count integer,
  anywhere_provisional_valid_count integer,
  domain_valid_count integer,
  domain_provisional_valid_count integer,
  domain_invalid_count integer,
  domain_unresolved_count integer,
  domain_is_forced boolean,
  domain_is_contradiction boolean,
  blocker_count integer,
  blockers jsonb,
  best_alternative jsonb,
  triage_class text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with revision_meta as (
    select
      revision.id as revision_id,
      revision.requirement_set_id,
      requirement_set.academic_year
    from public.schedule_revisions revision
    join public.requirement_sets requirement_set
      on requirement_set.id =
        revision.requirement_set_id
    where revision.id = p_schedule_revision_id
      and revision.status = 'DRAFT'
      and requirement_set.status = 'DRAFT'
  ),
  source_units as (
    select
      evidence.requirement_id,
      evidence.source_session_id,
      session_row.day_of_week,
      period_map.period_number::smallint
        as period_number,
      session_row.teacher_id,
      coalesce(
        selected_room.canonical_room_id,
        session_row.room_id
      ) as room_id,
      (period_map.period_number is null) as off_grid
    from revision_meta revision
    join public.course_requirement_source_sessions evidence
      on true
    join public.course_requirements requirement
      on requirement.id = evidence.requirement_id
     and requirement.requirement_set_id =
        revision.requirement_set_id
    left join public.schedule_sessions session_row
      on session_row.id =
        evidence.source_session_id
     and session_row.academic_year =
        revision.academic_year
    left join public.rooms selected_room
      on selected_room.id =
        session_row.room_id
    left join lateral (
      select period_number
      from generate_series(1, 12) period_number
      cross join lateral
        public.management_publication_period_bounds(
          period_number::smallint
        ) bounds
      where bounds.start_time =
          session_row.start_time
        and bounds.end_time =
          session_row.end_time
      limit 1
    ) period_map on true
  ),
  ordered_source as (
    select
      source.*,
      lag(source.day_of_week) over source_order
        as previous_day,
      lag(source.period_number) over source_order
        as previous_period,
      lag(source.teacher_id) over source_order
        as previous_teacher,
      lag(source.room_id) over source_order
        as previous_room
    from source_units source
    where not source.off_grid
    window source_order as (
      partition by source.requirement_id
      order by
        source.day_of_week,
        source.period_number,
        source.source_session_id
    )
  ),
  marked_source as (
    select
      ordered.*,
      case
        when ordered.previous_period is null
          then 1
        when ordered.previous_day
          is distinct from ordered.day_of_week
          then 1
        when ordered.previous_teacher
          is distinct from ordered.teacher_id
          then 1
        when ordered.previous_room
          is distinct from ordered.room_id
          then 1
        when ordered.previous_period = 5
          and ordered.period_number = 6
          then 1
        when ordered.period_number <>
          ordered.previous_period + 1
          then 1
        else 0
      end as starts_new_run
    from ordered_source ordered
  ),
  numbered_source as (
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
    from marked_source marked
  ),
  source_runs as (
    select
      numbered.requirement_id,
      numbered.run_number::integer
        as run_number,
      min(numbered.day_of_week)::smallint
        as day_of_week,
      min(numbered.period_number)::smallint
        as start_period,
      count(*)::smallint
        as duration_periods,
      (
        array_agg(
          numbered.teacher_id
          order by
            numbered.period_number,
            numbered.source_session_id
        )
      )[1] as teacher_id,
      (
        array_agg(
          numbered.room_id
          order by
            numbered.period_number,
            numbered.source_session_id
        )
      )[1] as room_id,
      jsonb_agg(
        numbered.source_session_id
        order by
          numbered.period_number,
          numbered.source_session_id
      ) as source_session_ids
    from numbered_source numbered
    group by
      numbered.requirement_id,
      numbered.run_number
  ),
  card_ranked as (
    select
      card.id as card_id,
      card.requirement_id,
      card.block_index,
      card.duration_periods,
      (placement.id is not null) as is_placed,
      row_number() over (
        partition by
          card.requirement_id,
          card.duration_periods
        order by
          card.block_index,
          card.id
      ) as duration_ordinal
    from public.schedule_cards card
    left join public.placements placement
      on placement.card_id = card.id
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
    from source_runs source_run
  ),
  paired as (
    select
      card.card_id,
      card.requirement_id,
      card.block_index,
      card.duration_periods,
      card.is_placed,
      source_run.day_of_week as source_day,
      source_run.start_period
        as source_start_period,
      source_run.teacher_id
        as source_teacher_id,
      source_run.room_id
        as source_room_id,
      source_run.source_session_ids
    from card_ranked card
    left join run_ranked source_run
      on source_run.requirement_id =
        card.requirement_id
     and source_run.duration_periods =
        card.duration_periods
     and source_run.duration_ordinal =
        card.duration_ordinal
  ),
  requirement_placement_stats as (
    select
      card.requirement_id,
      count(*) filter (
        where placement.id is not null
      )::integer as placed_count,
      count(*) filter (
        where placement.id is null
      )::integer as unplaced_count
    from public.schedule_cards card
    left join public.placements placement
      on placement.card_id = card.id
    where card.schedule_revision_id =
      p_schedule_revision_id
    group by card.requirement_id
  ),
  candidate_stats as (
    select
      pair.card_id,
      count(*) filter (
        where assessment.status = 'VALID'
          and assessment.is_complete
          and assessment.day_of_week =
            pair.source_day
          and assessment.start_period =
            pair.source_start_period
      )::integer as same_time_valid_count,
      count(*) filter (
        where assessment.status = 'VALID'
          and assessment.is_complete
          and assessment.day_of_week =
            pair.source_day
          and assessment.start_period =
            pair.source_start_period
          and assessment.teacher_resolution_status =
            'RESOLVED'
          and assessment.room_resolution_status =
            'RESOLVED'
          and cardinality(
            assessment.warning_codes
          ) = 0
      )::integer
        as same_time_resolved_valid_count,
      count(*) filter (
        where assessment.status = 'VALID'
          and assessment.is_complete
          and assessment.day_of_week =
            pair.source_day
          and assessment.start_period =
            pair.source_start_period
          and (
            assessment.teacher_resolution_status <>
              'RESOLVED'
            or assessment.room_resolution_status <>
              'RESOLVED'
            or cardinality(
              assessment.warning_codes
            ) > 0
          )
      )::integer
        as same_time_provisional_valid_count,
      count(*) filter (
        where assessment.status = 'VALID'
          and assessment.is_complete
          and assessment.day_of_week =
            pair.source_day
      )::integer as same_day_valid_count,
      count(*) filter (
        where assessment.status = 'VALID'
          and assessment.is_complete
      )::integer as anywhere_valid_count,
      count(*) filter (
        where assessment.status = 'VALID'
          and assessment.is_complete
          and assessment.teacher_resolution_status =
            'RESOLVED'
          and assessment.room_resolution_status =
            'RESOLVED'
          and cardinality(
            assessment.warning_codes
          ) = 0
      )::integer
        as anywhere_resolved_valid_count,
      count(*) filter (
        where assessment.status = 'VALID'
          and assessment.is_complete
          and (
            assessment.teacher_resolution_status <>
              'RESOLVED'
            or assessment.room_resolution_status <>
              'RESOLVED'
            or cardinality(
              assessment.warning_codes
            ) > 0
          )
      )::integer
        as anywhere_provisional_valid_count
    from paired pair
    left join public.schedule_card_candidate_assessments assessment
      on assessment.card_id = pair.card_id
    where not pair.is_placed
    group by pair.card_id
  ),
  exact_source as (
    select
      pair.card_id,
      assessment.id as assessment_id,
      assessment.status,
      assessment.reason_codes,
      assessment.warning_codes,
      assessment.teacher_resolution_status,
      assessment.room_resolution_status,
      assessment.is_complete
    from paired pair
    left join public.schedule_card_candidate_assessments assessment
      on assessment.card_id = pair.card_id
     and assessment.day_of_week =
        pair.source_day
     and assessment.start_period =
        pair.source_start_period
     and assessment.teacher_id
        is not distinct from pair.source_teacher_id
     and assessment.room_id
        is not distinct from pair.source_room_id
    where not pair.is_placed
  ),
  best_candidates as (
    select distinct on (assessment.card_id)
      assessment.card_id,
      jsonb_build_object(
        'candidateAssessmentId',
          assessment.id,
        'dayOfWeek',
          assessment.day_of_week,
        'startPeriod',
          assessment.start_period,
        'teacherId',
          assessment.teacher_id,
        'roomId',
          assessment.room_id,
        'teacherResolutionStatus',
          assessment.teacher_resolution_status,
        'roomResolutionStatus',
          assessment.room_resolution_status,
        'warningCodes',
          to_jsonb(
            coalesce(
              assessment.warning_codes,
              array[]::text[]
            )
          ),
        'timeRelation',
          case
            when assessment.day_of_week =
                 pair.source_day
             and assessment.start_period =
                 pair.source_start_period
              then 'SAME_TIME'
            when assessment.day_of_week =
                 pair.source_day
              then 'SAME_DAY'
            else 'OTHER_DAY'
          end
      ) as value
    from paired pair
    join public.schedule_card_candidate_assessments assessment
      on assessment.card_id = pair.card_id
     and assessment.status = 'VALID'
     and assessment.is_complete
    where not pair.is_placed
    order by
      assessment.card_id,
      case
        when assessment.day_of_week =
             pair.source_day
         and assessment.start_period =
             pair.source_start_period
          then 0
        when assessment.day_of_week =
             pair.source_day
          then 1
        else 2
      end,
      case
        when assessment.teacher_resolution_status =
             'RESOLVED'
         and assessment.room_resolution_status =
             'RESOLVED'
         and cardinality(
           assessment.warning_codes
         ) = 0
          then 0
        else 1
      end,
      assessment.day_of_week,
      assessment.start_period,
      assessment.teacher_id nulls last,
      assessment.room_id nulls last,
      assessment.id
  ),
  blocking_placements as (
    select
      pair.card_id,
      count(*)::integer as blocker_count,
      jsonb_agg(
        jsonb_build_object(
          'placementId',
            placement.id,
          'cardId',
            occupied_card.id,
          'requirementId',
            occupied_requirement.id,
          'subjectName',
            occupied_subject.name,
          'groupName',
            occupied_group.name,
          'dayOfWeek',
            placement.day_of_week,
          'startPeriod',
            placement.start_period,
          'durationPeriods',
            occupied_card.duration_periods,
          'teacherId',
            placement.teacher_id,
          'roomId',
            placement.room_id,
          'conflictTypes',
            to_jsonb(
              array_remove(
                array[
                  case
                    when pair.source_teacher_id
                           is not null
                     and placement.teacher_id =
                           pair.source_teacher_id
                      then 'TEACHER_CONFLICT'
                  end,
                  case
                    when pair.source_room_id
                           is not null
                     and coalesce(
                           occupied_room.canonical_room_id,
                           placement.room_id
                         ) =
                         pair.source_room_id
                      then 'ROOM_CONFLICT'
                  end,
                  case
                    when public.management_instructional_groups_conflict(
                           target_requirement.instructional_group_id,
                           occupied_requirement.instructional_group_id
                         )
                      then 'GROUP_CONFLICT'
                  end
                ]::text[],
                null
              )
            )
        )
        order by
          occupied_subject.name,
          occupied_group.name,
          occupied_card.id
      ) as blockers
    from paired pair
    join public.course_requirements target_requirement
      on target_requirement.id =
        pair.requirement_id
    join public.placements placement
      on placement.day_of_week =
        pair.source_day
     and placement.start_period <=
        pair.source_start_period +
        pair.duration_periods - 1
    join public.schedule_cards occupied_card
      on occupied_card.id =
        placement.card_id
     and occupied_card.schedule_revision_id =
        p_schedule_revision_id
     and occupied_card.id <> pair.card_id
     and (
       placement.start_period +
       occupied_card.duration_periods - 1
     ) >= pair.source_start_period
    join public.course_requirements occupied_requirement
      on occupied_requirement.id =
        occupied_card.requirement_id
    join public.subjects occupied_subject
      on occupied_subject.id =
        occupied_requirement.subject_id
    join public.instructional_groups occupied_group
      on occupied_group.id =
        occupied_requirement.instructional_group_id
    left join public.rooms occupied_room
      on occupied_room.id =
        placement.room_id
    where not pair.is_placed
      and (
        (
          pair.source_teacher_id is not null
          and placement.teacher_id =
            pair.source_teacher_id
        )
        or (
          pair.source_room_id is not null
          and coalesce(
                occupied_room.canonical_room_id,
                placement.room_id
              ) =
              pair.source_room_id
        )
        or public.management_instructional_groups_conflict(
          target_requirement.instructional_group_id,
          occupied_requirement.instructional_group_id
        )
      )
    group by pair.card_id
  ),
  row_base as (
    select
      pair.card_id,
      pair.requirement_id,
      pair.block_index,
      pair.duration_periods,
      subject.name as subject_name,
      instructional_group.name as group_name,
      case
        when requirement_stats.placed_count > 0
          then 'HAS_EXISTING_PLACEMENT'
        else 'SOURCE_SLOT_NOT_CURRENTLY_VALID'
      end as requirement_context,
      pair.source_day,
      pair.source_start_period,
      pair.source_teacher_id,
      pair.source_room_id,
      coalesce(
        pair.source_session_ids,
        '[]'::jsonb
      ) as source_session_ids,
      case
        when pair.source_day is null
          then 'NO_SOURCE_PAIR'
        when exact.assessment_id is null
          then 'NOT_IN_DOMAIN'
        else exact.status
      end as exact_source_candidate_status,
      case
        when pair.source_day is null
          then array['SOURCE_PAIR_MISSING']::text[]
        when exact.assessment_id is null
          then array['SOURCE_COMBINATION_NOT_IN_DOMAIN']::text[]
        else coalesce(
          exact.reason_codes,
          array[]::text[]
        )
      end as exact_source_reason_codes,
      coalesce(
        exact.warning_codes,
        array[]::text[]
      ) as exact_source_warning_codes,
      exact.teacher_resolution_status
        as exact_source_teacher_resolution,
      exact.room_resolution_status
        as exact_source_room_resolution,
      coalesce(
        candidate.same_time_valid_count,
        0
      ) as same_time_valid_count,
      coalesce(
        candidate.same_time_resolved_valid_count,
        0
      ) as same_time_resolved_valid_count,
      coalesce(
        candidate.same_time_provisional_valid_count,
        0
      ) as same_time_provisional_valid_count,
      coalesce(
        candidate.same_day_valid_count,
        0
      ) as same_day_valid_count,
      coalesce(
        candidate.anywhere_valid_count,
        0
      ) as anywhere_valid_count,
      coalesce(
        candidate.anywhere_resolved_valid_count,
        0
      ) as anywhere_resolved_valid_count,
      coalesce(
        candidate.anywhere_provisional_valid_count,
        0
      ) as anywhere_provisional_valid_count,
      coalesce(
        domain.valid_count,
        0
      ) as domain_valid_count,
      coalesce(
        domain.provisional_valid_count,
        0
      ) as domain_provisional_valid_count,
      coalesce(
        domain.invalid_count,
        0
      ) as domain_invalid_count,
      coalesce(
        domain.unresolved_count,
        0
      ) as domain_unresolved_count,
      coalesce(
        domain.is_forced,
        false
      ) as domain_is_forced,
      coalesce(
        domain.is_contradiction,
        false
      ) as domain_is_contradiction,
      coalesce(
        blocker.blocker_count,
        0
      ) as blocker_count,
      coalesce(
        blocker.blockers,
        '[]'::jsonb
      ) as blockers,
      coalesce(
        best.value,
        'null'::jsonb
      ) as best_alternative,
      exact.assessment_id,
      exact.status as exact_status,
      exact.is_complete as exact_complete
    from paired pair
    join public.course_requirements requirement
      on requirement.id =
        pair.requirement_id
    join public.subjects subject
      on subject.id =
        requirement.subject_id
    join public.instructional_groups instructional_group
      on instructional_group.id =
        requirement.instructional_group_id
    join requirement_placement_stats requirement_stats
      on requirement_stats.requirement_id =
        pair.requirement_id
    left join exact_source exact
      on exact.card_id =
        pair.card_id
    left join candidate_stats candidate
      on candidate.card_id =
        pair.card_id
    left join public.schedule_card_domain_summaries domain
      on domain.card_id =
        pair.card_id
    left join best_candidates best
      on best.card_id =
        pair.card_id
    left join blocking_placements blocker
      on blocker.card_id =
        pair.card_id
    where not pair.is_placed
  )
  select
    row_base.card_id,
    row_base.requirement_id,
    row_base.block_index,
    row_base.duration_periods,
    row_base.subject_name,
    row_base.group_name,
    row_base.requirement_context,
    row_base.source_day,
    row_base.source_start_period,
    row_base.source_teacher_id,
    row_base.source_room_id,
    row_base.source_session_ids,
    row_base.exact_source_candidate_status,
    row_base.exact_source_reason_codes,
    row_base.exact_source_warning_codes,
    row_base.exact_source_teacher_resolution,
    row_base.exact_source_room_resolution,
    row_base.same_time_valid_count,
    row_base.same_time_resolved_valid_count,
    row_base.same_time_provisional_valid_count,
    row_base.same_day_valid_count,
    row_base.anywhere_valid_count,
    row_base.anywhere_resolved_valid_count,
    row_base.anywhere_provisional_valid_count,
    row_base.domain_valid_count,
    row_base.domain_provisional_valid_count,
    row_base.domain_invalid_count,
    row_base.domain_unresolved_count,
    row_base.domain_is_forced,
    row_base.domain_is_contradiction,
    row_base.blocker_count,
    row_base.blockers,
    row_base.best_alternative,
    case
      when row_base.assessment_id is not null
       and row_base.exact_status = 'VALID'
       and coalesce(
         row_base.exact_complete,
         false
       )
        then 'EXACT_SOURCE_SLOT_AVAILABLE'
      when row_base.same_time_valid_count > 0
        then 'SAME_TIME_RESOURCE_ALTERNATIVE'
      when row_base.same_day_valid_count > 0
        then 'SAME_DAY_RELOCATION'
      when row_base.anywhere_valid_count > 0
        then 'CROSS_DAY_RELOCATION'
      when row_base.domain_unresolved_count > 0
        then 'DATA_RESOLUTION_REQUIRED'
      else 'NO_VALID_CANDIDATE'
    end::text as triage_class
  from row_base
  order by
    case
      when row_base.requirement_context =
        'HAS_EXISTING_PLACEMENT'
        then 0
      else 1
    end,
    row_base.subject_name,
    row_base.group_name,
    row_base.requirement_id,
    row_base.block_index,
    row_base.card_id
$$;

revoke all
  on function public.management_remaining_recovery_triage_rows_internal(uuid)
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- MANAGEMENT DIAGNOSTIC
-- -------------------------------------------------------------------------

create or replace function public.management_diagnose_remaining_recovery_triage(
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
  v_recovery_run record;
  v_current_recovery jsonb;
  v_rows jsonb;
  v_summary jsonb;
  v_reason_counts jsonb;
  v_class_counts jsonb;
  v_requirement_context_counts jsonb;
  v_public_baseline jsonb;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception
      'M24.4 management VIEWER role required'
      using errcode = '42501';
  end if;

  select
    revision.id,
    revision.requirement_set_id,
    requirement_set.academic_year,
    requirement_set.term
  into v_revision
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id =
      revision.requirement_set_id
  where revision.id = p_schedule_revision_id
    and revision.status = 'DRAFT'
    and requirement_set.status = 'DRAFT';

  if not found then
    raise exception
      'M24.4 requires the active DRAFT revision';
  end if;

  select
    run.id,
    run.plan_token,
    run.root_transaction_id,
    run.applied_at,
    run.placement_target_count
  into v_recovery_run
  from public.management_historical_recovery_runs run
  where run.schedule_revision_id =
    p_schedule_revision_id
  order by run.applied_at desc
  limit 1;

  if not found then
    raise exception
      'M24.4 requires a completed M24.3 recovery run';
  end if;

  -- Derived candidate state must reflect the 228 current placements.
  perform public.refresh_management_candidate_domain(
    p_schedule_revision_id
  );

  v_current_recovery :=
    public.management_diagnose_historical_recovery_v2(
      p_schedule_revision_id
    );

  if coalesce(
       (
         v_current_recovery
         #>> '{summary,unplacedCards}'
       )::integer,
       -1
     ) <> 64
     or coalesce(
       (
         v_current_recovery
         #>> '{summary,recoverableCardCount}'
       )::integer,
       -1
     ) <> 0
     or coalesce(
       (
         v_current_recovery
         #>> '{summary,partitionMismatchRequirementCount}'
       )::integer,
       -1
     ) <> 0 then
    raise exception
      'M24.4 current state is not the accepted post-M24.3 baseline: %',
      coalesce(
        v_current_recovery -> 'summary',
        '{}'::jsonb
      )::text;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', triage.card_id,
        'requirementId',
          triage.requirement_id,
        'blockIndex',
          triage.block_index,
        'durationPeriods',
          triage.duration_periods,
        'subjectName',
          triage.subject_name,
        'groupName',
          triage.group_name,
        'requirementContext',
          triage.requirement_context,
        'source',
          jsonb_build_object(
            'dayOfWeek',
              triage.source_day,
            'startPeriod',
              triage.source_start_period,
            'teacherId',
              triage.source_teacher_id,
            'roomId',
              triage.source_room_id,
            'sourceSessionIds',
              triage.source_session_ids
          ),
        'exactSourceCandidate',
          jsonb_build_object(
            'status',
              triage.exact_source_candidate_status,
            'reasonCodes',
              to_jsonb(
                triage.exact_source_reason_codes
              ),
            'warningCodes',
              to_jsonb(
                triage.exact_source_warning_codes
              ),
            'teacherResolutionStatus',
              triage.exact_source_teacher_resolution,
            'roomResolutionStatus',
              triage.exact_source_room_resolution
          ),
        'alternativeAvailability',
          jsonb_build_object(
            'sameTimeValidCount',
              triage.same_time_valid_count,
            'sameTimeResolvedValidCount',
              triage.same_time_resolved_valid_count,
            'sameTimeProvisionalValidCount',
              triage.same_time_provisional_valid_count,
            'sameDayValidCount',
              triage.same_day_valid_count,
            'anywhereValidCount',
              triage.anywhere_valid_count,
            'anywhereResolvedValidCount',
              triage.anywhere_resolved_valid_count,
            'anywhereProvisionalValidCount',
              triage.anywhere_provisional_valid_count,
            'bestAlternative',
              triage.best_alternative
          ),
        'domain',
          jsonb_build_object(
            'validCount',
              triage.domain_valid_count,
            'provisionalValidCount',
              triage.domain_provisional_valid_count,
            'invalidCount',
              triage.domain_invalid_count,
            'unresolvedCount',
              triage.domain_unresolved_count,
            'isForced',
              triage.domain_is_forced,
            'isContradiction',
              triage.domain_is_contradiction
          ),
        'blockingPlacements',
          jsonb_build_object(
            'count',
              triage.blocker_count,
            'rows',
              triage.blockers
          ),
        'triageClass',
          triage.triage_class
      )
      order by
        case
          when triage.requirement_context =
            'HAS_EXISTING_PLACEMENT'
            then 0
          else 1
        end,
        triage.triage_class,
        triage.subject_name,
        triage.group_name,
        triage.requirement_id,
        triage.block_index
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.management_remaining_recovery_triage_rows_internal(
    p_schedule_revision_id
  ) triage;

  select jsonb_build_object(
    'remainingCardCount',
      count(*),
    'remainingPeriodCount',
      coalesce(
        sum(triage.duration_periods),
        0
      ),
    'remainingRequirementCount',
      count(distinct triage.requirement_id),
    'requirementsWithExistingPlacement',
      count(distinct triage.requirement_id)
      filter (
        where triage.requirement_context =
          'HAS_EXISTING_PLACEMENT'
      ),
    'requirementsWithInvalidSourceSlot',
      count(distinct triage.requirement_id)
      filter (
        where triage.requirement_context =
          'SOURCE_SLOT_NOT_CURRENTLY_VALID'
      ),
    'exactSourceSlotAvailableCards',
      count(*) filter (
        where triage.triage_class =
          'EXACT_SOURCE_SLOT_AVAILABLE'
      ),
    'sameTimeResourceAlternativeCards',
      count(*) filter (
        where triage.triage_class =
          'SAME_TIME_RESOURCE_ALTERNATIVE'
      ),
    'sameDayRelocationCards',
      count(*) filter (
        where triage.triage_class =
          'SAME_DAY_RELOCATION'
      ),
    'crossDayRelocationCards',
      count(*) filter (
        where triage.triage_class =
          'CROSS_DAY_RELOCATION'
      ),
    'dataResolutionRequiredCards',
      count(*) filter (
        where triage.triage_class =
          'DATA_RESOLUTION_REQUIRED'
      ),
    'noValidCandidateCards',
      count(*) filter (
        where triage.triage_class =
          'NO_VALID_CANDIDATE'
      ),
    'cardsWithResolvedAlternative',
      count(*) filter (
        where triage.anywhere_resolved_valid_count > 0
      ),
    'cardsWithOnlyProvisionalAlternative',
      count(*) filter (
        where triage.anywhere_valid_count > 0
          and triage.anywhere_resolved_valid_count = 0
      ),
    'contradictionCards',
      count(*) filter (
        where triage.domain_is_contradiction
      )
  )
  into v_summary
  from public.management_remaining_recovery_triage_rows_internal(
    p_schedule_revision_id
  ) triage;

  select coalesce(
    jsonb_object_agg(
      reason.reason_code,
      reason.card_count
    ),
    '{}'::jsonb
  )
  into v_reason_counts
  from (
    select
      reason_code,
      count(distinct triage.card_id)::integer
        as card_count
    from public.management_remaining_recovery_triage_rows_internal(
      p_schedule_revision_id
    ) triage
    cross join lateral unnest(
      triage.exact_source_reason_codes
    ) reason_code
    group by reason_code
    order by reason_code
  ) reason;

  select coalesce(
    jsonb_object_agg(
      class.triage_class,
      class.card_count
    ),
    '{}'::jsonb
  )
  into v_class_counts
  from (
    select
      triage.triage_class,
      count(*)::integer as card_count
    from public.management_remaining_recovery_triage_rows_internal(
      p_schedule_revision_id
    ) triage
    group by triage.triage_class
    order by triage.triage_class
  ) class;

  select coalesce(
    jsonb_object_agg(
      context.requirement_context,
      context.requirement_count
    ),
    '{}'::jsonb
  )
  into v_requirement_context_counts
  from (
    select
      triage.requirement_context,
      count(distinct triage.requirement_id)::integer
        as requirement_count
    from public.management_remaining_recovery_triage_rows_internal(
      p_schedule_revision_id
    ) triage
    group by triage.requirement_context
    order by triage.requirement_context
  ) context;

  v_public_baseline :=
    public.management_publication_baseline_status(
      v_revision.academic_year
    );

  return jsonb_build_object(
    'revisionId',
      p_schedule_revision_id,
    'academicYear',
      v_revision.academic_year,
    'term',
      v_revision.term,
    'engineVersion',
      'M24.4-v1',
    'diagnosticOnly',
      true,
    'mutationPerformed',
      false,
    'applyEndpointPresent',
      false,
    'recoveryRun',
      jsonb_build_object(
        'auditId',
          v_recovery_run.id,
        'planToken',
          v_recovery_run.plan_token,
        'historyBarrierTransactionId',
          v_recovery_run.root_transaction_id,
        'appliedAt',
          v_recovery_run.applied_at,
        'recoveredPlacementCount',
          v_recovery_run.placement_target_count
      ),
    'summary',
      v_summary,
    'triageClassCounts',
      v_class_counts,
    'sourceReasonCounts',
      v_reason_counts,
    'requirementContextCounts',
      v_requirement_context_counts,
    'publicBaseline',
      v_public_baseline,
    'publicationBlocking',
      false,
    'nextStep',
      'M24_5_TARGETED_PARTIAL_RECOVERY_OR_MANUAL_PLACEMENT_DESIGN',
    'rows',
      v_rows
  );
end
$$;

revoke all
  on function public.management_diagnose_remaining_recovery_triage(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_diagnose_remaining_recovery_triage(uuid)
  to authenticated;

comment on function public.management_diagnose_remaining_recovery_triage(uuid) is
  'M24.4 read-only post-recovery triage. Explains every remaining unplaced card against its historical source slot, current conflicts, candidate-domain alternatives, resource certainty, and partial-recovery context. It refreshes derived candidate state but creates no placement and exposes no apply endpoint.';


-- -------------------------------------------------------------------------
-- INSTALLATION INVARIANTS
-- -------------------------------------------------------------------------

do $$
declare
  v_revision_id uuid;
  v_sessions integer;
  v_groups integer;
  v_cards integer;
  v_placements integer;
  v_moves integer;
  v_recovery_runs integer;
  v_triage_rows integer;
  v_triage_requirements integer;
begin
  select revision.id
  into v_revision_id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id =
      revision.requirement_set_id
  where requirement_set.academic_year =
      '2026-2027'
    and requirement_set.term = 1
    and requirement_set.status = 'DRAFT'
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1;

  if v_revision_id is null then
    raise exception
      'M24.4 current term-1 DRAFT not found';
  end if;

  perform public.refresh_management_candidate_domain(
    v_revision_id
  );

  select count(*)
  into v_sessions
  from public.schedule_sessions
  where academic_year = '2026-2027';

  select count(*)
  into v_groups
  from public.session_groups session_group
  join public.schedule_sessions session
    on session.id = session_group.session_id
  where session.academic_year = '2026-2027';

  select count(*)
  into v_cards
  from public.schedule_cards card
  where card.schedule_revision_id =
    v_revision_id;

  select count(*)
  into v_placements
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id =
    v_revision_id;

  select count(*)
  into v_moves
  from public.move_transactions transaction
  where transaction.schedule_revision_id =
    v_revision_id;

  select count(*)
  into v_recovery_runs
  from public.management_historical_recovery_runs run
  where run.schedule_revision_id =
    v_revision_id;

  select
    count(*),
    count(distinct triage.requirement_id)
  into
    v_triage_rows,
    v_triage_requirements
  from public.management_remaining_recovery_triage_rows_internal(
    v_revision_id
  ) triage;

  if v_sessions <> 517
     or v_groups <> 609
     or v_cards <> 292
     or v_placements <> 228
     or v_moves <> 343
     or v_recovery_runs <> 1
     or v_triage_rows <> 64
     or v_triage_requirements <> 30 then
    raise exception
      'M24.4 accepted post-recovery invariant failed: sessions %, groups %, cards %, placements %, moves %, recovery runs %, triage rows %, triage requirements %',
      v_sessions,
      v_groups,
      v_cards,
      v_placements,
      v_moves,
      v_recovery_runs,
      v_triage_rows,
      v_triage_requirements;
  end if;

  if not coalesce(
    (
      public.management_publication_baseline_status(
        '2026-2027'
      )
      ->> 'healthy'
    )::boolean,
    false
  ) then
    raise exception
      'M24.4 public baseline drift detected';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_historical_recovery_v2(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M24.4 must not expose historical recovery apply to authenticated';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M24.4 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M24.4 must not unlock term template apply';
  end if;
end
$$;

commit;
