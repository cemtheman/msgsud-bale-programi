-- Management M26.5
-- True grouped PLACE / MOVE execution.
--
-- Previous bundle functions delegated each member to the normal M15 single-card
-- PLACE/MOVE engine. That engine propagates forced cards immediately, so the
-- first member could change or even consume the second member before the bundle
-- completed. Grouped scheduling must apply every explicit member first, then
-- run forced propagation once from the final root.

begin;

create or replace function public.management_place_bundle_member(
  p_card_id uuid,
  p_day_of_week smallint,
  p_start_period smallint,
  p_teacher_id uuid,
  p_room_id uuid
)
returns uuid
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_revision_status text;
  v_locked boolean;
  v_candidate_id uuid;
  v_candidate_status text;
  v_reason_codes text[];
  v_transaction_id uuid;
begin
  if p_card_id is null
     or p_day_of_week is null
     or p_start_period is null
     or p_teacher_id is null
     or p_room_id is null then
    raise exception 'M26.5 PLACE member is incomplete';
  end if;

  if p_day_of_week < 1 or p_day_of_week > 5
     or p_start_period < 1 or p_start_period > 12 then
    raise exception 'M26.5 PLACE member has invalid day/period';
  end if;

  select
    revision.id,
    revision.status,
    card.locked
  into
    v_revision_id,
    v_revision_status,
    v_locked
  from public.schedule_cards card
  join public.schedule_revisions revision
    on revision.id = card.schedule_revision_id
  where card.id = p_card_id
  for update of revision;

  if v_revision_id is null then
    raise exception 'M26.5 PLACE card not found: %', p_card_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M26.5 PLACE requires DRAFT revision';
  end if;

  if v_locked then
    raise exception 'M26.5 PLACE rejected for locked card: %', p_card_id;
  end if;

  if exists (
    select 1
    from public.placements placement
    where placement.card_id = p_card_id
  ) then
    raise exception 'M26.5 PLACE card is already placed: %', p_card_id;
  end if;

  v_candidate_id := public.refresh_management_candidate_exact(
    v_revision_id,
    p_card_id,
    p_day_of_week,
    p_start_period,
    p_teacher_id,
    p_room_id
  );

  select
    assessment.status,
    assessment.reason_codes
  into
    v_candidate_status,
    v_reason_codes
  from public.schedule_card_candidate_assessments assessment
  where assessment.id = v_candidate_id;

  if v_candidate_id is null or v_candidate_status <> 'VALID' then
    raise exception
      'M26.5 PLACE candidate is %, reasons %',
      coalesce(v_candidate_status, 'MISSING'),
      coalesce(v_reason_codes, array[]::text[]);
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
    'PLACE',
    jsonb_build_object(
      'source', 'MANUAL',
      'engine_version', 'M26.5-bundle-member',
      'candidate_assessment_id', v_candidate_id,
      'card_id', p_card_id,
      'before', null,
      'after', jsonb_build_object(
        'day_of_week', p_day_of_week,
        'start_period', p_start_period,
        'teacher_id', p_teacher_id,
        'room_id', p_room_id
      ),
      'propagation_auto_count', 0,
      'propagation_stop_reason', 'BUNDLE_PENDING'
    )
  )
  returning id into v_transaction_id;

  insert into public.placements (
    card_id,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    move_transaction_id
  )
  values (
    p_card_id,
    p_day_of_week,
    p_start_period,
    p_teacher_id,
    p_room_id,
    v_transaction_id
  );

  perform public.refresh_management_candidate_domain_delta(
    v_revision_id,
    p_card_id,
    null,
    null,
    null,
    null,
    p_day_of_week,
    p_start_period,
    p_teacher_id,
    p_room_id
  );

  return v_transaction_id;
end
$$;


create or replace function public.management_move_bundle_member(
  p_card_id uuid,
  p_day_of_week smallint,
  p_start_period smallint,
  p_teacher_id uuid,
  p_room_id uuid
)
returns uuid
language plpgsql
set search_path = pg_catalog, public
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
  v_candidate_id uuid;
  v_candidate_status text;
  v_reason_codes text[];
  v_transaction_id uuid;
