-- Management / M24.3
-- Token-Controlled Atomic Historical Recovery Apply
--
-- Applies exactly one previously previewed M24.2 plan.
--
-- Safety contract:
--   * SQL-Editor/postgres only
--   * exact plan token required
--   * revision serialized FOR UPDATE
--   * 37 historical partition alignments are applied first
--   * post-alignment live logical recovery targets must exactly match preview
--   * only those exact recovery targets are placed
--   * generic forced propagation is NOT invoked
--   * pre-existing placements are guarded against any mutation
--   * recovery is recorded behind one permanent STRUCTURE history epoch
--   * public projection is not mutated
--   * publication/template apply remain locked

begin;


-- -------------------------------------------------------------------------
-- AUDIT TABLE
-- -------------------------------------------------------------------------

create table public.management_historical_recovery_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_revision_id uuid not null
    references public.schedule_revisions(id) on delete cascade,
  engine_version text not null,
  plan_token text not null,
  root_transaction_id uuid not null
    references public.move_transactions(id) on delete restrict,
  alignment_target_count integer not null,
  placement_target_count integer not null,
  created_card_count integer not null,
  removed_card_count integer not null,
  before_card_count integer not null,
  after_card_count integer not null,
  before_placement_count integer not null,
  after_placement_count integer not null,
  recovered_period_count integer not null,
  resolved_recovery_card_count integer not null,
  provisional_recovery_card_count integer not null,
  teacher_provisional_card_count integer not null,
  room_provisional_card_count integer not null,
  before_state jsonb not null,
  after_state jsonb not null,
  plan_snapshot jsonb not null,
  applied_by uuid null,
  applied_at timestamptz not null default now(),
  constraint management_historical_recovery_runs_plan_unique
    unique (schedule_revision_id, plan_token),
  constraint management_historical_recovery_runs_nonnegative
    check (
      alignment_target_count >= 0
      and placement_target_count >= 0
      and created_card_count >= 0
      and removed_card_count >= 0
      and before_card_count >= 0
      and after_card_count >= 0
      and before_placement_count >= 0
      and after_placement_count >= 0
      and recovered_period_count >= 0
      and resolved_recovery_card_count >= 0
      and provisional_recovery_card_count >= 0
      and teacher_provisional_card_count >= 0
      and room_provisional_card_count >= 0
    )
);

alter table public.management_historical_recovery_runs
  enable row level security;

revoke insert, update, delete
  on public.management_historical_recovery_runs
  from anon, authenticated;

grant select
  on public.management_historical_recovery_runs
  to authenticated;

create policy management_historical_recovery_runs_read
  on public.management_historical_recovery_runs
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));


-- -------------------------------------------------------------------------
-- LIVE LOGICAL RECOVERY TARGET PROJECTION
-- -------------------------------------------------------------------------
-- Card UUIDs are intentionally not part of this projection. Structural apply
-- recreates mismatch cards, so stable identity is requirement_id + block_index.

create or replace function public.management_m24_logical_recovery_targets(
  p_schedule_revision_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_diagnostic jsonb;
  v_targets jsonb;
begin
  if session_user <> 'postgres' then
    raise exception
      'M24.3 logical recovery target projection is SQL-Editor/postgres only'
      using errcode = '42501';
  end if;

  v_diagnostic :=
    public.management_diagnose_historical_recovery_v2(
      p_schedule_revision_id
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requirementId',
          proposal.value ->> 'requirementId',
        'blockIndex',
          (proposal.value ->> 'blockIndex')::integer,
        'durationPeriods',
          (proposal.value ->> 'durationPeriods')::integer,
        'dayOfWeek',
          (proposal.value ->> 'dayOfWeek')::integer,
        'startPeriod',
          (proposal.value ->> 'startPeriod')::integer,
        'teacherId',
          proposal.value -> 'teacherId',
        'roomId',
          proposal.value -> 'roomId',
        'teacherResolutionStatus',
          proposal.value ->> 'teacherResolutionStatus',
        'roomResolutionStatus',
          proposal.value ->> 'roomResolutionStatus',
        'warningCodes',
          coalesce(
            proposal.value -> 'warningCodes',
            '[]'::jsonb
          ),
        'resourceCertainty',
          proposal.value ->> 'resourceCertainty',
        'sourceSessionIds',
          coalesce(
            proposal.value -> 'sourceSessionIds',
            '[]'::jsonb
          )
      )
      order by
        proposal.value ->> 'requirementId',
        (proposal.value ->> 'blockIndex')::integer
    ),
    '[]'::jsonb
  )
  into v_targets
  from jsonb_array_elements(
    coalesce(
      v_diagnostic -> 'recoverableProposals',
      '[]'::jsonb
    )
  ) proposal(value);

  return v_targets;
