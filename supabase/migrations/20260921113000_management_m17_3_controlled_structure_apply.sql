-- Management / M17.3
-- Controlled structural apply.
--
-- Structural requirement changes may alter the draft card graph. M17.3 adds:
--   1. a deterministic preview state token,
--   2. a token-bearing preview wrapper,
--   3. an EDITOR-only atomic apply RPC,
--   4. a structural history barrier so schedule UNDO/REDO cannot cross a
--      card-graph change boundary.
--
-- Published schedule_sessions + session_groups remain untouched.

begin;

-- -------------------------------------------------------------------------
-- HISTORY BARRIER ACTION
-- -------------------------------------------------------------------------

alter table public.move_transactions
  drop constraint if exists move_transactions_action_check;

alter table public.move_transactions
  add constraint move_transactions_action_check
  check (action in ('PLACE', 'MOVE', 'REMOVE', 'LOCK', 'UNLOCK', 'STRUCTURE'));


-- -------------------------------------------------------------------------
-- PREVIEW STATE TOKEN
-- -------------------------------------------------------------------------
-- The token covers:
--   * the complete target requirement scheduling definition,
--   * target card identities / block structure / lock state,
--   * target teacher + room assignment sets,
--   * all current placements in the DRAFT revision.
--
-- Existing scheduling commands serialize on schedule_revisions FOR UPDATE.
-- The apply RPC takes the same revision lock before comparing this token.

create or replace function public.management_requirement_structure_state_token(
  p_requirement_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with target as (
    select
      requirement.id as requirement_id,
      requirement.requirement_set_id,
      revision.id as revision_id,
      to_jsonb(requirement) as requirement_snapshot
    from public.course_requirements requirement
    join public.schedule_revisions revision
      on revision.requirement_set_id = requirement.requirement_set_id
     and revision.status = 'DRAFT'
    where requirement.id = p_requirement_id
    order by revision.version_number desc
    limit 1
  ),
  target_cards as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', card.id,
          'blockIndex', card.block_index,
          'durationPeriods', card.duration_periods,
          'locked', card.locked
        )
        order by card.block_index, card.id
      ) filter (where card.id is not null),
      '[]'::jsonb
    ) as value
    from target
    left join public.schedule_cards card
      on card.schedule_revision_id = target.revision_id
     and card.requirement_id = target.requirement_id
  ),
  target_teachers as (
    select coalesce(
      jsonb_agg(
        assignment.teacher_id
        order by assignment.teacher_id
      ) filter (where assignment.teacher_id is not null),
      '[]'::jsonb
    ) as value
    from target
    left join public.course_requirement_teachers assignment
      on assignment.requirement_id = target.requirement_id
  ),
  target_rooms as (
    select coalesce(
      jsonb_agg(
        assignment.room_id
        order by assignment.room_id
      ) filter (where assignment.room_id is not null),
      '[]'::jsonb
    ) as value
    from target
    left join public.course_requirement_rooms assignment
      on assignment.requirement_id = target.requirement_id
  ),
  revision_placements as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', placement.id,
          'cardId', placement.card_id,
          'dayOfWeek', placement.day_of_week,
          'startPeriod', placement.start_period,
          'teacherId', placement.teacher_id,
          'roomId', placement.room_id,
          'moveTransactionId', placement.move_transaction_id
        )
        order by placement.card_id
      ) filter (where placement.id is not null),
      '[]'::jsonb
    ) as value
    from target
    left join public.schedule_cards card
      on card.schedule_revision_id = target.revision_id
    left join public.placements placement
      on placement.card_id = card.id
  )
  select md5(
    jsonb_build_object(
      'requirementId', target.requirement_id,
      'revisionId', target.revision_id,
      'requirement', target.requirement_snapshot,
      'cards', target_cards.value,
      'teachers', target_teachers.value,
      'rooms', target_rooms.value,
      'placements', revision_placements.value
    )::text
  )
  from target, target_cards, target_teachers, target_rooms, revision_placements
$$;

revoke all
  on function public.management_requirement_structure_state_token(uuid)
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- TOKEN-BEARING PREVIEW
-- -------------------------------------------------------------------------

