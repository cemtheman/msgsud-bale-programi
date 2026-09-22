-- Management / M24.6.1
-- Stable Exact Partial Recovery Preview Token
--
-- Root cause:
--   M24.5 included schedule_card_candidate_assessments.id in the plan token.
--   refresh_management_candidate_domain() deletes/rebuilds those derived rows,
--   therefore candidateAssessmentId changes on every preview although the
--   semantic recovery plan is identical.
--
-- Fix:
--   * keep fresh candidateAssessmentId in the returned target rows so M24.6 can
--     bind to the exact current derived candidate after taking the revision lock,
--   * EXCLUDE candidateAssessmentId from the hashed plan core,
--   * keep every semantic scheduling field + persistent-state hash in the token,
--   * prove token stability by running the preview twice during installation.
--
-- Applied M24.5 and M24.6 migrations are not edited.

begin;


create or replace function public.management_preview_exact_partial_recovery_v2_internal(
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
  v_triage jsonb;
  v_targets jsonb;
  v_token_targets jsonb;
  v_conflicts jsonb;
  v_conflict_cards jsonb;
  v_summary jsonb;
  v_plan_core jsonb;
  v_plan_token text;

  v_target_count integer;
  v_conflict_pair_count integer;
  v_conflicted_card_count integer;
  v_resolved_count integer;
  v_provisional_count integer;
  v_period_count integer;

  v_structure_hash text;
  v_card_hash text;
  v_placement_hash text;
  v_card_count integer;
  v_placement_count integer;
  v_move_count integer;
  v_recovery_run_count integer;
begin
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
    and requirement_set.status = 'DRAFT'
  for update of revision;

  if not found then
    raise exception
      'M24.6.1 requires the active DRAFT revision';
  end if;

  perform public.refresh_management_candidate_domain(
    p_schedule_revision_id
  );

  v_triage :=
    public.management_diagnose_remaining_recovery_triage(
      p_schedule_revision_id
    );

  if coalesce(
       (v_triage #>> '{summary,remainingCardCount}')::integer,
       -1
     ) <> 64
     or coalesce(
       (v_triage #>> '{summary,exactSourceSlotAvailableCards}')::integer,
       -1
     ) <> 28 then
    raise exception
      'M24.6.1 current triage no longer matches accepted baseline';
  end if;

  -- Returned targets retain the fresh derived candidateAssessmentId.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', target.card_id,
        'requirementId', target.requirement_id,
        'blockIndex', target.block_index,
        'durationPeriods', target.duration_periods,
        'subjectName', target.subject_name,
        'groupName', target.group_name,
        'dayOfWeek', target.day_of_week,
        'startPeriod', target.start_period,
        'teacherId', target.teacher_id,
        'roomId', target.room_id,
        'candidateAssessmentId',
          target.candidate_assessment_id,
        'teacherResolutionStatus',
          target.teacher_resolution_status,
        'roomResolutionStatus',
          target.room_resolution_status,
        'warningCodes',
          to_jsonb(target.warning_codes),
        'sourceSessionIds',
          target.source_session_ids,
        'resourceCertainty',
          target.resource_certainty
      )
      order by
        target.requirement_id,
        target.block_index,
        target.card_id
    ),
    '[]'::jsonb
  )
  into v_targets
  from public.management_m24_exact_partial_recovery_targets_internal(
    p_schedule_revision_id
  ) target;

  -- Stable token projection: deliberately exclude only the ephemeral derived
  -- candidate row UUID. All semantic placement/certainty/source evidence stays.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', target.card_id,
        'requirementId', target.requirement_id,
        'blockIndex', target.block_index,
        'durationPeriods', target.duration_periods,
        'subjectName', target.subject_name,
        'groupName', target.group_name,
        'dayOfWeek', target.day_of_week,
        'startPeriod', target.start_period,
        'teacherId', target.teacher_id,
        'roomId', target.room_id,
        'teacherResolutionStatus',
          target.teacher_resolution_status,
        'roomResolutionStatus',
          target.room_resolution_status,
        'warningCodes',
          to_jsonb(target.warning_codes),
        'sourceSessionIds',
          target.source_session_ids,
        'resourceCertainty',
          target.resource_certainty
      )
      order by
        target.requirement_id,
        target.block_index,
        target.card_id
    ),
    '[]'::jsonb
  )
  into v_token_targets
  from public.management_m24_exact_partial_recovery_targets_internal(
    p_schedule_revision_id
  ) target;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'leftCardId', conflict.left_card_id,
        'rightCardId', conflict.right_card_id,
        'dayOfWeek', conflict.day_of_week,
        'leftStartPeriod', conflict.left_start_period,
        'rightStartPeriod', conflict.right_start_period,
        'conflictTypes', to_jsonb(conflict.conflict_types)
      )
      order by
        conflict.day_of_week,
        conflict.left_start_period,
        conflict.left_card_id,
        conflict.right_card_id
    ),
    '[]'::jsonb
  )
  into v_conflicts
  from public.management_m24_exact_partial_recovery_conflicts_internal(
    p_schedule_revision_id
  ) conflict;

  select coalesce(
    jsonb_agg(card_id order by card_id),
    '[]'::jsonb
  )
  into v_conflict_cards
  from (
    select conflict.left_card_id as card_id
    from public.management_m24_exact_partial_recovery_conflicts_internal(
      p_schedule_revision_id
    ) conflict

    union

    select conflict.right_card_id as card_id
    from public.management_m24_exact_partial_recovery_conflicts_internal(
      p_schedule_revision_id
    ) conflict
  ) conflict_card;

  v_target_count := jsonb_array_length(v_targets);
  v_conflict_pair_count := jsonb_array_length(v_conflicts);
  v_conflicted_card_count := jsonb_array_length(v_conflict_cards);

  select
    count(*) filter (
      where target.resource_certainty = 'RESOLVED'
    )::integer,
    count(*) filter (
      where target.resource_certainty = 'PROVISIONAL'
    )::integer,
    coalesce(sum(target.duration_periods), 0)::integer
  into
    v_resolved_count,
    v_provisional_count,
    v_period_count
  from public.management_m24_exact_partial_recovery_targets_internal(
    p_schedule_revision_id
  ) target;

  v_structure_hash :=
    public.management_m24_requirement_structure_hash(
      p_schedule_revision_id
    );

  v_card_hash :=
    public.management_m24_card_graph_hash(
      p_schedule_revision_id
    );

  v_placement_hash :=
    public.management_m24_placement_semantic_hash(
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
  into v_recovery_run_count
  from public.management_historical_recovery_runs run
  where run.schedule_revision_id = p_schedule_revision_id;

  v_summary :=
    jsonb_build_object(
      'targetCount', v_target_count,
      'targetPeriodCount', v_period_count,
      'resolvedTargetCount', v_resolved_count,
      'provisionalTargetCount', v_provisional_count,
      'conflictPairCount', v_conflict_pair_count,
      'conflictedCardCount', v_conflicted_card_count,
      'conflictFreeTargetCount',
        v_target_count - v_conflicted_card_count,
      'canApplyWholeBatch',
        v_target_count > 0
        and v_conflict_pair_count = 0
    );

  v_plan_core :=
    jsonb_build_object(
      'revisionId', p_schedule_revision_id,
      'engineVersion', 'M24.6.1-v1',
      'persistentState',
        jsonb_build_object(
          'structureHash', v_structure_hash,
          'cardGraphHash', v_card_hash,
          'placementHash', v_placement_hash,
          'cardCount', v_card_count,
          'placementCount', v_placement_count,
          'moveTransactionCount', v_move_count,
          'recoveryRunCount', v_recovery_run_count
        ),
      'summary', v_summary,
      'targets', v_token_targets,
      'conflicts', v_conflicts
    );

  v_plan_token := md5(v_plan_core::text);

  return jsonb_build_object(
    'revisionId', p_schedule_revision_id,
    'academicYear', v_revision.academic_year,
    'term', v_revision.term,
    'engineVersion', 'M24.6.1-v1',
    'previewOnly', true,
    'mutationPerformed', false,
    'applyEndpointPresent', true,
    'tokenSemantics',
      jsonb_build_object(
        'stableAcrossCandidateRefresh', true,
        'candidateAssessmentIdHashed', false,
        'candidateAssessmentIdReturnedFresh', true
      ),
    'planToken', v_plan_token,
    'summary', v_summary,
    'persistentState',
      v_plan_core -> 'persistentState',
    'targets', v_targets,
    'conflicts', v_conflicts,
    'conflictedCardIds', v_conflict_cards,
    'publicBaseline',
      public.management_publication_baseline_status(
        v_revision.academic_year
      ),
    'publicationBlocking', false,
    'nextStep',
      case
        when v_conflict_pair_count = 0
          then 'M24_6_TOKEN_CONTROLLED_EXACT_PARTIAL_RECOVERY_APPLY'
        else 'M24_5_1_EXACT_TARGET_CONFLICT_SELECTION'
      end
  );
end
$$;

revoke all
  on function public.management_preview_exact_partial_recovery_v2_internal(uuid)
  from public, anon, authenticated;

comment on function public.management_preview_exact_partial_recovery_v2_internal(uuid) is
  'M24.6.1 internal stable-token exact-source partial recovery preview. Used by installation invariants and the SQL-Editor-only public wrapper.';


-- -------------------------------------------------------------------------
-- SQL-EDITOR-ONLY PUBLIC WRAPPER
-- -------------------------------------------------------------------------

create or replace function public.management_preview_exact_partial_recovery_v2(
  p_schedule_revision_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $
begin
  if session_user <> 'postgres' then
    raise exception
      'M24.6.1 exact partial recovery preview is SQL-Editor/postgres only'
      using errcode = '42501';
  end if;

  return public.management_preview_exact_partial_recovery_v2_internal(
    p_schedule_revision_id
  );
end
$;

revoke all
  on function public.management_preview_exact_partial_recovery_v2(uuid)
  from public, anon, authenticated;

comment on function public.management_preview_exact_partial_recovery_v2(uuid) is
  'M24.6.1 SQL-Editor/postgres-only wrapper for the stable-token exact-source partial recovery preview.';


-- -------------------------------------------------------------------------
-- INSTALLATION INVARIANTS
-- -------------------------------------------------------------------------

do $$
declare
  v_revision_id uuid;
  v_preview_1 jsonb;
  v_preview_2 jsonb;
  v_token_1 text;
  v_token_2 text;
  v_candidate_id_1 text;
  v_candidate_id_2 text;
  v_sessions integer;
  v_groups integer;
  v_cards integer;
  v_placements integer;
  v_moves integer;
  v_historical_runs integer;
  v_partial_runs integer;
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
      'M24.6.1 current term-1 DRAFT not found';
  end if;

  v_preview_1 :=
    public.management_preview_exact_partial_recovery_v2_internal(
      v_revision_id
    );

  v_token_1 := v_preview_1 ->> 'planToken';
  v_candidate_id_1 :=
    v_preview_1 #>> '{targets,0,candidateAssessmentId}';

  -- This call refreshes derived candidates again. The semantic token MUST stay
  -- identical even though candidateAssessmentId is allowed/expected to change.
  v_preview_2 :=
    public.management_preview_exact_partial_recovery_v2_internal(
      v_revision_id
    );

  v_token_2 := v_preview_2 ->> 'planToken';
  v_candidate_id_2 :=
    v_preview_2 #>> '{targets,0,candidateAssessmentId}';

  if v_token_1 is null
     or v_token_2 is null
     or v_token_1 is distinct from v_token_2 then
    raise exception
      'M24.6.1 token stability invariant failed: first %, second %',
      v_token_1,
      v_token_2;
  end if;

  if coalesce(
       (v_preview_2 #>> '{summary,targetCount}')::integer,
       -1
     ) <> 28
     or coalesce(
       (v_preview_2 #>> '{summary,targetPeriodCount}')::integer,
       -1
     ) <> 46
     or coalesce(
       (v_preview_2 #>> '{summary,resolvedTargetCount}')::integer,
       -1
     ) <> 15
     or coalesce(
       (v_preview_2 #>> '{summary,provisionalTargetCount}')::integer,
       -1
     ) <> 13
     or coalesce(
       (v_preview_2 #>> '{summary,conflictPairCount}')::integer,
       -1
     ) <> 0
     or not coalesce(
       (v_preview_2 #>> '{summary,canApplyWholeBatch}')::boolean,
       false
     ) then
    raise exception
      'M24.6.1 exact partial recovery plan cardinality drift';
  end if;

  if coalesce(
       (v_preview_2 #>> '{tokenSemantics,candidateAssessmentIdHashed}')::boolean,
       true
     )
     or not coalesce(
       (v_preview_2 #>> '{tokenSemantics,stableAcrossCandidateRefresh}')::boolean,
       false
     ) then
    raise exception
      'M24.6.1 token semantics invariant failed';
  end if;

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

  if v_sessions <> 517
     or v_groups <> 609
     or v_cards <> 292
     or v_placements <> 228
     or v_moves <> 343
     or v_historical_runs <> 1
     or v_partial_runs <> 0 then
    raise exception
      'M24.6.1 must preserve pre-apply state: sessions %, groups %, cards %, placements %, moves %, historical runs %, partial runs %',
      v_sessions,
      v_groups,
      v_cards,
      v_placements,
      v_moves,
      v_historical_runs,
      v_partial_runs;
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_exact_partial_recovery_v2(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M24.6.1 exact partial recovery apply must remain SQL-Editor only';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M24.6.1 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M24.6.1 must not unlock term template apply';
  end if;
end
$$;

commit;
