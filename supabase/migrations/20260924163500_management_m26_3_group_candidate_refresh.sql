-- Management M26.3
-- Keep grouped-card candidate domains current after atomic pool operations,
-- and provide an explicit live refresh used before drag/drop.

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
  v_revision_id uuid;
  v_revision_count integer;
  v_card_ids uuid[];
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M26.3 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_card_ids is null or jsonb_typeof(p_card_ids) <> 'array' then
    raise exception 'M26.3 candidate refresh requires a JSON card-id array';
  end if;

  v_card_count := jsonb_array_length(p_card_ids);
  if v_card_count < 1 or v_card_count > 24 then
    raise exception 'M26.3 candidate refresh requires 1..24 cards';
  end if;

  select
    count(distinct entry.value),
    array_agg(distinct entry.value::uuid order by entry.value::uuid)
  into
    v_distinct_card_count,
    v_card_ids
  from jsonb_array_elements_text(p_card_ids) as entry(value);

  if v_distinct_card_count <> v_card_count then
    raise exception 'M26.3 candidate refresh contains duplicate card ids';
  end if;

  select
    count(distinct card.schedule_revision_id),
    min(card.schedule_revision_id)
  into
    v_revision_count,
    v_revision_id
  from public.schedule_cards card
  where card.id = any(v_card_ids);

  if v_revision_count <> 1 then
    raise exception
      'M26.3 candidate refresh requires cards from one revision';
  end if;

  if (
    select count(*)
    from public.schedule_cards card
    where card.id = any(v_card_ids)
      and card.schedule_revision_id = v_revision_id
  ) <> v_card_count then
    raise exception 'M26.3 candidate refresh contains unknown cards';
  end if;

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
  v_bundle_id uuid;
  v_transaction_id uuid;
  v_last_transaction_id uuid;
  v_revision_id uuid;
  v_revision_count integer;
  v_card_ids uuid[];
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M26.3 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_card_ids is null or jsonb_typeof(p_card_ids) <> 'array' then
    raise exception 'M26.3 REMOVE bundle requires a JSON array';
  end if;

  v_bundle_size := jsonb_array_length(p_card_ids);
  if v_bundle_size < 1 or v_bundle_size > 24 then
    raise exception 'M26.3 REMOVE bundle requires 1..24 cards';
  end if;

  select
    count(distinct entry.value),
    array_agg(distinct entry.value::uuid order by entry.value::uuid)
  into
    v_distinct_card_count,
    v_card_ids
  from jsonb_array_elements_text(p_card_ids) as entry(value);

  if v_distinct_card_count <> v_bundle_size then
    raise exception 'M26.3 REMOVE bundle contains duplicate card ids';
  end if;

  select
    count(distinct card.schedule_revision_id),
    min(card.schedule_revision_id)
  into
    v_revision_count,
    v_revision_id
  from public.schedule_cards card
  where card.id = any(v_card_ids);

  if v_revision_count <> 1 then
    raise exception 'M26.3 REMOVE bundle requires cards from one revision';
  end if;

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

  -- Each underlying REMOVE uses a delta refresh while sibling cards are still
  -- transitioning. Rebuild the small explicit bundle subset once after the
  -- final state is reached so pool drag candidates cannot remain stale.
  perform public.refresh_management_candidate_domain_subset(
    v_revision_id,
    v_card_ids
  );

  if v_bundle_id is null then
    raise exception 'M26.3 REMOVE bundle produced no transaction';
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
  'M26.3 live subset refresh for one visual card/group before drag/drop. Repairs stale legacy pool domains without rebuilding the whole draft.';
comment on function public.management_remove_card_bundle(jsonb) is
  'M26.3 atomic grouped REMOVE with a final explicit subset-domain rebuild after all sibling cards reach the pool.';

commit;
