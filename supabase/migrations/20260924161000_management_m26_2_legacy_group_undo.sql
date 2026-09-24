-- Management M26.2
-- Legacy visual-group recovery.
--
-- Before M26, a visual 5A+5B common lesson was removed as two independent
-- manual REMOVE roots. M26 introduced real bundle metadata, but older history
-- rows remain unbundled. This wrapper safely recognizes only the latest
-- contiguous set of legacy REMOVE roots requested by card id and undoes them
-- atomically inside one database transaction. The produced ROOT_UNDO rows are
-- tagged as a bundle so subsequent REDO uses the normal M26 bundle path.

begin;

create or replace function public.management_undo_card_group(
  p_card_ids jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_card_count integer;
  v_distinct_card_count integer;
  v_revision_id uuid;
  v_root_count integer;
  v_min_history_sequence bigint;
  v_latest_active_count integer;
  v_latest_structure_sequence bigint;
  v_bundle_id uuid;
  v_root_id uuid;
  v_bundle_index integer;
  v_undo_id uuid;
  v_last_undo_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M26.2 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_card_ids is null or jsonb_typeof(p_card_ids) <> 'array' then
    raise exception 'M26.2 legacy group undo requires a JSON card-id array';
  end if;

  v_card_count := jsonb_array_length(p_card_ids);

  if v_card_count < 2 or v_card_count > 24 then
    raise exception 'M26.2 legacy group undo requires 2..24 cards';
  end if;

  select count(distinct entry.value)
  into v_distinct_card_count
  from jsonb_array_elements_text(p_card_ids) as entry(value);

  if v_distinct_card_count <> v_card_count then
    raise exception 'M26.2 legacy group undo contains duplicate card ids';
  end if;

  select
    root.schedule_revision_id,
    count(*),
    min(root.history_sequence)
  into
    v_revision_id,
    v_root_count,
    v_min_history_sequence
  from public.move_transactions root
  where root.actor_type = 'USER'
    and root.action = 'REMOVE'
    and root.root_transaction_id is null
    and root.parent_transaction_id is null
    and root.reverted_at is null
    and root.payload ->> 'source' in ('MANUAL', 'ROOT_REDO')
    and root.payload ->> 'bundle_id' is null
    and root.payload ->> 'card_id' in (
      select entry.value
      from jsonb_array_elements_text(p_card_ids) as entry(value)
    )
  group by root.schedule_revision_id
  order by max(root.history_sequence) desc
  limit 1;

  if v_revision_id is null or v_root_count <> v_card_count then
    raise exception
      'M26.2 active legacy REMOVE roots do not match requested visual group';
  end if;

  select count(*)
  into v_latest_active_count
  from public.move_transactions root
  where root.schedule_revision_id = v_revision_id
    and root.actor_type = 'USER'
    and root.action in ('PLACE', 'MOVE', 'REMOVE')
    and root.root_transaction_id is null
    and root.parent_transaction_id is null
    and root.reverted_at is null
    and root.payload ->> 'source' in ('MANUAL', 'ROOT_REDO')
    and root.history_sequence >= v_min_history_sequence;

  if v_latest_active_count <> v_card_count then
    raise exception
      'M26.2 legacy group undo requires the requested cards to be the latest contiguous scheduling roots';
  end if;

  select max(barrier.history_sequence)
  into v_latest_structure_sequence
  from public.move_transactions barrier
  where barrier.schedule_revision_id = v_revision_id
    and barrier.actor_type = 'USER'
    and barrier.action = 'STRUCTURE'
    and barrier.root_transaction_id is null
    and barrier.parent_transaction_id is null
    and barrier.payload ->> 'source'
      in ('STRUCTURE_APPLY', 'STRUCTURE_REVERT');

  if v_latest_structure_sequence is not null
     and v_min_history_sequence < v_latest_structure_sequence then
    raise exception 'M26.2 undo cannot cross a structural history epoch';
  end if;

  select root.id
  into v_bundle_id
  from public.move_transactions root
  where root.schedule_revision_id = v_revision_id
    and root.actor_type = 'USER'
    and root.action = 'REMOVE'
    and root.root_transaction_id is null
    and root.parent_transaction_id is null
    and root.reverted_at is null
    and root.payload ->> 'bundle_id' is null
    and root.payload ->> 'card_id' in (
      select entry.value
      from jsonb_array_elements_text(p_card_ids) as entry(value)
    )
  order by root.history_sequence desc
  limit 1;

  v_bundle_index := v_card_count;

  for v_root_id in
    select root.id
    from public.move_transactions root
    where root.schedule_revision_id = v_revision_id
      and root.actor_type = 'USER'
      and root.action = 'REMOVE'
      and root.root_transaction_id is null
      and root.parent_transaction_id is null
      and root.reverted_at is null
      and root.payload ->> 'bundle_id' is null
      and root.payload ->> 'card_id' in (
        select entry.value
        from jsonb_array_elements_text(p_card_ids) as entry(value)
      )
    order by root.history_sequence desc
  loop
    v_undo_id := public.undo_management_root_transaction(v_root_id);

    update public.move_transactions transaction
    set payload = coalesce(transaction.payload, '{}'::jsonb) || jsonb_build_object(
      'bundle_id', v_bundle_id,
      'bundle_index', v_bundle_index,
      'bundle_size', v_card_count,
      'bundle_card_ids', p_card_ids,
      'bundle_engine_version', 'M26.2-legacy-recovery'
    )
    where transaction.id = v_undo_id;

    v_last_undo_id := v_undo_id;
    v_bundle_index := v_bundle_index - 1;
  end loop;

  if v_last_undo_id is null then
    raise exception 'M26.2 legacy group produced no undo transaction';
  end if;

  return v_last_undo_id;
end
$$;

revoke all
  on function public.management_undo_card_group(jsonb)
  from public, anon;

grant execute
  on function public.management_undo_card_group(jsonb)
  to authenticated;

comment on function public.management_undo_card_group(jsonb) is
  'M26.2 atomic recovery for the latest contiguous pre-M26 visual-group REMOVE roots. Tags generated ROOT_UNDO rows as one bundle so normal M26 REDO applies thereafter.';

commit;
