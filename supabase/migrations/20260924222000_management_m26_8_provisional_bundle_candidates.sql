-- Management M26.8
-- Provisional VALID candidates in grouped drag/drop.
--
-- M22/M22.1 explicitly define UNKNOWN teacher/room identity as schedulable
-- provisional state when the candidate is VALID + complete. The management
-- grid still required non-NULL teacher_id and room_id, which made such
-- candidates disappear as NONE. Group bundle validation also used SQL "=",
-- so NULL provisional identities could never match their exact candidate.
--
-- This migration changes only grouped PLACE/MOVE exact-candidate matching to
-- NULL-safe semantics. Existing M22.1 placement triggers and certainty rules
-- remain authoritative.

begin;

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
  v_candidate_status text;
  v_candidate_complete boolean;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M26.6 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'M26.8 PLACE bundle requires a JSON array';
  end if;

  v_bundle_size := jsonb_array_length(p_items);
  if v_bundle_size < 1 or v_bundle_size > 24 then
    raise exception 'M26.8 PLACE bundle requires 1..24 cards';
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
    raise exception 'M26.8 PLACE bundle contains duplicate card ids';
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
    raise exception 'M26.8 PLACE bundle requires known cards from one revision';
  end if;

  v_revision_id := v_revision_ids[1];

  perform public.refresh_management_candidate_domain_bundle_subset(
    v_revision_id,
    v_card_ids
  );

  -- Validate every requested member before any placement is written.
  for v_item in
    select entry.value
    from jsonb_array_elements(p_items) as entry(value)
  loop
    select
      assessment.status,
      assessment.is_complete
    into
      v_candidate_status,
      v_candidate_complete
    from public.schedule_card_candidate_assessments assessment
    where assessment.card_id = nullif(v_item ->> 'card_id', '')::uuid
      and assessment.day_of_week = nullif(v_item ->> 'day_of_week', '')::smallint
      and assessment.start_period = nullif(v_item ->> 'start_period', '')::smallint
      and assessment.teacher_id is not distinct from
        nullif(v_item ->> 'teacher_id', '')::uuid
      and assessment.room_id is not distinct from
        nullif(v_item ->> 'room_id', '')::uuid
    limit 1;

    if v_candidate_status is distinct from 'VALID'
       or coalesce(v_candidate_complete, false) is not true then
      raise exception
        'M26.8 PLACE bundle member is not externally valid: card %, status %',
        v_item ->> 'card_id',
        coalesce(v_candidate_status, 'MISSING');
    end if;
  end loop;

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

  perform public.refresh_management_candidate_domain_bundle_subset(
    v_revision_id,
    v_card_ids
  );

  perform public.management_finalize_bundle_propagation(
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
  v_candidate_status text;
  v_candidate_complete boolean;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M26.6 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'M26.8 MOVE bundle requires a JSON array';
  end if;

  v_bundle_size := jsonb_array_length(p_items);
  if v_bundle_size < 1 or v_bundle_size > 24 then
    raise exception 'M26.8 MOVE bundle requires 1..24 cards';
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
    raise exception 'M26.8 MOVE bundle contains duplicate card ids';
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
    raise exception 'M26.8 MOVE bundle requires known cards from one revision';
  end if;

  v_revision_id := v_revision_ids[1];

  perform public.refresh_management_candidate_domain_bundle_subset(
    v_revision_id,
    v_card_ids
  );

  -- Evaluate the whole move against external occupancy only. Current sibling
  -- placements are intentionally excluded by the bundle-scoped refresh.
  for v_item in
    select entry.value
    from jsonb_array_elements(p_items) as entry(value)
  loop
    select
      assessment.status,
      assessment.is_complete
    into
      v_candidate_status,
      v_candidate_complete
    from public.schedule_card_candidate_assessments assessment
    where assessment.card_id = nullif(v_item ->> 'card_id', '')::uuid
      and assessment.day_of_week = nullif(v_item ->> 'day_of_week', '')::smallint
      and assessment.start_period = nullif(v_item ->> 'start_period', '')::smallint
      and assessment.teacher_id is not distinct from
        nullif(v_item ->> 'teacher_id', '')::uuid
      and assessment.room_id is not distinct from
        nullif(v_item ->> 'room_id', '')::uuid
    limit 1;

    if v_candidate_status is distinct from 'VALID'
       or coalesce(v_candidate_complete, false) is not true then
      raise exception
        'M26.8 MOVE bundle member is not externally valid: card %, status %',
        v_item ->> 'card_id',
        coalesce(v_candidate_status, 'MISSING');
    end if;
  end loop;

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

  perform public.refresh_management_candidate_domain_bundle_subset(
    v_revision_id,
    v_card_ids
  );

  perform public.management_finalize_bundle_propagation(
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

comment on function public.management_place_card_bundle(jsonb) is
  'M26.8 atomic grouped PLACE with NULL-safe exact VALID candidate matching for M22 provisional teacher/room identities.';
comment on function public.management_move_card_bundle(jsonb) is
  'M26.8 atomic grouped MOVE with NULL-safe exact VALID candidate matching for M22 provisional teacher/room identities.';

commit;
