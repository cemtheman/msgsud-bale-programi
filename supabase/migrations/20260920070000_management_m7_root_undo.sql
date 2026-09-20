-- Management v0.1 / M7
-- Root undo + descendant rollback with durable history.
-- Undo removes the placement state created by one USER root and all of its
-- AUTO descendants, but preserves the original transactions as reverted audit
-- records and writes a new USER / REMOVE transaction describing the undo.
-- No redo, arbitrary move/remove, or publish action in this phase.

begin;

alter table public.move_transactions
  add column reverted_at timestamptz null,
  add column reverted_by_transaction_id uuid null
    references public.move_transactions(id) on delete restrict;

alter table public.move_transactions
  add constraint move_transactions_reversion_pair
    check (
      (reverted_at is null and reverted_by_transaction_id is null)
      or
      (reverted_at is not null and reverted_by_transaction_id is not null)
    ),
  add constraint move_transactions_reversion_not_self
    check (
      reverted_by_transaction_id is null
      or reverted_by_transaction_id <> id
    );

create index move_transactions_reverted_by_idx
  on public.move_transactions (reverted_by_transaction_id)
  where reverted_by_transaction_id is not null;

create index move_transactions_active_root_idx
  on public.move_transactions (
    schedule_revision_id,
    created_at desc
  )
  where actor_type = 'USER'
    and action = 'PLACE'
    and root_transaction_id is null
    and parent_transaction_id is null
    and reverted_at is null;

comment on column public.move_transactions.reverted_at is
  'M7 audit marker. Set when this transaction''s scheduling effect has been undone; the history row itself remains durable.';

comment on column public.move_transactions.reverted_by_transaction_id is
  'USER / REMOVE transaction that reverted this transaction''s scheduling effect.';

