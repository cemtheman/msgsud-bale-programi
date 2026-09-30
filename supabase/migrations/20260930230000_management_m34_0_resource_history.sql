-- Management / M34.0
-- Unified resource history engine.
--
-- Adds RESOURCE as a first-class USER root action so the global Geri Al/Yinele
-- stack covers scheduling decisions and Kaynaklar mutations in one LIFO history.
-- Resource undo/redo is guarded by exact before/after snapshots and never changes
-- the published projection.

begin;

alter table public.move_transactions
  drop constraint if exists move_transactions_action_check;

alter table public.move_transactions
  add constraint move_transactions_action_check
  check (
    action in (
      'PLACE',
      'MOVE',
      'REMOVE',
      'LOCK',
      'UNLOCK',
      'STRUCTURE',
      'RESOURCE'
    )
  );


create or replace function public.management_assert_resource_history_revision(
  p_schedule_revision_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M34 management EDITOR role required'
      using errcode = '42501';
  end if;

  select revision.status
  into v_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id
  for update;

  if v_status is null then
    raise exception 'M34 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_status <> 'DRAFT' then
    raise exception 'M34 resource history requires DRAFT revision';
  end if;
end
$$;


create or replace function public.management_resource_history_state(
  p_schedule_revision_id uuid,
  p_resource_type text,
  p_resource_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state jsonb;
begin
  if p_resource_type = 'TEACHER' then
    select jsonb_build_object(
      'exists', true,
      'name', teacher.name,
      'operationalStatus', teacher.operational_status,
      'nameOverridden', override_row.teacher_id is not null,
      'displayName', coalesce(override_row.display_name, teacher.name)
    )
    into v_state
    from public.teachers teacher
    left join public.management_teacher_name_overrides override_row
      on override_row.schedule_revision_id = p_schedule_revision_id
     and override_row.teacher_id = teacher.id
    where teacher.id = p_resource_id;

  elsif p_resource_type = 'ROOM' then
    select jsonb_build_object(
      'exists', true,
      'name', room.name,
      'canonicalRoomId', room.canonical_room_id,
      'capabilities', to_jsonb(
        array(
          select capability
          from unnest(coalesce(room.capabilities, array[]::text[])) capability
          order by capability
        )
      ),
      'knowledgeStatus', room.knowledge_status,
      'operationalStatus', room.operational_status,
      'nameOverridden', override_row.room_id is not null,
      'displayName', coalesce(override_row.display_name, room.name)
    )
    into v_state
    from public.rooms room
    left join public.management_room_name_overrides override_row
      on override_row.schedule_revision_id = p_schedule_revision_id
     and override_row.room_id = room.id
    where room.id = p_resource_id;

  else
    raise exception 'M34 unsupported resource type: %',
      p_resource_type;
  end if;

  return coalesce(v_state, jsonb_build_object('exists', false));
end
$$;


create or replace function public.management_record_resource_history(
  p_schedule_revision_id uuid,
  p_operation text,
  p_resource_type text,
  p_resource_id uuid,
  p_before jsonb,
  p_after jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_transaction_id uuid;
  v_resource_name text;
begin
  if p_operation not in (
    'TEACHER_NAME',
    'ROOM_NAME',
    'TEACHER_STATUS',
    'ROOM_PROFILE',
    'ROOM_STATUS',
    'TEACHER_CREATE',
    'ROOM_CREATE',
    'TEACHER_DELETE',
    'ROOM_DELETE'
  ) then
    raise exception 'M34 unsupported resource operation: %',
      p_operation;
  end if;

  if p_resource_type not in ('TEACHER', 'ROOM') then
    raise exception 'M34 unsupported resource type: %',
      p_resource_type;
  end if;

  if p_before is not distinct from p_after then
    raise exception 'M34 resource history refuses no-op';
  end if;

  v_resource_name := coalesce(
    p_after ->> 'displayName',
    p_before ->> 'displayName',
    p_after ->> 'name',
    p_before ->> 'name',
    case when p_resource_type = 'TEACHER' then 'Öğretmen' else 'Salon' end
  );

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
    'RESOURCE',
    jsonb_build_object(
      'source', 'MANUAL',
      'engine_version', 'M34.0-v1',
      'resource_operation', p_operation,
      'resource_type', p_resource_type,
      'resource_id', p_resource_id,
      'resource_name', v_resource_name,
      'before', p_before,
      'after', p_after
    )
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end
$$;


create or replace function public.management_apply_resource_history_state(
  p_schedule_revision_id uuid,
  p_operation text,
  p_resource_type text,
  p_resource_id uuid,
  p_target jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_target_exists boolean :=
    coalesce((p_target ->> 'exists')::boolean, false);
  v_preview jsonb;
  v_capabilities text[];
  v_current jsonb;
begin
  perform public.management_assert_resource_history_revision(
    p_schedule_revision_id
  );

  if p_operation in ('TEACHER_CREATE', 'TEACHER_DELETE') then
    if p_resource_type <> 'TEACHER' then
      raise exception 'M34 teacher lifecycle type mismatch';
    end if;

    if v_target_exists then
      if exists (
        select 1 from public.teachers where id = p_resource_id
      ) then
        raise exception 'M34 teacher restore target already exists';
      end if;

      if exists (
        select 1
        from public.teachers
        where lower(btrim(name)) =
          lower(btrim(coalesce(p_target ->> 'name', '')))
      ) then
        raise exception 'M34 teacher restore name is no longer available';
      end if;

      insert into public.teachers (
        id,
        name,
        operational_status
      )
      values (
        p_resource_id,
        p_target ->> 'name',
        p_target ->> 'operationalStatus'
      );

      if coalesce(
        (p_target ->> 'nameOverridden')::boolean,
        false
      ) then
        insert into public.management_teacher_name_overrides (
          schedule_revision_id,
          teacher_id,
          display_name,
          updated_by,
          updated_at
        )
        values (
          p_schedule_revision_id,
          p_resource_id,
          p_target ->> 'displayName',
          auth.uid(),
          clock_timestamp()
        )
        on conflict (schedule_revision_id, teacher_id)
        do update set
          display_name = excluded.display_name,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at;
      end if;
    else
      perform public.management_delete_teacher_resource(
        p_resource_id
      );
    end if;

  elsif p_operation in ('ROOM_CREATE', 'ROOM_DELETE') then
    if p_resource_type <> 'ROOM' then
      raise exception 'M34 room lifecycle type mismatch';
    end if;

    if v_target_exists then
      if exists (
        select 1 from public.rooms where id = p_resource_id
      ) then
        raise exception 'M34 room restore target already exists';
      end if;

      if exists (
        select 1
        from public.rooms
        where canonical_room_id is null
          and lower(btrim(name)) =
            lower(btrim(coalesce(p_target ->> 'name', '')))
      ) then
        raise exception 'M34 room restore name is no longer available';
      end if;

      select coalesce(
        array_agg(value order by value),
        array[]::text[]
      )
      into v_capabilities
      from jsonb_array_elements_text(
        coalesce(p_target -> 'capabilities', '[]'::jsonb)
      ) item(value);

      insert into public.rooms (
        id,
        name,
        canonical_room_id,
        capabilities,
        knowledge_status,
        operational_status
      )
      values (
        p_resource_id,
        p_target ->> 'name',
        nullif(p_target ->> 'canonicalRoomId', '')::uuid,
        v_capabilities,
        p_target ->> 'knowledgeStatus',
        p_target ->> 'operationalStatus'
      );

      if coalesce(
        (p_target ->> 'nameOverridden')::boolean,
        false
      ) then
        insert into public.management_room_name_overrides (
          schedule_revision_id,
          room_id,
          display_name,
          updated_by,
          updated_at
        )
        values (
          p_schedule_revision_id,
          p_resource_id,
          p_target ->> 'displayName',
          auth.uid(),
          clock_timestamp()
        )
        on conflict (schedule_revision_id, room_id)
        do update set
          display_name = excluded.display_name,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at;
      end if;
    else
      perform public.management_delete_room_resource(
        p_resource_id
      );
    end if;

  elsif p_operation = 'TEACHER_NAME' then
    if p_resource_type <> 'TEACHER' or not v_target_exists then
      raise exception 'M34 teacher name target mismatch';
    end if;

    if coalesce(
      (p_target ->> 'nameOverridden')::boolean,
      false
    ) then
      insert into public.management_teacher_name_overrides (
        schedule_revision_id,
        teacher_id,
        display_name,
        updated_by,
        updated_at
      )
      values (
        p_schedule_revision_id,
        p_resource_id,
        p_target ->> 'displayName',
        auth.uid(),
        clock_timestamp()
      )
      on conflict (schedule_revision_id, teacher_id)
      do update set
        display_name = excluded.display_name,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
    else
      delete from public.management_teacher_name_overrides override_row
      where override_row.schedule_revision_id = p_schedule_revision_id
        and override_row.teacher_id = p_resource_id;
    end if;

  elsif p_operation = 'ROOM_NAME' then
    if p_resource_type <> 'ROOM' or not v_target_exists then
      raise exception 'M34 room name target mismatch';
    end if;

    if coalesce(
      (p_target ->> 'nameOverridden')::boolean,
      false
    ) then
      insert into public.management_room_name_overrides (
        schedule_revision_id,
        room_id,
        display_name,
        updated_by,
        updated_at
      )
      values (
        p_schedule_revision_id,
        p_resource_id,
        p_target ->> 'displayName',
        auth.uid(),
        clock_timestamp()
      )
      on conflict (schedule_revision_id, room_id)
      do update set
        display_name = excluded.display_name,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
    else
      delete from public.management_room_name_overrides override_row
      where override_row.schedule_revision_id = p_schedule_revision_id
        and override_row.room_id = p_resource_id;
    end if;

  elsif p_operation = 'TEACHER_STATUS' then
    if p_resource_type <> 'TEACHER' or not v_target_exists then
      raise exception 'M34 teacher status target mismatch';
    end if;

    perform public.management_set_teacher_operational_status(
      p_schedule_revision_id,
      p_resource_id,
      p_target ->> 'operationalStatus'
    );

  elsif p_operation = 'ROOM_PROFILE' then
    if p_resource_type <> 'ROOM' or not v_target_exists then
      raise exception 'M34 room profile target mismatch';
    end if;

    select coalesce(
      array_agg(value order by value),
      array[]::text[]
    )
    into v_capabilities
    from jsonb_array_elements_text(
      coalesce(p_target -> 'capabilities', '[]'::jsonb)
    ) item(value);

    v_preview := public.management_preview_room_profile(
      p_schedule_revision_id,
      p_resource_id,
      v_capabilities,
      p_target ->> 'knowledgeStatus'
    );

    if not coalesce((v_preview ->> 'canApply')::boolean, false) then
      raise exception 'M34 room profile history replay is no longer safe';
    end if;

    if coalesce((v_preview ->> 'hasChanges')::boolean, false) then
      perform public.management_apply_room_profile(
        p_schedule_revision_id,
        p_resource_id,
        v_capabilities,
        p_target ->> 'knowledgeStatus',
        v_preview ->> 'stateToken'
      );
    end if;

  elsif p_operation = 'ROOM_STATUS' then
    if p_resource_type <> 'ROOM' or not v_target_exists then
      raise exception 'M34 room status target mismatch';
    end if;

    v_preview := public.management_preview_room_operational_status(
      p_schedule_revision_id,
      p_resource_id,
      p_target ->> 'operationalStatus'
    );

    if not coalesce((v_preview ->> 'canApply')::boolean, false) then
      raise exception 'M34 room status history replay is no longer safe';
    end if;

    if coalesce((v_preview ->> 'hasChanges')::boolean, false) then
      perform public.management_apply_room_operational_status(
        p_schedule_revision_id,
        p_resource_id,
        p_target ->> 'operationalStatus',
        v_preview ->> 'stateToken'
      );
    end if;

  else
    raise exception 'M34 unsupported resource operation: %',
      p_operation;
  end if;

  v_current := public.management_resource_history_state(
    p_schedule_revision_id,
    p_resource_type,
    p_resource_id
  );

  if v_current is distinct from p_target then
    raise exception
      'M34 resource history replay did not reach the exact target state';
  end if;
end
$$;


create or replace function public.undo_management_resource_transaction(
  p_root_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_revision_status text;
  v_history_sequence bigint;
  v_root_source text;
  v_payload jsonb;
  v_operation text;
  v_resource_type text;
  v_resource_id uuid;
  v_resource_name text;
  v_before jsonb;
  v_after jsonb;
  v_current jsonb;
  v_latest_root_id uuid;
  v_undo_id uuid;
  v_reverted_at timestamptz := clock_timestamp();
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M34 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    revision.id,
    revision.status,
    root_tx.history_sequence,
    root_tx.payload ->> 'source',
    root_tx.payload
  into
    v_revision_id,
    v_revision_status,
    v_history_sequence,
    v_root_source,
    v_payload
  from public.move_transactions root_tx
  join public.schedule_revisions revision
    on revision.id = root_tx.schedule_revision_id
  where root_tx.id = p_root_transaction_id
    and root_tx.actor_type = 'USER'
    and root_tx.action = 'RESOURCE'
    and root_tx.root_transaction_id is null
    and root_tx.parent_transaction_id is null
    and root_tx.reverted_at is null
    and root_tx.payload ->> 'source' in ('MANUAL', 'ROOT_REDO')
  for update of revision, root_tx;

  if v_revision_id is null then
    raise exception 'M34 active RESOURCE root not found: %',
      p_root_transaction_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M34 resource undo requires DRAFT revision';
  end if;

  select transaction.id
  into v_latest_root_id
  from public.move_transactions transaction
  where transaction.schedule_revision_id = v_revision_id
    and transaction.actor_type = 'USER'
    and transaction.root_transaction_id is null
    and transaction.parent_transaction_id is null
    and transaction.reverted_at is null
    and transaction.action in ('PLACE', 'MOVE', 'REMOVE', 'RESOURCE')
    and transaction.payload ->> 'source' in ('MANUAL', 'ROOT_REDO')
  order by transaction.history_sequence desc
  limit 1;

  if v_latest_root_id is distinct from p_root_transaction_id then
    raise exception
      'M34 undo is LIFO: latest active root is %, requested %',
      v_latest_root_id,
      p_root_transaction_id;
  end if;

  v_operation := v_payload ->> 'resource_operation';
  v_resource_type := v_payload ->> 'resource_type';
  v_resource_id := nullif(v_payload ->> 'resource_id', '')::uuid;
  v_resource_name := v_payload ->> 'resource_name';
  v_before := v_payload -> 'before';
  v_after := v_payload -> 'after';

  if v_operation is null
     or v_resource_type is null
     or v_resource_id is null
     or v_before is null
     or v_after is null then
    raise exception 'M34 RESOURCE root payload is incomplete';
  end if;

  v_current := public.management_resource_history_state(
    v_revision_id,
    v_resource_type,
    v_resource_id
  );

  if v_current is distinct from v_after then
    raise exception
      'M34 resource undo is stale; current state no longer matches history';
  end if;

  perform public.management_apply_resource_history_state(
    v_revision_id,
    v_operation,
    v_resource_type,
    v_resource_id,
    v_before
  );

  insert into public.move_transactions (
    schedule_revision_id,
    root_transaction_id,
    parent_transaction_id,
    actor_type,
    action,
    payload
  )
  values (
    v_revision_id,
    null,
    null,
    'USER',
    'RESOURCE',
    jsonb_build_object(
      'source', 'ROOT_UNDO',
      'engine_version', 'M34.0-v1',
      'reverts_root_transaction_id', p_root_transaction_id,
      'reverts_root_source', v_root_source,
      'reverted_root_action', 'RESOURCE',
      'reverted_transaction_count', 1,
      'resource_operation', v_operation,
      'resource_type', v_resource_type,
      'resource_id', v_resource_id,
      'resource_name', v_resource_name,
      'before', v_after,
      'after', v_before
    )
  )
  returning id into v_undo_id;

  update public.move_transactions transaction
  set
    reverted_at = v_reverted_at,
    reverted_by_transaction_id = v_undo_id
  where transaction.id = p_root_transaction_id
    and transaction.reverted_at is null;

  if not found then
    raise exception 'M34 resource undo lost ownership of root transaction';
  end if;

  return v_undo_id;
end
$$;


create or replace function public.redo_management_resource_undo(
  p_undo_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_revision_status text;
  v_undo_history_sequence bigint;
  v_original_root_id uuid;
  v_original_payload jsonb;
  v_operation text;
  v_resource_type text;
  v_resource_id uuid;
  v_resource_name text;
  v_before jsonb;
  v_after jsonb;
  v_current jsonb;
  v_latest_redoable_undo_id uuid;
  v_redo_id uuid;
  v_redone_at timestamptz := clock_timestamp();
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M34 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    revision.id,
    revision.status,
    undo_tx.history_sequence,
    nullif(undo_tx.payload ->> 'reverts_root_transaction_id', '')::uuid
  into
    v_revision_id,
    v_revision_status,
    v_undo_history_sequence,
    v_original_root_id
  from public.move_transactions undo_tx
  join public.schedule_revisions revision
    on revision.id = undo_tx.schedule_revision_id
  where undo_tx.id = p_undo_transaction_id
    and undo_tx.actor_type = 'USER'
    and undo_tx.action = 'RESOURCE'
    and undo_tx.root_transaction_id is null
    and undo_tx.parent_transaction_id is null
    and undo_tx.payload ->> 'source' = 'ROOT_UNDO'
    and undo_tx.redone_at is null
    and undo_tx.redone_by_transaction_id is null
  for update of revision, undo_tx;

  if v_revision_id is null or v_original_root_id is null then
    raise exception 'M34 active resource undo not found: %',
      p_undo_transaction_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M34 resource redo requires DRAFT revision';
  end if;

  if exists (
    select 1
    from public.move_transactions transaction
    where transaction.schedule_revision_id = v_revision_id
      and transaction.actor_type = 'USER'
      and transaction.root_transaction_id is null
      and transaction.parent_transaction_id is null
      and transaction.payload ->> 'source' = 'MANUAL'
      and transaction.history_sequence > v_undo_history_sequence
  ) then
    raise exception
      'M34 redo branch was invalidated by a newer management decision';
  end if;

  select candidate.id
  into v_latest_redoable_undo_id
  from public.move_transactions candidate
  where candidate.schedule_revision_id = v_revision_id
    and candidate.actor_type = 'USER'
    and candidate.root_transaction_id is null
    and candidate.parent_transaction_id is null
    and candidate.payload ->> 'source' = 'ROOT_UNDO'
    and candidate.redone_at is null
    and candidate.redone_by_transaction_id is null
    and not exists (
      select 1
      from public.move_transactions manual_tx
      where manual_tx.schedule_revision_id = v_revision_id
        and manual_tx.actor_type = 'USER'
        and manual_tx.root_transaction_id is null
        and manual_tx.parent_transaction_id is null
        and manual_tx.payload ->> 'source' = 'MANUAL'
        and manual_tx.history_sequence > candidate.history_sequence
    )
  order by candidate.history_sequence desc
  limit 1;

  if v_latest_redoable_undo_id is distinct from p_undo_transaction_id then
    raise exception
      'M34 redo is LIFO: latest redoable undo is %, requested %',
      v_latest_redoable_undo_id,
      p_undo_transaction_id;
  end if;

  select root_tx.payload
  into v_original_payload
  from public.move_transactions root_tx
  where root_tx.id = v_original_root_id
    and root_tx.schedule_revision_id = v_revision_id
    and root_tx.actor_type = 'USER'
    and root_tx.action = 'RESOURCE'
    and root_tx.root_transaction_id is null
    and root_tx.parent_transaction_id is null
    and root_tx.reverted_at is not null
    and root_tx.reverted_by_transaction_id = p_undo_transaction_id
    and root_tx.payload ->> 'source' in ('MANUAL', 'ROOT_REDO');

  if v_original_payload is null then
    raise exception 'M34 original resource root is missing';
  end if;

  v_operation := v_original_payload ->> 'resource_operation';
  v_resource_type := v_original_payload ->> 'resource_type';
  v_resource_id :=
    nullif(v_original_payload ->> 'resource_id', '')::uuid;
  v_resource_name := v_original_payload ->> 'resource_name';
  v_before := v_original_payload -> 'before';
  v_after := v_original_payload -> 'after';

  if v_operation is null
     or v_resource_type is null
     or v_resource_id is null
     or v_before is null
     or v_after is null then
    raise exception 'M34 original RESOURCE root payload is incomplete';
  end if;

  v_current := public.management_resource_history_state(
    v_revision_id,
    v_resource_type,
    v_resource_id
  );

  if v_current is distinct from v_before then
    raise exception
      'M34 resource redo is stale; current state no longer matches undo state';
  end if;

  perform public.management_apply_resource_history_state(
    v_revision_id,
    v_operation,
    v_resource_type,
    v_resource_id,
    v_after
  );

  insert into public.move_transactions (
    schedule_revision_id,
    root_transaction_id,
    parent_transaction_id,
    actor_type,
    action,
    payload
  )
  values (
    v_revision_id,
    null,
    null,
    'USER',
    'RESOURCE',
    jsonb_build_object(
      'source', 'ROOT_REDO',
      'engine_version', 'M34.0-v1',
      'redo_of_undo_transaction_id', p_undo_transaction_id,
      'replays_root_transaction_id', v_original_root_id,
      'resource_operation', v_operation,
      'resource_type', v_resource_type,
      'resource_id', v_resource_id,
      'resource_name', v_resource_name,
      'before', v_before,
      'after', v_after
    )
  )
  returning id into v_redo_id;

  update public.move_transactions undo_tx
  set
    redone_at = v_redone_at,
    redone_by_transaction_id = v_redo_id
  where undo_tx.id = p_undo_transaction_id
    and undo_tx.redone_at is null
    and undo_tx.redone_by_transaction_id is null;

  if not found then
    raise exception 'M34 resource redo lost ownership of undo transaction';
  end if;

  return v_redo_id;
end
$$;


create or replace function public.management_undo(
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
  v_action text;
  v_source text;
  v_reverted_at timestamptz;
  v_revertible boolean;
  v_latest_structure_sequence bigint;
  v_latest_active_root_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M34 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    transaction.schedule_revision_id,
    transaction.history_sequence,
    transaction.action,
    transaction.payload ->> 'source',
    transaction.reverted_at,
    coalesce((transaction.payload ->> 'revertible')::boolean, false)
  into
    v_revision_id,
    v_history_sequence,
    v_action,
    v_source,
    v_reverted_at,
    v_revertible
  from public.move_transactions transaction
  join public.schedule_revisions revision
    on revision.id = transaction.schedule_revision_id
  where transaction.id = p_root_transaction_id
  for update of revision;

  if v_revision_id is null then
    raise exception 'M34 undo transaction not found: %',
      p_root_transaction_id;
  end if;

  if v_action = 'STRUCTURE'
     and v_source = 'STRUCTURE_APPLY'
     and v_reverted_at is null
     and v_revertible then
    return public.management_revert_requirement_structure(
      p_root_transaction_id
    );
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
    raise exception
      'M34 undo cannot cross a structural history epoch';
  end if;

  select transaction.id
  into v_latest_active_root_id
  from public.move_transactions transaction
  where transaction.schedule_revision_id = v_revision_id
    and transaction.actor_type = 'USER'
    and transaction.root_transaction_id is null
    and transaction.parent_transaction_id is null
    and transaction.reverted_at is null
    and transaction.action in ('PLACE', 'MOVE', 'REMOVE', 'RESOURCE')
    and transaction.payload ->> 'source' in ('MANUAL', 'ROOT_REDO')
    and transaction.history_sequence >
      coalesce(v_latest_structure_sequence, 0)
  order by transaction.history_sequence desc
  limit 1;

  if v_latest_active_root_id is distinct from p_root_transaction_id then
    raise exception
      'M34 undo is LIFO: latest active root is %, requested %',
      v_latest_active_root_id,
      p_root_transaction_id;
  end if;

  if v_action = 'RESOURCE' then
    return public.undo_management_resource_transaction(
      p_root_transaction_id
    );
  end if;

  return public.undo_management_root_transaction(
    p_root_transaction_id
  );
end
$$;


create or replace function public.management_redo(
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
  v_latest_structure_sequence bigint;
  v_original_root_id uuid;
  v_original_action text;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M34 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    transaction.schedule_revision_id,
    transaction.history_sequence,
    nullif(transaction.payload ->> 'reverts_root_transaction_id', '')::uuid
  into
    v_revision_id,
    v_history_sequence,
    v_original_root_id
  from public.move_transactions transaction
  join public.schedule_revisions revision
    on revision.id = transaction.schedule_revision_id
  where transaction.id = p_undo_transaction_id
  for update of revision;

  if v_revision_id is null then
    raise exception 'M34 redo transaction not found: %',
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
    raise exception
      'M34 redo cannot cross a structural history epoch';
  end if;

  select root_tx.action
  into v_original_action
  from public.move_transactions root_tx
  where root_tx.id = v_original_root_id
    and root_tx.schedule_revision_id = v_revision_id;

  if v_original_action = 'RESOURCE' then
    return public.redo_management_resource_undo(
      p_undo_transaction_id
    );
  end if;

  return public.redo_management_undo_transaction(
    p_undo_transaction_id
  );
end
$$;


create or replace function public.management_undo_bundle_v2(
  p_root_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_bundle_id uuid;
  v_latest_structure_sequence bigint;
  v_latest_root_bundle_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M34 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    transaction.schedule_revision_id,
    nullif(transaction.payload ->> 'bundle_id', '')::uuid
  into
    v_revision_id,
    v_bundle_id
  from public.move_transactions transaction
  join public.schedule_revisions revision
    on revision.id = transaction.schedule_revision_id
  where transaction.id = p_root_transaction_id
    and transaction.actor_type = 'USER'
    and transaction.root_transaction_id is null
    and transaction.parent_transaction_id is null
  for update of revision;

  if v_revision_id is null or v_bundle_id is null then
    raise exception 'M34 active bundle root not found';
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

  select nullif(transaction.payload ->> 'bundle_id', '')::uuid
  into v_latest_root_bundle_id
  from public.move_transactions transaction
  where transaction.schedule_revision_id = v_revision_id
    and transaction.actor_type = 'USER'
    and transaction.root_transaction_id is null
    and transaction.parent_transaction_id is null
    and transaction.reverted_at is null
    and transaction.action in ('PLACE', 'MOVE', 'REMOVE', 'RESOURCE')
    and transaction.payload ->> 'source' in ('MANUAL', 'ROOT_REDO')
    and transaction.history_sequence >
      coalesce(v_latest_structure_sequence, 0)
  order by transaction.history_sequence desc
  limit 1;

  if v_latest_root_bundle_id is distinct from v_bundle_id then
    raise exception
      'M34 bundle undo is LIFO; a newer management decision exists';
  end if;

  return public.management_undo_bundle(
    p_root_transaction_id
  );
end
$$;


create or replace function public.management_redo_bundle_v2(
  p_undo_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_bundle_id uuid;
  v_latest_structure_sequence bigint;
  v_latest_redoable_bundle_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M34 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    transaction.schedule_revision_id,
    nullif(transaction.payload ->> 'bundle_id', '')::uuid
  into
    v_revision_id,
    v_bundle_id
  from public.move_transactions transaction
  join public.schedule_revisions revision
    on revision.id = transaction.schedule_revision_id
  where transaction.id = p_undo_transaction_id
    and transaction.actor_type = 'USER'
    and transaction.root_transaction_id is null
    and transaction.parent_transaction_id is null
    and transaction.payload ->> 'source' = 'ROOT_UNDO'
    and transaction.redone_at is null
    and transaction.redone_by_transaction_id is null
  for update of revision;

  if v_revision_id is null or v_bundle_id is null then
    raise exception 'M34 redoable bundle undo not found';
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

  select nullif(candidate.payload ->> 'bundle_id', '')::uuid
  into v_latest_redoable_bundle_id
  from public.move_transactions candidate
  where candidate.schedule_revision_id = v_revision_id
    and candidate.actor_type = 'USER'
    and candidate.root_transaction_id is null
    and candidate.parent_transaction_id is null
    and candidate.payload ->> 'source' = 'ROOT_UNDO'
    and candidate.redone_at is null
    and candidate.redone_by_transaction_id is null
    and candidate.history_sequence >
      coalesce(v_latest_structure_sequence, 0)
    and not exists (
      select 1
      from public.move_transactions manual_tx
      where manual_tx.schedule_revision_id = v_revision_id
        and manual_tx.actor_type = 'USER'
        and manual_tx.root_transaction_id is null
        and manual_tx.parent_transaction_id is null
        and manual_tx.payload ->> 'source' = 'MANUAL'
        and manual_tx.history_sequence > candidate.history_sequence
    )
  order by candidate.history_sequence desc
  limit 1;

  if v_latest_redoable_bundle_id is distinct from v_bundle_id then
    raise exception
      'M34 bundle redo is LIFO; another undo must be replayed first';
  end if;

  return public.management_redo_bundle(
    p_undo_transaction_id
  );
end
$$;


revoke all
  on function public.management_assert_resource_history_revision(uuid)
  from public, anon, authenticated;
revoke all
  on function public.management_resource_history_state(uuid, text, uuid)
  from public, anon, authenticated;
revoke all
  on function public.management_record_resource_history(
    uuid, text, text, uuid, jsonb, jsonb
  )
  from public, anon, authenticated;
revoke all
  on function public.management_apply_resource_history_state(
    uuid, text, text, uuid, jsonb
  )
  from public, anon, authenticated;
revoke all
  on function public.undo_management_resource_transaction(uuid)
  from public, anon, authenticated;
revoke all
  on function public.redo_management_resource_undo(uuid)
  from public, anon, authenticated;

revoke all on function public.management_undo(uuid)
  from public, anon, authenticated;
revoke all on function public.management_redo(uuid)
  from public, anon, authenticated;
revoke all on function public.management_undo_bundle_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.management_redo_bundle_v2(uuid)
  from public, anon, authenticated;

grant execute on function public.management_undo(uuid)
  to authenticated;
grant execute on function public.management_redo(uuid)
  to authenticated;
grant execute on function public.management_undo_bundle_v2(uuid)
  to authenticated;
grant execute on function public.management_redo_bundle_v2(uuid)
  to authenticated;

comment on function public.management_resource_history_state(uuid, text, uuid) is
  'M34 exact draft resource snapshot used as the stale guard for resource undo/redo.';
comment on function public.management_undo(uuid) is
  'M34 unified global undo entry point. Enforces one LIFO history across scheduling roots and RESOURCE roots inside the current structural epoch.';
comment on function public.management_redo(uuid) is
  'M34 unified global redo entry point. Dispatches RESOURCE undos to exact resource replay and scheduling undos to the existing placement engine.';
comment on function public.management_undo_bundle_v2(uuid) is
  'M34 bundle undo guard. A scheduling bundle cannot jump over a newer RESOURCE or scheduling decision.';
comment on function public.management_redo_bundle_v2(uuid) is
  'M34 bundle redo guard. A scheduling bundle cannot jump over a newer redoable undo.';

commit;
