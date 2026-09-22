-- Management / M24.8
-- Same-Time Resource Selection Preview
--
-- Post-M24.7 decision-support for the 8 remaining cards that can preserve their
-- historical day/start period but require a different teacher/room combination.
--
-- This migration does NOT choose among multiple valid real resource options.
-- It:
--   * lists every current same-time VALID/complete option,
--   * assigns a stable semantic option key,
--   * distinguishes unique vs multi-option cards,
--   * detects conflicts among the uniquely determined subset,
--   * produces a refresh-stable selection token that excludes ephemeral
--     candidateAssessmentId UUIDs,
--   * creates no placement and exposes no apply endpoint.

begin;


-- -------------------------------------------------------------------------
-- SAME-TIME OPTION ROWS
-- -------------------------------------------------------------------------

create or replace function public.management_m24_same_time_resource_options_internal(
  p_schedule_revision_id uuid
)
returns table (
  card_id uuid,
  requirement_id uuid,
  instructional_group_id uuid,
  block_index smallint,
  duration_periods smallint,
  subject_name text,
  group_name text,
  source_day smallint,
  source_start_period smallint,
  source_teacher_id uuid,
  source_room_id uuid,
  candidate_assessment_id uuid,
  teacher_id uuid,
  room_id uuid,
  teacher_resolution_status text,
  room_resolution_status text,
  warning_codes text[],
  resource_certainty text,
  option_key text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    triage.card_id,
    triage.requirement_id,
    requirement.instructional_group_id,
    triage.block_index,
    triage.duration_periods,
    triage.subject_name,
    triage.group_name,
    triage.source_day,
    triage.source_start_period,
    triage.source_teacher_id,
    triage.source_room_id,
    assessment.id,
    assessment.teacher_id,
    assessment.room_id,
    assessment.teacher_resolution_status,
    assessment.room_resolution_status,
    assessment.warning_codes,
    case
      when assessment.teacher_resolution_status = 'RESOLVED'
       and assessment.room_resolution_status = 'RESOLVED'
       and cardinality(assessment.warning_codes) = 0
        then 'RESOLVED'
      else 'PROVISIONAL'
    end::text as resource_certainty,
    md5(
      jsonb_build_object(
        'cardId', triage.card_id,
        'dayOfWeek', triage.source_day,
        'startPeriod', triage.source_start_period,
        'teacherId', assessment.teacher_id,
        'roomId', assessment.room_id,
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
          )
      )::text
    ) as option_key
  from public.management_remaining_recovery_triage_rows_internal(
    p_schedule_revision_id
  ) triage
  join public.course_requirements requirement
    on requirement.id = triage.requirement_id
  join public.schedule_card_candidate_assessments assessment
    on assessment.card_id = triage.card_id
   and assessment.day_of_week = triage.source_day
   and assessment.start_period = triage.source_start_period
   and assessment.status = 'VALID'
   and assessment.is_complete
  where triage.triage_class =
    'SAME_TIME_RESOURCE_ALTERNATIVE'
  order by
    triage.requirement_id,
    triage.block_index,
    triage.card_id,
    case
      when assessment.teacher_resolution_status = 'RESOLVED'
       and assessment.room_resolution_status = 'RESOLVED'
       and cardinality(assessment.warning_codes) = 0
        then 0
      else 1
    end,
    assessment.teacher_id nulls last,
    assessment.room_id nulls last,
    assessment.id
$$;

revoke all
  on function public.management_m24_same_time_resource_options_internal(uuid)
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- UNIQUE SUBSET PAIRWISE CONFLICTS
-- -------------------------------------------------------------------------