create or replace function public.undo_management_root_transaction(
  p_root_transaction_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_revision_id uuid;
  v_revision_status text;
  v_root_created_at timestamptz;
  v_latest_root_id uuid;
  v_chain_ids uuid[];
  v_chain_count integer;
  v_placement_count integer;
  v_removed_placements jsonb;
  v_undo_transaction_id uuid;
  v_reverted_at timestamptz := clock_timestamp();
  v_remaining_placements integer;
  v_forced_count integer;
  v_contradiction_count integer;
begin
  if p_root_transaction_id is null then
    raise exception 'M7 undo requires root transaction id';
  end if;

  -- Lock the revision and root transaction so undo is atomic with respect to
  -- manual scheduling writes in the same draft.
  select
    revision.id,
    revision.status,
    root_tx.created_at
  into
    v_revision_id,
    v_revision_status,
    v_root_created_at
  from public.move_transactions root_tx
  join public.schedule_revisions revision
    on revision.id = root_tx.schedule_revision_id
  where root_tx.id = p_root_transaction_id
    and root_tx.actor_type = 'USER'
    and root_tx.action = 'PLACE'
    and root_tx.root_transaction_id is null
    and root_tx.parent_transaction_id is null
    and root_tx.reverted_at is null
  for update of revision, root_tx;

  if v_revision_id is null then
    raise exception 'M7 active USER root PLACE transaction not found: %', p_root_transaction_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M7 undo requires DRAFT revision, found %', v_revision_status;
  end if;

  -- v0.1 is stack-style undo. Reverting an older human decision while a newer
  -- active root depends on it could invalidate later history, so only the most
  -- recent active USER root may be undone.
  select mt.id
  into v_latest_root_id
  from public.move_transactions mt
  where mt.schedule_revision_id = v_revision_id
    and mt.actor_type = 'USER'
    and mt.action = 'PLACE'
    and mt.root_transaction_id is null
    and mt.parent_transaction_id is null
    and mt.reverted_at is null
  order by mt.created_at desc, mt.id::text desc
  limit 1;

  if v_latest_root_id is distinct from p_root_transaction_id then
    raise exception
      'M7 undo is LIFO: latest active root is %, requested %',
      v_latest_root_id,
      p_root_transaction_id;
  end if;

  if exists (
    select 1
    from public.move_transactions mt
    where (
      mt.id = p_root_transaction_id
      or mt.root_transaction_id = p_root_transaction_id
    )
      and mt.reverted_at is null
      and mt.action <> 'PLACE'
  ) then
    raise exception 'M7 root chain contains a non-PLACE transaction';
  end if;

  if exists (
    select 1
    from public.move_transactions mt
    where mt.root_transaction_id = p_root_transaction_id
      and mt.reverted_at is null
      and mt.actor_type <> 'AUTO'
  ) then
    raise exception 'M7 root chain contains a non-AUTO descendant';
  end if;

  select
    array_agg(mt.id order by mt.created_at, mt.id::text),
    count(*)
  into
    v_chain_ids,
    v_chain_count
  from public.move_transactions mt
  where (
    mt.id = p_root_transaction_id
    or mt.root_transaction_id = p_root_transaction_id
  )
    and mt.reverted_at is null;

  if v_chain_count = 0 or v_chain_ids is null then
    raise exception 'M7 found no active transaction chain for root %', p_root_transaction_id;
  end if;

  -- Every active PLACE transaction in the chain must still own exactly one
  -- placement. If not, history/state was already mutated outside the M7 model.
  select count(*)
  into v_placement_count
  from public.placements placement
  where placement.move_transaction_id = any(v_chain_ids);

  if v_placement_count <> v_chain_count then
    raise exception
      'M7 root chain state mismatch: % active transactions, % linked placements',
      v_chain_count,
      v_placement_count;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'placement_id', placement.id,
        'transaction_id', placement.move_transaction_id,
        'card_id', placement.card_id,
        'day_of_week', placement.day_of_week,
        'start_period', placement.start_period,
        'teacher_id', placement.teacher_id,
        'room_id', placement.room_id
      )
      order by placement.created_at, placement.id::text
    ),
    '[]'::jsonb
  )
  into v_removed_placements
  from public.placements placement
  where placement.move_transaction_id = any(v_chain_ids);

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
    'REMOVE',
    jsonb_build_object(
      'source', 'ROOT_UNDO',
      'engine_version', 'M7-v0.1',
      'reverts_root_transaction_id', p_root_transaction_id,
      'reverted_transaction_count', v_chain_count,
      'removed_placements', v_removed_placements
    )
  )
  returning id into v_undo_transaction_id;

  delete from public.placements placement
  where placement.move_transaction_id = any(v_chain_ids);

  update public.move_transactions mt
  set
    reverted_at = v_reverted_at,
    reverted_by_transaction_id = v_undo_transaction_id
  where mt.id = any(v_chain_ids)
    and mt.reverted_at is null;

  if (select count(*) from public.move_transactions mt where mt.reverted_by_transaction_id = v_undo_transaction_id)
     <> v_chain_count then
    raise exception 'M7 failed to mark the complete root chain as reverted';
  end if;

  if exists (
    select 1
    from public.placements placement
    where placement.move_transaction_id = any(v_chain_ids)
  ) then
    raise exception 'M7 failed to remove all root-chain placements';
  end if;

  perform public.refresh_management_candidate_domain(v_revision_id);

  select count(*)
  into v_remaining_placements
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = v_revision_id;

  select count(*)
  into v_forced_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card
    on card.id = summary.card_id
  where card.schedule_revision_id = v_revision_id
    and summary.is_forced
    and not exists (
      select 1
      from public.placements placement
      where placement.card_id = card.id
    );

  select count(*)
  into v_contradiction_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card
    on card.id = summary.card_id
  where card.schedule_revision_id = v_revision_id
    and summary.is_contradiction
    and not exists (
      select 1
      from public.placements placement
      where placement.card_id = card.id
    );

  update public.move_transactions mt
  set payload = mt.payload || jsonb_build_object(
    'remaining_placement_count', v_remaining_placements,
    'post_undo_forced_count', v_forced_count,
    'post_undo_contradiction_count', v_contradiction_count,
    'candidate_domain_refresh', 'PASS'
  )
  where mt.id = v_undo_transaction_id;

  return v_undo_transaction_id;