begin
  if p_card_id is null
     or p_day_of_week is null
     or p_start_period is null
     or p_teacher_id is null
     or p_room_id is null then
    raise exception 'M26.5 MOVE member is incomplete';
  end if;

  if p_day_of_week < 1 or p_day_of_week > 5
     or p_start_period < 1 or p_start_period > 12 then
    raise exception 'M26.5 MOVE member has invalid day/period';
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
    raise exception 'M26.5 MOVE placed card not found: %', p_card_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M26.5 MOVE requires DRAFT revision';
  end if;

  if v_locked then
    raise exception 'M26.5 MOVE rejected for locked card: %', p_card_id;
  end if;

  if v_before_day = p_day_of_week
     and v_before_start = p_start_period
     and v_before_teacher = p_teacher_id
     and v_before_room = p_room_id then
    raise exception 'M26.5 MOVE is a no-op for card %', p_card_id;
  end if;

  v_candidate_id := public.refresh_management_candidate_exact(
    v_revision_id,
    p_card_id,
    p_day_of_week,
    p_start_period,
    p_teacher_id,
    p_room_id
  );

  select
    assessment.status,
    assessment.reason_codes
  into
    v_candidate_status,
    v_reason_codes
  from public.schedule_card_candidate_assessments assessment
  where assessment.id = v_candidate_id;

  if v_candidate_id is null or v_candidate_status <> 'VALID' then
    raise exception
      'M26.5 MOVE candidate is %, reasons %',
      coalesce(v_candidate_status, 'MISSING'),
      coalesce(v_reason_codes, array[]::text[]);
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
    'MOVE',
    jsonb_build_object(
      'source', 'MANUAL',
      'engine_version', 'M26.5-bundle-member',
      'candidate_assessment_id', v_candidate_id,
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
      'after', jsonb_build_object(
        'placement_id', v_placement_id,
        'card_id', p_card_id,
        'day_of_week', p_day_of_week,
        'start_period', p_start_period,
        'teacher_id', p_teacher_id,
        'room_id', p_room_id
      ),
      'propagation_auto_count', 0,
      'propagation_stop_reason', 'BUNDLE_PENDING'
    )
  )
  returning id into v_transaction_id;

  update public.placements placement
  set
    day_of_week = p_day_of_week,
    start_period = p_start_period,
    teacher_id = p_teacher_id,
    room_id = p_room_id,
    move_transaction_id = v_transaction_id,
    updated_at = now()
  where placement.id = v_placement_id;

  perform public.refresh_management_candidate_domain_delta(
    v_revision_id,
    p_card_id,
    v_before_day,
    v_before_start,
    v_before_teacher,
    v_before_room,
    p_day_of_week,
    p_start_period,
    p_teacher_id,
    p_room_id
  );

  return v_transaction_id;
end
$$;


create or replace function public.management_finalize_bundle_propagation(
  p_revision_id uuid,
  p_final_root_id uuid
)
returns integer
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_auto_count integer;
  v_contradiction_count integer;
  v_forced_remaining_count integer;
  v_unplaced_count integer;
  v_stop_reason text;
