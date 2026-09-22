-- Management / M24.2
-- Historical Recovery Apply Design / Token-Bearing Preview
--
-- Builds the exact logical plan that a later M24.3 controlled apply may use:
--   1. align every current PARTITION_MISMATCH requirement to its historical
--      source partition inside a rollback-only subtransaction,
--   2. rebuild the M22-aware candidate domain,
--   3. capture only the resulting RECOVERABLE historical placements,
--   4. express placement targets by stable logical card identity
--      (requirement_id + block_index), never simulated UUIDs,
--   5. hash the complete plan into one stale-state token,
--   6. roll the simulation back and verify exact persistent state restoration.
--
-- No apply endpoint is installed in M24.2.

begin;


-- -------------------------------------------------------------------------
-- PERSISTENT PLACEMENT HASH
-- -------------------------------------------------------------------------

create or replace function public.management_m24_placement_semantic_hash(
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
          'dayOfWeek', placement.day_of_week,
          'startPeriod', placement.start_period,
          'teacherId', placement.teacher_id,
          'roomId', placement.room_id,
          'teacherResolution',
            placement.teacher_resolution_status,
          'roomResolution',
            placement.room_resolution_status,
          'warnings',
            to_jsonb(placement.resource_warning_codes)
        )
        order by card.id::text
      )::text,
      '[]'
    )
  )
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id =
    p_schedule_revision_id
$$;

revoke all
  on function public.management_m24_placement_semantic_hash(uuid)
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- TOKEN-BEARING RECOVERY PLAN PREVIEW
-- -------------------------------------------------------------------------