end
$$;

comment on function public.undo_management_root_transaction(uuid) is
  'M7 stack-style root undo. Removes placements created by the latest active USER PLACE root and all AUTO descendants, preserves them as reverted audit rows, writes one USER REMOVE undo transaction, and refreshes candidate domains atomically.';

revoke all
  on function public.undo_management_root_transaction(uuid)
  from public;

-- M6 propagation must never be resumed from an already reverted root.
create or replace function public.propagate_management_forced_cards(
  p_schedule_revision_id uuid,
  p_root_transaction_id uuid,
  p_parent_transaction_id uuid
)
returns integer
language plpgsql
as $$
declare
  v_root_count integer;
  v_parent_count integer;
  v_parent_transaction_id uuid := p_parent_transaction_id;
  v_forced_card_id uuid;
  v_candidate_id uuid;
  v_day_of_week smallint;
  v_start_period smallint;
  v_teacher_id uuid;
  v_room_id uuid;
  v_auto_transaction_id uuid;
  v_auto_count integer := 0;
begin
  if p_schedule_revision_id is null
     or p_root_transaction_id is null
     or p_parent_transaction_id is null then
    raise exception 'M7 propagation requires revision, root transaction, and parent transaction';
  end if;

  select count(*)
  into v_root_count
  from public.move_transactions mt
  where mt.id = p_root_transaction_id
    and mt.schedule_revision_id = p_schedule_revision_id
    and mt.actor_type = 'USER'
    and mt.action = 'PLACE'
    and mt.root_transaction_id is null
    and mt.parent_transaction_id is null
    and mt.reverted_at is null;

  if v_root_count <> 1 then
    raise exception 'M7 propagation root must be one active USER root transaction: %', p_root_transaction_id;
  end if;

  select count(*)
  into v_parent_count
  from public.move_transactions mt
  where mt.id = p_parent_transaction_id
    and mt.schedule_revision_id = p_schedule_revision_id
    and mt.reverted_at is null
    and (
      mt.id = p_root_transaction_id
      or mt.root_transaction_id = p_root_transaction_id
    );

  if v_parent_count <> 1 then
    raise exception 'M7 propagation parent is outside active root chain: %', p_parent_transaction_id;
  end if;

  loop
    if v_auto_count > 289 then
      raise exception 'M7 propagation exceeded card safety bound';
    end if;

    perform public.refresh_management_candidate_domain(p_schedule_revision_id);

    if exists (
      select 1
      from public.schedule_card_domain_summaries summary
      join public.schedule_cards card
        on card.id = summary.card_id
      where card.schedule_revision_id = p_schedule_revision_id
        and summary.is_contradiction
        and not exists (
          select 1
          from public.placements placement
          where placement.card_id = card.id
        )
    ) then
      exit;
    end if;

    v_forced_card_id := null;
    v_candidate_id := null;
    v_day_of_week := null;
    v_start_period := null;
    v_teacher_id := null;
    v_room_id := null;

    select
      card.id,
      assessment.id,
      assessment.day_of_week,
      assessment.start_period,
      assessment.teacher_id,
      assessment.room_id
    into
      v_forced_card_id,
      v_candidate_id,
      v_day_of_week,
      v_start_period,
      v_teacher_id,
      v_room_id
    from public.schedule_card_domain_summaries summary
    join public.schedule_cards card
      on card.id = summary.card_id
    join public.schedule_card_candidate_assessments assessment
      on assessment.card_id = card.id
     and assessment.status = 'VALID'
     and assessment.is_complete
    where card.schedule_revision_id = p_schedule_revision_id
      and summary.is_forced
      and summary.unresolved_count = 0
      and not exists (
        select 1
        from public.placements placement
        where placement.card_id = card.id
      )
    order by
      card.requirement_id::text,
      card.block_index,
      card.id::text
    limit 1;

    if v_forced_card_id is null then
      exit;
    end if;

    if v_candidate_id is null
       or v_teacher_id is null
       or v_room_id is null then
      raise exception 'M7 forced domain produced incomplete candidate for card %', v_forced_card_id;
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
      p_schedule_revision_id,
      p_root_transaction_id,
      v_parent_transaction_id,
      'AUTO',
      'PLACE',
      jsonb_build_object(
        'source', 'FORCED_PROPAGATION',
        'engine_version', 'M7-v0.1',
        'propagation_step', v_auto_count + 1,
        'candidate_assessment_id', v_candidate_id,
        'card_id', v_forced_card_id,
        'before', null,
        'after', jsonb_build_object(
          'day_of_week', v_day_of_week,
          'start_period', v_start_period,
          'teacher_id', v_teacher_id,
          'room_id', v_room_id
        )
      )
    )
    returning id into v_auto_transaction_id;

    insert into public.placements (
      card_id,
      day_of_week,
      start_period,
      teacher_id,
      room_id,
      move_transaction_id
    )
    values (
      v_forced_card_id,
      v_day_of_week,
      v_start_period,
      v_teacher_id,
      v_room_id,
      v_auto_transaction_id
    );

    v_auto_count := v_auto_count + 1;
    v_parent_transaction_id := v_auto_transaction_id;
  end loop;

  return v_auto_count;
