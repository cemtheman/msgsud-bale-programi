-- Management / M24.1
-- Historical Partition Alignment Rollback Simulation
--
-- Purpose:
--   Exercise the current M22-aware candidate engine against the historical
--   source block partition for every current PARTITION_MISMATCH requirement,
--   then roll the simulation back inside the function before returning.
--
-- Safety contract:
--   * no persistent requirement/card/placement/history mutation
--   * simulation runs inside a PL/pgSQL exception subtransaction
--   * a deliberate private SQLSTATE rolls back every simulated mutation
--   * post-rollback hashes/counts are verified before any result is returned
--   * no authenticated EXECUTE grant
--   * publication/template apply stay locked
--   * M20.3 permanent apply is NOT invoked

begin;


-- -------------------------------------------------------------------------
-- STATE HASH HELPERS
-- -------------------------------------------------------------------------

create or replace function public.management_m24_requirement_structure_hash(
  p_schedule_revision_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select md5(
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'requirementId', requirement.id,
          'weeklyLoad', requirement.weekly_load,
          'preferredPartition',
            requirement.preferred_partition,
          'allowedPartitions',
            requirement.allowed_partitions,
          'termStatus', requirement.term_status
        )
        order by requirement.id::text
      )::text,
      '[]'
    )
  )
  from public.schedule_revisions revision
  join public.course_requirements requirement
    on requirement.requirement_set_id =
      revision.requirement_set_id
  where revision.id = p_schedule_revision_id
$$;

create or replace function public.management_m24_card_graph_hash(
  p_schedule_revision_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select md5(
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cardId', card.id,
          'requirementId', card.requirement_id,
          'blockIndex', card.block_index,
          'durationPeriods', card.duration_periods,
          'locked', card.locked
        )
        order by card.id::text
      )::text,
      '[]'
    )
  )
  from public.schedule_cards card
  where card.schedule_revision_id =
    p_schedule_revision_id
$$;

revoke all
  on function public.management_m24_requirement_structure_hash(uuid)
  from public, anon, authenticated;

revoke all
  on function public.management_m24_card_graph_hash(uuid)
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- SELF-ROLLING-BACK SIMULATION
-- -------------------------------------------------------------------------