create or replace function public.management_m24_unique_same_time_conflicts_internal(
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
  with option_stats as (
    select
      option.card_id,
      count(*)::integer as option_count
    from public.management_m24_same_time_resource_options_internal(
      p_schedule_revision_id
    ) option
    group by option.card_id
  ),
  unique_target as (
    select option.*
    from public.management_m24_same_time_resource_options_internal(
      p_schedule_revision_id
    ) option
    join option_stats stats
      on stats.card_id = option.card_id
     and stats.option_count = 1
  )
  select
    left_target.card_id,
    right_target.card_id,
    left_target.source_day,
    left_target.source_start_period,
    right_target.source_start_period,
    array_remove(
      array[
        case
          when left_target.teacher_id is not null
           and left_target.teacher_id =
               right_target.teacher_id
            then 'TEACHER_CONFLICT'
        end,
        case
          when left_target.room_id is not null
           and left_target.room_id =
               right_target.room_id
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
  from unique_target left_target
  join unique_target right_target
    on right_target.card_id > left_target.card_id
   and right_target.source_day = left_target.source_day
   and right_target.source_start_period
      <= left_target.source_start_period
         + left_target.duration_periods - 1
   and left_target.source_start_period
      <= right_target.source_start_period
         + right_target.duration_periods - 1
  where
    (
      left_target.teacher_id is not null
      and left_target.teacher_id =
          right_target.teacher_id
    )
    or (
      left_target.room_id is not null
      and left_target.room_id =
          right_target.room_id
    )
    or public.management_instructional_groups_conflict(
      left_target.instructional_group_id,
      right_target.instructional_group_id
    )
  order by
    left_target.source_day,
    left_target.source_start_period,
    left_target.card_id,
    right_target.card_id
$$;

revoke all
  on function public.management_m24_unique_same_time_conflicts_internal(uuid)
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- INTERNAL PREVIEW BUILDER
-- -------------------------------------------------------------------------

create or replace function public.management_m24_same_time_resource_selection_internal(
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
  v_options jsonb;
  v_token_options jsonb;
  v_cards jsonb;
  v_unique_targets jsonb;
  v_conflicts jsonb;
  v_summary jsonb;
  v_plan_core jsonb;
  v_plan_token text;

  v_card_count integer;
  v_placement_count integer;
  v_move_count integer;
  v_historical_run_count integer;
  v_partial_run_count integer;

  v_same_time_card_count integer;
  v_same_time_period_count integer;
  v_option_count integer;
  v_unique_card_count integer;
  v_multi_card_count integer;
  v_unique_resolved_count integer;
  v_unique_provisional_count integer;
  v_cards_with_resolved_option integer;
  v_cards_only_provisional integer;
  v_unique_conflict_count integer;
begin
  select
    revision.id,
    requirement_set.academic_year,
    requirement_set.term
  into v_revision
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id =
      revision.requirement_set_id
  where revision.id = p_schedule_revision_id
    and revision.status = 'DRAFT'
    and requirement_set.status = 'DRAFT'
  for update of revision;

  if not found then
    raise exception
      'M24.8 requires the active DRAFT revision';
  end if;

  perform public.refresh_management_candidate_domain(
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
  into v_historical_run_count
  from public.management_historical_recovery_runs run
  where run.schedule_revision_id =
    p_schedule_revision_id;

  select count(*)
  into v_partial_run_count
  from public.management_exact_partial_recovery_runs run
  where run.schedule_revision_id =
    p_schedule_revision_id;

  if v_card_count <> 292
     or v_placement_count <> 256
     or v_move_count <> 372
     or v_historical_run_count <> 1
     or v_partial_run_count <> 1 then
    raise exception
      'M24.8 current state does not match accepted post-M24.6 baseline: cards %, placements %, moves %, historical runs %, partial runs %',
      v_card_count,
      v_placement_count,
      v_move_count,
      v_historical_run_count,
      v_partial_run_count;
  end if;

  -- Returned option rows include the fresh derived candidate UUID.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', option.card_id,
        'requirementId', option.requirement_id,
        'blockIndex', option.block_index,
        'durationPeriods', option.duration_periods,
        'subjectName', option.subject_name,
        'groupName', option.group_name,
        'dayOfWeek', option.source_day,
        'startPeriod', option.source_start_period,
        'sourceTeacherId', option.source_teacher_id,
        'sourceRoomId', option.source_room_id,
        'candidateAssessmentId',
          option.candidate_assessment_id,
        'teacherId', option.teacher_id,
        'roomId', option.room_id,
        'teacherResolutionStatus',
          option.teacher_resolution_status,
        'roomResolutionStatus',
          option.room_resolution_status,
        'warningCodes',
          to_jsonb(
            coalesce(
              option.warning_codes,
              array[]::text[]
            )
          ),
        'resourceCertainty',
          option.resource_certainty,
        'optionKey', option.option_key
      )
      order by
        option.requirement_id,
        option.block_index,
        option.card_id,
        option.resource_certainty,
        option.teacher_id nulls last,
        option.room_id nulls last,
        option.option_key
    ),
    '[]'::jsonb
  )
  into v_options
  from public.management_m24_same_time_resource_options_internal(
    p_schedule_revision_id
  ) option;

  -- Stable token projection excludes only candidateAssessmentId.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', option.card_id,
        'requirementId', option.requirement_id,
        'blockIndex', option.block_index,
        'durationPeriods', option.duration_periods,
        'subjectName', option.subject_name,
        'groupName', option.group_name,
        'dayOfWeek', option.source_day,
        'startPeriod', option.source_start_period,
        'sourceTeacherId', option.source_teacher_id,
        'sourceRoomId', option.source_room_id,
        'teacherId', option.teacher_id,
        'roomId', option.room_id,
        'teacherResolutionStatus',
          option.teacher_resolution_status,
        'roomResolutionStatus',
          option.room_resolution_status,
        'warningCodes',
          to_jsonb(
            coalesce(
              option.warning_codes,
              array[]::text[]
            )
          ),
        'resourceCertainty',
          option.resource_certainty,
        'optionKey', option.option_key
      )
      order by
        option.requirement_id,
        option.block_index,
        option.card_id,
        option.resource_certainty,
        option.teacher_id nulls last,
        option.room_id nulls last,
        option.option_key
    ),
    '[]'::jsonb
  )
  into v_token_options
  from public.management_m24_same_time_resource_options_internal(
    p_schedule_revision_id
  ) option;

  with option_rows as (
    select *
    from public.management_m24_same_time_resource_options_internal(
      p_schedule_revision_id
    )
  ),
  stats as (
    select
      option.card_id,
      option.requirement_id,
      option.block_index,
      option.duration_periods,
      option.subject_name,
      option.group_name,
      option.source_day as day_of_week,
      option.source_start_period as start_period,
      count(*)::integer as option_count,
      count(*) filter (
        where option.resource_certainty = 'RESOLVED'
      )::integer as resolved_option_count,
      count(*) filter (
        where option.resource_certainty = 'PROVISIONAL'
      )::integer as provisional_option_count
    from option_rows option
    group by
      option.card_id,
      option.requirement_id,
      option.block_index,
      option.duration_periods,
      option.subject_name,
      option.group_name,
      option.source_day,
      option.source_start_period
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', stats.card_id,
        'requirementId', stats.requirement_id,
        'blockIndex', stats.block_index,
        'durationPeriods', stats.duration_periods,
        'subjectName', stats.subject_name,
        'groupName', stats.group_name,
        'dayOfWeek', stats.day_of_week,
        'startPeriod', stats.start_period,
        'optionCount', stats.option_count,
        'resolvedOptionCount',
          stats.resolved_option_count,
        'provisionalOptionCount',
          stats.provisional_option_count,
        'selectionClass',
          case
            when stats.option_count = 1
             and stats.resolved_option_count = 1
              then 'UNIQUE_RESOLVED'
            when stats.option_count = 1
              then 'UNIQUE_PROVISIONAL'
            when stats.resolved_option_count =
                 stats.option_count
              then 'MULTIPLE_ALL_RESOLVED'
            when stats.provisional_option_count =
                 stats.option_count
              then 'MULTIPLE_ALL_PROVISIONAL'
            else 'MULTIPLE_MIXED'
          end,
        'requiresHumanResourceSelection',
          stats.option_count > 1
      )
      order by
        stats.requirement_id,
        stats.block_index,
        stats.card_id
    ),
    '[]'::jsonb
  )
  into v_cards
  from stats;

  with option_rows as (
    select *
    from public.management_m24_same_time_resource_options_internal(
      p_schedule_revision_id
    )
  ),
  stats as (
    select
      option.card_id,
      count(*)::integer as option_count
    from option_rows option
    group by option.card_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', option.card_id,
        'requirementId', option.requirement_id,
        'blockIndex', option.block_index,
        'durationPeriods', option.duration_periods,
        'subjectName', option.subject_name,
        'groupName', option.group_name,
        'dayOfWeek', option.source_day,
        'startPeriod', option.source_start_period,
        'candidateAssessmentId',
          option.candidate_assessment_id,
        'teacherId', option.teacher_id,
        'roomId', option.room_id,
        'teacherResolutionStatus',
          option.teacher_resolution_status,
        'roomResolutionStatus',
          option.room_resolution_status,
        'warningCodes',
          to_jsonb(
            coalesce(
              option.warning_codes,
              array[]::text[]
            )
          ),
        'resourceCertainty',
          option.resource_certainty,
        'optionKey', option.option_key
      )
      order by
        option.requirement_id,
        option.block_index,
        option.card_id
    ),
    '[]'::jsonb
  )
  into v_unique_targets
  from option_rows option
  join stats
    on stats.card_id = option.card_id
   and stats.option_count = 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'leftCardId', conflict.left_card_id,
        'rightCardId', conflict.right_card_id,
        'dayOfWeek', conflict.day_of_week,
        'leftStartPeriod',
          conflict.left_start_period,
        'rightStartPeriod',
          conflict.right_start_period,
        'conflictTypes',
          to_jsonb(conflict.conflict_types)
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
  from public.management_m24_unique_same_time_conflicts_internal(
    p_schedule_revision_id
  ) conflict;

  with option_rows as (
    select *
    from public.management_m24_same_time_resource_options_internal(
      p_schedule_revision_id
    )
  ),
  stats as (
    select
      option.card_id,
      option.duration_periods::integer
        as duration_periods,
      count(*)::integer as option_count,
      count(*) filter (
        where option.resource_certainty = 'RESOLVED'
      )::integer as resolved_option_count,
      count(*) filter (
        where option.resource_certainty = 'PROVISIONAL'
      )::integer as provisional_option_count
    from option_rows option
    group by
      option.card_id,
      option.duration_periods
  )
  select
    count(*)::integer,
    coalesce(sum(stats.duration_periods), 0)::integer,
    coalesce(sum(stats.option_count), 0)::integer,
    count(*) filter (
      where stats.option_count = 1
    )::integer,
    count(*) filter (
      where stats.option_count > 1
    )::integer,
    count(*) filter (
      where stats.option_count = 1
        and stats.resolved_option_count = 1
    )::integer,
    count(*) filter (
      where stats.option_count = 1
        and stats.provisional_option_count = 1
    )::integer,
    count(*) filter (
      where stats.resolved_option_count > 0
    )::integer,
    count(*) filter (
      where stats.resolved_option_count = 0
        and stats.provisional_option_count > 0
    )::integer
  into
    v_same_time_card_count,
    v_same_time_period_count,
    v_option_count,
    v_unique_card_count,
    v_multi_card_count,
    v_unique_resolved_count,
    v_unique_provisional_count,
    v_cards_with_resolved_option,
    v_cards_only_provisional
  from stats;

  v_unique_conflict_count :=
    jsonb_array_length(v_conflicts);

  if v_same_time_card_count <> 8 then
    raise exception
      'M24.8 expected 8 same-time resource cards, found %',
      v_same_time_card_count;
  end if;

  v_summary :=
    jsonb_build_object(
      'sameTimeCardCount',
        v_same_time_card_count,
      'sameTimePeriodCount',
        v_same_time_period_count,
      'semanticOptionCount',
        v_option_count,
      'uniqueOptionCardCount',
        v_unique_card_count,
      'multiOptionCardCount',
        v_multi_card_count,
      'uniqueResolvedCardCount',
        v_unique_resolved_count,
      'uniqueProvisionalCardCount',
        v_unique_provisional_count,
      'cardsWithResolvedOption',
        v_cards_with_resolved_option,
      'cardsWithOnlyProvisionalOptions',
        v_cards_only_provisional,
      'uniqueSubsetConflictPairCount',
        v_unique_conflict_count,
      'canApplyUniqueSubset',
        v_unique_card_count > 0
        and v_unique_conflict_count = 0,
      'requiresHumanResourceSelectionCardCount',
        v_multi_card_count
    );

  v_plan_core :=
    jsonb_build_object(
      'revisionId', p_schedule_revision_id,
      'engineVersion', 'M24.8-v1',
      'persistentState',
        jsonb_build_object(
          'structureHash',
            public.management_m24_requirement_structure_hash(
              p_schedule_revision_id
            ),
          'cardGraphHash',
            public.management_m24_card_graph_hash(
              p_schedule_revision_id
            ),
          'placementHash',
            public.management_m24_placement_semantic_hash(
              p_schedule_revision_id
            ),
          'cardCount', v_card_count,
          'placementCount', v_placement_count,
          'moveTransactionCount', v_move_count,
          'historicalRecoveryRunCount',
            v_historical_run_count,
          'exactPartialRecoveryRunCount',
            v_partial_run_count
        ),
      'summary', v_summary,
      'cardSelectionState', v_cards,
      'semanticOptions', v_token_options,
      'uniqueSubsetConflicts', v_conflicts
    );

  v_plan_token := md5(v_plan_core::text);

  return jsonb_build_object(
    'revisionId', p_schedule_revision_id,
    'academicYear', v_revision.academic_year,
    'term', v_revision.term,
    'engineVersion', 'M24.8-v1',
    'previewOnly', true,
    'mutationPerformed', false,
    'applyEndpointPresent', false,
    'planToken', v_plan_token,
    'tokenSemantics',
      jsonb_build_object(
        'stableAcrossCandidateRefresh', true,
        'candidateAssessmentIdHashed', false,
        'candidateAssessmentIdReturnedFresh', true,
        'semanticOptionKeyHashed', true
      ),
    'persistentState',
      v_plan_core -> 'persistentState',
    'summary', v_summary,
    'cards', v_cards,
    'options', v_options,
    'uniqueSubsetTargets', v_unique_targets,
    'uniqueSubsetConflicts', v_conflicts,
    'publicBaseline',
      public.management_publication_baseline_status(
        v_revision.academic_year
      ),
    'publicationBlocking', false,
    'nextStep',
      case
        when v_unique_card_count > 0
         and v_unique_conflict_count = 0
          then 'M24_9_UNIQUE_SAME_TIME_PARTIAL_APPLY_DESIGN'
        when v_multi_card_count > 0
          then 'M24_9_HUMAN_RESOURCE_SELECTION'
        else 'M24_9_RELOCATION_DESIGN'
      end
  );
