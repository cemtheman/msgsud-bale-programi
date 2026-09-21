-- Management / M17.3.2
-- Reversible structural apply + exact structural undo.
--
-- M17.3 intentionally introduced a history barrier. M17.3.2 keeps that
-- barrier, but makes the latest structural apply itself undoable when:
--   * it was created by the new revertible wrapper,
--   * no later USER root decision exists in the draft,
--   * the structural state token still matches the post-apply state,
--   * newly-created cards have not become placed or locked.
--
-- The revert restores the exact previous requirement structure and card IDs,
-- rebuilds only that requirement's candidate domain, and preserves audit rows.
-- Published schedule_sessions + session_groups remain untouched.

begin;

-- -------------------------------------------------------------------------
-- REVERTIBLE APPLY WRAPPER
-- -------------------------------------------------------------------------

create or replace function public.management_apply_requirement_structure_v2(
  p_requirement_id uuid,
  p_weekly_load smallint,
  p_preferred_partition smallint[],
  p_allowed_partitions jsonb,
  p_term_status text,
  p_expected_structure_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_preview jsonb;
  v_result jsonb;
  v_revision_id uuid;
  v_barrier_id uuid;
  v_removed_snapshots jsonb := '[]'::jsonb;
  v_created_snapshots jsonb := '[]'::jsonb;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M17.3.2 management EDITOR role required'
      using errcode = '42501';
  end if;

  -- Capture the exact pre-apply impact graph. The underlying M17.3 apply
  -- independently revalidates the token and preview before mutating anything.
  v_preview := public.management_preview_requirement_structure_v2(
    p_requirement_id,
    p_weekly_load,
    p_preferred_partition,
    p_allowed_partitions,
    p_term_status
  );

  if (v_preview ->> 'structureToken')
       is distinct from p_expected_structure_token then
    raise exception
      'M17.3.2 preview is stale; the draft changed after impact preview';
  end if;

  v_revision_id := (v_preview ->> 'revisionId')::uuid;

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
  from jsonb_array_elements(v_preview -> 'removedCards') impact
  join public.schedule_cards card
    on card.id = (impact ->> 'cardId')::uuid
   and card.schedule_revision_id = v_revision_id
   and card.requirement_id = p_requirement_id;

  v_result := public.management_apply_requirement_structure(
    p_requirement_id,
    p_weekly_load,
    p_preferred_partition,
    p_allowed_partitions,
    p_term_status,
    p_expected_structure_token
  );

  v_barrier_id :=
    (v_result ->> 'historyBarrierTransactionId')::uuid;

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
  from jsonb_array_elements(v_preview -> 'createdBlocks') impact
  join public.schedule_cards card
    on card.schedule_revision_id = v_revision_id
   and card.requirement_id = p_requirement_id
   and card.block_index =
     (impact ->> 'proposedBlockIndex')::smallint
   and card.duration_periods =
     (impact ->> 'durationPeriods')::smallint;

  if jsonb_array_length(v_created_snapshots)
       <> jsonb_array_length(v_preview -> 'createdBlocks') then
    raise exception
      'M17.3.2 created-card snapshot mismatch after apply';
  end if;

  update public.move_transactions transaction
  set payload = transaction.payload || jsonb_build_object(
    'engine_version', 'M17.3.2-v0.1',
    'revertible', true,
    'preserved_cards', v_preview -> 'preservedCards',
    'removed_card_snapshots', v_removed_snapshots,
    'created_card_snapshots', v_created_snapshots,
    'after_structure_token', v_result ->> 'structureToken'
  )
  where transaction.id = v_barrier_id
    and transaction.schedule_revision_id = v_revision_id
    and transaction.actor_type = 'USER'
    and transaction.action = 'STRUCTURE'
    and transaction.payload ->> 'source' = 'STRUCTURE_APPLY';

  if not found then
    raise exception
      'M17.3.2 structural history barrier could not be upgraded';
  end if;

  return v_result || jsonb_build_object(
    'revertible', true
  );
end
$$;

revoke all
  on function public.management_apply_requirement_structure_v2(
    uuid,
    smallint,
    smallint[],
    jsonb,
    text,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.management_apply_requirement_structure_v2(
    uuid,
    smallint,
    smallint[],
    jsonb,
    text,
    text
  )
  to authenticated;


-- -------------------------------------------------------------------------
-- EXACT STRUCTURAL REVERT
-- -------------------------------------------------------------------------

create or replace function public.management_revert_requirement_structure(
  p_structure_transaction_id uuid
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
  v_requirement_id uuid;
  v_payload jsonb;
  v_current_token text;
  v_expected_after_token text;
  v_created_count integer;
  v_deleted_created_count integer := 0;
  v_removed_count integer;
  v_restored_removed_count integer := 0;
  v_result_card_ids uuid[];
  v_revert_transaction_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M17.3.2 management EDITOR role required'
      using errcode = '42501';
  end if;

  select
    transaction.schedule_revision_id,
    revision.status,
    transaction.history_sequence,
    (transaction.payload ->> 'requirement_id')::uuid,
    transaction.payload
  into
    v_revision_id,
    v_revision_status,
    v_history_sequence,
    v_requirement_id,
    v_payload
  from public.move_transactions transaction
  join public.schedule_revisions revision
    on revision.id = transaction.schedule_revision_id
  where transaction.id = p_structure_transaction_id
    and transaction.actor_type = 'USER'
    and transaction.action = 'STRUCTURE'
    and transaction.root_transaction_id is null
    and transaction.parent_transaction_id is null
    and transaction.reverted_at is null
    and transaction.payload ->> 'source' = 'STRUCTURE_APPLY'
    and coalesce(
      (transaction.payload ->> 'revertible')::boolean,
      false
    )
  for update of revision, transaction;

  if v_revision_id is null then
    raise exception
      'M17.3.2 active revertible STRUCTURE_APPLY not found: %',
      p_structure_transaction_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception
      'M17.3.2 structural revert requires DRAFT revision';
  end if;

  if v_requirement_id is null then
    raise exception
      'M17.3.2 structural apply is missing requirement_id';
  end if;

  -- The structural apply is only an immediate/root-level undo. Any later USER
  -- root is another explicit human decision and permanently closes this revert.
  if exists (
    select 1
    from public.move_transactions later
    where later.schedule_revision_id = v_revision_id
      and later.actor_type = 'USER'
      and later.root_transaction_id is null
      and later.parent_transaction_id is null
      and later.history_sequence > v_history_sequence
  ) then
    raise exception
      'M17.3.2 structural revert was invalidated by a newer management decision';
  end if;

  v_expected_after_token :=
    v_payload ->> 'after_structure_token';

  if v_expected_after_token is null then
    raise exception
      'M17.3.2 structural apply is missing after-state token';
  end if;

  v_current_token :=
    public.management_requirement_structure_state_token(
      v_requirement_id
    );

  if v_current_token is distinct from v_expected_after_token then
    raise exception
      'M17.3.2 structural revert is stale; the draft changed after apply';
  end if;

  v_created_count :=
    jsonb_array_length(
      coalesce(
        v_payload -> 'created_card_snapshots',
        '[]'::jsonb
      )
    );

  v_removed_count :=
    jsonb_array_length(
      coalesce(
        v_payload -> 'removed_card_snapshots',
        '[]'::jsonb
      )
    );

  -- Cards created by the structural apply may only be removed by the revert
  -- if the user has not placed or locked them in the meantime.
  if exists (
    select 1
    from jsonb_array_elements(
      coalesce(
        v_payload -> 'created_card_snapshots',
        '[]'::jsonb
      )
    ) snapshot
    join public.schedule_cards card
      on card.id = (snapshot ->> 'id')::uuid
     and card.schedule_revision_id = v_revision_id
     and card.requirement_id = v_requirement_id
    left join public.placements placement
      on placement.card_id = card.id
    where card.locked
       or placement.card_id is not null
  ) then
    raise exception
      'M17.3.2 structural revert blocked because a created card is placed or locked';
  end if;

  delete from public.schedule_cards card
  using jsonb_array_elements(
    coalesce(
      v_payload -> 'created_card_snapshots',
      '[]'::jsonb
    )
  ) snapshot
  where card.id = (snapshot ->> 'id')::uuid
    and card.schedule_revision_id = v_revision_id
    and card.requirement_id = v_requirement_id;

  get diagnostics v_deleted_created_count = row_count;

  if v_deleted_created_count <> v_created_count then
    raise exception
      'M17.3.2 created-card delete mismatch: expected %, deleted %',
      v_created_count,
      v_deleted_created_count;
  end if;

  -- Free the original block-index namespace before exact restoration.
  update public.schedule_cards card
  set block_index = (card.block_index + 1000)::smallint
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = v_requirement_id;

  update public.schedule_cards card
  set block_index =
    (impact ->> 'currentBlockIndex')::smallint
  from jsonb_array_elements(
    coalesce(
      v_payload -> 'preserved_cards',
      '[]'::jsonb
    )
  ) impact
  where card.id = (impact ->> 'cardId')::uuid
    and card.schedule_revision_id = v_revision_id
    and card.requirement_id = v_requirement_id;

  insert into public.schedule_cards (
    id,
    schedule_revision_id,
    requirement_id,
    block_index,
    duration_periods,
    locked,
    created_at
  )
  select
    (snapshot ->> 'id')::uuid,
    v_revision_id,
    v_requirement_id,
    (snapshot ->> 'blockIndex')::smallint,
    (snapshot ->> 'durationPeriods')::smallint,
    coalesce(
      (snapshot ->> 'locked')::boolean,
      false
    ),
    coalesce(
      (snapshot ->> 'createdAt')::timestamptz,
      now()
    )
  from jsonb_array_elements(
    coalesce(
      v_payload -> 'removed_card_snapshots',
      '[]'::jsonb
    )
  ) snapshot;

  get diagnostics v_restored_removed_count = row_count;

  if v_restored_removed_count <> v_removed_count then
    raise exception
      'M17.3.2 removed-card restore mismatch: expected %, restored %',
      v_removed_count,
      v_restored_removed_count;
  end if;

  if exists (
    select 1
    from public.schedule_cards card
    where card.schedule_revision_id = v_revision_id
      and card.requirement_id = v_requirement_id
      and card.block_index >= 1000
  ) then
    raise exception
      'M17.3.2 preserved-card restore did not cover current card graph';
  end if;

  update public.course_requirements requirement
  set
    weekly_load =
      (v_payload -> 'before' ->> 'weeklyLoad')::smallint,
    preferred_partition =
      coalesce(
        v_payload -> 'before' -> 'preferredPartition',
        '[]'::jsonb
      ),
    allowed_partitions =
      coalesce(
        v_payload -> 'before' -> 'allowedPartitions',
        '[]'::jsonb
      ),
    term_status =
      v_payload -> 'before' ->> 'termStatus'
  where requirement.id = v_requirement_id;

  if not found then
    raise exception
      'M17.3.2 requirement restore failed: %',
      v_requirement_id;
  end if;

  select coalesce(
    array_agg(card.id order by card.block_index),
    array[]::uuid[]
  )
  into v_result_card_ids
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = v_requirement_id;

  if cardinality(v_result_card_ids) > 0 then
    perform public.refresh_management_candidate_domain_subset(
      v_revision_id,
      v_result_card_ids
    );
  end if;

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
    'STRUCTURE',
    jsonb_build_object(
      'source', 'STRUCTURE_REVERT',
      'engine_version', 'M17.3.2-v0.1',
      'requirement_id', v_requirement_id,
      'reverts_structure_transaction_id',
        p_structure_transaction_id,
      'before', v_payload -> 'after',
      'after', v_payload -> 'before',
      'restored_card_count',
        cardinality(v_result_card_ids)
    )
  )
  returning id into v_revert_transaction_id;

  update public.move_transactions transaction
  set
    reverted_at = clock_timestamp(),
    reverted_by_transaction_id = v_revert_transaction_id
  where transaction.id = p_structure_transaction_id
    and transaction.reverted_at is null;

  if not found then
    raise exception
      'M17.3.2 structural apply could not be marked reverted';
  end if;

  return v_revert_transaction_id;
end
$$;

revoke all
  on function public.management_revert_requirement_structure(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_revert_requirement_structure(uuid)
  to authenticated;


-- -------------------------------------------------------------------------
-- ROUTE STRUCTURE THROUGH THE EXISTING UNDO ENTRY POINT
-- -------------------------------------------------------------------------

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
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M17.3.2 management EDITOR role required'
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
      'M17.3.2 undo transaction not found: %',
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

  if exists (
    select 1
    from public.move_transactions barrier
    where barrier.schedule_revision_id = v_revision_id
      and barrier.actor_type = 'USER'
      and barrier.action = 'STRUCTURE'
      and barrier.root_transaction_id is null
      and barrier.parent_transaction_id is null
      and barrier.reverted_at is null
      and barrier.payload ->> 'source' = 'STRUCTURE_APPLY'
      and barrier.history_sequence > v_history_sequence
  ) then
    raise exception
      'M17.3.2 undo cannot cross an active structural history barrier';
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
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M17.3.2 management EDITOR role required'
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
      'M17.3.2 redo transaction not found: %',
      p_undo_transaction_id;
  end if;

  if exists (
    select 1
    from public.move_transactions barrier
    where barrier.schedule_revision_id = v_revision_id
      and barrier.actor_type = 'USER'
      and barrier.action = 'STRUCTURE'
      and barrier.root_transaction_id is null
      and barrier.parent_transaction_id is null
      and barrier.reverted_at is null
      and barrier.payload ->> 'source' = 'STRUCTURE_APPLY'
      and barrier.history_sequence > v_history_sequence
  ) then
    raise exception
      'M17.3.2 redo cannot cross an active structural history barrier';
  end if;

  return public.redo_management_undo_transaction(
    p_undo_transaction_id
  );
end
$$;

comment on function public.management_apply_requirement_structure_v2(
  uuid,
  smallint,
  smallint[],
  jsonb,
  text,
  text
) is
  'M17.3.2 controlled structural apply wrapper. Captures exact card snapshots and upgrades the STRUCTURE_APPLY audit row so the latest untouched structural decision can be undone exactly.';

comment on function public.management_revert_requirement_structure(uuid) is
  'M17.3.2 exact immediate structural undo. Restores the previous requirement structure and card IDs only when no newer USER root decision exists and the post-apply structural token is unchanged.';

commit;
