CREATE OR REPLACE FUNCTION public.management_commit_workspace_v10(p_schedule_revision_id uuid, p_requirement_set_id uuid, p_expected_revision_version integer, p_expected_snapshot_hash text, p_expected_baseline_hash text, p_changes jsonb, p_requirement_changes jsonb, p_resource_changes jsonb, p_teacher_planning_changes jsonb, p_teacher_availability_changes jsonb, p_room_profile_changes jsonb, p_resource_creates jsonb, p_resource_deletes jsonb, p_structure_changes jsonb)
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
  v_change jsonb;
  v_requirement_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_final_cards jsonb;
  v_preview jsonb;
  v_preferred smallint[];
  v_removed_snapshots jsonb;
  v_created_snapshots jsonb;
  v_final_card_ids uuid[];
  v_structure_count integer;
  v_distinct_count integer;
  v_structural_card_change_count integer := 0;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'WORKSPACE_V10_EDITOR_REQUIRED'
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

  if jsonb_typeof(p_structure_changes) is distinct from 'array' then
    raise exception 'WORKSPACE_V10_STRUCTURE_INVALID';
  end if;

  v_structure_count := jsonb_array_length(p_structure_changes);
  if v_structure_count > 100 then
    raise exception 'WORKSPACE_V10_STRUCTURE_TOO_LARGE';
  end if;

  select count(distinct entry.value ->> 'requirement_id')::integer
  into v_distinct_count
  from jsonb_array_elements(p_structure_changes) entry(value);

  if v_distinct_count <> v_structure_count then
    raise exception 'WORKSPACE_V10_DUPLICATE_STRUCTURE_CHANGE';
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

  for v_change in
    select entry.value
    from jsonb_array_elements(p_structure_changes) entry(value)
    order by entry.value ->> 'requirement_id'
  loop
    begin
      v_requirement_id := nullif(v_change ->> 'requirement_id', '')::uuid;
    exception when others then
      raise exception 'WORKSPACE_V10_STRUCTURE_INVALID';
    end;

    v_before := v_change -> 'before';
    v_after := v_change -> 'after';
    v_final_cards := v_change -> 'final_cards';

    if v_requirement_id is null
       or jsonb_typeof(v_before) is distinct from 'object'
       or jsonb_typeof(v_after) is distinct from 'object'
       or jsonb_typeof(v_final_cards) is distinct from 'array'
       or (v_before ->> 'term_status') is distinct from 'ACTIVE'
       or (v_after ->> 'term_status') is distinct from 'ACTIVE'
       or jsonb_typeof(v_before -> 'preferred_partition') is distinct from 'array'
       or jsonb_typeof(v_after -> 'preferred_partition') is distinct from 'array'
       or jsonb_typeof(v_before -> 'allowed_partitions') is distinct from 'array'
       or jsonb_typeof(v_after -> 'allowed_partitions') is distinct from 'array' then
      raise exception 'WORKSPACE_V10_STRUCTURE_INVALID';
    end if;

    if not exists (
      select 1
      from public.course_requirements requirement
      where requirement.id = v_requirement_id
        and requirement.requirement_set_id = p_requirement_set_id
        and requirement.term_status = 'ACTIVE'
    ) then
      raise exception 'WORKSPACE_V10_STRUCTURE_REQUIREMENT_NOT_ACTIVE: %',
        v_requirement_id;
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
      'ACTIVE'
    );

    if (v_preview -> 'current' ->> 'weeklyLoad')
         is distinct from (v_before ->> 'weekly_load')
       or coalesce(v_preview -> 'current' -> 'preferredPartition', '[]'::jsonb)
         is distinct from coalesce(v_before -> 'preferred_partition', '[]'::jsonb)
       or coalesce(v_preview -> 'current' -> 'allowedPartitions', '[]'::jsonb)
         is distinct from coalesce(v_before -> 'allowed_partitions', '[]'::jsonb)
       or (v_preview -> 'current' ->> 'termStatus')
         is distinct from (v_before ->> 'term_status') then
      raise exception 'WORKSPACE_V10_STRUCTURE_BEFORE_STALE: %',
        v_requirement_id;
    end if;

    if not coalesce((v_preview ->> 'canApply')::boolean, false) then
      raise exception 'WORKSPACE_V10_STRUCTURE_BLOCKED: %',
        coalesce(v_preview -> 'blockReasons', '[]'::jsonb)::text;
    end if;

    if jsonb_array_length(v_final_cards)
         <> jsonb_array_length(v_after -> 'preferred_partition') then
      raise exception 'WORKSPACE_V10_STRUCTURE_GRAPH_MISMATCH: %',
        v_requirement_id;
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_final_cards) card(value)
      where nullif(card.value ->> 'card_id', '') is null
         or (card.value ->> 'block_index')::integer < 1
         or (card.value ->> 'block_index')::integer
              > jsonb_array_length(v_after -> 'preferred_partition')
         or (card.value ->> 'duration_periods')::integer <= 0
    ) then
      raise exception 'WORKSPACE_V10_STRUCTURE_INVALID';
    end if;

    if (
      select count(distinct (card.value ->> 'card_id'))
      from jsonb_array_elements(v_final_cards) card(value)
    ) <> jsonb_array_length(v_final_cards) then
      raise exception 'WORKSPACE_V10_STRUCTURE_GRAPH_MISMATCH: duplicate card id';
    end if;

    if (
      select count(distinct (card.value ->> 'block_index'))
      from jsonb_array_elements(v_final_cards) card(value)
    ) <> jsonb_array_length(v_final_cards) then
      raise exception 'WORKSPACE_V10_STRUCTURE_GRAPH_MISMATCH: duplicate block index';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_final_cards) card(value)
      join lateral (
        select item.value::integer as expected_duration
        from jsonb_array_elements_text(v_after -> 'preferred_partition')
          with ordinality as item(value, ordinality)
        where item.ordinality = (card.value ->> 'block_index')::integer
      ) expected on true
      where (card.value ->> 'duration_periods')::integer
        <> expected.expected_duration
    ) then
      raise exception 'WORKSPACE_V10_STRUCTURE_GRAPH_MISMATCH: duration';
    end if;

    if (
      select count(*)
      from jsonb_array_elements(v_final_cards) card(value)
      where coalesce((card.value ->> 'baseline_exists')::boolean, false)
    ) <> jsonb_array_length(v_preview -> 'preservedCards') then
      raise exception 'WORKSPACE_V10_STRUCTURE_GRAPH_MISMATCH: preserved count';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_preview -> 'preservedCards') impact(value)
      where not exists (
        select 1
        from jsonb_array_elements(v_final_cards) card(value)
        where coalesce((card.value ->> 'baseline_exists')::boolean, false)
          and card.value ->> 'card_id' = impact.value ->> 'cardId'
          and (card.value ->> 'block_index')::integer
              = (impact.value ->> 'proposedBlockIndex')::integer
          and (card.value ->> 'duration_periods')::integer
              = (impact.value ->> 'durationPeriods')::integer
      )
    ) then
      raise exception 'WORKSPACE_V10_STRUCTURE_GRAPH_MISMATCH: preserved cards';
    end if;

    if (
      select count(*)
      from jsonb_array_elements(v_final_cards) card(value)
      where not coalesce((card.value ->> 'baseline_exists')::boolean, false)
    ) <> jsonb_array_length(v_preview -> 'createdBlocks') then
      raise exception 'WORKSPACE_V10_STRUCTURE_GRAPH_MISMATCH: created count';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_preview -> 'createdBlocks') impact(value)
      where not exists (
        select 1
        from jsonb_array_elements(v_final_cards) card(value)
        where not coalesce((card.value ->> 'baseline_exists')::boolean, false)
          and (card.value ->> 'block_index')::integer
              = (impact.value ->> 'proposedBlockIndex')::integer
          and (card.value ->> 'duration_periods')::integer
              = (impact.value ->> 'durationPeriods')::integer
          and not coalesce((card.value ->> 'locked')::boolean, false)
      )
    ) then
      raise exception 'WORKSPACE_V10_STRUCTURE_GRAPH_MISMATCH: created cards';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_final_cards) card(value)
      where coalesce((card.value ->> 'baseline_exists')::boolean, false)
        and not exists (
          select 1
          from public.schedule_cards current_card
          where current_card.id = (card.value ->> 'card_id')::uuid
            and current_card.schedule_revision_id = p_schedule_revision_id
            and current_card.requirement_id = v_requirement_id
            and current_card.locked
                = coalesce((card.value ->> 'locked')::boolean, false)
        )
    ) then
      raise exception 'WORKSPACE_V10_STRUCTURE_CARD_GRAPH_STALE: %',
        v_requirement_id;
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_final_cards) card(value)
      where not coalesce((card.value ->> 'baseline_exists')::boolean, false)
        and exists (
          select 1
          from public.schedule_cards existing
          where existing.id = (card.value ->> 'card_id')::uuid
        )
    ) then
      raise exception 'WORKSPACE_V10_STRUCTURE_GRAPH_MISMATCH: client card id conflict';
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
    into v_removed_snapshots
    from jsonb_array_elements(v_preview -> 'removedCards') impact(value)
    join public.schedule_cards card
      on card.id = (impact.value ->> 'cardId')::uuid
     and card.schedule_revision_id = p_schedule_revision_id
     and card.requirement_id = v_requirement_id;

    delete from public.schedule_cards card
    using jsonb_array_elements(v_preview -> 'removedCards') impact(value)
    where card.id = (impact.value ->> 'cardId')::uuid
      and card.schedule_revision_id = p_schedule_revision_id
      and card.requirement_id = v_requirement_id
      and not card.locked
      and not exists (
        select 1 from public.placements placement
        where placement.card_id = card.id
      );

    if found is false
       and jsonb_array_length(v_preview -> 'removedCards') > 0 then
      raise exception 'WORKSPACE_V10_STRUCTURE_CARD_GRAPH_STALE: removal';
    end if;

    update public.schedule_cards card
    set block_index = (card.block_index + 1000)::smallint
    where card.schedule_revision_id = p_schedule_revision_id
      and card.requirement_id = v_requirement_id;

    update public.schedule_cards card
    set block_index = (impact.value ->> 'proposedBlockIndex')::smallint
    from jsonb_array_elements(v_preview -> 'preservedCards') impact(value)
    where card.id = (impact.value ->> 'cardId')::uuid
      and card.schedule_revision_id = p_schedule_revision_id
      and card.requirement_id = v_requirement_id;

    if exists (
      select 1
      from public.schedule_cards card
      where card.schedule_revision_id = p_schedule_revision_id
        and card.requirement_id = v_requirement_id
        and card.block_index >= 1000
    ) then
      raise exception 'WORKSPACE_V10_STRUCTURE_GRAPH_MISMATCH: preserved mapping';
    end if;

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
    from jsonb_array_elements(v_final_cards) card(value)
    where not coalesce((card.value ->> 'baseline_exists')::boolean, false);

    update public.course_requirements requirement
    set
      weekly_load = (v_after ->> 'weekly_load')::smallint,
      preferred_partition = v_after -> 'preferred_partition',
      allowed_partitions = v_after -> 'allowed_partitions',
      term_status = 'ACTIVE'
    where requirement.id = v_requirement_id
      and requirement.requirement_set_id = p_requirement_set_id;

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
    from jsonb_array_elements(v_final_cards) final(value)
    join public.schedule_cards card
      on card.id = (final.value ->> 'card_id')::uuid
    where not coalesce((final.value ->> 'baseline_exists')::boolean, false);

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
        'engine_version', 'WORKSPACE_V10-v1',
        'requirement_id', v_requirement_id,
        'before', v_preview -> 'current',
        'after', v_preview -> 'proposed',
        'preserved_card_count',
          jsonb_array_length(v_preview -> 'preservedCards'),
        'removed_card_count',
          jsonb_array_length(v_preview -> 'removedCards'),
        'created_card_count',
          jsonb_array_length(v_preview -> 'createdBlocks'),
        'revertible', true,
        'preserved_cards', v_preview -> 'preservedCards',
        'removed_card_snapshots', v_removed_snapshots,
        'created_card_snapshots', v_created_snapshots
      )
    );

    v_structural_card_change_count :=
      v_structural_card_change_count
      + jsonb_array_length(v_preview -> 'removedCards')
      + jsonb_array_length(v_preview -> 'createdBlocks')
      + (
          select count(*)::integer
          from jsonb_array_elements(v_preview -> 'preservedCards') impact(value)
          where (impact.value ->> 'currentBlockIndex')::integer
             <> (impact.value ->> 'proposedBlockIndex')::integer
        );
  end loop;

  v_intermediate_snapshot := public.management_preview_solver_snapshot(
    p_schedule_revision_id,
    null
  );

  v_workspace_result := public.management_commit_workspace_v9(
    p_schedule_revision_id,
    p_requirement_set_id,
    p_expected_revision_version,
    v_intermediate_snapshot ->> 'snapshotHash',
    v_intermediate_snapshot ->> 'baselineHash',
    p_changes,
    p_requirement_changes,
    p_resource_changes,
    p_teacher_planning_changes,
    p_teacher_availability_changes,
    p_room_profile_changes,
    p_resource_creates,
    p_resource_deletes
  );

  v_final_snapshot := public.management_preview_solver_snapshot(
    p_schedule_revision_id,
    null
  );

  return v_workspace_result || jsonb_build_object(
    'changedStructureCount', v_structure_count,
    'changedStructuralCardCount', v_structural_card_change_count,
    'snapshotHash', v_final_snapshot ->> 'snapshotHash',
    'baselineHash', v_final_snapshot ->> 'baselineHash'
  );
end
$function$


revoke all on function public.management_commit_workspace_v10(
  uuid, uuid, integer, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;

grant execute on function public.management_commit_workspace_v10(
  uuid, uuid, integer, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;

comment on function public.management_commit_workspace_v10(
  uuid, uuid, integer, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) is
  'Workspace v10 atomic commit. Applies ACTIVE requirement structure/card-graph changes with client card UUIDs under server preview verification and STRUCTURE_APPLY history barriers, then commits remaining workspace deltas through v9 in one transaction.';