end
$$;

comment on function public.propagate_management_forced_cards(uuid, uuid, uuid) is
  'M7-hardened forced propagation. Same M6 deterministic behavior, with active/reverted root-chain guards.';

revoke all
  on function public.propagate_management_forced_cards(uuid, uuid, uuid)
  from public;

-- Lock installation to the clean live state left after the rollback-only M6 QA.
do $$
declare
  v_revision_id uuid;
  v_revision_count integer;
  v_card_count integer;
  v_summary_count integer;
  v_placement_count integer;
  v_transaction_count integer;
begin
  select count(*)
  into v_revision_count
  from public.schedule_revisions revision
  where revision.status = 'DRAFT'
    and revision.version_number = 1;

  if v_revision_count <> 1 then
    raise exception 'M7 expected one v1 DRAFT revision, found %', v_revision_count;
  end if;

  select revision.id
  into v_revision_id
  from public.schedule_revisions revision
  where revision.status = 'DRAFT'
    and revision.version_number = 1;

  select count(*)
  into v_card_count
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id;

  if v_card_count <> 289 then
    raise exception 'M7 expected 289 cards, found %', v_card_count;
  end if;

  select count(*)
  into v_summary_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card on card.id = summary.card_id
  where card.schedule_revision_id = v_revision_id;

  if v_summary_count <> 289 then
    raise exception 'M7 expected 289 candidate domain summaries, found %', v_summary_count;
  end if;

  select count(*) into v_placement_count from public.placements;
  select count(*) into v_transaction_count from public.move_transactions;

  if v_placement_count <> 0 or v_transaction_count <> 0 then
    raise exception
      'M7 installation requires clean scheduling state: placements %, transactions %',
      v_placement_count,
      v_transaction_count;
  end if;

  update public.schedule_revisions revision
  set validation_summary = coalesce(revision.validation_summary, '{}'::jsonb) || jsonb_build_object(
    'root_undo_engine_version', 'M7-v0.1',
    'root_undo_command', 'READY',
    'root_undo_smoke_test', 'PENDING',
    'redo', 'NOT_IMPLEMENTED'
  )
  where revision.id = v_revision_id;
end
$$;

commit;
