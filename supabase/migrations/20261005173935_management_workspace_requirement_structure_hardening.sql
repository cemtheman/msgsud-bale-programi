do $hardening$
declare
  v_def text;
  v_before text;
  v_after text;
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'management_commit_workspace_v10'
    and p.prokind = 'f'
  limit 1;

  if v_def is null then
    raise exception 'WORKSPACE_V10 hardening target not found';
  end if;

  if position(E'  v_deleted_count integer := 0;\n' in v_def) > 0 then
    return;
  end if;

  v_before := E'  v_structural_card_change_count integer := 0;\n';
  v_after := E'  v_structural_card_change_count integer := 0;\n  v_deleted_count integer := 0;\n';

  if position(v_before in v_def) = 0 then
    raise exception 'WORKSPACE_V10 declaration hardening target not found';
  end if;

  v_def := replace(v_def, v_before, v_after);

  v_before := E'    delete from public.schedule_cards card\n'
    || E'    using jsonb_array_elements(v_preview -> ''removedCards'') impact(value)\n'
    || E'    where card.id = (impact.value ->> ''cardId'')::uuid\n'
    || E'      and card.schedule_revision_id = p_schedule_revision_id\n'
    || E'      and card.requirement_id = v_requirement_id\n'
    || E'      and not card.locked\n'
    || E'      and not exists (\n'
    || E'        select 1 from public.placements placement\n'
    || E'        where placement.card_id = card.id\n'
    || E'      );\n\n'
    || E'    if found is false\n'
    || E'       and jsonb_array_length(v_preview -> ''removedCards'') > 0 then\n'
    || E'      raise exception ''WORKSPACE_V10_STRUCTURE_CARD_GRAPH_STALE: removal'';\n'
    || E'    end if;\n';

  v_after := E'    delete from public.schedule_cards card\n'
    || E'    using jsonb_array_elements(v_preview -> ''removedCards'') impact(value)\n'
    || E'    where card.id = (impact.value ->> ''cardId'')::uuid\n'
    || E'      and card.schedule_revision_id = p_schedule_revision_id\n'
    || E'      and card.requirement_id = v_requirement_id\n'
    || E'      and not card.locked\n'
    || E'      and not exists (\n'
    || E'        select 1 from public.placements placement\n'
    || E'        where placement.card_id = card.id\n'
    || E'      );\n\n'
    || E'    get diagnostics v_deleted_count = row_count;\n\n'
    || E'    if v_deleted_count <> jsonb_array_length(v_preview -> ''removedCards'') then\n'
    || E'      raise exception ''WORKSPACE_V10_STRUCTURE_CARD_GRAPH_STALE: removal count'';\n'
    || E'    end if;\n';

  if position(v_before in v_def) = 0 then
    raise exception 'WORKSPACE_V10 delete hardening target not found';
  end if;

  v_def := replace(v_def, v_before, v_after);
  execute v_def;
end
$hardening$;

comment on function public.management_commit_workspace_v10(
  uuid, uuid, integer, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) is
  'Workspace v10 atomic commit. Applies ACTIVE requirement structure/card-graph changes with client card UUIDs under server preview verification and exact removal cardinality, writes STRUCTURE_APPLY history barriers, then commits remaining workspace deltas through v9 in one transaction.';