end
$$;

revoke all
  on function public.management_m24_same_time_resource_selection_internal(uuid)
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- SQL-EDITOR-ONLY PUBLIC PREVIEW
-- -------------------------------------------------------------------------

create or replace function public.management_preview_same_time_resource_selection_v2(
  p_schedule_revision_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if session_user <> 'postgres' then
    raise exception
      'M24.8 same-time resource selection preview is SQL-Editor/postgres only'
      using errcode = '42501';
  end if;

  return public.management_m24_same_time_resource_selection_internal(
    p_schedule_revision_id
  );
end
$$;

revoke all
  on function public.management_preview_same_time_resource_selection_v2(uuid)
  from public, anon, authenticated;

comment on function public.management_preview_same_time_resource_selection_v2(uuid) is
  'M24.8 SQL-Editor/postgres-only same-time resource-selection preview. Lists all current valid teacher/room options for the 8 cards that can preserve historical day/start, classifies unique versus human-selection cases, checks conflicts among the uniquely determined subset, hashes only stable semantic option fields, and creates no placement.';


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
      'M24.8 current term-1 DRAFT not found';
  end if;

  v_preview_1 :=
    public.management_m24_same_time_resource_selection_internal(
      v_revision_id
    );

  v_preview_2 :=
    public.management_m24_same_time_resource_selection_internal(
      v_revision_id
    );

  v_token_1 := v_preview_1 ->> 'planToken';
  v_token_2 := v_preview_2 ->> 'planToken';

  if v_token_1 is null
     or v_token_2 is null
     or v_token_1 is distinct from v_token_2 then
    raise exception
      'M24.8 token stability invariant failed: first %, second %',
      v_token_1,
      v_token_2;
  end if;

  if coalesce(
       (v_preview_2 #>> '{summary,sameTimeCardCount}')::integer,
       -1
     ) <> 8 then
    raise exception
      'M24.8 expected 8 same-time cards';
  end if;

  if coalesce(
       (v_preview_2 #>> '{summary,uniqueOptionCardCount}')::integer,
       0
     )
     + coalesce(
       (v_preview_2 #>> '{summary,multiOptionCardCount}')::integer,
       0
     ) <> 8 then
    raise exception
      'M24.8 unique/multi option partition mismatch';
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
  into v_historical_runs
  from public.management_historical_recovery_runs run
  where run.schedule_revision_id =
    v_revision_id;

  select count(*)
  into v_partial_runs
  from public.management_exact_partial_recovery_runs run
  where run.schedule_revision_id =
    v_revision_id;

  if v_sessions <> 517
     or v_groups <> 609
     or v_cards <> 292
     or v_placements <> 256
     or v_moves <> 372
     or v_historical_runs <> 1
     or v_partial_runs <> 1 then
    raise exception
      'M24.8 must preserve post-M24.6 state: sessions %, groups %, cards %, placements %, moves %, historical runs %, partial runs %',
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
    'public.management_preview_same_time_resource_selection_v2(uuid)',
    'EXECUTE'
  ) then
    raise exception
      'M24.8 same-time selection preview must remain SQL-Editor only';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_exact_partial_recovery_v2(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M24.8 must not expose exact partial recovery apply to authenticated';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M24.8 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M24.8 must not unlock term template apply';
  end if;
end
$$;

commit;
