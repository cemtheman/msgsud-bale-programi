do $hardening$
declare
  v_def text;
  v_before text;
  v_after text;
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='management_commit_workspace_v10'
    and p.prokind='f'
  limit 1;

  if v_def is null then
    raise exception 'WORKSPACE_V10 staged-removal hardening target not found';
  end if;

  if position('v_pre_structure_changes jsonb' in v_def) > 0 then
    return;
  end if;

  v_before := E'  v_deleted_count integer := 0;\n';
  v_after := E'  v_deleted_count integer := 0;\n'
    || E'  v_pre_structure_changes jsonb := ''[]''::jsonb;\n'
    || E'  v_remaining_changes jsonb := ''[]''::jsonb;\n'
    || E'  v_pre_workspace_result jsonb := ''{}''::jsonb;\n';

  if position(v_before in v_def) = 0 then
    raise exception 'WORKSPACE_V10 declaration target not found';
  end if;
  v_def := replace(v_def, v_before, v_after);

  v_before := E'  for v_change in\n';

  v_after := E'  select coalesce(jsonb_agg(change.value order by change.value ->> ''card_id''), ''[]''::jsonb)\n'
    || E'  into v_pre_structure_changes\n'
    || E'  from jsonb_array_elements(p_changes) change(value)\n'
    || E'  where change.value #>> ''{after,day_of_week}'' is null\n'
    || E'    and change.value #>> ''{after,start_period}'' is null\n'
    || E'    and change.value #>> ''{after,teacher_id}'' is null\n'
    || E'    and change.value #>> ''{after,room_id}'' is null\n'
    || E'    and exists (\n'
    || E'      select 1\n'
    || E'      from jsonb_array_elements(p_structure_changes) structure(value)\n'
    || E'      where exists (\n'
    || E'        select 1\n'
    || E'        from public.schedule_cards card\n'
    || E'        where card.id = (change.value ->> ''card_id'')::uuid\n'
    || E'          and card.schedule_revision_id = p_schedule_revision_id\n'
    || E'          and card.requirement_id = (structure.value ->> ''requirement_id'')::uuid\n'
    || E'      )\n'
    || E'        and not exists (\n'
    || E'          select 1\n'
    || E'          from jsonb_array_elements(structure.value -> ''final_cards'') final(value)\n'
    || E'          where final.value ->> ''card_id'' = change.value ->> ''card_id''\n'
    || E'        )\n'
    || E'    );\n\n'
    || E'  select coalesce(jsonb_agg(change.value order by change.value ->> ''card_id''), ''[]''::jsonb)\n'
    || E'  into v_remaining_changes\n'
    || E'  from jsonb_array_elements(p_changes) change(value)\n'
    || E'  where not exists (\n'
    || E'    select 1\n'
    || E'    from jsonb_array_elements(v_pre_structure_changes) staged(value)\n'
    || E'    where staged.value ->> ''card_id'' = change.value ->> ''card_id''\n'
    || E'  );\n\n'
    || E'  if jsonb_array_length(v_pre_structure_changes) > 0 then\n'
    || E'    v_pre_workspace_result := public.management_commit_workspace_v9(\n'
    || E'      p_schedule_revision_id,\n'
    || E'      p_requirement_set_id,\n'
    || E'      p_expected_revision_version,\n'
    || E'      p_expected_snapshot_hash,\n'
    || E'      p_expected_baseline_hash,\n'
    || E'      v_pre_structure_changes,\n'
    || E'      ''[]''::jsonb,\n'
    || E'      ''[]''::jsonb,\n'
    || E'      ''[]''::jsonb,\n'
    || E'      ''[]''::jsonb,\n'
    || E'      ''[]''::jsonb,\n'
    || E'      ''[]''::jsonb,\n'
    || E'      ''[]''::jsonb\n'
    || E'    );\n\n'
    || E'    v_current_snapshot := public.management_preview_solver_snapshot(\n'
    || E'      p_schedule_revision_id,\n'
    || E'      null\n'
    || E'    );\n'
    || E'  end if;\n\n'
    || E'  for v_change in\n';

  if position(v_before in v_def) = 0 then
    raise exception 'WORKSPACE_V10 pre-structure loop target not found';
  end if;
  v_def := replace(v_def, v_before, v_after);

  v_before := E'    p_changes,\n'
    || E'    p_requirement_changes,\n';

  v_after := E'    v_remaining_changes,\n'
    || E'    p_requirement_changes,\n';

  if position(v_before in v_def) = 0 then
    raise exception 'WORKSPACE_V10 final v9 changes target not found';
  end if;
  v_def := replace(v_def, v_before, v_after);

  v_before := E'  return v_workspace_result || jsonb_build_object(\n'
    || E'    ''changedStructureCount'', v_structure_count,\n'
    || E'    ''changedStructuralCardCount'', v_structural_card_change_count,\n';

  v_after := E'  return v_workspace_result || jsonb_build_object(\n'
    || E'    ''changedCardCount'',\n'
    || E'      coalesce((v_workspace_result ->> ''changedCardCount'')::integer, 0)\n'
    || E'      + coalesce((v_pre_workspace_result ->> ''changedCardCount'')::integer, 0),\n'
    || E'    ''removeCount'',\n'
    || E'      coalesce((v_workspace_result ->> ''removeCount'')::integer, 0)\n'
    || E'      + coalesce((v_pre_workspace_result ->> ''removeCount'')::integer, 0),\n'
    || E'    ''moveCount'',\n'
    || E'      coalesce((v_workspace_result ->> ''moveCount'')::integer, 0)\n'
    || E'      + coalesce((v_pre_workspace_result ->> ''moveCount'')::integer, 0),\n'
    || E'    ''placeCount'',\n'
    || E'      coalesce((v_workspace_result ->> ''placeCount'')::integer, 0)\n'
    || E'      + coalesce((v_pre_workspace_result ->> ''placeCount'')::integer, 0),\n'
    || E'    ''changedStructureCount'', v_structure_count,\n'
    || E'    ''changedStructuralCardCount'', v_structural_card_change_count,\n';

  if position(v_before in v_def) = 0 then
    raise exception 'WORKSPACE_V10 return aggregation target not found';
  end if;
  v_def := replace(v_def, v_before, v_after);

  execute v_def;
end
$hardening$;

comment on function public.management_commit_workspace_v10(
  uuid, uuid, integer, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) is
  'Workspace v10 atomic commit. Applies staged placement removals required by structural shrink first, then ACTIVE structure/card-graph changes under server preview verification, then remaining v9 deltas; all in one transaction with STRUCTURE_APPLY history barriers.';
