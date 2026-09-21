-- Management / M17.3.3
-- Permanent structural history epochs.
--
-- M17.3.2 made STRUCTURE_APPLY itself revertible, but after a successful
-- STRUCTURE_REVERT the older scheduling epoch must never become active again.
-- This migration treats the latest STRUCTURE_APPLY or STRUCTURE_REVERT root as
-- a permanent history boundary for ordinary schedule undo/redo.

begin;

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
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M17.3.3 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    transaction.schedule_revision_id,
    transaction.history_sequence,
    transaction.action,
    transaction.payload ->> 'source',
    transaction.reverted_at,
    coalesce(
      (transaction.payload ->> 'revertible')::boolean,
      false
    )
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
    raise exception
      'M17.3.3 undo transaction not found: %',
      p_root_transaction_id;
  end if;

  -- The latest untouched revertible STRUCTURE_APPLY may itself be undone
  -- through the structural revert path.
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
      'M17.3.3 undo cannot cross a structural history epoch';
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
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M17.3.3 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    transaction.schedule_revision_id,
    transaction.history_sequence
  into
    v_revision_id,
    v_history_sequence
  from public.move_transactions transaction
  join public.schedule_revisions revision
    on revision.id = transaction.schedule_revision_id
  where transaction.id = p_undo_transaction_id
  for update of revision;

  if v_revision_id is null then
    raise exception
      'M17.3.3 redo transaction not found: %',
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
      'M17.3.3 redo cannot cross a structural history epoch';
  end if;

  return public.redo_management_undo_transaction(
    p_undo_transaction_id
  );
end
$$;

comment on function public.management_undo(uuid) is
  'M17.3.3 public undo entry point. The latest STRUCTURE_APPLY may be reverted exactly when still eligible; ordinary scheduling undo cannot cross the latest STRUCTURE_APPLY/STRUCTURE_REVERT history epoch.';

comment on function public.management_redo(uuid) is
  'M17.3.3 public redo entry point. Scheduling redo cannot cross the latest STRUCTURE_APPLY/STRUCTURE_REVERT history epoch.';

commit;