end
$$;

revoke all
  on function public.management_m24_logical_recovery_targets(uuid)
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- TOKEN-CONTROLLED ATOMIC APPLY
-- -------------------------------------------------------------------------

create or replace function public.management_apply_historical_recovery_v2(
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
  v_alignment_targets jsonb;
  v_preview_targets jsonb;
  v_live_targets jsonb;
  v_before_summary jsonb;
  v_after_summary jsonb;
  v_after_diagnostic jsonb;

  v_item jsonb;
  v_target jsonb;

  v_requirement_id uuid;
  v_source_partition smallint[];
  v_weekly_load smallint;
  v_term_status text;
  v_allowed_partitions jsonb;

  v_card_id uuid;
  v_duration smallint;
  v_day smallint;
  v_start smallint;
  v_teacher_id uuid;
  v_room_id uuid;
  v_candidate_id uuid;
  v_candidate_status text;
  v_candidate_complete boolean;
  v_candidate_teacher_resolution text;
  v_candidate_room_resolution text;
  v_candidate_warnings text[];

  v_root_transaction_id uuid;
  v_child_transaction_id uuid;
  v_audit_id uuid;

  v_alignment_count integer;
  v_placement_target_count integer;
  v_removed_card_count integer := 0;
  v_removed_this integer := 0;
  v_created_card_count integer := 0;
  v_inserted_placement_count integer := 0;
  v_recovered_period_count integer := 0;

  v_resolved_recovery_card_count integer := 0;
  v_provisional_recovery_card_count integer := 0;
  v_teacher_provisional_card_count integer := 0;
  v_room_provisional_card_count integer := 0;

  v_before_structure_hash text;
  v_before_card_hash text;
  v_before_placement_hash text;
  v_before_card_count integer;
  v_before_placement_count integer;
  v_before_move_count integer;
  v_before_reconciliation_count integer;

  v_after_card_count integer;
  v_after_placement_count integer;
  v_after_move_count integer;
  v_after_reconciliation_count integer;

  v_public_session_count integer;
  v_public_group_count integer;
begin
  if session_user <> 'postgres' then
    raise exception
      'M24.3 historical recovery apply is SQL-Editor/postgres only'
      using errcode = '42501';
  end if;

  if p_expected_plan_token is null
     or length(btrim(p_expected_plan_token)) = 0 then
    raise exception
      'M24.3 apply requires an exact M24.2 plan token';
  end if;

  -- Serialize with every current scheduling write path.
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
    on requirement_set.id =
      revision.requirement_set_id
  where revision.id = p_schedule_revision_id
  for update of revision;

  if not found then
    raise exception
      'M24.3 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision.revision_status <> 'DRAFT'
     or v_revision.requirement_set_status <> 'DRAFT' then
    raise exception
      'M24.3 requires a DRAFT revision on a DRAFT requirement set';
  end if;

  if exists (
    select 1
    from public.management_historical_recovery_runs run
    where run.schedule_revision_id =
        p_schedule_revision_id
      and run.plan_token =
        p_expected_plan_token
  ) then
    raise exception
      'M24.3 plan token was already applied';
  end if;

  -- The preview self-rolls back. Calling it after taking the revision lock
  -- guarantees that the token is checked against the serialized current state.
  v_preview :=
    public.management_preview_historical_recovery_apply_v2(
      p_schedule_revision_id
    );

  if not coalesce(
    (v_preview ->> 'rollbackVerified')::boolean,
    false
  ) then
    raise exception
      'M24.3 preview rollback was not verified';
  end if;

  if not coalesce(
    (v_preview ->> 'canDesignApply')::boolean,
    false
  ) then
    raise exception
      'M24.3 current recovery preview is not applyable';
  end if;

  if v_preview ->> 'planToken'
       is distinct from p_expected_plan_token then
    raise exception
      'M24.3 recovery preview is stale: expected %, current %',
      p_expected_plan_token,
      v_preview ->> 'planToken';
  end if;

  v_alignment_targets :=
    coalesce(
      v_preview -> 'alignmentTargets',
      '[]'::jsonb
    );

  v_preview_targets :=
    coalesce(
      v_preview -> 'placementTargets',
      '[]'::jsonb
    );

  v_alignment_count :=
    jsonb_array_length(v_alignment_targets);

  v_placement_target_count :=
    jsonb_array_length(v_preview_targets);

  if v_alignment_count <> 37 then
    raise exception
      'M24.3 expected 37 alignment targets, found %',
      v_alignment_count;
  end if;

  if v_placement_target_count <> 200 then
    raise exception
      'M24.3 expected 200 placement targets, found %',
      v_placement_target_count;
  end if;

  v_before_summary :=
    coalesce(
      v_preview -> 'before',
      '{}'::jsonb
    );

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
  where card.schedule_revision_id =
    p_schedule_revision_id;

  select count(*)
  into v_before_placement_count
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id =
    p_schedule_revision_id;

  select count(*)
  into v_before_move_count
  from public.move_transactions transaction
  where transaction.schedule_revision_id =
    p_schedule_revision_id;

  select count(*)
  into v_before_reconciliation_count
  from public.management_resource_reconciliations reconciliation
  where reconciliation.schedule_revision_id =
    p_schedule_revision_id;

  if v_before_card_count <> 295
     or v_before_placement_count <> 28
     or v_before_move_count <> 142
     or v_before_reconciliation_count <> 0 then
    raise exception
      'M24.3 current state no longer matches accepted preview baseline: cards %, placements %, moves %, reconciliations %',
      v_before_card_count,
      v_before_placement_count,
      v_before_move_count,
      v_before_reconciliation_count;
  end if;

  if v_before_structure_hash is distinct from
       (v_preview #>> '{persistentStateAfterReturn,structureHash}')
     or v_before_card_hash is distinct from
       (v_preview #>> '{persistentStateAfterReturn,cardGraphHash}')
     or v_before_placement_hash is distinct from
       (v_preview #>> '{persistentStateAfterReturn,placementHash}') then
    raise exception
      'M24.3 preview baseline hashes no longer match persistent state';
  end if;

  -- Guard the exact pre-existing placement rows. The 37 alignment targets were
  -- previewed as having no placements, so all 28 current placements must survive
  -- byte-for-byte semantically.
  drop table if exists pg_temp.m243_existing_placement_guard;

  create temporary table m243_existing_placement_guard
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
  where card.schedule_revision_id =
    p_schedule_revision_id;

  -- -----------------------------------------------------------------------
  -- APPLY EXACT ALIGNMENTS
  -- -----------------------------------------------------------------------

  for v_item in
    select target.value
    from jsonb_array_elements(
      v_alignment_targets
    ) target(value)
    order by
      target.value ->> 'subjectName',
      target.value ->> 'groupName',
      target.value ->> 'requirementId'
  loop
    v_requirement_id :=
      (v_item ->> 'requirementId')::uuid;

    select coalesce(
      array_agg(
        element.value::smallint
        order by element.ordinality
      ),
      array[]::smallint[]
    )
    into v_source_partition
    from jsonb_array_elements_text(
      coalesce(
        v_item -> 'sourcePartition',
        '[]'::jsonb
      )
    ) with ordinality
      as element(value, ordinality);

    select
      requirement.weekly_load,
      requirement.term_status,
      requirement.allowed_partitions
    into
      v_weekly_load,
      v_term_status,
      v_allowed_partitions
    from public.course_requirements requirement
    where requirement.id = v_requirement_id
      and requirement.requirement_set_id =
        v_revision.requirement_set_id
    for update;

    if not found then
      raise exception
        'M24.3 alignment requirement not found: %',
        v_requirement_id;
    end if;

    if exists (
      select 1
      from public.schedule_cards card
      join public.placements placement
        on placement.card_id = card.id
      where card.schedule_revision_id =
          p_schedule_revision_id
        and card.requirement_id =
          v_requirement_id
    ) then
      raise exception
        'M24.3 refuses to align requirement with placement: %',
        v_requirement_id;
    end if;

    if exists (
      select 1
      from public.schedule_cards card
      where card.schedule_revision_id =
          p_schedule_revision_id
        and card.requirement_id =
          v_requirement_id
        and card.locked
    ) then
      raise exception
        'M24.3 refuses to align locked requirement: %',
        v_requirement_id;
    end if;

    if cardinality(v_source_partition) = 0
       or (
         select coalesce(sum(duration), 0)
         from unnest(v_source_partition) duration
       ) <> v_weekly_load then
      raise exception
        'M24.3 source partition load mismatch for requirement %',
        v_requirement_id;
    end if;

    if to_jsonb(v_source_partition) is distinct from
         coalesce(
           v_item -> 'sourcePartition',
           '[]'::jsonb
         ) then
      raise exception
        'M24.3 source partition decode mismatch for requirement %',
        v_requirement_id;
    end if;

    v_allowed_partitions :=
      coalesce(
        v_allowed_partitions,
        '[]'::jsonb
      );

    if jsonb_typeof(v_allowed_partitions) <> 'array' then
      v_allowed_partitions := '[]'::jsonb;
    end if;

    if not exists (
      select 1
      from jsonb_array_elements(
        v_allowed_partitions
      ) alternative
      where alternative =
        to_jsonb(v_source_partition)
    ) then
      v_allowed_partitions :=
        v_allowed_partitions
        || jsonb_build_array(
          to_jsonb(v_source_partition)
        );
    end if;

    select count(*)
    into v_removed_this
    from public.schedule_cards card
    where card.schedule_revision_id =
        p_schedule_revision_id
      and card.requirement_id =
        v_requirement_id;

    v_removed_card_count :=
      v_removed_card_count
      + coalesce(v_removed_this, 0);

    delete from public.schedule_cards card
    where card.schedule_revision_id =
        p_schedule_revision_id
      and card.requirement_id =
        v_requirement_id;

    update public.course_requirements requirement
    set
      preferred_partition =
        to_jsonb(v_source_partition),
      allowed_partitions =
        v_allowed_partitions,
      term_status =
        v_term_status
    where requirement.id =
      v_requirement_id;

    insert into public.schedule_cards (
      schedule_revision_id,
      requirement_id,
      block_index,
      duration_periods,
      locked
    )
    select
      p_schedule_revision_id,
      v_requirement_id,
      element.ordinality::smallint,
      element.duration::smallint,
      false
    from unnest(v_source_partition)
      with ordinality
      as element(duration, ordinality);

    v_created_card_count :=
      v_created_card_count
      + cardinality(v_source_partition);
  end loop;

  if v_removed_card_count <> 83
     or v_created_card_count <> 80 then
    raise exception
      'M24.3 alignment card replacement mismatch: removed %, created %',
      v_removed_card_count,
      v_created_card_count;
  end if;

  perform public.refresh_management_candidate_domain(
    p_schedule_revision_id
  );

  -- The live, post-alignment logical plan must be byte-for-byte equivalent to
  -- the M24.2 preview plan before any placement is written.
  v_live_targets :=
    public.management_m24_logical_recovery_targets(
      p_schedule_revision_id
    );

  if v_live_targets is distinct from
       v_preview_targets then
    raise exception
      'M24.3 post-alignment recovery targets differ from preview';
  end if;

  select count(*)
  into v_after_card_count
  from public.schedule_cards card
  where card.schedule_revision_id =
    p_schedule_revision_id;

  if v_after_card_count <> 292 then
    raise exception
      'M24.3 expected 292 cards after alignment, found %',
      v_after_card_count;
  end if;

  -- -----------------------------------------------------------------------
  -- CREATE ONE PERMANENT STRUCTURE HISTORY EPOCH
  -- -----------------------------------------------------------------------

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
      'engine_version', 'M24.3-v1',
      'structure_kind',
        'HISTORICAL_RECOVERY_V2',
      'revertible', false,
      'plan_token',
        p_expected_plan_token,
      'alignment_target_count',
        v_alignment_count,
      'placement_target_count',
        v_placement_target_count,
      'removed_card_count',
        v_removed_card_count,
      'created_card_count',
        v_created_card_count,
      'before_structure_hash',
        v_before_structure_hash,
      'before_card_graph_hash',
        v_before_card_hash,
      'before_placement_hash',
        v_before_placement_hash
    )
  )
  returning id into v_root_transaction_id;

  -- -----------------------------------------------------------------------
  -- APPLY EXACT HISTORICAL PLACEMENTS
  -- -----------------------------------------------------------------------

  for v_target in
    select target.value
    from jsonb_array_elements(
      v_preview_targets
    ) target(value)
    order by
      target.value ->> 'requirementId',
      (target.value ->> 'blockIndex')::integer
  loop
    v_requirement_id :=
      (v_target ->> 'requirementId')::uuid;

    v_duration :=
      (v_target ->> 'durationPeriods')::smallint;

    v_day :=
      (v_target ->> 'dayOfWeek')::smallint;

    v_start :=
      (v_target ->> 'startPeriod')::smallint;

    v_teacher_id :=
      nullif(
        v_target ->> 'teacherId',
        ''
      )::uuid;

    v_room_id :=
      nullif(
        v_target ->> 'roomId',
        ''
      )::uuid;

    select card.id
    into v_card_id
    from public.schedule_cards card
    where card.schedule_revision_id =
        p_schedule_revision_id
      and card.requirement_id =
        v_requirement_id
      and card.block_index =
        (v_target ->> 'blockIndex')::smallint
      and card.duration_periods =
        v_duration;

    if v_card_id is null then
      raise exception
        'M24.3 target card not found for requirement %, block %',
        v_requirement_id,
        v_target ->> 'blockIndex';
    end if;

    if exists (
      select 1
      from public.placements placement
      where placement.card_id = v_card_id
    ) then
      raise exception
        'M24.3 target card became placed before recovery: %',
        v_card_id;
    end if;

    select
      assessment.id,
      assessment.status,
      assessment.is_complete,
      assessment.teacher_resolution_status,
      assessment.room_resolution_status,
      assessment.warning_codes
    into
      v_candidate_id,
      v_candidate_status,
      v_candidate_complete,
      v_candidate_teacher_resolution,
      v_candidate_room_resolution,
      v_candidate_warnings
    from public.schedule_card_candidate_assessments assessment
    where assessment.card_id =
        v_card_id
      and assessment.day_of_week =
        v_day
      and assessment.start_period =
        v_start
      and assessment.teacher_id
        is not distinct from v_teacher_id
      and assessment.room_id
        is not distinct from v_room_id;

    if v_candidate_id is null then
      raise exception
        'M24.3 exact target candidate not found for card %',
        v_card_id;
    end if;

    if v_candidate_status <> 'VALID'
       or not coalesce(
         v_candidate_complete,
         false
       ) then
      raise exception
        'M24.3 target candidate is not VALID/complete for card %',
        v_card_id;
    end if;

    if v_candidate_teacher_resolution is distinct from
         (v_target ->> 'teacherResolutionStatus')
       or v_candidate_room_resolution is distinct from
         (v_target ->> 'roomResolutionStatus')
       or to_jsonb(
         coalesce(
           v_candidate_warnings,
           array[]::text[]
         )
       ) is distinct from
         coalesce(
           v_target -> 'warningCodes',
           '[]'::jsonb
         ) then
      raise exception
        'M24.3 candidate certainty drift for card %',
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
          'HISTORICAL_RECOVERY_V2',
        'engine_version',
          'M24.3-v1',
        'plan_token',
          p_expected_plan_token,
        'candidate_assessment_id',
          v_candidate_id,
        'card_id',
          v_card_id,
        'logical_card',
          jsonb_build_object(
            'requirement_id',
              v_requirement_id,
            'block_index',
              (v_target ->> 'blockIndex')::integer
          ),
        'source_session_ids',
          coalesce(
            v_target -> 'sourceSessionIds',
            '[]'::jsonb
          ),
        'before',
          null,
        'after',
          jsonb_build_object(
            'day_of_week',
              v_day,
            'start_period',
              v_start,
            'teacher_id',
              v_teacher_id,
            'room_id',
              v_room_id
          ),
        'resource_certainty',
          jsonb_build_object(
            'teacher',
              v_candidate_teacher_resolution,
            'room',
              v_candidate_room_resolution,
            'warnings',
              to_jsonb(
                coalesce(
                  v_candidate_warnings,
                  array[]::text[]
                )
              )
          )
      )
    )
    returning id into
      v_child_transaction_id;

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
    );

    v_inserted_placement_count :=
      v_inserted_placement_count + 1;

    v_recovered_period_count :=
      v_recovered_period_count
      + v_duration;

    if v_candidate_teacher_resolution =
         'PROVISIONAL_UNKNOWN'
       or v_candidate_room_resolution in (
         'PROVISIONAL_UNKNOWN',
         'PROVISIONAL_CAPABILITY'
       )
       or cardinality(
         coalesce(
           v_candidate_warnings,
           array[]::text[]
         )
       ) > 0 then
      v_provisional_recovery_card_count :=
        v_provisional_recovery_card_count + 1;
    else
      v_resolved_recovery_card_count :=
        v_resolved_recovery_card_count + 1;
    end if;

    if v_candidate_teacher_resolution =
         'PROVISIONAL_UNKNOWN' then
      v_teacher_provisional_card_count :=
        v_teacher_provisional_card_count + 1;
    end if;

    if v_candidate_room_resolution in (
      'PROVISIONAL_UNKNOWN',
      'PROVISIONAL_CAPABILITY'
    ) then
      v_room_provisional_card_count :=
        v_room_provisional_card_count + 1;
    end if;
  end loop;

  if v_inserted_placement_count <> 200
     or v_recovered_period_count <> 364
     or v_resolved_recovery_card_count <> 11
     or v_provisional_recovery_card_count <> 189
     or v_teacher_provisional_card_count <> 187
     or v_room_provisional_card_count <> 33 then
    raise exception
      'M24.3 recovery cardinality/certainty mismatch: placements %, periods %, resolved %, provisional %, teacher provisional %, room provisional %',
      v_inserted_placement_count,
      v_recovered_period_count,
      v_resolved_recovery_card_count,
      v_provisional_recovery_card_count,
      v_teacher_provisional_card_count,
      v_room_provisional_card_count;
  end if;

  -- Recompute remaining domains only after the exact recovery batch is complete.
  -- Deliberately do NOT invoke propagate_management_forced_cards().
  perform public.refresh_management_candidate_domain(
    p_schedule_revision_id
  );

  -- -----------------------------------------------------------------------
  -- POST-APPLY SAFETY VERIFICATION
  -- -----------------------------------------------------------------------

  if exists (
    select 1
    from pg_temp.m243_existing_placement_guard before_row
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
      'M24.3 pre-existing placement guard failed';
  end if;

  select count(*)
  into v_after_placement_count
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id =
    p_schedule_revision_id;

  if v_after_placement_count <> 228 then
    raise exception
      'M24.3 expected 228 placements after recovery, found %',
      v_after_placement_count;
  end if;

  select count(*)
  into v_after_move_count
  from public.move_transactions transaction
  where transaction.schedule_revision_id =
    p_schedule_revision_id;

  if v_after_move_count <>
       v_before_move_count + 201 then
    raise exception
      'M24.3 move transaction count mismatch: before %, after %',
      v_before_move_count,
      v_after_move_count;
  end if;

  select count(*)
  into v_after_reconciliation_count
  from public.management_resource_reconciliations reconciliation
  where reconciliation.schedule_revision_id =
    p_schedule_revision_id;

  if v_after_reconciliation_count <>
       v_before_reconciliation_count then
    raise exception
      'M24.3 unexpectedly changed resource reconciliations';
  end if;

  select count(*)
  into v_public_session_count
  from public.schedule_sessions
  where academic_year =
    v_revision.academic_year;

  select count(*)
  into v_public_group_count
  from public.session_groups session_group
  join public.schedule_sessions session
    on session.id = session_group.session_id
  where session.academic_year =
    v_revision.academic_year;

  if v_public_session_count <> 517
     or v_public_group_count <> 609 then
    raise exception
      'M24.3 modified public projection: sessions %, groups %',
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
      'M24.3 public baseline drift detected';
  end if;

  v_after_diagnostic :=
    public.management_diagnose_historical_recovery_v2(
      p_schedule_revision_id
    );

  v_after_summary :=
    coalesce(
      v_after_diagnostic -> 'summary',
      '{}'::jsonb
    );

  if coalesce(
       (v_after_summary ->> 'totalCards')::integer,
       -1
     ) <> 292
     or coalesce(
       (v_after_summary ->> 'placedCards')::integer,
       -1
     ) <> 228
     or coalesce(
       (v_after_summary ->> 'unplacedCards')::integer,
       -1
     ) <> 64
     or coalesce(
       (
         v_after_summary
         ->> 'partitionMismatchRequirementCount'
       )::integer,
       -1
     ) <> 0 then
    raise exception
      'M24.3 post-apply recovery diagnostic mismatch: %',
      v_after_summary::text;
  end if;

  insert into public.management_historical_recovery_runs (
    schedule_revision_id,
    engine_version,
    plan_token,
    root_transaction_id,
    alignment_target_count,
    placement_target_count,
    created_card_count,
    removed_card_count,
    before_card_count,
    after_card_count,
    before_placement_count,
    after_placement_count,
    recovered_period_count,
    resolved_recovery_card_count,
    provisional_recovery_card_count,
    teacher_provisional_card_count,
    room_provisional_card_count,
    before_state,
    after_state,
    plan_snapshot,
    applied_by
  )
  values (
    p_schedule_revision_id,
    'M24.3-v1',
    p_expected_plan_token,
    v_root_transaction_id,
    v_alignment_count,
    v_placement_target_count,
    v_created_card_count,
    v_removed_card_count,
    v_before_card_count,
    v_after_card_count,
    v_before_placement_count,
    v_after_placement_count,
    v_recovered_period_count,
    v_resolved_recovery_card_count,
    v_provisional_recovery_card_count,
    v_teacher_provisional_card_count,
    v_room_provisional_card_count,
    jsonb_build_object(
      'summary',
        v_before_summary,
      'structureHash',
        v_before_structure_hash,
      'cardGraphHash',
        v_before_card_hash,
      'placementHash',
        v_before_placement_hash,
      'moveTransactionCount',
        v_before_move_count,
      'resourceReconciliationCount',
        v_before_reconciliation_count
    ),
    jsonb_build_object(
      'summary',
        v_after_summary,
      'cardCount',
        v_after_card_count,
      'placementCount',
        v_after_placement_count,
      'moveTransactionCount',
        v_after_move_count,
      'resourceReconciliationCount',
        v_after_reconciliation_count,
      'publicBaselineHealthy',
        true
    ),
    jsonb_build_object(
      'planToken',
        p_expected_plan_token,
      'alignmentTargets',
        v_alignment_targets,
      'placementTargets',
        v_preview_targets
    ),
    auth.uid()
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'applied', true,
    'engineVersion', 'M24.3-v1',
    'auditId', v_audit_id,
    'revisionId', p_schedule_revision_id,
    'planToken', p_expected_plan_token,
    'historyBarrierTransactionId',
      v_root_transaction_id,
    'alignmentTargetCount',
      v_alignment_count,
    'removedCardCount',
      v_removed_card_count,
    'createdCardCount',
      v_created_card_count,
    'cardCountBefore',
      v_before_card_count,
    'cardCountAfter',
      v_after_card_count,
    'placementCountBefore',
      v_before_placement_count,
    'placementCountAfter',
      v_after_placement_count,
    'recoveredPlacementCount',
      v_inserted_placement_count,
    'recoveredPeriodCount',
      v_recovered_period_count,
    'resourceCertainty',
      jsonb_build_object(
        'resolvedRecoveryCards',
          v_resolved_recovery_card_count,
        'provisionalRecoveryCards',
          v_provisional_recovery_card_count,
        'teacherProvisionalCards',
          v_teacher_provisional_card_count,
        'roomProvisionalCards',
          v_room_provisional_card_count
      ),
    'remaining',
      v_after_summary,
    'publicProjectionChanged',
      false,
    'publicationBlockingChanged',
      false,
    'nextStep',
      'M24_4_REMAINING_64_RECOVERY_TRIAGE'
  );
end
$$;

revoke all
  on function public.management_apply_historical_recovery_v2(
    uuid,
    text
  )
  from public, anon, authenticated;

comment on function public.management_apply_historical_recovery_v2(
  uuid,
  text
) is
  'M24.3 SQL-Editor/postgres-only atomic historical recovery apply. Requires an exact M24.2 plan token, permanently aligns the 37 previewed historical partitions, verifies that the live post-alignment logical target set exactly matches the 200 previewed recoverable placements, writes only those exact placements under one permanent STRUCTURE history epoch, preserves the original 28 placements, and leaves the public projection untouched.';


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
  v_reconciliations integer;
  v_recovery_runs integer;
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
      'M24.3 current term-1 DRAFT not found';
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
  into v_reconciliations
  from public.management_resource_reconciliations reconciliation
  where reconciliation.schedule_revision_id =
    v_revision_id;

  select count(*)
  into v_recovery_runs
  from public.management_historical_recovery_runs run
  where run.schedule_revision_id =
    v_revision_id;

  if v_sessions <> 517
     or v_groups <> 609
     or v_cards <> 295
     or v_placements <> 28
     or v_moves <> 142
     or v_reconciliations <> 0
     or v_recovery_runs <> 0 then
    raise exception
      'M24.3 installation must not apply recovery: sessions %, groups %, cards %, placements %, moves %, reconciliations %, recovery runs %',
      v_sessions,
      v_groups,
      v_cards,
      v_placements,
      v_moves,
      v_reconciliations,
      v_recovery_runs;
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_historical_recovery_v2(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M24.3 recovery apply must remain SQL-Editor only';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M24.3 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M24.3 must not unlock term template apply';
  end if;
end
$$;

commit;
