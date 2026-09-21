-- Management / M18.4
-- Course-plan room selection strategy.
--
-- A requirement can resolve rooms by:
--   SPECIFIC   -> one canonical room (FIXED) or several canonical rooms (ELIGIBLE_POOL)
--   CAPABILITY -> one required room capability
--   UNKNOWN    -> unresolved room knowledge
--
-- Any strategy change requires all cards for the requirement to be unplaced,
-- preserving the same safety invariant as M17.1. Only the requirement's cards
-- are refreshed. Published schedule projection is untouched.

begin;

create or replace function public.management_update_requirement_room_strategy(
  p_requirement_id uuid,
  p_strategy text,
  p_room_ids uuid[],
  p_required_capability text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_card_ids uuid[];
  v_room_ids uuid[] := coalesce(p_room_ids, array[]::uuid[]);
  v_distinct_room_count integer;
  v_room_count integer;
  v_placed_count integer;
  v_capability text := nullif(btrim(coalesce(p_required_capability, '')), '');
  v_resource_mode text;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M18.4 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_strategy not in ('SPECIFIC', 'CAPABILITY', 'UNKNOWN') then
    raise exception 'M18.4 invalid room strategy';
  end if;

  select revision.id
  into v_revision_id
  from public.schedule_revisions revision
  join public.course_requirements requirement
    on requirement.requirement_set_id = revision.requirement_set_id
  where requirement.id = p_requirement_id
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1
  for update of revision;

  if v_revision_id is null then
    raise exception 'M18.4 requirement is not part of an active DRAFT: %',
      p_requirement_id;
  end if;

  perform 1
  from public.course_requirements requirement
  where requirement.id = p_requirement_id
  for update;

  select coalesce(
    array_agg(card.id order by card.block_index),
    array[]::uuid[]
  )
  into v_card_ids
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = p_requirement_id;

  if cardinality(v_card_ids) > 0 then
    perform 1
    from public.schedule_cards card
    where card.id = any(v_card_ids)
    for update;

    perform 1
    from public.placements placement
    where placement.card_id = any(v_card_ids)
    for update;
  end if;

  select count(*)
  into v_placed_count
  from public.placements placement
  where placement.card_id = any(v_card_ids);

  if v_placed_count > 0 then
    raise exception
      'M18.4 room strategy change requires all requirement cards to be unplaced first; placed cards: %',
      v_placed_count;
  end if;

  select
    count(distinct room_id),
    count(*)
  into
    v_distinct_room_count,
    v_room_count
  from unnest(v_room_ids) as selected(room_id);

  if v_distinct_room_count <> v_room_count then
    raise exception 'M18.4 room selection contains duplicates';
  end if;

  if p_strategy = 'SPECIFIC' then
    if v_room_count = 0 then
      raise exception 'M18.4 SPECIFIC strategy requires at least one room';
    end if;

    if v_capability is not null then
      raise exception 'M18.4 SPECIFIC strategy cannot include a capability';
    end if;

    if exists (
      select 1
      from unnest(v_room_ids) as selected(room_id)
      where not exists (
        select 1
        from public.rooms room
        where room.id = selected.room_id
          and room.canonical_room_id is null
      )
    ) then
      raise exception
        'M18.4 SPECIFIC strategy contains an unknown or alias room';
    end if;

    v_resource_mode := case
      when v_room_count = 1 then 'FIXED'
      else 'ELIGIBLE_POOL'
    end;

  elsif p_strategy = 'CAPABILITY' then
    if v_room_count <> 0 then
      raise exception 'M18.4 CAPABILITY strategy cannot include room ids';
    end if;

    if v_capability is null then
      raise exception 'M18.4 CAPABILITY strategy requires a capability';
    end if;

    if length(v_capability) > 80 then
      raise exception 'M18.4 capability is too long';
    end if;

    v_resource_mode := 'CAPABILITY';

  else
    if v_room_count <> 0 or v_capability is not null then
      raise exception
        'M18.4 UNKNOWN strategy cannot include rooms or capability';
    end if;

    v_resource_mode := 'UNKNOWN';
  end if;

  delete from public.course_requirement_rooms
  where requirement_id = p_requirement_id;

  if p_strategy = 'SPECIFIC' then
    insert into public.course_requirement_rooms (
      requirement_id,
      room_id
    )
    select
      p_requirement_id,
      selected.room_id
    from unnest(v_room_ids) as selected(room_id);
  end if;

  update public.course_requirements
  set
    resource_mode = v_resource_mode,
    required_capability = case
      when p_strategy = 'CAPABILITY' then v_capability
      else null
    end
  where id = p_requirement_id;

  perform public.refresh_management_candidate_domain_subset(
    v_revision_id,
    v_card_ids
  );

  return jsonb_build_object(
    'applied', true,
    'requirementId', p_requirement_id,
    'revisionId', v_revision_id,
    'strategy', p_strategy,
    'resourceMode', v_resource_mode,
    'roomCount', case
      when p_strategy = 'SPECIFIC' then v_room_count
      else 0
    end,
    'requiredCapability', case
      when p_strategy = 'CAPABILITY' then v_capability
      else null
    end,
    'candidateRebuildCardCount', cardinality(v_card_ids),
    'publishedChanged', false
  );
end
$$;

revoke all
  on function public.management_update_requirement_room_strategy(
    uuid,
    text,
    uuid[],
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.management_update_requirement_room_strategy(
    uuid,
    text,
    uuid[],
    text
  )
  to authenticated;

comment on function public.management_update_requirement_room_strategy(uuid, text, uuid[], text) is
  'M18.4 EDITOR-only DRAFT room selection strategy update. Supports SPECIFIC, CAPABILITY and UNKNOWN; requires all requirement cards unplaced and refreshes only that requirement candidate domain.';

commit;
