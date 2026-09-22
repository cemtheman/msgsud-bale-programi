-- Management / M24.7
-- Remaining 36 Recovery Triage
--
-- Read-only diagnostic after the successful M24.6 exact-source partial recovery.
--
-- M24.4 intentionally described the pre-M24.6 64-card state and is retained as
-- historical evidence. M24.7 creates a new diagnostic for the current 36-card
-- state instead of rewriting any applied migration.
--
-- No placement/apply endpoint is created here.

begin;


create or replace function public.management_diagnose_remaining_36_recovery_triage(
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
  v_historical_run record;
  v_partial_run record;

  v_rows jsonb;
  v_summary jsonb;
  v_class_counts jsonb;
  v_reason_counts jsonb;
  v_context_counts jsonb;
  v_blocker_type_counts jsonb;
  v_subject_counts jsonb;
  v_public_baseline jsonb;

  v_card_count integer;
  v_placement_count integer;
  v_move_count integer;
  v_historical_run_count integer;
  v_partial_run_count integer;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception
      'M24.7 management VIEWER role required'
      using errcode = '42501';
  end if;

  select
    revision.id,
    requirement_set.academic_year,
    requirement_set.term
  into v_revision
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_schedule_revision_id
    and revision.status = 'DRAFT'
    and requirement_set.status = 'DRAFT';

  if not found then
    raise exception
      'M24.7 requires the active DRAFT revision';
  end if;

  select
    run.id,
    run.plan_token,
    run.root_transaction_id,
    run.applied_at,
    run.placement_target_count
  into v_historical_run
  from public.management_historical_recovery_runs run
  where run.schedule_revision_id = p_schedule_revision_id
  order by run.applied_at desc
  limit 1;

  if not found then
    raise exception
      'M24.7 requires a completed M24.3 historical recovery run';
  end if;

  select
    run.id,
    run.plan_token,
    run.root_transaction_id,
    run.applied_at,
    run.target_count,
    run.target_period_count
  into v_partial_run
  from public.management_exact_partial_recovery_runs run
  where run.schedule_revision_id = p_schedule_revision_id
  order by run.applied_at desc
  limit 1;

  if not found then
    raise exception
      'M24.7 requires a completed M24.6 exact partial recovery run';
  end if;

  perform public.refresh_management_candidate_domain(
    p_schedule_revision_id
  );

  select count(*)
  into v_card_count
  from public.schedule_cards card
  where card.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_placement_count
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_move_count
  from public.move_transactions transaction
  where transaction.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_historical_run_count
  from public.management_historical_recovery_runs run
  where run.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_partial_run_count
  from public.management_exact_partial_recovery_runs run
  where run.schedule_revision_id = p_schedule_revision_id;

  if v_card_count <> 292
     or v_placement_count <> 256
     or v_move_count <> 372
     or v_historical_run_count <> 1
     or v_partial_run_count <> 1 then
    raise exception
      'M24.7 current state does not match accepted post-M24.6 baseline: cards %, placements %, moves %, historical runs %, partial runs %',
      v_card_count,
      v_placement_count,
      v_move_count,
      v_historical_run_count,
      v_partial_run_count;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', triage.card_id,
        'requirementId', triage.requirement_id,
        'blockIndex', triage.block_index,
        'durationPeriods', triage.duration_periods,
        'subjectName', triage.subject_name,
        'groupName', triage.group_name,
        'requirementContext', triage.requirement_context,
        'triageClass', triage.triage_class,
        'source',
          jsonb_build_object(
            'dayOfWeek', triage.source_day,
            'startPeriod', triage.source_start_period,
            'teacherId', triage.source_teacher_id,
            'roomId', triage.source_room_id,
            'sourceSessionIds', triage.source_session_ids
          ),
        'exactSourceCandidate',
          jsonb_build_object(
            'status', triage.exact_source_candidate_status,
            'reasonCodes',
              to_jsonb(triage.exact_source_reason_codes),
            'warningCodes',
              to_jsonb(triage.exact_source_warning_codes),
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
            'validCount', triage.domain_valid_count,
            'provisionalValidCount',
              triage.domain_provisional_valid_count,
            'invalidCount', triage.domain_invalid_count,
            'unresolvedCount',
              triage.domain_unresolved_count,
            'isForced', triage.domain_is_forced,
            'isContradiction',
              triage.domain_is_contradiction
          ),
        'blockingPlacements',
          jsonb_build_object(
            'count', triage.blocker_count,
            'rows', triage.blockers
          )
      )
      order by
        triage.triage_class,
        triage.subject_name,
        triage.group_name,
        triage.requirement_id,
        triage.block_index,
        triage.card_id
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.management_remaining_recovery_triage_rows_internal(
    p_schedule_revision_id
  ) triage;

  select jsonb_build_object(
    'remainingCardCount',
      count(*)::integer,
    'remainingPeriodCount',
      coalesce(sum(triage.duration_periods), 0)::integer,
    'remainingRequirementCount',
      count(distinct triage.requirement_id)::integer,
    'exactSourceSlotAvailableCards',
      count(*) filter (
        where triage.triage_class =
          'EXACT_SOURCE_SLOT_AVAILABLE'
      )::integer,
    'sameTimeResourceAlternativeCards',
      count(*) filter (
        where triage.triage_class =
          'SAME_TIME_RESOURCE_ALTERNATIVE'
      )::integer,
    'sameDayRelocationCards',
      count(*) filter (
        where triage.triage_class =
          'SAME_DAY_RELOCATION'
      )::integer,
    'crossDayRelocationCards',
      count(*) filter (
        where triage.triage_class =
          'CROSS_DAY_RELOCATION'
      )::integer,
    'dataResolutionRequiredCards',
      count(*) filter (
        where triage.triage_class =
          'DATA_RESOLUTION_REQUIRED'
      )::integer,
    'noValidCandidateCards',
      count(*) filter (
        where triage.triage_class =
          'NO_VALID_CANDIDATE'
      )::integer,
    'cardsWithAnyValidAlternative',
      count(*) filter (
        where triage.anywhere_valid_count > 0
      )::integer,
    'cardsWithResolvedAlternative',
      count(*) filter (
        where triage.anywhere_resolved_valid_count > 0
      )::integer,
    'cardsWithOnlyProvisionalAlternative',
      count(*) filter (
        where triage.anywhere_valid_count > 0
          and triage.anywhere_resolved_valid_count = 0
      )::integer,
    'cardsWithBlockingPlacement',
      count(*) filter (
        where triage.blocker_count > 0
      )::integer,
    'contradictionCards',
      count(*) filter (
        where triage.domain_is_contradiction
      )::integer
  )
  into v_summary
  from public.management_remaining_recovery_triage_rows_internal(
    p_schedule_revision_id
  ) triage;

  if coalesce(
       (v_summary ->> 'remainingCardCount')::integer,
       -1
     ) <> 36 then
    raise exception
      'M24.7 expected 36 remaining cards, found %',
      v_summary ->> 'remainingCardCount';
  end if;

  select coalesce(
    jsonb_object_agg(
      class_summary.triage_class,
      class_summary.card_count
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
  ) class_summary;

  select coalesce(
    jsonb_object_agg(
      reason_summary.reason_code,
      reason_summary.card_count
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
  ) reason_summary;

  select coalesce(
    jsonb_object_agg(
      context_summary.requirement_context,
      context_summary.requirement_count
    ),
    '{}'::jsonb
  )
  into v_context_counts
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
  ) context_summary;

  select coalesce(
    jsonb_object_agg(
      blocker_summary.conflict_type,
      blocker_summary.card_count
    ),
    '{}'::jsonb
  )
  into v_blocker_type_counts
  from (
    select
      conflict_type,
      count(distinct triage.card_id)::integer
        as card_count
    from public.management_remaining_recovery_triage_rows_internal(
      p_schedule_revision_id
    ) triage
    cross join lateral jsonb_array_elements(
      coalesce(triage.blockers, '[]'::jsonb)
    ) blocker
    cross join lateral jsonb_array_elements_text(
      coalesce(
        blocker -> 'conflictTypes',
        '[]'::jsonb
      )
    ) conflict_type
    group by conflict_type
    order by conflict_type
  ) blocker_summary;

  select coalesce(
    jsonb_object_agg(
      subject_summary.subject_name,
      subject_summary.card_count
    ),
    '{}'::jsonb
  )
  into v_subject_counts
  from (
    select
      triage.subject_name,
      count(*)::integer as card_count
    from public.management_remaining_recovery_triage_rows_internal(
      p_schedule_revision_id
    ) triage
    group by triage.subject_name
    order by triage.subject_name
  ) subject_summary;

  v_public_baseline :=
    public.management_publication_baseline_status(
      v_revision.academic_year
    );

  if not coalesce(
    (v_public_baseline ->> 'healthy')::boolean,
    false
  ) then
    raise exception
      'M24.7 public baseline drift detected';
  end if;

  return jsonb_build_object(
    'revisionId', p_schedule_revision_id,
    'academicYear', v_revision.academic_year,
    'term', v_revision.term,
    'engineVersion', 'M24.7-v1',
    'diagnosticOnly', true,
    'mutationPerformed', false,
    'applyEndpointPresent', false,
    'historicalRecoveryRun',
      jsonb_build_object(
        'auditId', v_historical_run.id,
        'planToken', v_historical_run.plan_token,
        'historyBarrierTransactionId',
          v_historical_run.root_transaction_id,
        'appliedAt', v_historical_run.applied_at,
        'recoveredPlacementCount',
          v_historical_run.placement_target_count
      ),
    'exactPartialRecoveryRun',
      jsonb_build_object(
        'auditId', v_partial_run.id,
        'planToken', v_partial_run.plan_token,
        'historyBarrierTransactionId',
          v_partial_run.root_transaction_id,
        'appliedAt', v_partial_run.applied_at,
        'recoveredPlacementCount',
          v_partial_run.target_count,
        'recoveredPeriodCount',
          v_partial_run.target_period_count
      ),
    'persistentState',
      jsonb_build_object(
        'cardCount', v_card_count,
        'placementCount', v_placement_count,
        'moveTransactionCount', v_move_count,
        'historicalRecoveryRunCount',
          v_historical_run_count,
        'exactPartialRecoveryRunCount',
          v_partial_run_count
      ),
    'summary', v_summary,
    'triageClassCounts', v_class_counts,
    'sourceReasonCounts', v_reason_counts,
    'requirementContextCounts', v_context_counts,
    'blockingConflictTypeCounts',
      v_blocker_type_counts,
    'remainingSubjectCounts',
      v_subject_counts,
    'publicBaseline', v_public_baseline,
    'publicationBlocking', false,
    'nextStep',
      case
        when coalesce(
          (v_summary ->> 'exactSourceSlotAvailableCards')::integer,
          0
        ) > 0
          then 'M24_8_EXACT_SOURCE_RECHECK'
        when coalesce(
          (v_summary ->> 'sameTimeResourceAlternativeCards')::integer,
          0
        ) > 0
          then 'M24_8_SAME_TIME_RESOURCE_SELECTION'
        when coalesce(
          (v_summary ->> 'sameDayRelocationCards')::integer,
          0
        ) > 0
          then 'M24_8_SAME_DAY_RELOCATION_SELECTION'
        when coalesce(
          (v_summary ->> 'crossDayRelocationCards')::integer,
          0
        ) > 0
          then 'M24_8_CROSS_DAY_RELOCATION_SELECTION'
        else 'M24_8_MANUAL_RESOLUTION'
      end,
    'rows', v_rows
  );
end
$$;

revoke all
  on function public.management_diagnose_remaining_36_recovery_triage(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_diagnose_remaining_36_recovery_triage(uuid)
  to authenticated;

comment on function public.management_diagnose_remaining_36_recovery_triage(uuid) is
  'M24.7 read-only post-M24.6 triage. Recomputes the candidate domain for the 36 remaining unplaced cards, classifies current exact/same-time/same-day/cross-day/data-resolution/no-candidate options, exposes current blocking placements and reason counts, and creates no placement.';


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
  v_historical_runs integer;
  v_partial_runs integer;
  v_remaining integer;
begin
  select revision.id
  into v_revision_id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
    and requirement_set.status = 'DRAFT'
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1;

  if v_revision_id is null then
    raise exception
      'M24.7 current term-1 DRAFT not found';
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
  where card.schedule_revision_id = v_revision_id;

  select count(*)
  into v_placements
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = v_revision_id;

  select count(*)
  into v_moves
  from public.move_transactions transaction
  where transaction.schedule_revision_id = v_revision_id;

  select count(*)
  into v_historical_runs
  from public.management_historical_recovery_runs run
  where run.schedule_revision_id = v_revision_id;

  select count(*)
  into v_partial_runs
  from public.management_exact_partial_recovery_runs run
  where run.schedule_revision_id = v_revision_id;

  select count(*)
  into v_remaining
  from public.management_remaining_recovery_triage_rows_internal(
    v_revision_id
  );

  if v_sessions <> 517
     or v_groups <> 609
     or v_cards <> 292
     or v_placements <> 256
     or v_moves <> 372
     or v_historical_runs <> 1
     or v_partial_runs <> 1
     or v_remaining <> 36 then
    raise exception
      'M24.7 accepted post-M24.6 invariant failed: sessions %, groups %, cards %, placements %, moves %, historical runs %, partial runs %, remaining %',
      v_sessions,
      v_groups,
      v_cards,
      v_placements,
      v_moves,
      v_historical_runs,
      v_partial_runs,
      v_remaining;
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
      'M24.7 public baseline drift detected';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_exact_partial_recovery_v2(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M24.7 must not expose exact partial recovery apply to authenticated';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M24.7 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M24.7 must not unlock term template apply';
  end if;
end
$$;

commit;