begin
  v_auto_count := public.propagate_management_forced_cards(
    p_revision_id,
    p_final_root_id,
    p_final_root_id
  );

  select count(*)
  into v_contradiction_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card on card.id = summary.card_id
  where card.schedule_revision_id = p_revision_id
    and summary.is_contradiction
    and not exists (
      select 1
      from public.placements placement
      where placement.card_id = card.id
    );

  select count(*)
  into v_forced_remaining_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card on card.id = summary.card_id
  where card.schedule_revision_id = p_revision_id
    and summary.is_forced
    and not exists (
      select 1
      from public.placements placement
      where placement.card_id = card.id
    );

  select count(*)
  into v_unplaced_count
  from public.schedule_cards card
  where card.schedule_revision_id = p_revision_id
    and not exists (
      select 1
      from public.placements placement
      where placement.card_id = card.id
    );

  if v_contradiction_count > 0 then
    v_stop_reason := 'CONTRADICTION';
  elsif v_unplaced_count = 0 then
    v_stop_reason := 'COMPLETE';
  elsif v_forced_remaining_count > 0 then
    raise exception
      'M26.5 bundle propagation stopped with % forced cards remaining',
      v_forced_remaining_count;
  else
    v_stop_reason := 'NO_FORCED_CANDIDATE';
  end if;

  update public.move_transactions transaction
  set payload = transaction.payload || jsonb_build_object(
    'propagation_auto_count', v_auto_count,
    'propagation_stop_reason', v_stop_reason,
    'propagation_contradiction_count', v_contradiction_count,
    'remaining_unplaced_count', v_unplaced_count,
    'candidate_domain_refresh', 'DELTA_PASS'
  )
  where transaction.id = p_final_root_id;

  return v_auto_count;
