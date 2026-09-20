-- Management v0.1 / M14.4
-- REMOVE performance hardening.
--
-- Live M14 testing showed REMOVE could still reach statement_timeout because
-- the M8 command rebuilt the full candidate domain after deleting one
-- placement. M14.3 introduced incremental domain refresh; REMOVE now uses it.
--
-- Product semantics are unchanged:
-- - removed card returns to the unscheduled pool
-- - no forced propagation runs after explicit REMOVE
-- - root history / undo / redo contract remains unchanged

begin;

create or replace function public.remove_management_card(
  p_card_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_revision_id uuid;
  v_revision_status text;
  v_locked boolean;
  v_placement_id uuid;
  v_before_day smallint;
  v_before_start smallint;
  v_before_teacher uuid;
  v_before_room uuid;
  v_before_move_transaction_id uuid;
  v_before_created_at timestamptz;
  v_transaction_id uuid;
  v_remaining_placements integer;
  v_forced_count integer;
  v_contradiction_count integer;
begin
  if p_card_id is null then
    raise exception 'M8 remove requires card_id';
  end if;

  select
    revision.id,
    revision.status,
    card.locked,
    placement.id,
    placement.day_of_week,
    placement.start_period,
    placement.teacher_id,
    placement.room_id,
    placement.move_transaction_id,
    placement.created_at
  into
    v_revision_id,
    v_revision_status,
    v_locked,
    v_placement_id,
    v_before_day,
    v_before_start,
    v_before_teacher,
    v_before_room,
    v_before_move_transaction_id,
    v_before_created_at
  from public.schedule_cards card
  join public.schedule_revisions revision
    on revision.id = card.schedule_revision_id
  join public.placements placement
    on placement.card_id = card.id
  where card.id = p_card_id
  for update of revision, placement;

  if v_revision_id is null then
    raise exception 'M8 placed card not found for remove: %', p_card_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M8 remove requires DRAFT revision, found %', v_revision_status;
  end if;

  if v_locked then
    raise exception 'M8 remove rejected for locked card: %', p_card_id;
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
    'REMOVE',
    jsonb_build_object(
      'source', 'MANUAL',
      'engine_version', 'M14.4-v0.1',
      'card_id', p_card_id,
      'before', jsonb_build_object(
        'placement_id', v_placement_id,
        'card_id', p_card_id,
        'day_of_week', v_before_day,
        'start_period', v_before_start,
        'teacher_id', v_before_teacher,
        'room_id', v_before_room,
        'move_transaction_id', v_before_move_transaction_id,
        'created_at', v_before_created_at
      ),
      'after', null
    )
  )
  returning id into v_transaction_id;

  delete from public.placements placement
  where placement.id = v_placement_id;

  -- M14.4: the removed card must stay in the unscheduled pool until the human
  -- acts, so REMOVE still does not propagate. Refresh only domains affected by
  -- releasing this placement instead of rebuilding the complete revision.
  perform public.refresh_management_candidate_domain_after_change(
    v_revision_id,
    p_card_id,
    v_before_teacher,
    v_before_room,
    null,
    null
  );

  select count(*)
  into v_remaining_placements
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = v_revision_id;

  select count(*)
  into v_forced_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card on card.id = summary.card_id
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
  join public.schedule_cards card on card.id = summary.card_id
  where card.schedule_revision_id = v_revision_id
    and summary.is_contradiction
    and not exists (
      select 1
      from public.placements placement
      where placement.card_id = card.id
    );

  update public.move_transactions mt
  set payload = mt.payload || jsonb_build_object(
    'propagation_auto_count', 0,
    'propagation_stop_reason', 'MANUAL_REMOVE',
    'remaining_placement_count', v_remaining_placements,
    'post_remove_forced_count', v_forced_count,
    'post_remove_contradiction_count', v_contradiction_count,
    'candidate_domain_refresh', 'PASS'
  )
  where mt.id = v_transaction_id;

  return v_transaction_id;
end
$$;



comment on function public.remove_management_card(uuid) is
  'M14.4 manual REMOVE command. Returns one unlocked placed card to the pool and incrementally refreshes only domains affected by released teacher/room/group occupancy; no forced propagation.';

revoke all
  on function public.remove_management_card(uuid)
  from public, anon, authenticated;

commit;