create or replace function public.management_preview_historical_recovery_apply_v2(
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

  v_alignment_targets jsonb;
  v_logical_placements jsonb;
  v_remaining_requirements jsonb;
  v_plan_core jsonb;
  v_plan_token text;
  v_result jsonb;

  v_requirement_id uuid;
  v_source_partition smallint[];
  v_weekly_load smallint;
  v_term_status text;
  v_allowed_partitions jsonb;

  v_alignment_count integer;
  v_placement_target_count integer;

  v_before_structure_hash text;
  v_before_card_hash text;
  v_before_placement_hash text;
  v_before_card_count integer;
  v_before_placement_count integer;
  v_before_move_count integer;
  v_before_reconciliation_count integer;

  v_after_rollback_structure_hash text;
  v_after_rollback_card_hash text;
  v_after_rollback_placement_hash text;
  v_after_rollback_card_count integer;
  v_after_rollback_placement_count integer;
  v_after_rollback_move_count integer;
  v_after_rollback_reconciliation_count integer;
begin
  if session_user <> 'postgres' then
    raise exception
      'M24.2 recovery apply preview is SQL-Editor/postgres only'
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
      'M24.2 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision.revision_status <> 'DRAFT'
     or v_revision.requirement_set_status <> 'DRAFT' then
    raise exception
      'M24.2 requires a DRAFT revision on a DRAFT requirement set';
  end if;

  v_before :=
    public.management_diagnose_historical_recovery_v2(
      p_schedule_revision_id
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requirementId',
          item.value ->> 'requirementId',
        'subjectName',
          item.value ->> 'subjectName',
        'groupName',
          item.value ->> 'groupName',
        'weeklyLoad',
          (
            select requirement.weekly_load
            from public.course_requirements requirement
            where requirement.id =
              (item.value ->> 'requirementId')::uuid
          ),
        'currentCardDurations',
          coalesce(
            item.value -> 'cardDurations',
            '[]'::jsonb
          ),
        'sourcePartition',
          coalesce(
            item.value -> 'sourceRunDurations',
            '[]'::jsonb
          )
      )
      order by
        item.value ->> 'subjectName',
        item.value ->> 'groupName',
        item.value ->> 'requirementId'
    ),
    '[]'::jsonb
  )
  into v_alignment_targets
  from jsonb_array_elements(
    coalesce(
      v_before -> 'requirements',
      '[]'::jsonb
    )
  ) item(value)
  where item.value ->> 'status' =
    'PARTITION_MISMATCH';

  v_alignment_count :=
    jsonb_array_length(v_alignment_targets);

  if v_alignment_count = 0 then
    raise exception
      'M24.2 no PARTITION_MISMATCH requirements remain';
  end if;

  if v_alignment_count <> coalesce(
    (
      v_before
      #>> '{summary,partitionMismatchRequirementCount}'
    )::integer,
    0
  ) then
    raise exception
      'M24.2 alignment target count does not match diagnostic summary';
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

  -- All temporary structural work is inside an exception subtransaction.
  begin
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
          v_revision.requirement_set_id;

      if not found then
        raise exception
          'M24.2 requirement disappeared during preview: %',
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
          'M24.2 refuses to align requirement with placements: %',
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
          'M24.2 refuses to align locked requirement: %',
          v_requirement_id;
      end if;

      if cardinality(v_source_partition) = 0
         or (
           select coalesce(sum(duration), 0)
           from unnest(v_source_partition) duration
         ) <> v_weekly_load then
        raise exception
          'M24.2 source partition load mismatch for requirement %',
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
    end loop;

    perform public.refresh_management_candidate_domain(
      p_schedule_revision_id
    );

    v_after :=
      public.management_diagnose_historical_recovery_v2(
        p_schedule_revision_id
      );

    if coalesce(
      (
        v_after
        #>> '{summary,partitionMismatchRequirementCount}'
      )::integer,
      -1
    ) <> 0 then
      raise exception
        'M24.2 simulated alignment left partition mismatches';
    end if;

    -- Simulated card UUIDs are intentionally excluded. A future M24.3 apply
    -- will resolve each stable requirementId + blockIndex pair to the actual
    -- post-alignment card UUID inside the apply transaction.
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
    into v_logical_placements
    from jsonb_array_elements(
      coalesce(
        v_after -> 'recoverableProposals',
        '[]'::jsonb
      )
    ) proposal(value);

    v_placement_target_count :=
      jsonb_array_length(v_logical_placements);

    select coalesce(
      jsonb_agg(
        item.value
        order by
          item.value ->> 'status',
          item.value ->> 'subjectName',
          item.value ->> 'groupName',
          item.value ->> 'requirementId'
      ),
      '[]'::jsonb
    )
    into v_remaining_requirements
    from jsonb_array_elements(
      coalesce(
        v_after -> 'requirements',
        '[]'::jsonb
      )
    ) item(value)
    where item.value ->> 'status' <> 'RECOVERABLE';

    v_plan_core :=
      jsonb_build_object(
        'revisionId',
          p_schedule_revision_id,
        'academicYear',
          v_revision.academic_year,
        'term',
          v_revision.term,
        'engineVersion',
          'M24.2-v1',
        'beforeState',
          jsonb_build_object(
            'structureHash',
              v_before_structure_hash,
            'cardGraphHash',
              v_before_card_hash,
            'placementHash',
              v_before_placement_hash,
            'cardCount',
              v_before_card_count,
            'placementCount',
              v_before_placement_count,
            'moveTransactionCount',
              v_before_move_count,
            'resourceReconciliationCount',
              v_before_reconciliation_count
          ),
        'alignmentTargets',
          v_alignment_targets,
        'placementTargets',
          v_logical_placements,
        'afterAlignmentSummary',
          v_after -> 'summary',
        'resourceCertaintyAfterAlignment',
          v_after -> 'resourceCertainty',
        'remainingRequirements',
          v_remaining_requirements
      );

    v_plan_token :=
      md5(v_plan_core::text);

    v_result :=
      jsonb_build_object(
        'revisionId',
          p_schedule_revision_id,
        'engineVersion',
          'M24.2-v1',
        'previewOnly',
          true,
        'applyEndpointPresent',
          false,
        'alignmentTargetCount',
          v_alignment_count,
        'placementTargetCount',
          v_placement_target_count,
        'planToken',
          v_plan_token,
        'canDesignApply',
          v_alignment_count > 0
          and v_placement_target_count > 0
          and coalesce(
            (
              v_after
              #>> '{summary,partitionMismatchRequirementCount}'
            )::integer,
            -1
          ) = 0
          and coalesce(
            (
              v_after
              #>> '{publicBaseline,healthy}'
            )::boolean,
            false
          ),
        'before',
          v_before -> 'summary',
        'afterAlignment',
          v_after -> 'summary',
        'resourceCertaintyAfterAlignment',
          v_after -> 'resourceCertainty',
        'alignmentTargets',
          v_alignment_targets,
        'placementTargets',
          v_logical_placements,
        'remainingRequirements',
          v_remaining_requirements,
        'nextStep',
          'M24_3_TOKEN_CONTROLLED_ATOMIC_RECOVERY_APPLY'
      );

    raise exception
      'M24.2_INTERNAL_ROLLBACK'
      using errcode = 'P2402';

  exception
    when sqlstate 'P2402' then
      null;
  end;

  v_after_rollback_structure_hash :=
    public.management_m24_requirement_structure_hash(
      p_schedule_revision_id
    );

  v_after_rollback_card_hash :=
    public.management_m24_card_graph_hash(
      p_schedule_revision_id
    );

  v_after_rollback_placement_hash :=
    public.management_m24_placement_semantic_hash(
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
     or v_before_placement_hash is distinct from
       v_after_rollback_placement_hash
     or v_before_card_count <>
       v_after_rollback_card_count
     or v_before_placement_count <>
       v_after_rollback_placement_count
     or v_before_move_count <>
       v_after_rollback_move_count
     or v_before_reconciliation_count <>
       v_after_rollback_reconciliation_count then
    raise exception
      'M24.2 rollback verification failed';
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
      'M24.2 public baseline drift after rollback';
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
          'placementHash',
            v_after_rollback_placement_hash,
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
  on function public.management_preview_historical_recovery_apply_v2(uuid)
  from public, anon, authenticated;

comment on function public.management_preview_historical_recovery_apply_v2(uuid) is
  'M24.2 SQL-Editor/postgres-only token-bearing recovery apply design. Self-simulates historical partition alignment, captures exact stable logical recovery targets and remaining blockers, hashes the complete plan, rolls all temporary changes back, and verifies exact persistent-state restoration. No apply endpoint is installed.';


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
      'M24.2 current term-1 DRAFT not found';
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
      'M24.2 accepted-state invariant failed: sessions %, groups %, cards %, placements %, reconciliations %',
      v_sessions,
      v_groups,
      v_cards,
      v_placements,
      v_reconciliations;
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_preview_historical_recovery_apply_v2(uuid)',
    'EXECUTE'
  ) then
    raise exception
      'M24.2 recovery apply preview must remain SQL-Editor only';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_apply_publication(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'M24.2 must not unlock publication';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.management_create_term_from_template(uuid,text,smallint)',
    'EXECUTE'
  ) then
    raise exception
      'M24.2 must not unlock term template apply';
  end if;
end
$$;

commit;