end
$$;


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
  v_matched_card_count integer;
  v_revision_id uuid;
  v_revision_ids uuid[];
  v_card_ids uuid[];
  v_bundle_card_ids jsonb;
  v_bundle_id uuid;
  v_transaction_id uuid;
  v_last_transaction_id uuid;
  v_auto_count integer;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M26.5 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'M26.5 PLACE bundle requires a JSON array';
  end if;

  v_bundle_size := jsonb_array_length(p_items);
  if v_bundle_size < 1 or v_bundle_size > 24 then
    raise exception 'M26.5 PLACE bundle requires 1..24 cards';
  end if;

  select
    count(distinct entry.value ->> 'card_id'),
    array_agg(distinct (entry.value ->> 'card_id')::uuid),
    jsonb_agg(entry.value ->> 'card_id' order by entry.ordinality)
  into
    v_distinct_card_count,
    v_card_ids,
    v_bundle_card_ids
  from jsonb_array_elements(p_items) with ordinality
    as entry(value, ordinality);

  if v_distinct_card_count <> v_bundle_size then
    raise exception 'M26.5 PLACE bundle contains duplicate card ids';
  end if;

  select
    count(*),
    array_agg(distinct card.schedule_revision_id)
  into
    v_matched_card_count,
    v_revision_ids
  from public.schedule_cards card
  where card.id = any(v_card_ids);

  if v_matched_card_count <> v_bundle_size
     or v_revision_ids is null
     or cardinality(v_revision_ids) <> 1 then
    raise exception 'M26.5 PLACE bundle requires known cards from one revision';
  end if;

  v_revision_id := v_revision_ids[1];

  for v_item, v_index in
    select entry.value, entry.ordinality::integer
    from jsonb_array_elements(p_items) with ordinality
      as entry(value, ordinality)
  loop
    v_transaction_id := public.management_place_bundle_member(
      nullif(v_item ->> 'card_id', '')::uuid,
      nullif(v_item ->> 'day_of_week', '')::smallint,
      nullif(v_item ->> 'start_period', '')::smallint,
      nullif(v_item ->> 'teacher_id', '')::uuid,
      nullif(v_item ->> 'room_id', '')::uuid
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

  if v_last_transaction_id is null then
    raise exception 'M26.5 PLACE bundle produced no transaction';
  end if;

  v_auto_count := public.management_finalize_bundle_propagation(
    v_revision_id,
    v_last_transaction_id
  );

  -- Propagation descendants are created only after all explicit members.
  -- Re-tag the final root so its AUTO chain belongs to the same visible bundle.
  perform public.management_tag_bundle_root(
    v_last_transaction_id,
    v_bundle_id,
    v_bundle_size,
    v_bundle_size,
    v_bundle_card_ids
  );

  return v_last_transaction_id;
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
  v_matched_card_count integer;
  v_revision_id uuid;
  v_revision_ids uuid[];
  v_card_ids uuid[];
  v_bundle_card_ids jsonb;
  v_bundle_id uuid;
  v_transaction_id uuid;
  v_last_transaction_id uuid;
  v_auto_count integer;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M26.5 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'M26.5 MOVE bundle requires a JSON array';
  end if;

  v_bundle_size := jsonb_array_length(p_items);
  if v_bundle_size < 1 or v_bundle_size > 24 then
    raise exception 'M26.5 MOVE bundle requires 1..24 cards';
  end if;

  select
    count(distinct entry.value ->> 'card_id'),
    array_agg(distinct (entry.value ->> 'card_id')::uuid),
    jsonb_agg(entry.value ->> 'card_id' order by entry.ordinality)
  into
    v_distinct_card_count,
    v_card_ids,
    v_bundle_card_ids
  from jsonb_array_elements(p_items) with ordinality
    as entry(value, ordinality);

  if v_distinct_card_count <> v_bundle_size then
    raise exception 'M26.5 MOVE bundle contains duplicate card ids';
  end if;

  select
    count(*),
    array_agg(distinct card.schedule_revision_id)
  into
    v_matched_card_count,
    v_revision_ids
  from public.schedule_cards card
  where card.id = any(v_card_ids);

  if v_matched_card_count <> v_bundle_size
     or v_revision_ids is null
     or cardinality(v_revision_ids) <> 1 then
    raise exception 'M26.5 MOVE bundle requires known cards from one revision';
  end if;

  v_revision_id := v_revision_ids[1];

  for v_item, v_index in
    select entry.value, entry.ordinality::integer
    from jsonb_array_elements(p_items) with ordinality
      as entry(value, ordinality)
  loop
    v_transaction_id := public.management_move_bundle_member(
      nullif(v_item ->> 'card_id', '')::uuid,
      nullif(v_item ->> 'day_of_week', '')::smallint,
      nullif(v_item ->> 'start_period', '')::smallint,
      nullif(v_item ->> 'teacher_id', '')::uuid,
      nullif(v_item ->> 'room_id', '')::uuid
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

  if v_last_transaction_id is null then
    raise exception 'M26.5 MOVE bundle produced no transaction';
  end if;

  v_auto_count := public.management_finalize_bundle_propagation(
    v_revision_id,
    v_last_transaction_id
  );

  perform public.management_tag_bundle_root(
    v_last_transaction_id,
    v_bundle_id,
    v_bundle_size,
    v_bundle_size,
    v_bundle_card_ids
  );

  return v_last_transaction_id;
end
$$;


revoke all
  on function public.management_place_bundle_member(uuid, smallint, smallint, uuid, uuid)
  from public, anon, authenticated;
revoke all
  on function public.management_move_bundle_member(uuid, smallint, smallint, uuid, uuid)
  from public, anon, authenticated;
revoke all
  on function public.management_finalize_bundle_propagation(uuid, uuid)
  from public, anon, authenticated;

revoke all
  on function public.management_place_card_bundle(jsonb)
  from public, anon;
revoke all
  on function public.management_move_card_bundle(jsonb)
  from public, anon;

grant execute
  on function public.management_place_card_bundle(jsonb)
  to authenticated;
grant execute
  on function public.management_move_card_bundle(jsonb)
  to authenticated;

comment on function public.management_place_bundle_member(uuid, smallint, smallint, uuid, uuid) is
  'M26.5 internal bundle PLACE member. Exact-validates and applies one explicit placement with delta refresh but no forced propagation.';
comment on function public.management_move_bundle_member(uuid, smallint, smallint, uuid, uuid) is
  'M26.5 internal bundle MOVE member. Exact-validates and applies one explicit move with delta refresh but no forced propagation.';
comment on function public.management_finalize_bundle_propagation(uuid, uuid) is
  'M26.5 runs forced propagation once after all explicit bundle members have reached their requested state.';
comment on function public.management_place_card_bundle(jsonb) is
  'M26.5 atomic grouped PLACE: all explicit members first, one propagation pass last.';
comment on function public.management_move_card_bundle(jsonb) is
  'M26.5 atomic grouped MOVE: all explicit members first, one propagation pass last.';

commit;
