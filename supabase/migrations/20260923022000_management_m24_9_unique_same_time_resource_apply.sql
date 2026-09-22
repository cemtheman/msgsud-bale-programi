-- Management / M24.9
-- Token-Controlled Unique Same-Time Resource Recovery Apply
--
-- Applies only the uniquely determined subset from M24.8:
--   * exactly 2 cards,
--   * both preserve historical day/start,
--   * each has exactly one current valid resource option,
--   * the two targets are pairwise conflict-free,
--   * both are provisional under current M22 resource semantics.
--
-- The six multi-option same-time cards remain untouched for human selection.

begin;


create table public.management_same_time_resource_recovery_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_revision_id uuid not null
    references public.schedule_revisions(id) on delete cascade,
  engine_version text not null,
  plan_token text not null,
  root_transaction_id uuid not null
    references public.move_transactions(id) on delete restrict,
  target_count integer not null,
  target_period_count integer not null,
  resolved_target_count integer not null,
  provisional_target_count integer not null,
  before_placement_count integer not null,
  after_placement_count integer not null,
  before_move_count integer not null,
  after_move_count integer not null,
  before_state jsonb not null,
  after_state jsonb not null,
  plan_snapshot jsonb not null,
  applied_by uuid null,
  applied_at timestamptz not null default now(),
  constraint management_same_time_resource_recovery_runs_plan_unique
    unique (schedule_revision_id, plan_token),
  constraint management_same_time_resource_recovery_runs_nonnegative
    check (
      target_count >= 0
      and target_period_count >= 0
      and resolved_target_count >= 0
      and provisional_target_count >= 0
      and before_placement_count >= 0
      and after_placement_count >= 0
      and before_move_count >= 0
      and after_move_count >= 0
    )
);

alter table public.management_same_time_resource_recovery_runs
  enable row level security;

revoke insert, update, delete
  on public.management_same_time_resource_recovery_runs
  from anon, authenticated;

grant select
  on public.management_same_time_resource_recovery_runs
  to authenticated;

create policy management_same_time_resource_recovery_runs_read
  on public.management_same_time_resource_recovery_runs
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));


