-- Management M26.4
-- Fix UUID revision resolution in M26.3 grouped candidate refresh / remove.
--
-- M26.3 used min(uuid) to select the single schedule revision after first
-- counting distinct revisions. That aggregate is not a safe UUID path in the
-- target PostgreSQL runtime. Both grouped drag refresh and grouped REMOVE use
-- this code, so a runtime failure disabled both interactions.
--
-- Keep the M26.3 contracts, but resolve the revision through a one-element
-- UUID array and validate the exact card count before any mutation.

begin;

create or replace function public.management_refresh_card_group_candidates(
  p_card_ids jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_card_count integer;
  v_distinct_card_count integer;
  v_matched_card_count integer;
  v_revision_id uuid;
  v_revision_ids uuid[];
  v_card_ids uuid[];
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M26.4 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_card_ids is null or jsonb_typeof(p_card_ids) <> 'array' then
    raise exception 'M26.4 candidate refresh requires a JSON card-id array';
  end if;

  v_card_count := jsonb_array_length(p_card_ids);

  if v_card_count < 1 or v_card_count > 24 then
    raise exception 'M26.4 candidate refresh requires 1..24 cards';
  end if;

  select
    count(distinct entry.value),
    array_agg(distinct entry.value::uuid)
  into
    v_distinct_card_count,
    v_card_ids
  from jsonb_array_elements_text(p_card_ids) as entry(value);

  if v_distinct_card_count <> v_card_count then
    raise exception 'M26.4 candidate refresh contains duplicate card ids';
  end if;

  select
    count(*),
    array_agg(distinct card.schedule_revision_id)
  into
    v_matched_card_count,
    v_revision_ids
  from public.schedule_cards card
  where card.id = any(v_card_ids);

  if v_matched_card_count <> v_card_count then
    raise exception 'M26.4 candidate refresh contains unknown cards';
  end if;

  if v_revision_ids is null or cardinality(v_revision_ids) <> 1 then
    raise exception
      'M26.4 candidate refresh requires cards from one revision';
  end if;

  v_revision_id := v_revision_ids[1];

  perform public.refresh_management_candidate_domain_subset(
    v_revision_id,
    v_card_ids
  );

  return v_card_count;
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
  v_matched_card_count integer;
  v_bundle_id uuid;
  v_transaction_id uuid;
  v_last_transaction_id uuid;
  v_revision_id uuid;
  v_revision_ids uuid[];
  v_card_ids uuid[];
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M26.4 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_card_ids is null or jsonb_typeof(p_card_ids) <> 'array' then
    raise exception 'M26.4 REMOVE bundle requires a JSON array';
  end if;

  v_bundle_size := jsonb_array_length(p_card_ids);

  if v_bundle_size < 1 or v_bundle_size > 24 then
    raise exception 'M26.4 REMOVE bundle requires 1..24 cards';
  end if;

  select
    count(distinct entry.value),
    array_agg(distinct entry.value::uuid)
  into
    v_distinct_card_count,
    v_card_ids
  from jsonb_array_elements_text(p_card_ids) as entry(value);

  if v_distinct_card_count <> v_bundle_size then
    raise exception 'M26.4 REMOVE bundle contains duplicate card ids';
  end if;

  select
    count(*),
    array_agg(distinct card.schedule_revision_id)
  into
    v_matched_card_count,
    v_revision_ids
  from public.schedule_cards card
  where card.id = any(v_card_ids);

  if v_matched_card_count <> v_bundle_size then
    raise exception 'M26.4 REMOVE bundle contains unknown cards';
  end if;

  if v_revision_ids is null or cardinality(v_revision_ids) <> 1 then
    raise exception 'M26.4 REMOVE bundle requires cards from one revision';
  end if;

  v_revision_id := v_revision_ids[1];

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

  -- Rebuild only the explicit group after every sibling has reached the pool.
  -- This repairs the temporary asymmetric candidate states produced while the
  -- two underlying records are being removed one at a time inside this single
  -- transaction.
  perform public.refresh_management_candidate_domain_subset(
    v_revision_id,
    v_card_ids
  );

  if v_bundle_id is null then
    raise exception 'M26.4 REMOVE bundle produced no transaction';
  end if;

  return coalesce(v_last_transaction_id, v_bundle_id);
end
$$;


revoke all
  on function public.management_refresh_card_group_candidates(jsonb)
  from public, anon;
revoke all
  on function public.management_remove_card_bundle(jsonb)
  from public, anon;

grant execute
  on function public.management_refresh_card_group_candidates(jsonb)
  to authenticated;
grant execute
  on function public.management_remove_card_bundle(jsonb)
  to authenticated;

comment on function public.management_refresh_card_group_candidates(jsonb) is
  'M26.4 live grouped candidate refresh with UUID-safe single-revision resolution.';
comment on function public.management_remove_card_bundle(jsonb) is
  'M26.4 atomic grouped REMOVE with UUID-safe revision resolution and final group candidate rebuild.';

commit;
