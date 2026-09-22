-- Management / M24.5
-- Exact-Source Partial Recovery Batch Preview
--
-- M24.4 showed that some remaining cards are individually valid at their exact
-- historical source slot even though their requirement is not fully recoverable.
--
-- This migration builds a token-bearing, read-only batch preview for those exact
-- card-level targets and checks target-vs-target conflicts before any apply
-- endpoint is considered.
--
-- No placement is created here.

begin;


-- -------------------------------------------------------------------------
-- EXACT TARGET ROWS
-- -------------------------------------------------------------------------

create or replace function public.management_m24_exact_partial_recovery_targets_internal(
  p_schedule_revision_id uuid
)
returns table (
  card_id uuid,
  requirement_id uuid,
  block_index smallint,
  duration_periods smallint,
  instructional_group_id uuid,
  subject_name text,
  group_name text,
  day_of_week smallint,
  start_period smallint,
  teacher_id uuid,
  room_id uuid,
  candidate_assessment_id uuid,
  teacher_resolution_status text,
  room_resolution_status text,
  warning_codes text[],
  source_session_ids jsonb,
  resource_certainty text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    triage.card_id,
    triage.requirement_id,
    triage.block_index,
    triage.duration_periods,
    requirement.instructional_group_id,
    triage.subject_name,
    triage.group_name,
    triage.source_day,
    triage.source_start_period,
    triage.source_teacher_id,
    triage.source_room_id,
    assessment.id,
    assessment.teacher_resolution_status,
    assessment.room_resolution_status,
    assessment.warning_codes,
    triage.source_session_ids,
    case
      when assessment.teacher_resolution_status = 'RESOLVED'
       and assessment.room_resolution_status = 'RESOLVED'
       and cardinality(assessment.warning_codes) = 0
        then 'RESOLVED'
      else 'PROVISIONAL'
    end::text
  from public.management_remaining_recovery_triage_rows_internal(
    p_schedule_revision_id
  ) triage
  join public.course_requirements requirement
    on requirement.id = triage.requirement_id
  join public.schedule_card_candidate_assessments assessment
    on assessment.card_id = triage.card_id
   and assessment.day_of_week = triage.source_day
   and assessment.start_period = triage.source_start_period
   and assessment.teacher_id
      is not distinct from triage.source_teacher_id
   and assessment.room_id
      is not distinct from triage.source_room_id
  where triage.triage_class = 'EXACT_SOURCE_SLOT_AVAILABLE'
    and assessment.status = 'VALID'
    and assessment.is_complete
  order by
    triage.requirement_id,
    triage.block_index,
    triage.card_id
$$;

revoke all
  on function public.management_m24_exact_partial_recovery_targets_internal(uuid)
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- PAIRWISE TARGET CONFLICTS
-- -------------------------------------------------------------------------

create or replace function public.management_m24_exact_partial_recovery_conflicts_internal(
  p_schedule_revision_id uuid
)
returns table (
  left_card_id uuid,
  right_card_id uuid,
  day_of_week smallint,
  left_start_period smallint,
  right_start_period smallint,
  conflict_types text[]
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with target as (
    select *
    from public.management_m24_exact_partial_recovery_targets_internal(
      p_schedule_revision_id
    )
  )
  select
    left_target.card_id,
    right_target.card_id,
    left_target.day_of_week,
    left_target.start_period,
    right_target.start_period,
    array_remove(
      array[
        case
          when left_target.teacher_id is not null
           and left_target.teacher_id = right_target.teacher_id
            then 'TEACHER_CONFLICT'
        end,
        case
          when left_target.room_id is not null
           and left_target.room_id = right_target.room_id
            then 'ROOM_CONFLICT'
        end,
        case
          when public.management_instructional_groups_conflict(
                 left_target.instructional_group_id,
                 right_target.instructional_group_id
               )
            then 'GROUP_CONFLICT'
        end
      ]::text[],
      null
    ) as conflict_types
  from target left_target
  join target right_target
    on right_target.card_id > left_target.card_id
   and right_target.day_of_week = left_target.day_of_week
   and right_target.start_period
      <= left_target.start_period + left_target.duration_periods - 1
   and left_target.start_period
      <= right_target.start_period + right_target.duration_periods - 1
  where
    (
      left_target.teacher_id is not null
      and left_target.teacher_id = right_target.teacher_id
    )
    or (
      left_target.room_id is not null
      and left_target.room_id = right_target.room_id
    )
    or public.management_instructional_groups_conflict(
      left_target.instructional_group_id,
      right_target.instructional_group_id
    )
  order by
    left_target.day_of_week,
    left_target.start_period,
    left_target.card_id,
    right_target.card_id
$$;

revoke all
  on function public.management_m24_exact_partial_recovery_conflicts_internal(uuid)
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- TOKEN-BEARING PREVIEW
-- -------------------------------------------------------------------------

create or replace function public.management_preview_exact_partial_recovery_v2(
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
  if session_user <> 'postgres' then
    raise exception
      'M24.5 exact partial recovery preview is SQL-Editor/postgres only'
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
    and requirement_set.status = 'DRAFT'
  for update of revision;

  if not found then
    raise exception
      'M24.5 requires the active DRAFT revision';
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
      'M24.5 current triage no longer matches accepted baseline';
  end if;

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
  where card.schedule_revision_id =
    p_schedule_revision_id;

  select count(*)
  into v_placement_count
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id =
    p_schedule_revision_id;

  select count(*)
  into v_move_count
  from public.move_transactions transaction
  where transaction.schedule_revision_id =
    p_schedule_revision_id;

  select count(*)
  into v_recovery_run_count
  from public.management_historical_recovery_runs run
  where run.schedule_revision_id =
    p_schedule_revision_id;

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
      'engineVersion', 'M24.5-v1',
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
      'targets', v_targets,
      'conflicts', v_conflicts
    );

  v_plan_token := md5(v_plan_core::text);

  return jsonb_build_object(
    'revisionId', p_schedule_revision_id,
    'academicYear', v_revision.academic_year,
    'term', v_revision.term,
    'engineVersion', 'M24.5-v1',
    'previewOnly', true,
    'mutationPerformed', false,
    'applyEndpointPresent', false,
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
  on function public.management_preview_exact_partial_recovery_v2(uuid)
  from public, anon, authenticated;

comment on function public.management_preview_exact_partial_recovery_v2(uuid) is
  'M24.5 SQL-Editor/postgres-only exact-source partial recovery preview. Revalidates the 28 card-level exact historical targets found by M24.4, detects target-vs-target teacher/room/group conflicts, hashes the complete batch and persistent state, and creates no placement.';


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
  v_exact_targets integer;
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
      'M24.5 current term-1 DRAFT not found';
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

  select count(*)
  into v_triage_rows
  from public.management_remaining_recovery_triage_rows_internal(
    v_revision_id
  );

  select count(*)
  into v_exact_targets
  from public.management_m24_exact_partial_recovery_targets_internal(
    v_revision_id
  );

  if v_sessions <> 517
     or v_groups <> 609
     or v_cards <> 292
     or v_placements <> 228
     or v_moves <> 343
     or v_recovery_runs <> 1
     or v_triage_rows <> 64
     or v_exact_targets <> 28 then
    raise exception
      'M24.5 accepted-state invariant failed: sessions %, groups %, cards %, placements %, moves %, recovery runs %, triage rows %, exact targets %',
      v_sessions,
      v_groups,
      v_cards,
      v_placements,
      v_moves,
      v_recovery_runs,
      v_triage_rows,
      v_exact_targets;
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_preview_exact_partial_recovery_v2(uuid)',
    'EXECUTE'
  ) then
    raise exception
      'M24.5 exact partial recovery preview must remain SQL-Editor only';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_historical_recovery_v2(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M24.5 must not expose historical recovery apply to authenticated';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M24.5 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M24.5 must not unlock term template apply';
  end if;
end
$$;

commit;
