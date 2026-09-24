-- Management M26
-- Atomic bundle operations for visually grouped class cards.
-- One browser action may represent multiple underlying schedule cards while
-- preserving the existing per-card scheduling engine, propagation and audit log.

begin;

create or replace function public.management_tag_bundle_root(
  p_root_transaction_id uuid,
  p_bundle_id uuid,
  p_bundle_index integer,
  p_bundle_size integer,
  p_bundle_card_ids jsonb
)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  update public.move_transactions transaction
  set payload = coalesce(transaction.payload, '{}'::jsonb) || jsonb_build_object(
    'bundle_id', p_bundle_id,
    'bundle_index', p_bundle_index,
    'bundle_size', p_bundle_size,
    'bundle_card_ids', p_bundle_card_ids,
    'bundle_engine_version', 'M26-v1'
  )
  where transaction.id = p_root_transaction_id
     or transaction.root_transaction_id = p_root_transaction_id;

  if not found then
    raise exception 'M26 bundle root transaction not found: %',
      p_root_transaction_id;
  end if;
end
$$;

revoke all
  on function public.management_tag_bundle_root(uuid, uuid, integer, integer, jsonb)
  from public, anon, authenticated;


create or replace function public.management_place_card_bundle(
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_index integer;
  v_bundle_size integer;
  v_distinct_card_count integer;
  v_bundle_card_ids jsonb;
  v_bundle_id uuid;
  v_transaction_id uuid;
  v_last_transaction_id uuid;
  v_card_id uuid;
  v_day_of_week smallint;
  v_start_period smallint;
  v_teacher_id uuid;
  v_room_id uuid;
  v_existing_day smallint;
  v_existing_start smallint;
  v_existing_teacher uuid;
  v_existing_room uuid;
  v_existing_bundle_id text;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M26 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'M26 PLACE bundle requires a JSON array';
  end if;

  v_bundle_size := jsonb_array_length(p_items);
  if v_bundle_size < 1 or v_bundle_size > 24 then
    raise exception 'M26 PLACE bundle requires 1..24 cards';
  end if;

  select
    count(distinct entry.value ->> 'card_id'),
    jsonb_agg(entry.value ->> 'card_id' order by entry.ordinality)
  into
    v_distinct_card_count,
    v_bundle_card_ids
  from jsonb_array_elements(p_items) with ordinality
    as entry(value, ordinality);

  if v_distinct_card_count <> v_bundle_size then
    raise exception 'M26 PLACE bundle contains duplicate card ids';
  end if;

  for v_item, v_index in
    select entry.value, entry.ordinality::integer
    from jsonb_array_elements(p_items) with ordinality
      as entry(value, ordinality)
  loop
    v_card_id := nullif(v_item ->> 'card_id', '')::uuid;
    v_day_of_week := nullif(v_item ->> 'day_of_week', '')::smallint;
    v_start_period := nullif(v_item ->> 'start_period', '')::smallint;
    v_teacher_id := nullif(v_item ->> 'teacher_id', '')::uuid;
    v_room_id := nullif(v_item ->> 'room_id', '')::uuid;

    if v_card_id is null
       or v_day_of_week is null
       or v_start_period is null
       or v_teacher_id is null
       or v_room_id is null then
      raise exception 'M26 PLACE bundle item % is incomplete', v_index;
    end if;

    select
      placement.day_of_week,
      placement.start_period,
      placement.teacher_id,
      placement.room_id,
      coalesce(
        transaction.payload ->> 'bundle_id',
        root.payload ->> 'bundle_id'
      )
    into
      v_existing_day,
      v_existing_start,
      v_existing_teacher,
      v_existing_room,
      v_existing_bundle_id
    from public.placements placement
    left join public.move_transactions transaction
      on transaction.id = placement.move_transaction_id
    left join public.move_transactions root
      on root.id = transaction.root_transaction_id
    where placement.card_id = v_card_id;

    if found then
      if v_bundle_id is not null
         and v_existing_bundle_id = v_bundle_id::text
         and v_existing_day = v_day_of_week
         and v_existing_start = v_start_period
         and v_existing_teacher = v_teacher_id
         and v_existing_room = v_room_id then
        continue;
      end if;

      raise exception 'M26 PLACE bundle encountered an already placed card: %',
        v_card_id;
    end if;

    v_transaction_id := public.place_management_card(
      v_card_id,
      v_day_of_week,
      v_start_period,
      v_teacher_id,
      v_room_id
    );

    if v_bundle_id is null then
      v_bundle_id := v_transaction_id;
    end if;

    perform public.management_tag_bundle_root(
      v_transaction_id,
      v_bundle_id,
      v_index,
      v_bundle_size,
      v_bundle_card_ids
    );

    v_last_transaction_id := v_transaction_id;
  end loop;

  if v_bundle_id is null then
    raise exception 'M26 PLACE bundle produced no transaction';
  end if;

  return coalesce(v_last_transaction_id, v_bundle_id);
end
$$;


create or replace function public.management_move_card_bundle(
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_item jsonb;
  v_index integer;
  v_bundle_size integer;
  v_distinct_card_count integer;
  v_bundle_card_ids jsonb;
  v_bundle_id uuid;
  v_transaction_id uuid;
  v_last_transaction_id uuid;
  v_card_id uuid;
  v_day_of_week smallint;
  v_start_period smallint;
  v_teacher_id uuid;
  v_room_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M26 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'M26 MOVE bundle requires a JSON array';
  end if;

  v_bundle_size := jsonb_array_length(p_items);
  if v_bundle_size < 1 or v_bundle_size > 24 then
    raise exception 'M26 MOVE bundle requires 1..24 cards';
  end if;

  select
    count(distinct entry.value ->> 'card_id'),
    jsonb_agg(entry.value ->> 'card_id' order by entry.ordinality)
  into
    v_distinct_card_count,
    v_bundle_card_ids
  from jsonb_array_elements(p_items) with ordinality
    as entry(value, ordinality);

  if v_distinct_card_count <> v_bundle_size then
    raise exception 'M26 MOVE bundle contains duplicate card ids';
  end if;

  for v_item, v_index in
    select entry.value, entry.ordinality::integer
    from jsonb_array_elements(p_items) with ordinality
      as entry(value, ordinality)
  loop
    v_card_id := nullif(v_item ->> 'card_id', '')::uuid;
    v_day_of_week := nullif(v_item ->> 'day_of_week', '')::smallint;
    v_start_period := nullif(v_item ->> 'start_period', '')::smallint;
    v_teacher_id := nullif(v_item ->> 'teacher_id', '')::uuid;
    v_room_id := nullif(v_item ->> 'room_id', '')::uuid;

    if v_card_id is null
       or v_day_of_week is null
       or v_start_period is null
       or v_teacher_id is null
       or v_room_id is null then
      raise exception 'M26 MOVE bundle item % is incomplete', v_index;
    end if;

    v_transaction_id := public.move_management_card(
      v_card_id,
      v_day_of_week,
      v_start_period,
      v_teacher_id,
      v_room_id
    );

    if v_bundle_id is null then
      v_bundle_id := v_transaction_id;
    end if;

    perform public.management_tag_bundle_root(
      v_transaction_id,
      v_bundle_id,
      v_index,
      v_bundle_size,
      v_bundle_card_ids
    );

    v_last_transaction_id := v_transaction_id;
  end loop;

  if v_bundle_id is null then
    raise exception 'M26 MOVE bundle produced no transaction';
  end if;

  return coalesce(v_last_transaction_id, v_bundle_id);
end
$$;


create or replace function public.management_remove_card_bundle(
  p_card_ids jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_card_id_text text;
  v_index integer;
  v_bundle_size integer;
  v_distinct_card_count integer;
  v_bundle_id uuid;
  v_transaction_id uuid;
  v_last_transaction_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M26 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_card_ids is null or jsonb_typeof(p_card_ids) <> 'array' then
    raise exception 'M26 REMOVE bundle requires a JSON array';
  end if;

  v_bundle_size := jsonb_array_length(p_card_ids);
  if v_bundle_size < 1 or v_bundle_size > 24 then
    raise exception 'M26 REMOVE bundle requires 1..24 cards';
  end if;

  select count(distinct entry.value)
  into v_distinct_card_count
  from jsonb_array_elements_text(p_card_ids) as entry(value);

  if v_distinct_card_count <> v_bundle_size then
    raise exception 'M26 REMOVE bundle contains duplicate card ids';
  end if;

  for v_card_id_text, v_index in
    select entry.value, entry.ordinality::integer
    from jsonb_array_elements_text(p_card_ids) with ordinality
      as entry(value, ordinality)
  loop
    v_transaction_id := public.remove_management_card(
      nullif(v_card_id_text, '')::uuid
    );

    if v_bundle_id is null then
      v_bundle_id := v_transaction_id;
    end if;

    perform public.management_tag_bundle_root(
      v_transaction_id,
      v_bundle_id,
      v_index,
      v_bundle_size,
      p_card_ids
    );

    v_last_transaction_id := v_transaction_id;
  end loop;

  if v_bundle_id is null then
    raise exception 'M26 REMOVE bundle produced no transaction';
  end if;

  return coalesce(v_last_transaction_id, v_bundle_id);
end
$$;


create or replace function public.management_undo_bundle(
  p_root_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_history_sequence bigint;
  v_bundle_id uuid;
  v_bundle_size integer;
  v_bundle_card_ids jsonb;
  v_latest_structure_sequence bigint;
  v_root_id uuid;
  v_bundle_index integer;
  v_undo_id uuid;
  v_last_undo_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M26 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    transaction.schedule_revision_id,
    transaction.history_sequence,
    nullif(transaction.payload ->> 'bundle_id', '')::uuid,
    coalesce((transaction.payload ->> 'bundle_size')::integer, 1),
    coalesce(transaction.payload -> 'bundle_card_ids', '[]'::jsonb)
  into
    v_revision_id,
    v_history_sequence,
    v_bundle_id,
    v_bundle_size,
    v_bundle_card_ids
  from public.move_transactions transaction
  where transaction.id = p_root_transaction_id
    and transaction.actor_type = 'USER'
    and transaction.root_transaction_id is null
    and transaction.parent_transaction_id is null
    and transaction.reverted_at is null
    and transaction.payload ->> 'source' in ('MANUAL', 'ROOT_REDO');

  if v_bundle_id is null then
    raise exception 'M26 active bundle root not found: %',
      p_root_transaction_id;
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
     and v_history_sequence < v_latest_structure_sequence then
    raise exception 'M26 undo cannot cross a structural history epoch';
  end if;

  for v_root_id, v_bundle_index in
    select
      root.id,
      coalesce((root.payload ->> 'bundle_index')::integer, 1)
    from public.move_transactions root
    where root.schedule_revision_id = v_revision_id
      and root.actor_type = 'USER'
      and root.root_transaction_id is null
      and root.parent_transaction_id is null
      and root.reverted_at is null
      and root.payload ->> 'source' in ('MANUAL', 'ROOT_REDO')
      and root.payload ->> 'bundle_id' = v_bundle_id::text
    order by root.history_sequence desc, root.id::text desc
  loop
    v_undo_id := public.undo_management_root_transaction(v_root_id);

    update public.move_transactions transaction
    set payload = coalesce(transaction.payload, '{}'::jsonb) || jsonb_build_object(
      'bundle_id', v_bundle_id,
      'bundle_index', v_bundle_index,
      'bundle_size', v_bundle_size,
      'bundle_card_ids', v_bundle_card_ids,
      'bundle_engine_version', 'M26-v1'
    )
    where transaction.id = v_undo_id;

    v_last_undo_id := v_undo_id;
  end loop;

  if v_last_undo_id is null then
    raise exception 'M26 bundle has no active roots to undo: %',
      v_bundle_id;
  end if;

  return v_last_undo_id;
end
$$;


create or replace function public.management_redo_bundle(
  p_undo_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_history_sequence bigint;
  v_bundle_id uuid;
  v_bundle_size integer;
  v_bundle_card_ids jsonb;
  v_latest_structure_sequence bigint;
  v_undo_id uuid;
  v_bundle_index integer;
  v_redo_id uuid;
  v_last_redo_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M26 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    transaction.schedule_revision_id,
    transaction.history_sequence,
    nullif(transaction.payload ->> 'bundle_id', '')::uuid,
    coalesce((transaction.payload ->> 'bundle_size')::integer, 1),
    coalesce(transaction.payload -> 'bundle_card_ids', '[]'::jsonb)
  into
    v_revision_id,
    v_history_sequence,
    v_bundle_id,
    v_bundle_size,
    v_bundle_card_ids
  from public.move_transactions transaction
  where transaction.id = p_undo_transaction_id
    and transaction.actor_type = 'USER'
    and transaction.root_transaction_id is null
    and transaction.parent_transaction_id is null
    and transaction.payload ->> 'source' = 'ROOT_UNDO'
    and transaction.redone_at is null
    and transaction.redone_by_transaction_id is null;

  if v_bundle_id is null then
    raise exception 'M26 redoable bundle undo not found: %',
      p_undo_transaction_id;
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
     and v_history_sequence < v_latest_structure_sequence then
    raise exception 'M26 redo cannot cross a structural history epoch';
  end if;

  for v_undo_id, v_bundle_index in
    select
      undo_tx.id,
      coalesce((undo_tx.payload ->> 'bundle_index')::integer, 1)
    from public.move_transactions undo_tx
    where undo_tx.schedule_revision_id = v_revision_id
      and undo_tx.actor_type = 'USER'
      and undo_tx.root_transaction_id is null
      and undo_tx.parent_transaction_id is null
      and undo_tx.payload ->> 'source' = 'ROOT_UNDO'
      and undo_tx.payload ->> 'bundle_id' = v_bundle_id::text
      and undo_tx.redone_at is null
      and undo_tx.redone_by_transaction_id is null
    order by undo_tx.history_sequence desc, undo_tx.id::text desc
  loop
    v_redo_id := public.redo_management_undo_transaction(v_undo_id);

    perform public.management_tag_bundle_root(
      v_redo_id,
      v_bundle_id,
      v_bundle_index,
      v_bundle_size,
      v_bundle_card_ids
    );

    v_last_redo_id := v_redo_id;
  end loop;

  if v_last_redo_id is null then
    raise exception 'M26 bundle has no redoable undo rows: %',
      v_bundle_id;
  end if;

  return v_last_redo_id;
end
$$;


revoke all
  on function public.management_place_card_bundle(jsonb)
  from public, anon;
revoke all
  on function public.management_move_card_bundle(jsonb)
  from public, anon;
revoke all
  on function public.management_remove_card_bundle(jsonb)
  from public, anon;
revoke all
  on function public.management_undo_bundle(uuid)
  from public, anon;
revoke all
  on function public.management_redo_bundle(uuid)
  from public, anon;

grant execute
  on function public.management_place_card_bundle(jsonb)
  to authenticated;
grant execute
  on function public.management_move_card_bundle(jsonb)
  to authenticated;
grant execute
  on function public.management_remove_card_bundle(jsonb)
  to authenticated;
grant execute
  on function public.management_undo_bundle(uuid)
  to authenticated;
grant execute
  on function public.management_redo_bundle(uuid)
  to authenticated;

comment on function public.management_place_card_bundle(jsonb) is
  'M26 atomic grouped PLACE. Executes the existing per-card engine inside one database transaction and tags all generated roots/descendants as one user-visible bundle.';
comment on function public.management_move_card_bundle(jsonb) is
  'M26 atomic grouped MOVE. All explicit cards succeed or the complete RPC rolls back.';
comment on function public.management_remove_card_bundle(jsonb) is
  'M26 atomic grouped REMOVE. All explicit cards return to the pool or the complete RPC rolls back.';
comment on function public.management_undo_bundle(uuid) is
  'M26 atomic bundle undo. Replays the existing LIFO undo engine for every active bundle root inside one transaction.';
comment on function public.management_redo_bundle(uuid) is
  'M26 atomic bundle redo. Replays all pending bundle ROOT_UNDO rows in safe LIFO order inside one transaction.';

commit;
