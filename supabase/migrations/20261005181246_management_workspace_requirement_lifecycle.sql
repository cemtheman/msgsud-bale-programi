CREATE OR REPLACE FUNCTION public.management_commit_workspace_v11(p_schedule_revision_id uuid, p_requirement_set_id uuid, p_expected_revision_version integer, p_expected_snapshot_hash text, p_expected_baseline_hash text, p_changes jsonb, p_requirement_changes jsonb, p_resource_changes jsonb, p_teacher_planning_changes jsonb, p_teacher_availability_changes jsonb, p_room_profile_changes jsonb, p_resource_creates jsonb, p_resource_deletes jsonb, p_structure_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_current_snapshot jsonb;
  v_intermediate_snapshot jsonb;
  v_final_snapshot jsonb;
  v_workspace_result jsonb;
  v_pre_workspace_result jsonb := '{}'::jsonb;

  v_lifecycle_changes jsonb := '[]'::jsonb;
  v_active_structure_changes jsonb := '[]'::jsonb;
  v_pre_lifecycle_changes jsonb := '[]'::jsonb;
  v_remaining_changes jsonb := '[]'::jsonb;

  v_change jsonb;
  v_requirement_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_final_cards jsonb;
  v_preview jsonb;
  v_apply_result jsonb;
  v_preferred smallint[];
  v_final_card_ids uuid[];
  v_created_snapshots jsonb;

  v_lifecycle_count integer := 0;
  v_lifecycle_card_change_count integer := 0;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'WORKSPACE_V11_EDITOR_REQUIRED'
      using errcode = '42501';
  end if;

  p_changes := coalesce(p_changes, '[]'::jsonb);
  p_requirement_changes := coalesce(p_requirement_changes, '[]'::jsonb);
  p_resource_changes := coalesce(p_resource_changes, '[]'::jsonb);
  p_teacher_planning_changes := coalesce(p_teacher_planning_changes, '[]'::jsonb);
  p_teacher_availability_changes := coalesce(p_teacher_availability_changes, '[]'::jsonb);
  p_room_profile_changes := coalesce(p_room_profile_changes, '[]'::jsonb);
  p_resource_creates := coalesce(p_resource_creates, '[]'::jsonb);
  p_resource_deletes := coalesce(p_resource_deletes, '[]'::jsonb);
  p_structure_changes := coalesce(p_structure_changes, '[]'::jsonb);

  if jsonb_typeof(p_structure_changes) is distinct from 'array'
     or jsonb_typeof(p_changes) is distinct from 'array' then
    raise exception 'WORKSPACE_V11_LIFECYCLE_INVALID';
  end if;

  v_current_snapshot := public.management_preview_solver_snapshot(
    p_schedule_revision_id,
    null
  );

  if (v_current_snapshot ->> 'snapshotHash')
      is distinct from p_expected_snapshot_hash then
    raise exception 'WORKSPACE_V1_SNAPSHOT_STALE';
  end if;

  if (v_current_snapshot ->> 'baselineHash')
      is distinct from p_expected_baseline_hash then
    raise exception 'WORKSPACE_V1_BASELINE_STALE';
  end if;

  select coalesce(
    jsonb_agg(item.value order by item.value ->> 'requirement_id'),
    '[]'::jsonb
  )
  into v_lifecycle_changes
  from jsonb_array_elements(p_structure_changes) item(value)
  where item.value #>> '{before,term_status}'
        is distinct from item.value #>> '{after,term_status}';

  select coalesce(
    jsonb_agg(item.value order by item.value ->> 'requirement_id'),
    '[]'::jsonb
  )
  into v_active_structure_changes
  from jsonb_array_elements(p_structure_changes) item(value)
  where item.value #>> '{before,term_status}'
        is not distinct from item.value #>> '{after,term_status}'
    and item.value #>> '{after,term_status}' = 'ACTIVE';

  if exists (
    select 1
    from jsonb_array_elements(p_structure_changes) item(value)
    where item.value #>> '{before,term_status}'
          is not distinct from item.value #>> '{after,term_status}'
      and item.value #>> '{after,term_status}' <> 'ACTIVE'
  ) then
    raise exception 'WORKSPACE_V11_LIFECYCLE_INVALID: inactive structure mutation';
  end if;

  v_lifecycle_count := jsonb_array_length(v_lifecycle_changes);

  select coalesce(
    jsonb_agg(change.value order by change.value ->> 'card_id'),
    '[]'::jsonb
  )
  into v_pre_lifecycle_changes
  from jsonb_array_elements(p_changes) change(value)
  where change.value #>> '{after,day_of_week}' is null
    and change.value #>> '{after,start_period}' is null
    and change.value #>> '{after,teacher_id}' is null
    and change.value #>> '{after,room_id}' is null
    and exists (
      select 1
      from jsonb_array_elements(v_lifecycle_changes) lifecycle(value)
      where lifecycle.value #>> '{before,term_status}' = 'ACTIVE'
        and lifecycle.value #>> '{after,term_status}' = 'INACTIVE'
        and exists (
          select 1
          from public.schedule_cards card
          where card.id = (change.value ->> 'card_id')::uuid
            and card.schedule_revision_id = p_schedule_revision_id
            and card.requirement_id =
              (lifecycle.value ->> 'requirement_id')::uuid
        )
    );

  select coalesce(
    jsonb_agg(change.value order by change.value ->> 'card_id'),
    '[]'::jsonb
  )
  into v_remaining_changes
  from jsonb_array_elements(p_changes) change(value)
  where not exists (
    select 1
    from jsonb_array_elements(v_pre_lifecycle_changes) staged(value)
    where staged.value ->> 'card_id' = change.value ->> 'card_id'
  );

  if jsonb_array_length(v_pre_lifecycle_changes) > 0 then
    v_pre_workspace_result := public.management_commit_workspace_v9(
      p_schedule_revision_id,
      p_requirement_set_id,
      p_expected_revision_version,
      p_expected_snapshot_hash,
      p_expected_baseline_hash,
      v_pre_lifecycle_changes,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb
    );

    v_current_snapshot := public.management_preview_solver_snapshot(
      p_schedule_revision_id,
      null
    );
  end if;

  for v_change in
    select item.value
    from jsonb_array_elements(v_lifecycle_changes) item(value)
    order by item.value ->> 'requirement_id'
  loop
    begin
      v_requirement_id := nullif(v_change ->> 'requirement_id', '')::uuid;
    exception when others then
      raise exception 'WORKSPACE_V11_LIFECYCLE_INVALID';
    end;

    v_before := v_change -> 'before';
    v_after := v_change -> 'after';
    v_final_cards := v_change -> 'final_cards';

    if v_requirement_id is null
       or jsonb_typeof(v_before) is distinct from 'object'
       or jsonb_typeof(v_after) is distinct from 'object'
       or jsonb_typeof(v_final_cards) is distinct from 'array'
       or (v_before ->> 'term_status') not in ('ACTIVE', 'INACTIVE')
       or (v_after ->> 'term_status') not in ('ACTIVE', 'INACTIVE')
       or (v_before ->> 'term_status') =
          (v_after ->> 'term_status') then
      raise exception 'WORKSPACE_V11_LIFECYCLE_INVALID';
    end if;

    if not exists (
      select 1
      from public.course_requirements requirement
      where requirement.id = v_requirement_id
        and requirement.requirement_set_id = p_requirement_set_id
    ) then
      raise exception 'WORKSPACE_V11_LIFECYCLE_BEFORE_STALE: requirement';
    end if;

    select coalesce(
      array_agg(value::smallint order by ordinality),
      array[]::smallint[]
    )
    into v_preferred
    from jsonb_array_elements_text(v_after -> 'preferred_partition')
      with ordinality as item(value, ordinality);

    v_preview := public.management_preview_requirement_structure_v2(
      v_requirement_id,
      (v_after ->> 'weekly_load')::smallint,
      v_preferred,
      v_after -> 'allowed_partitions',
      v_after ->> 'term_status'
    );

    if (v_preview -> 'current' ->> 'weeklyLoad')
         is distinct from (v_before ->> 'weekly_load')
       or coalesce(v_preview -> 'current' -> 'preferredPartition', '[]'::jsonb)
         is distinct from coalesce(v_before -> 'preferred_partition', '[]'::jsonb)
       or coalesce(v_preview -> 'current' -> 'allowedPartitions', '[]'::jsonb)
         is distinct from coalesce(v_before -> 'allowed_partitions', '[]'::jsonb)
       or (v_preview -> 'current' ->> 'termStatus')
         is distinct from (v_before ->> 'term_status') then
      raise exception 'WORKSPACE_V11_LIFECYCLE_BEFORE_STALE: %',
        v_requirement_id;
    end if;

    if not coalesce((v_preview ->> 'canApply')::boolean, false) then
      raise exception 'WORKSPACE_V11_LIFECYCLE_BLOCKED: %',
        coalesce(v_preview -> 'blockReasons', '[]'::jsonb)::text;
    end if;

    if (v_after ->> 'term_status') = 'INACTIVE' then
      if jsonb_array_length(v_final_cards) <> 0 then
        raise exception 'WORKSPACE_V11_LIFECYCLE_GRAPH_MISMATCH: inactive cards';
      end if;

      v_apply_result := public.management_apply_requirement_structure_v2(
        v_requirement_id,
        (v_after ->> 'weekly_load')::smallint,
        v_preferred,
        v_after -> 'allowed_partitions',
        'INACTIVE',
        v_preview ->> 'structureToken'
      );

      v_lifecycle_card_change_count :=
        v_lifecycle_card_change_count
        + jsonb_array_length(v_preview -> 'removedCards');

      continue;
    end if;

    if (v_before ->> 'term_status') <> 'INACTIVE'
       or (v_after ->> 'term_status') <> 'ACTIVE' then
      raise exception 'WORKSPACE_V11_LIFECYCLE_INVALID';
    end if;

    if jsonb_array_length(v_preview -> 'preservedCards') <> 0
       or jsonb_array_length(v_preview -> 'removedCards') <> 0
       or jsonb_array_length(v_final_cards)
          <> jsonb_array_length(v_preview -> 'createdBlocks') then
      raise exception 'WORKSPACE_V11_LIFECYCLE_GRAPH_MISMATCH: activation';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_final_cards) card(value)
      where coalesce((card.value ->> 'baseline_exists')::boolean, false)
         or coalesce((card.value ->> 'locked')::boolean, false)
         or nullif(card.value ->> 'card_id', '') is null
         or (card.value ->> 'block_index')::integer < 1
         or (card.value ->> 'block_index')::integer
              > jsonb_array_length(v_after -> 'preferred_partition')
    ) then
      raise exception 'WORKSPACE_V11_LIFECYCLE_GRAPH_MISMATCH: activation card';
    end if;

    if (
      select count(distinct card.value ->> 'card_id')
      from jsonb_array_elements(v_final_cards) card(value)
    ) <> jsonb_array_length(v_final_cards) then
      raise exception 'WORKSPACE_V11_LIFECYCLE_GRAPH_MISMATCH: duplicate card id';
    end if;

    if (
      select count(distinct card.value ->> 'block_index')
      from jsonb_array_elements(v_final_cards) card(value)
    ) <> jsonb_array_length(v_final_cards) then
      raise exception 'WORKSPACE_V11_LIFECYCLE_GRAPH_MISMATCH: duplicate block index';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_preview -> 'createdBlocks') impact(value)
      where not exists (
        select 1
        from jsonb_array_elements(v_final_cards) card(value)
        where (card.value ->> 'block_index')::integer
              = (impact.value ->> 'proposedBlockIndex')::integer
          and (card.value ->> 'duration_periods')::integer
              = (impact.value ->> 'durationPeriods')::integer
      )
    ) then
      raise exception 'WORKSPACE_V11_LIFECYCLE_GRAPH_MISMATCH: activation layout';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_final_cards) card(value)
      where exists (
        select 1
        from public.schedule_cards existing
        where existing.id = (card.value ->> 'card_id')::uuid
      )
    ) then
      raise exception 'WORKSPACE_V11_LIFECYCLE_GRAPH_MISMATCH: client card id conflict';
    end if;

    update public.course_requirements requirement
    set
      weekly_load = (v_after ->> 'weekly_load')::smallint,
      preferred_partition = v_after -> 'preferred_partition',
      allowed_partitions = v_after -> 'allowed_partitions',
      term_status = 'ACTIVE'
    where requirement.id = v_requirement_id
      and requirement.requirement_set_id = p_requirement_set_id;

    insert into public.schedule_cards (
      id,
      schedule_revision_id,
      requirement_id,
      block_index,
      duration_periods,
      locked
    )
    select
      (card.value ->> 'card_id')::uuid,
      p_schedule_revision_id,
      v_requirement_id,
      (card.value ->> 'block_index')::smallint,
      (card.value ->> 'duration_periods')::smallint,
      false
    from jsonb_array_elements(v_final_cards) card(value);

    select coalesce(
      array_agg(card.id order by card.block_index),
      array[]::uuid[]
    )
    into v_final_card_ids
    from public.schedule_cards card
    where card.schedule_revision_id = p_schedule_revision_id
      and card.requirement_id = v_requirement_id;

    if cardinality(v_final_card_ids) > 0 then
      perform public.refresh_management_candidate_domain_subset(
        p_schedule_revision_id,
        v_final_card_ids
      );
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', card.id,
          'blockIndex', card.block_index,
          'durationPeriods', card.duration_periods,
          'locked', card.locked,
          'createdAt', card.created_at
        )
        order by card.block_index, card.id
      ),
      '[]'::jsonb
    )
    into v_created_snapshots
    from public.schedule_cards card
    where card.schedule_revision_id = p_schedule_revision_id
      and card.requirement_id = v_requirement_id;

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
        'engine_version', 'WORKSPACE_V11-v1',
        'requirement_id', v_requirement_id,
        'before', v_preview -> 'current',
        'after', v_preview -> 'proposed',
        'preserved_card_count', 0,
        'removed_card_count', 0,
        'created_card_count', jsonb_array_length(v_preview -> 'createdBlocks'),
        'revertible', true,
        'preserved_cards', '[]'::jsonb,
        'removed_card_snapshots', '[]'::jsonb,
        'created_card_snapshots', v_created_snapshots
      )
    );

    v_lifecycle_card_change_count :=
      v_lifecycle_card_change_count
      + jsonb_array_length(v_preview -> 'createdBlocks');
  end loop;

  v_intermediate_snapshot := public.management_preview_solver_snapshot(
    p_schedule_revision_id,
    null
  );

  v_workspace_result := public.management_commit_workspace_v10(
    p_schedule_revision_id,
    p_requirement_set_id,
    p_expected_revision_version,
    v_intermediate_snapshot ->> 'snapshotHash',
    v_intermediate_snapshot ->> 'baselineHash',
    v_remaining_changes,
    p_requirement_changes,
    p_resource_changes,
    p_teacher_planning_changes,
    p_teacher_availability_changes,
    p_room_profile_changes,
    p_resource_creates,
    p_resource_deletes,
    v_active_structure_changes
  );

  v_final_snapshot := public.management_preview_solver_snapshot(
    p_schedule_revision_id,
    null
  );

  return v_workspace_result || jsonb_build_object(
    'changedCardCount',
      coalesce((v_workspace_result ->> 'changedCardCount')::integer, 0)
      + coalesce((v_pre_workspace_result ->> 'changedCardCount')::integer, 0),
    'removeCount',
      coalesce((v_workspace_result ->> 'removeCount')::integer, 0)
      + coalesce((v_pre_workspace_result ->> 'removeCount')::integer, 0),
    'moveCount',
      coalesce((v_workspace_result ->> 'moveCount')::integer, 0)
      + coalesce((v_pre_workspace_result ->> 'moveCount')::integer, 0),
    'placeCount',
      coalesce((v_workspace_result ->> 'placeCount')::integer, 0)
      + coalesce((v_pre_workspace_result ->> 'placeCount')::integer, 0),
    'changedStructureCount',
      coalesce((v_workspace_result ->> 'changedStructureCount')::integer, 0)
      + v_lifecycle_count,
    'changedStructuralCardCount',
      coalesce((v_workspace_result ->> 'changedStructuralCardCount')::integer, 0)
      + v_lifecycle_card_change_count,
    'previousSnapshotHash', p_expected_snapshot_hash,
    'previousBaselineHash', p_expected_baseline_hash,
    'snapshotHash', v_final_snapshot ->> 'snapshotHash',
    'baselineHash', v_final_snapshot ->> 'baselineHash'
  );
end
$function$


revoke all on function public.management_commit_workspace_v11(
  uuid, uuid, integer, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;

grant execute on function public.management_commit_workspace_v11(
  uuid, uuid, integer, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;

comment on function public.management_commit_workspace_v11(
  uuid, uuid, integer, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) is
  'Workspace v11 atomic commit. Adds ACTIVE/INACTIVE requirement lifecycle transitions to v10: staged deactivation removals first, server-primitive deactivation, client-UUID activation cards, then remaining v10 workspace deltas in one transaction.';