create or replace function public.management_apply_unique_same_time_resource_recovery_v2(
  p_schedule_revision_id uuid,
  p_expected_plan_token text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision record;
  v_preview jsonb;
  v_targets jsonb;
  v_target jsonb;

  v_root_transaction_id uuid;
  v_child_transaction_id uuid;
  v_audit_id uuid;

  v_card_id uuid;
  v_requirement_id uuid;
  v_candidate_id uuid;
  v_day smallint;
  v_start smallint;
  v_duration smallint;
  v_teacher_id uuid;
  v_room_id uuid;
  v_option_key text;

  v_candidate record;
  v_placement record;

  v_target_count integer;
  v_target_period_count integer;
  v_resolved_target_count integer;
  v_provisional_target_count integer;

  v_before_structure_hash text;
  v_before_card_hash text;
  v_before_placement_hash text;
  v_before_card_count integer;
  v_before_placement_count integer;
  v_before_move_count integer;
  v_before_historical_run_count integer;
  v_before_exact_partial_run_count integer;
  v_before_same_time_run_count integer;

  v_after_structure_hash text;
  v_after_card_hash text;
  v_after_placement_hash text;
  v_after_card_count integer;
  v_after_placement_count integer;
  v_after_move_count integer;
  v_after_same_time_run_count integer;
  v_remaining_card_count integer;

  v_inserted_count integer := 0;
  v_inserted_period_count integer := 0;
  v_inserted_resolved_count integer := 0;
  v_inserted_provisional_count integer := 0;

  v_public_session_count integer;
  v_public_group_count integer;
begin
  if session_user <> 'postgres' then
    raise exception
      'M24.9 unique same-time resource recovery apply is SQL-Editor/postgres only'
      using errcode = '42501';
  end if;

  if p_expected_plan_token is null
     or length(btrim(p_expected_plan_token)) = 0 then
    raise exception
      'M24.9 apply requires an exact M24.8 plan token';
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
  where revision.id = p_schedule_revision_id
  for update of revision;

  if not found then
    raise exception
      'M24.9 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision.revision_status <> 'DRAFT'
     or v_revision.requirement_set_status <> 'DRAFT' then
    raise exception
      'M24.9 requires a DRAFT revision on a DRAFT requirement set';
  end if;

  if exists (
    select 1
    from public.management_same_time_resource_recovery_runs run
    where run.schedule_revision_id = p_schedule_revision_id
      and run.plan_token = p_expected_plan_token
  ) then
    raise exception
      'M24.9 plan token was already applied';
  end if;

  v_preview :=
    public.management_m24_same_time_resource_selection_internal(
      p_schedule_revision_id
    );

  if v_preview ->> 'planToken'
       is distinct from p_expected_plan_token then
    raise exception
      'M24.9 same-time resource preview is stale: expected %, current %',
      p_expected_plan_token,
      v_preview ->> 'planToken';
  end if;

  if not coalesce(
       (v_preview #>> '{summary,canApplyUniqueSubset}')::boolean,
       false
     )
     or coalesce(
       (v_preview #>> '{summary,uniqueSubsetConflictPairCount}')::integer,
       -1
     ) <> 0 then
    raise exception
      'M24.9 unique same-time subset is no longer conflict-free';
  end if;

  v_targets := coalesce(
    v_preview -> 'uniqueSubsetTargets',
    '[]'::jsonb
  );

  v_target_count := jsonb_array_length(v_targets);

  select
    coalesce(
      sum((target.value ->> 'durationPeriods')::integer),
      0
    )::integer,
    count(*) filter (
      where target.value ->> 'resourceCertainty' = 'RESOLVED'
    )::integer,
    count(*) filter (
      where target.value ->> 'resourceCertainty' = 'PROVISIONAL'
    )::integer
  into
    v_target_period_count,
    v_resolved_target_count,
    v_provisional_target_count
  from jsonb_array_elements(v_targets) target(value);

  if v_target_count <> 2
     or v_target_period_count <> 4
     or v_resolved_target_count <> 0
     or v_provisional_target_count <> 2 then
    raise exception
      'M24.9 unique subset cardinality/certainty drift: targets %, periods %, resolved %, provisional %',
      v_target_count,
      v_target_period_count,
      v_resolved_target_count,
      v_provisional_target_count;
  end if;

  v_before_structure_hash :=
    public.management_m24_requirement_structure_hash(
      p_schedule_revision_id
    );

  v_before_card_hash :=
    public.management_m24_card_graph_hash(
      p_schedule_revision_id
    );

  v_before_placement_hash :=
    public.management_m24_placement_semantic_hash(
      p_schedule_revision_id
    );

  select count(*)
  into v_before_card_count
  from public.schedule_cards card
  where card.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_before_placement_count
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_before_move_count
  from public.move_transactions transaction
  where transaction.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_before_historical_run_count
  from public.management_historical_recovery_runs run
  where run.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_before_exact_partial_run_count
  from public.management_exact_partial_recovery_runs run
  where run.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_before_same_time_run_count
  from public.management_same_time_resource_recovery_runs run
  where run.schedule_revision_id = p_schedule_revision_id;

  if v_before_card_count <> 292
     or v_before_placement_count <> 256
     or v_before_move_count <> 372
     or v_before_historical_run_count <> 1
     or v_before_exact_partial_run_count <> 1
     or v_before_same_time_run_count <> 0 then
    raise exception
      'M24.9 current state no longer matches accepted M24.8 baseline: cards %, placements %, moves %, historical runs %, exact partial runs %, same-time runs %',
      v_before_card_count,
      v_before_placement_count,
      v_before_move_count,
      v_before_historical_run_count,
      v_before_exact_partial_run_count,
      v_before_same_time_run_count;
  end if;

  if v_before_structure_hash is distinct from
       (v_preview #>> '{persistentState,structureHash}')
     or v_before_card_hash is distinct from
       (v_preview #>> '{persistentState,cardGraphHash}')
     or v_before_placement_hash is distinct from
       (v_preview #>> '{persistentState,placementHash}') then
    raise exception
      'M24.9 preview persistent-state hashes no longer match';
  end if;

  drop table if exists pg_temp.m249_existing_placement_guard;

  create temporary table m249_existing_placement_guard
  on commit drop
  as
  select
    placement.id,
    placement.card_id,
    placement.day_of_week,
    placement.start_period,
    placement.teacher_id,
    placement.room_id,
    placement.move_transaction_id,
    placement.teacher_resolution_status,
    placement.room_resolution_status,
    placement.resource_warning_codes,
    placement.created_at,
    placement.updated_at
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = p_schedule_revision_id;

  insert into public.move_transactions (
    schedule_revision_id,
    root_transaction_id,
    parent_transaction_id,
    actor_type,
    action,
    payload
  )
  values (
    p_schedule_revision_id,
    null,
    null,
    'USER',
    'STRUCTURE',
    jsonb_build_object(
      'source', 'STRUCTURE_APPLY',
      'engine_version', 'M24.9-v1',
      'structure_kind',
        'HISTORICAL_UNIQUE_SAME_TIME_RESOURCE_RECOVERY_V2',
      'card_graph_changed', false,
      'revertible', false,
      'plan_token', p_expected_plan_token,
      'target_count', v_target_count,
      'target_period_count', v_target_period_count,
      'resolved_target_count', v_resolved_target_count,
      'provisional_target_count', v_provisional_target_count,
      'before_structure_hash', v_before_structure_hash,
      'before_card_graph_hash', v_before_card_hash,
      'before_placement_hash', v_before_placement_hash
    )
  )
  returning id into v_root_transaction_id;

  for v_target in
    select target.value
    from jsonb_array_elements(v_targets) target(value)
    order by
      target.value ->> 'requirementId',
      (target.value ->> 'blockIndex')::integer,
      target.value ->> 'cardId'
  loop
    v_card_id := (v_target ->> 'cardId')::uuid;
    v_requirement_id := (v_target ->> 'requirementId')::uuid;
    v_candidate_id := (v_target ->> 'candidateAssessmentId')::uuid;
    v_day := (v_target ->> 'dayOfWeek')::smallint;
    v_start := (v_target ->> 'startPeriod')::smallint;
    v_duration := (v_target ->> 'durationPeriods')::smallint;
    v_teacher_id := nullif(v_target ->> 'teacherId', '')::uuid;
    v_room_id := nullif(v_target ->> 'roomId', '')::uuid;
    v_option_key := v_target ->> 'optionKey';

    if not exists (
      select 1
      from public.schedule_cards card
      where card.id = v_card_id
        and card.schedule_revision_id = p_schedule_revision_id
        and card.requirement_id = v_requirement_id
        and card.block_index =
          (v_target ->> 'blockIndex')::smallint
        and card.duration_periods = v_duration
        and not card.locked
    ) then
      raise exception
        'M24.9 target card identity drift: %',
        v_card_id;
    end if;

    if exists (
      select 1
      from public.placements placement
      where placement.card_id = v_card_id
    ) then
      raise exception
        'M24.9 target card became placed: %',
        v_card_id;
    end if;

    select
      assessment.id,
      assessment.status,
      assessment.is_complete,
      assessment.day_of_week,
      assessment.start_period,
      assessment.teacher_id,
      assessment.room_id,
      assessment.teacher_resolution_status,
      assessment.room_resolution_status,
      assessment.warning_codes
    into v_candidate
    from public.schedule_card_candidate_assessments assessment
    where assessment.id = v_candidate_id
      and assessment.card_id = v_card_id;

    if not found
       or v_candidate.status <> 'VALID'
       or not coalesce(v_candidate.is_complete, false)
       or v_candidate.day_of_week <> v_day
       or v_candidate.start_period <> v_start
       or v_candidate.teacher_id is distinct from v_teacher_id
       or v_candidate.room_id is distinct from v_room_id
       or v_candidate.teacher_resolution_status is distinct from
            (v_target ->> 'teacherResolutionStatus')
       or v_candidate.room_resolution_status is distinct from
            (v_target ->> 'roomResolutionStatus')
       or to_jsonb(
            coalesce(
              v_candidate.warning_codes,
              array[]::text[]
            )
          ) is distinct from
          coalesce(v_target -> 'warningCodes', '[]'::jsonb) then
      raise exception
        'M24.9 candidate drift for target card %',
        v_card_id;
    end if;

    if md5(
      jsonb_build_object(
        'cardId', v_card_id,
        'dayOfWeek', v_day,
        'startPeriod', v_start,
        'teacherId', v_teacher_id,
        'roomId', v_room_id,
        'teacherResolutionStatus',
          v_candidate.teacher_resolution_status,
        'roomResolutionStatus',
          v_candidate.room_resolution_status,
        'warningCodes',
          to_jsonb(
            coalesce(
              v_candidate.warning_codes,
              array[]::text[]
            )
          )
      )::text
    ) is distinct from v_option_key then
      raise exception
        'M24.9 semantic option key drift for target card %',
        v_card_id;
    end if;

    insert into public.move_transactions (
      schedule_revision_id,
      root_transaction_id,
      parent_transaction_id,
      actor_type,
      action,
      payload
    )
    values (
      p_schedule_revision_id,
      v_root_transaction_id,
      v_root_transaction_id,
      'AUTO',
      'PLACE',
      jsonb_build_object(
        'source',
          'HISTORICAL_UNIQUE_SAME_TIME_RESOURCE_RECOVERY_V2',
        'engine_version',
          'M24.9-v1',
        'plan_token',
          p_expected_plan_token,
        'option_key',
          v_option_key,
        'candidate_assessment_id',
          v_candidate_id,
        'card_id',
          v_card_id,
        'logical_card',
          jsonb_build_object(
            'requirement_id', v_requirement_id,
            'block_index',
              (v_target ->> 'blockIndex')::integer
          ),
        'before', null,
        'after',
          jsonb_build_object(
            'day_of_week', v_day,
            'start_period', v_start,
            'teacher_id', v_teacher_id,
            'room_id', v_room_id
          ),
        'resource_certainty',
          jsonb_build_object(
            'teacher',
              v_candidate.teacher_resolution_status,
            'room',
              v_candidate.room_resolution_status,
            'warnings',
              to_jsonb(
                coalesce(
                  v_candidate.warning_codes,
                  array[]::text[]
                )
              )
          )
      )
    )
    returning id into v_child_transaction_id;

    insert into public.placements (
      card_id,
      day_of_week,
      start_period,
      teacher_id,
      room_id,
      move_transaction_id
    )
    values (
      v_card_id,
      v_day,
      v_start,
      v_teacher_id,
      v_room_id,
      v_child_transaction_id
    )
    returning
      teacher_resolution_status,
      room_resolution_status,
      resource_warning_codes
    into v_placement;

    if v_placement.teacher_resolution_status is distinct from
         v_candidate.teacher_resolution_status
       or v_placement.room_resolution_status is distinct from
         v_candidate.room_resolution_status
       or v_placement.resource_warning_codes is distinct from
         coalesce(v_candidate.warning_codes, array[]::text[]) then
      raise exception
        'M24.9 placement certainty drift for card %',
        v_card_id;
    end if;

    v_inserted_count := v_inserted_count + 1;
    v_inserted_period_count :=
      v_inserted_period_count + v_duration;

    if v_target ->> 'resourceCertainty' = 'RESOLVED' then
      v_inserted_resolved_count :=
        v_inserted_resolved_count + 1;
    else
      v_inserted_provisional_count :=
        v_inserted_provisional_count + 1;
    end if;
  end loop;

  if v_inserted_count <> 2
     or v_inserted_period_count <> 4
     or v_inserted_resolved_count <> 0
     or v_inserted_provisional_count <> 2 then
    raise exception
      'M24.9 inserted batch mismatch: cards %, periods %, resolved %, provisional %',
      v_inserted_count,
      v_inserted_period_count,
      v_inserted_resolved_count,
      v_inserted_provisional_count;
  end if;

  if exists (
    select 1
    from pg_temp.m249_existing_placement_guard before_row
    left join public.placements placement
      on placement.id = before_row.id
    where placement.id is null
       or placement.card_id is distinct from before_row.card_id
       or placement.day_of_week is distinct from before_row.day_of_week
       or placement.start_period is distinct from before_row.start_period
       or placement.teacher_id is distinct from before_row.teacher_id
       or placement.room_id is distinct from before_row.room_id
       or placement.move_transaction_id is distinct from
            before_row.move_transaction_id
       or placement.teacher_resolution_status is distinct from
            before_row.teacher_resolution_status
       or placement.room_resolution_status is distinct from
            before_row.room_resolution_status
       or placement.resource_warning_codes is distinct from
            before_row.resource_warning_codes
       or placement.created_at is distinct from before_row.created_at
       or placement.updated_at is distinct from before_row.updated_at
  ) then
    raise exception
      'M24.9 existing placement guard failed';
  end if;

  perform public.refresh_management_candidate_domain(
    p_schedule_revision_id
  );

  v_after_structure_hash :=
    public.management_m24_requirement_structure_hash(
      p_schedule_revision_id
    );

  v_after_card_hash :=
    public.management_m24_card_graph_hash(
      p_schedule_revision_id
    );

  v_after_placement_hash :=
    public.management_m24_placement_semantic_hash(
      p_schedule_revision_id
    );

  select count(*)
  into v_after_card_count
  from public.schedule_cards card
  where card.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_after_placement_count
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_after_move_count
  from public.move_transactions transaction
  where transaction.schedule_revision_id = p_schedule_revision_id;

  select count(*)
  into v_after_same_time_run_count
  from public.management_same_time_resource_recovery_runs run
  where run.schedule_revision_id = p_schedule_revision_id;

  v_remaining_card_count :=
    v_after_card_count - v_after_placement_count;

  if v_after_structure_hash is distinct from
       v_before_structure_hash
     or v_after_card_hash is distinct from
       v_before_card_hash then
    raise exception
      'M24.9 unexpectedly changed requirement/card structure';
  end if;

  if v_after_card_count <> 292
     or v_after_placement_count <> 258
     or v_after_move_count <> 375
     or v_after_same_time_run_count <> 0
     or v_remaining_card_count <> 34 then
    raise exception
      'M24.9 post-apply state mismatch: cards %, placements %, moves %, pre-audit same-time runs %, remaining %',
      v_after_card_count,
      v_after_placement_count,
      v_after_move_count,
      v_after_same_time_run_count,
      v_remaining_card_count;
  end if;

  select count(*)
  into v_public_session_count
  from public.schedule_sessions
  where academic_year = v_revision.academic_year;

  select count(*)
  into v_public_group_count
  from public.session_groups session_group
  join public.schedule_sessions session
    on session.id = session_group.session_id
  where session.academic_year = v_revision.academic_year;

  if v_public_session_count <> 517
     or v_public_group_count <> 609 then
    raise exception
      'M24.9 modified public projection: sessions %, groups %',
      v_public_session_count,
      v_public_group_count;
  end if;

  if not coalesce(
    (
      public.management_publication_baseline_status(
        v_revision.academic_year
      )
      ->> 'healthy'
    )::boolean,
    false
  ) then
    raise exception
      'M24.9 public baseline drift detected';
  end if;

  insert into public.management_same_time_resource_recovery_runs (
    schedule_revision_id,
    engine_version,
    plan_token,
    root_transaction_id,
    target_count,
    target_period_count,
    resolved_target_count,
    provisional_target_count,
    before_placement_count,
    after_placement_count,
    before_move_count,
    after_move_count,
    before_state,
    after_state,
    plan_snapshot,
    applied_by
  )
  values (
    p_schedule_revision_id,
    'M24.9-v1',
    p_expected_plan_token,
    v_root_transaction_id,
    v_target_count,
    v_target_period_count,
    v_resolved_target_count,
    v_provisional_target_count,
    v_before_placement_count,
    v_after_placement_count,
    v_before_move_count,
    v_after_move_count,
    jsonb_build_object(
      'structureHash', v_before_structure_hash,
      'cardGraphHash', v_before_card_hash,
      'placementHash', v_before_placement_hash,
      'cardCount', v_before_card_count,
      'placementCount', v_before_placement_count,
      'moveTransactionCount', v_before_move_count
    ),
    jsonb_build_object(
      'structureHash', v_after_structure_hash,
      'cardGraphHash', v_after_card_hash,
      'placementHash', v_after_placement_hash,
      'cardCount', v_after_card_count,
      'placementCount', v_after_placement_count,
      'moveTransactionCount', v_after_move_count,
      'remainingCardCount', v_remaining_card_count,
      'publicBaselineHealthy', true
    ),
    jsonb_build_object(
      'planToken', p_expected_plan_token,
      'summary', v_preview -> 'summary',
      'uniqueSubsetTargets', v_targets,
      'uniqueSubsetConflicts',
        v_preview -> 'uniqueSubsetConflicts'
    ),
    auth.uid()
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'applied', true,
    'engineVersion', 'M24.9-v1',
    'auditId', v_audit_id,
    'revisionId', p_schedule_revision_id,
    'planToken', p_expected_plan_token,
    'historyBarrierTransactionId',
      v_root_transaction_id,
    'recoveredPlacementCount',
      v_inserted_count,
    'recoveredPeriodCount',
      v_inserted_period_count,
    'resourceCertainty',
      jsonb_build_object(
        'resolvedRecoveryCards',
          v_inserted_resolved_count,
        'provisionalRecoveryCards',
          v_inserted_provisional_count
      ),
    'cardCountAfter', v_after_card_count,
    'placementCountBefore', v_before_placement_count,
    'placementCountAfter', v_after_placement_count,
    'moveTransactionCountBefore', v_before_move_count,
    'moveTransactionCountAfter', v_after_move_count,
    'remainingUnplacedCards', v_remaining_card_count,
    'cardGraphChanged', false,
    'publicProjectionChanged', false,
    'publicationBlockingChanged', false,
    'remainingMultiOptionSameTimeCards',
      coalesce(
        (v_preview #>> '{summary,multiOptionCardCount}')::integer,
        0
      ),
    'nextStep',
      'M24_10_HUMAN_RESOURCE_SELECTION_AND_RELOCATION_DESIGN'
  );
end
$$;

revoke all
  on function public.management_apply_unique_same_time_resource_recovery_v2(
    uuid,
    text
  )
  from public, anon, authenticated;

comment on function public.management_apply_unique_same_time_resource_recovery_v2(
  uuid,
  text
) is
  'M24.9 SQL-Editor/postgres-only atomic apply for the uniquely determined conflict-free same-time resource subset from M24.8. It places only the two single-option provisional cards, preserves all existing placements and the card graph, leaves six multi-option same-time cards untouched for human resource selection, and does not change the public projection.';


do $$
declare
  v_revision_id uuid;
  v_sessions integer;
  v_groups integer;
  v_cards integer;
  v_placements integer;
  v_moves integer;
  v_historical_runs integer;
  v_exact_partial_runs integer;
  v_same_time_runs integer;
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
      'M24.9 current term-1 DRAFT not found';
  end if;

  perform public.refresh_management_candidate_domain(
    v_revision_id
  );

  select count(*) into v_sessions
  from public.schedule_sessions
  where academic_year = '2026-2027';

  select count(*) into v_groups
  from public.session_groups session_group
  join public.schedule_sessions session
    on session.id = session_group.session_id
  where session.academic_year = '2026-2027';

  select count(*) into v_cards
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id;

  select count(*) into v_placements
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = v_revision_id;

  select count(*) into v_moves
  from public.move_transactions transaction
  where transaction.schedule_revision_id = v_revision_id;

  select count(*) into v_historical_runs
  from public.management_historical_recovery_runs run
  where run.schedule_revision_id = v_revision_id;

  select count(*) into v_exact_partial_runs
  from public.management_exact_partial_recovery_runs run
  where run.schedule_revision_id = v_revision_id;

  select count(*) into v_same_time_runs
  from public.management_same_time_resource_recovery_runs run
  where run.schedule_revision_id = v_revision_id;

  if v_sessions <> 517
     or v_groups <> 609
     or v_cards <> 292
     or v_placements <> 256
     or v_moves <> 372
     or v_historical_runs <> 1
     or v_exact_partial_runs <> 1
     or v_same_time_runs <> 0 then
    raise exception
      'M24.9 installation must not apply unique same-time recovery: sessions %, groups %, cards %, placements %, moves %, historical runs %, exact partial runs %, same-time runs %',
      v_sessions,
      v_groups,
      v_cards,
      v_placements,
      v_moves,
      v_historical_runs,
      v_exact_partial_runs,
      v_same_time_runs;
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_unique_same_time_resource_recovery_v2(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M24.9 unique same-time apply must remain SQL-Editor only';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M24.9 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M24.9 must not unlock term template apply';
  end if;
end
$$;

commit;
