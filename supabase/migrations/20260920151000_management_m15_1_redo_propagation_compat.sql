-- Management v0.1 / M15.1
-- Restore REDO compatibility in delta forced propagation.
--
-- M15 accidentally narrowed the propagation root guard back to MANUAL-only.
-- M9 explicitly allows a successful ROOT_REDO PLACE/MOVE to become the active
-- root for deterministic forced propagation. After several undo/redo cycles,
-- M15 therefore rejected an otherwise valid replayed root.
--
-- This migration changes only that guard. Delta-domain behavior and all
-- placement / conflict / history invariants remain unchanged.

begin;

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
  v_parent_payload jsonb;
  v_parent_card_id uuid;
  v_old_day smallint;
  v_old_start smallint;
  v_old_teacher_id uuid;
  v_old_room_id uuid;
  v_new_day smallint;
  v_new_start smallint;
  v_new_teacher_id uuid;
  v_new_room_id uuid;
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
    raise exception
      'M15 propagation requires revision, root transaction, and parent transaction';
  end if;

  select count(*)
  into v_root_count
  from public.move_transactions mt
  where mt.id = p_root_transaction_id
    and mt.schedule_revision_id = p_schedule_revision_id
    and mt.actor_type = 'USER'
    and mt.action in ('PLACE', 'MOVE')
    and mt.root_transaction_id is null
    and mt.parent_transaction_id is null
    and mt.reverted_at is null
    and mt.payload ->> 'source' in ('MANUAL', 'ROOT_REDO');

  if v_root_count <> 1 then
    raise exception
      'M15.1 propagation root must be one active USER PLACE/MOVE MANUAL/ROOT_REDO root: %',
      p_root_transaction_id;
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
    raise exception
      'M15 propagation parent is outside active root chain: %',
      p_parent_transaction_id;
  end if;

  loop
    if v_auto_count > 289 then
      raise exception 'M15 propagation exceeded card safety bound';
    end if;

    select mt.payload
    into v_parent_payload
    from public.move_transactions mt
    where mt.id = v_parent_transaction_id
      and mt.schedule_revision_id = p_schedule_revision_id
      and mt.reverted_at is null;

    if v_parent_payload is null then
      raise exception
        'M15 active propagation parent payload not found: %',
        v_parent_transaction_id;
    end if;

    v_parent_card_id :=
      nullif(v_parent_payload ->> 'card_id', '')::uuid;
    v_old_day :=
      nullif(v_parent_payload -> 'before' ->> 'day_of_week', '')::smallint;
    v_old_start :=
      nullif(v_parent_payload -> 'before' ->> 'start_period', '')::smallint;
    v_old_teacher_id :=
      nullif(v_parent_payload -> 'before' ->> 'teacher_id', '')::uuid;
    v_old_room_id :=
      nullif(v_parent_payload -> 'before' ->> 'room_id', '')::uuid;
    v_new_day :=
      nullif(v_parent_payload -> 'after' ->> 'day_of_week', '')::smallint;
    v_new_start :=
      nullif(v_parent_payload -> 'after' ->> 'start_period', '')::smallint;
    v_new_teacher_id :=
      nullif(v_parent_payload -> 'after' ->> 'teacher_id', '')::uuid;
    v_new_room_id :=
      nullif(v_parent_payload -> 'after' ->> 'room_id', '')::uuid;

    perform public.refresh_management_candidate_domain_delta(
      p_schedule_revision_id,
      v_parent_card_id,
      v_old_day,
      v_old_start,
      v_old_teacher_id,
      v_old_room_id,
      v_new_day,
      v_new_start,
      v_new_teacher_id,
      v_new_room_id
    );

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
      raise exception
        'M15 forced domain produced incomplete candidate for card %',
        v_forced_card_id;
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
        'engine_version', 'M15.1-v0.1',
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
  'M15.1 deterministic forced propagation using delta domain updates. Active USER PLACE/MOVE roots may originate from MANUAL or ROOT_REDO.';

revoke all
  on function public.propagate_management_forced_cards(uuid, uuid, uuid)
  from public, anon, authenticated;

commit;