create or replace function public.management_preview_requirement_structure_v2(
  p_requirement_id uuid,
  p_weekly_load smallint,
  p_preferred_partition smallint[],
  p_allowed_partitions jsonb,
  p_term_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_preview jsonb;
  v_token text;
  v_locked_removed_count integer;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M17.3 management EDITOR role required'
      using errcode = '42501';
  end if;

  v_preview := public.management_preview_requirement_structure(
    p_requirement_id,
    p_weekly_load,
    p_preferred_partition,
    p_allowed_partitions,
    p_term_status
  );

  v_token := public.management_requirement_structure_state_token(
    p_requirement_id
  );

  if v_token is null then
    raise exception 'M17.3 requirement state token could not be created: %',
      p_requirement_id;
  end if;

  select count(*)
  into v_locked_removed_count
  from jsonb_array_elements(v_preview -> 'removedCards') impact
  join public.schedule_cards card
    on card.id = (impact ->> 'cardId')::uuid
  where card.locked;

  if v_locked_removed_count > 0 then
    v_preview := jsonb_set(
      v_preview,
      '{canApply}',
      'false'::jsonb
    );

    v_preview := jsonb_set(
      v_preview,
      '{blockReasons}',
      coalesce(v_preview -> 'blockReasons', '[]'::jsonb)
        || jsonb_build_array('LOCKED_CARD_REMOVAL_REQUIRED')
    );
  end if;

  return v_preview || jsonb_build_object(
    'structureToken', v_token
  );
end
$$;

revoke all
  on function public.management_preview_requirement_structure_v2(
    uuid,
    smallint,
    smallint[],
    jsonb,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.management_preview_requirement_structure_v2(
    uuid,
    smallint,
    smallint[],
    jsonb,
    text
  )
  to authenticated;


-- -------------------------------------------------------------------------
-- CONTROLLED APPLY
-- -------------------------------------------------------------------------

create or replace function public.management_apply_requirement_structure(
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
  v_revision_id uuid;
  v_revision_status text;
  v_current_token text;
  v_preview jsonb;
  v_block_reasons jsonb;
  v_removed_count integer;
  v_deleted_count integer := 0;
  v_created_count integer;
  v_preserved_count integer;
  v_result_card_ids uuid[];
  v_barrier_transaction_id uuid;
  v_new_token text;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M17.3 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_expected_structure_token is null
     or length(btrim(p_expected_structure_token)) = 0 then
    raise exception 'M17.3 apply requires a preview state token';
  end if;

  -- Serialize with PLACE/MOVE/REMOVE/UNDO/REDO for this draft revision.
  select
    revision.id,
    revision.status
  into
    v_revision_id,
    v_revision_status
  from public.course_requirements requirement
  join public.schedule_revisions revision
    on revision.requirement_set_id = requirement.requirement_set_id
  where requirement.id = p_requirement_id
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1
  for update of revision, requirement;

  if v_revision_id is null then
    raise exception 'M17.3 requirement is not part of an active DRAFT: %',
      p_requirement_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M17.3 structural apply requires DRAFT revision';
  end if;

  v_current_token := public.management_requirement_structure_state_token(
    p_requirement_id
  );

  if v_current_token is distinct from p_expected_structure_token then
    raise exception
      'M17.3 preview is stale; the draft changed after impact preview';
  end if;

  v_preview := public.management_preview_requirement_structure_v2(
    p_requirement_id,
    p_weekly_load,
    p_preferred_partition,
    p_allowed_partitions,
    p_term_status
  );

  if not coalesce((v_preview ->> 'hasChanges')::boolean, false) then
    raise exception 'M17.3 structural apply is a no-op';
  end if;

  if not coalesce((v_preview ->> 'canApply')::boolean, false) then
    v_block_reasons := coalesce(
      v_preview -> 'blockReasons',
      '[]'::jsonb
    );

    raise exception
      'M17.3 structural apply blocked: %',
      v_block_reasons::text;
  end if;

  v_removed_count := jsonb_array_length(v_preview -> 'removedCards');
  v_created_count := jsonb_array_length(v_preview -> 'createdBlocks');
  v_preserved_count := jsonb_array_length(v_preview -> 'preservedCards');

  -- Defense in depth: a removable card must still be unplaced and unlocked.
  if exists (
    select 1
    from jsonb_array_elements(v_preview -> 'removedCards') impact
    join public.schedule_cards card
      on card.id = (impact ->> 'cardId')::uuid
    left join public.placements placement
      on placement.card_id = card.id
    where placement.card_id is not null
       or card.locked
  ) then
    raise exception
      'M17.3 removable card became placed or locked after preview';
  end if;

  -- Remove only cards selected by the deterministic preview.
  -- Candidate assessment/summary rows cascade from schedule_cards.
  delete from public.schedule_cards card
  using jsonb_array_elements(v_preview -> 'removedCards') impact
  where card.id = (impact ->> 'cardId')::uuid
    and card.schedule_revision_id = v_revision_id
    and card.requirement_id = p_requirement_id;

  get diagnostics v_deleted_count = row_count;

  if v_deleted_count <> v_removed_count then
    raise exception
      'M17.3 removed-card count mismatch: expected %, deleted %',
      v_removed_count,
      v_deleted_count;
  end if;

  -- Move remaining block indexes out of the destination range first so swaps
  -- such as [2,1] -> [1,2] cannot violate the unique block-index constraint.
  update public.schedule_cards card
  set block_index = (card.block_index + 1000)::smallint
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = p_requirement_id;

  update public.schedule_cards card
  set block_index = (impact ->> 'proposedBlockIndex')::smallint
  from jsonb_array_elements(v_preview -> 'preservedCards') impact
  where card.id = (impact ->> 'cardId')::uuid
    and card.schedule_revision_id = v_revision_id
    and card.requirement_id = p_requirement_id;

  if (
    select count(*)
    from public.schedule_cards card
    where card.schedule_revision_id = v_revision_id
      and card.requirement_id = p_requirement_id
      and card.block_index >= 1000
  ) <> 0 then
    raise exception
      'M17.3 preserved-card mapping did not cover the remaining card graph';
  end if;

  insert into public.schedule_cards (
    schedule_revision_id,
    requirement_id,
    block_index,
    duration_periods,
    locked
  )
  select
    v_revision_id,
    p_requirement_id,
    (impact ->> 'proposedBlockIndex')::smallint,
    (impact ->> 'durationPeriods')::smallint,
    false
  from jsonb_array_elements(v_preview -> 'createdBlocks') impact;

  update public.course_requirements requirement
  set
    weekly_load = p_weekly_load,
    preferred_partition = to_jsonb(
      coalesce(p_preferred_partition, array[]::smallint[])
    ),
    allowed_partitions = coalesce(p_allowed_partitions, '[]'::jsonb),
    term_status = p_term_status
  where requirement.id = p_requirement_id;

  select coalesce(
    array_agg(card.id order by card.block_index),
    array[]::uuid[]
  )
  into v_result_card_ids
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = p_requirement_id;

  if cardinality(v_result_card_ids) > 0 then
    perform public.refresh_management_candidate_domain_subset(
      v_revision_id,
      v_result_card_ids
    );
  end if;

  -- Structural changes are an explicit history boundary. Audit rows are kept,
  -- but schedule UNDO/REDO may not cross this point.
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
      'source', 'STRUCTURE_APPLY',
      'engine_version', 'M17.3-v0.1',
      'requirement_id', p_requirement_id,
      'expected_structure_token', p_expected_structure_token,
      'before', v_preview -> 'current',
      'after', v_preview -> 'proposed',
      'preserved_card_count', v_preserved_count,
      'removed_card_count', v_removed_count,
      'created_card_count', v_created_count
    )
  )
  returning id into v_barrier_transaction_id;

  v_new_token := public.management_requirement_structure_state_token(
    p_requirement_id
  );

  return jsonb_build_object(
    'applied', true,
    'requirementId', p_requirement_id,
    'revisionId', v_revision_id,
    'historyBarrierTransactionId', v_barrier_transaction_id,
    'preservedCardCount', v_preserved_count,
    'removedCardCount', v_removed_count,
    'createdCardCount', v_created_count,
    'resultCardCount', cardinality(v_result_card_ids),
    'structureToken', v_new_token
  );
end
$$;

revoke all
  on function public.management_apply_requirement_structure(
    uuid,
    smallint,
    smallint[],
    jsonb,
    text,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.management_apply_requirement_structure(
    uuid,
    smallint,
    smallint[],
    jsonb,
    text,
    text
  )
  to authenticated;


-- -------------------------------------------------------------------------
-- UNDO / REDO HISTORY BARRIER
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
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M17.3 management EDITOR role required'
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
  where transaction.id = p_root_transaction_id
  for update of revision;

  if v_revision_id is null then
    raise exception 'M17.3 undo transaction not found: %',
      p_root_transaction_id;
  end if;

  if exists (
    select 1
    from public.move_transactions barrier
    where barrier.schedule_revision_id = v_revision_id
      and barrier.actor_type = 'USER'
      and barrier.action = 'STRUCTURE'
      and barrier.root_transaction_id is null
      and barrier.parent_transaction_id is null
      and barrier.payload ->> 'source' = 'STRUCTURE_APPLY'
      and barrier.history_sequence > v_history_sequence
  ) then
    raise exception
      'M17.3 undo cannot cross a structural history barrier';
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
    raise exception 'M17.3 management EDITOR role required'
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
    raise exception 'M17.3 redo transaction not found: %',
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
      and barrier.payload ->> 'source' = 'STRUCTURE_APPLY'
      and barrier.history_sequence > v_history_sequence
  ) then
    raise exception
      'M17.3 redo cannot cross a structural history barrier';
  end if;

  return public.redo_management_undo_transaction(
    p_undo_transaction_id
  );
end
$$;

revoke all
  on function public.management_undo(uuid)
  from public, anon, authenticated;

revoke all
  on function public.management_redo(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_undo(uuid)
  to authenticated;

grant execute
  on function public.management_redo(uuid)
  to authenticated;

comment on function public.management_preview_requirement_structure_v2(
  uuid,
  smallint,
  smallint[],
  jsonb,
  text
) is
  'M17.3 token-bearing structural preview. Read-only; adds stale-state protection and locked-card removal guard.';

comment on function public.management_apply_requirement_structure(
  uuid,
  smallint,
  smallint[],
  jsonb,
  text,
  text
) is
  'M17.3 atomic EDITOR structural apply. Requires an exact preview token, refuses blocked/ambiguous impacts, preserves deterministic card identities, refreshes only resulting requirement cards, and creates a history barrier.';

commit;