create or replace function public.management_simulate_historical_partition_alignment_v2(
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
  v_before jsonb;
  v_after jsonb;
  v_item jsonb;
  v_requirement_id uuid;
  v_source_partition smallint[];
  v_weekly_load smallint;
  v_term_status text;
  v_allowed_partitions jsonb;

  v_alignment_count integer := 0;
  v_removed_card_count integer := 0;
  v_removed_this integer := 0;
  v_created_card_count integer := 0;

  v_before_structure_hash text;
  v_before_card_hash text;
  v_before_card_count integer;
  v_before_placement_count integer;
  v_before_move_count integer;
  v_before_reconciliation_count integer;

  v_after_rollback_structure_hash text;
  v_after_rollback_card_hash text;
  v_after_rollback_card_count integer;
  v_after_rollback_placement_count integer;
  v_after_rollback_move_count integer;
  v_after_rollback_reconciliation_count integer;

  v_result jsonb;
begin
  if session_user <> 'postgres' then
    raise exception
      'M24.1 rollback simulation is SQL-Editor/postgres only'
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
    on requirement_set.id =
      revision.requirement_set_id
  where revision.id = p_schedule_revision_id;

  if not found then
    raise exception
      'M24.1 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision.revision_status <> 'DRAFT'
     or v_revision.requirement_set_status <> 'DRAFT' then
    raise exception
      'M24.1 requires a DRAFT revision on a DRAFT requirement set';
  end if;

  v_before :=
    public.management_diagnose_historical_recovery_v2(
      p_schedule_revision_id
    );

  if coalesce(
    (
      v_before
      #>> '{summary,partitionMismatchRequirementCount}'
    )::integer,
    0
  ) = 0 then
    raise exception
      'M24.1 no PARTITION_MISMATCH requirements remain to simulate';
  end if;

  v_before_structure_hash :=
    public.management_m24_requirement_structure_hash(
      p_schedule_revision_id
    );

  v_before_card_hash :=
    public.management_m24_card_graph_hash(
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

  -- The nested block is a PostgreSQL subtransaction. The deliberate P2401
  -- exception at the end rolls every simulated UPDATE/DELETE/INSERT and every
  -- candidate-domain refresh back. PL/pgSQL variables keep the captured result.
  begin
    for v_item in
      select item.value
      from jsonb_array_elements(
        coalesce(
          v_before -> 'requirements',
          '[]'::jsonb
        )
      ) item(value)
      where item.value ->> 'status' =
        'PARTITION_MISMATCH'
      order by
        item.value ->> 'subjectName',
        item.value ->> 'groupName',
        item.value ->> 'requirementId'
    loop
      v_requirement_id :=
        (v_item ->> 'requirementId')::uuid;

      if coalesce(
        (v_item ->> 'placedCardCount')::integer,
        0
      ) <> 0 then
        raise exception
          'M24.1 partition simulation refuses placed requirement %',
          v_requirement_id;
      end if;

      if coalesce(
        (v_item ->> 'lockedCardCount')::integer,
        0
      ) <> 0 then
        raise exception
          'M24.1 partition simulation refuses locked requirement %',
          v_requirement_id;
      end if;

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
          v_item -> 'sourceRunDurations',
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
          v_revision.requirement_set_id;

      if not found then
        raise exception
          'M24.1 requirement disappeared during simulation: %',
          v_requirement_id;
      end if;

      if cardinality(v_source_partition) = 0
         or (
           select coalesce(sum(duration), 0)
           from unnest(v_source_partition) duration
         ) <> v_weekly_load then
        raise exception
          'M24.1 source partition load mismatch for requirement %: partition %, weekly load %',
          v_requirement_id,
          v_source_partition,
          v_weekly_load;
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

      v_alignment_count :=
        v_alignment_count + 1;
    end loop;

    -- Rebuild the complete derived candidate domain once after all simulated
    -- partition changes. M24.0 then evaluates exact source slots using current
    -- M22 resource semantics.
    perform public.refresh_management_candidate_domain(
      p_schedule_revision_id
    );

    v_after :=
      public.management_diagnose_historical_recovery_v2(
        p_schedule_revision_id
      );

    v_result := jsonb_build_object(
      'revisionId',
        p_schedule_revision_id,
      'engineVersion',
        'M24.1-v1',
      'simulationOnly',
        true,
      'persistentMutation',
        false,
      'alignedRequirementCount',
        v_alignment_count,
      'simulatedRemovedCardCount',
        v_removed_card_count,
      'simulatedCreatedCardCount',
        v_created_card_count,
      'before',
        v_before -> 'summary',
      'afterAlignment',
        v_after -> 'summary',
      'resourceCertaintyAfterAlignment',
        v_after -> 'resourceCertainty',
      'delta',
        jsonb_build_object(
          'recoverableRequirementCount',
            coalesce(
              (
                v_after
                #>> '{summary,recoverableRequirementCount}'
              )::integer,
              0
            )
            -
            coalesce(
              (
                v_before
                #>> '{summary,recoverableRequirementCount}'
              )::integer,
              0
            ),
          'recoverableCardCount',
            coalesce(
              (
                v_after
                #>> '{summary,recoverableCardCount}'
              )::integer,
              0
            )
            -
            coalesce(
              (
                v_before
                #>> '{summary,recoverableCardCount}'
              )::integer,
              0
            ),
          'remainingAfterExactRecovery',
            coalesce(
              (
                v_after
                #>> '{summary,remainingAfterExactRecovery}'
              )::integer,
              0
            )
            -
            coalesce(
              (
                v_before
                #>> '{summary,remainingAfterExactRecovery}'
              )::integer,
              0
            ),
          'partitionMismatchRequirementCount',
            coalesce(
              (
                v_after
                #>> '{summary,partitionMismatchRequirementCount}'
              )::integer,
              0
            )
            -
            coalesce(
              (
                v_before
                #>> '{summary,partitionMismatchRequirementCount}'
              )::integer,
              0
            )
        ),
      'reasonCountsAfterAlignment',
        v_after #> '{summary,reasonCounts}',
      'nextStep',
        'M24_2_RECOVERY_APPLY_DESIGN'
    );

    raise exception
      'M24.1_INTERNAL_ROLLBACK'
      using errcode = 'P2401';

  exception
    when sqlstate 'P2401' then
      null;
  end;

  -- Everything above the exception boundary must now be back at the exact
  -- pre-simulation state.
  v_after_rollback_structure_hash :=
    public.management_m24_requirement_structure_hash(
      p_schedule_revision_id
    );

  v_after_rollback_card_hash :=
    public.management_m24_card_graph_hash(
      p_schedule_revision_id
    );

  select count(*)
  into v_after_rollback_card_count
  from public.schedule_cards card
  where card.schedule_revision_id =
    p_schedule_revision_id;

  select count(*)
  into v_after_rollback_placement_count
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id =
    p_schedule_revision_id;

  select count(*)
  into v_after_rollback_move_count
  from public.move_transactions transaction
  where transaction.schedule_revision_id =
    p_schedule_revision_id;

  select count(*)
  into v_after_rollback_reconciliation_count
  from public.management_resource_reconciliations reconciliation
  where reconciliation.schedule_revision_id =
    p_schedule_revision_id;

  if v_before_structure_hash is distinct from
       v_after_rollback_structure_hash
     or v_before_card_hash is distinct from
       v_after_rollback_card_hash
     or v_before_card_count <>
       v_after_rollback_card_count
     or v_before_placement_count <>
       v_after_rollback_placement_count
     or v_before_move_count <>
       v_after_rollback_move_count
     or v_before_reconciliation_count <>
       v_after_rollback_reconciliation_count then
    raise exception
      'M24.1 rollback verification failed';
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
      'M24.1 public baseline drift after rollback';
  end if;

  return
    v_result
    || jsonb_build_object(
      'rollbackVerified', true,
      'persistentStateAfterReturn',
        jsonb_build_object(
          'structureHash',
            v_after_rollback_structure_hash,
          'cardGraphHash',
            v_after_rollback_card_hash,
          'cardCount',
            v_after_rollback_card_count,
          'placementCount',
            v_after_rollback_placement_count,
          'moveTransactionCount',
            v_after_rollback_move_count,
          'resourceReconciliationCount',
            v_after_rollback_reconciliation_count,
          'publicBaselineHealthy',
            true
        )
    );
end
$$;

revoke all
  on function public.management_simulate_historical_partition_alignment_v2(uuid)
  from public, anon, authenticated;

comment on function public.management_simulate_historical_partition_alignment_v2(uuid) is
  'M24.1 SQL-Editor/postgres-only self-rolling-back simulation. Temporarily rebuilds every current PARTITION_MISMATCH requirement to the exact historical source partition, evaluates M24.0 recovery with the M22-aware candidate engine, deliberately aborts the inner subtransaction, verifies exact requirement/card/count rollback, and returns only the captured diagnostic result.';


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
  v_reconciliations integer;
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
      'M24.1 current term-1 DRAFT not found';
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
  into v_reconciliations
  from public.management_resource_reconciliations reconciliation
  where reconciliation.schedule_revision_id =
    v_revision_id;

  if v_sessions <> 517
     or v_groups <> 609
     or v_cards <> 295
     or v_placements <> 28
     or v_reconciliations <> 0 then
    raise exception
      'M24.1 accepted-state invariant failed: sessions %, groups %, cards %, placements %, reconciliations %',
      v_sessions,
      v_groups,
      v_cards,
      v_placements,
      v_reconciliations;
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_simulate_historical_partition_alignment_v2(uuid)',
    'EXECUTE'
  ) then
    raise exception
      'M24.1 simulation must not be executable by authenticated';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M24.1 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M24.1 must not unlock term template apply';
  end if;
end
$$;

commit;
