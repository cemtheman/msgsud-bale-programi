-- Management / M17.1
-- Controlled course-plan assignment editing.
--
-- Teacher and room assignment changes are configuration changes, not schedule
-- placement moves. They are allowed only while none of the requirement's cards
-- are currently placed. This avoids silently invalidating an existing schedule.
--
-- Weekly load / partition / term-status mutation is intentionally deferred:
-- those changes can create/delete cards and require a separate impact workflow.

begin;

create or replace function public.management_update_requirement_teachers(
  p_requirement_id uuid,
  p_teacher_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_card_ids uuid[];
  v_teacher_ids uuid[] := coalesce(p_teacher_ids, array[]::uuid[]);
  v_distinct_teacher_count integer;
  v_existing_teacher_count integer;
  v_placed_count integer;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M17.1 management EDITOR role required'
      using errcode = '42501';
  end if;

  select revision.id
  into v_revision_id
  from public.schedule_revisions revision
  join public.course_requirements requirement
    on requirement.requirement_set_id = revision.requirement_set_id
  where requirement.id = p_requirement_id
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1;

  if v_revision_id is null then
    raise exception 'M17.1 requirement is not part of an active DRAFT: %',
      p_requirement_id;
  end if;

  select coalesce(array_agg(card.id order by card.block_index), array[]::uuid[])
  into v_card_ids
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = p_requirement_id;

  select count(*)
  into v_placed_count
  from public.placements placement
  where placement.card_id = any(v_card_ids);

  if v_placed_count > 0 then
    raise exception
      'M17.1 assignment change requires all requirement cards to be unplaced first; placed cards: %',
      v_placed_count;
  end if;

  select count(distinct teacher_id), count(*)
  into v_distinct_teacher_count, v_existing_teacher_count
  from unnest(v_teacher_ids) as teacher_id;

  if v_distinct_teacher_count <> v_existing_teacher_count then
    raise exception 'M17.1 teacher selection contains duplicates';
  end if;

  if exists (
    select 1
    from unnest(v_teacher_ids) as selected_teacher_id
    where not exists (
      select 1
      from public.teachers teacher
      where teacher.id = selected_teacher_id
    )
  ) then
    raise exception 'M17.1 teacher selection contains an unknown teacher';
  end if;

  delete from public.course_requirement_teachers
  where requirement_id = p_requirement_id;

  insert into public.course_requirement_teachers (
    requirement_id,
    teacher_id
  )
  select
    p_requirement_id,
    teacher_id
  from unnest(v_teacher_ids) as teacher_id;

  update public.course_requirements
  set teacher_mode = case
    when cardinality(v_teacher_ids) = 0 then 'UNKNOWN'
    when cardinality(v_teacher_ids) = 1 then 'FIXED'
    else 'ELIGIBLE_POOL'
  end
  where id = p_requirement_id;

  perform public.refresh_management_candidate_domain_subset(
    v_revision_id,
    v_card_ids
  );

  return p_requirement_id;
end
$$;

create or replace function public.management_update_requirement_rooms(
  p_requirement_id uuid,
  p_room_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_card_ids uuid[];
  v_room_ids uuid[] := coalesce(p_room_ids, array[]::uuid[]);
  v_distinct_room_count integer;
  v_existing_room_count integer;
  v_placed_count integer;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M17.1 management EDITOR role required'
      using errcode = '42501';
  end if;

  select revision.id
  into v_revision_id
  from public.schedule_revisions revision
  join public.course_requirements requirement
    on requirement.requirement_set_id = revision.requirement_set_id
  where requirement.id = p_requirement_id
    and revision.status = 'DRAFT'
  order by revision.version_number desc
  limit 1;

  if v_revision_id is null then
    raise exception 'M17.1 requirement is not part of an active DRAFT: %',
      p_requirement_id;
  end if;

  select coalesce(array_agg(card.id order by card.block_index), array[]::uuid[])
  into v_card_ids
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id
    and card.requirement_id = p_requirement_id;

  select count(*)
  into v_placed_count
  from public.placements placement
  where placement.card_id = any(v_card_ids);

  if v_placed_count > 0 then
    raise exception
      'M17.1 assignment change requires all requirement cards to be unplaced first; placed cards: %',
      v_placed_count;
  end if;

  select count(distinct room_id), count(*)
  into v_distinct_room_count, v_existing_room_count
  from unnest(v_room_ids) as room_id;

  if v_distinct_room_count <> v_existing_room_count then
    raise exception 'M17.1 room selection contains duplicates';
  end if;

  if exists (
    select 1
    from unnest(v_room_ids) as selected_room_id
    where not exists (
      select 1
      from public.rooms room
      where room.id = selected_room_id
    )
  ) then
    raise exception 'M17.1 room selection contains an unknown room';
  end if;

  delete from public.course_requirement_rooms
  where requirement_id = p_requirement_id;

  insert into public.course_requirement_rooms (
    requirement_id,
    room_id
  )
  select
    p_requirement_id,
    room_id
  from unnest(v_room_ids) as room_id;

  update public.course_requirements
  set
    resource_mode = case
      when cardinality(v_room_ids) = 0 then 'UNKNOWN'
      when cardinality(v_room_ids) = 1 then 'FIXED'
      else 'ELIGIBLE_POOL'
    end,
    required_capability = null
  where id = p_requirement_id;

  perform public.refresh_management_candidate_domain_subset(
    v_revision_id,
    v_card_ids
  );

  return p_requirement_id;
end
$$;

revoke all
  on function public.management_update_requirement_teachers(uuid, uuid[])
  from public, anon, authenticated;

revoke all
  on function public.management_update_requirement_rooms(uuid, uuid[])
  from public, anon, authenticated;

grant execute
  on function public.management_update_requirement_teachers(uuid, uuid[])
  to authenticated;

grant execute
  on function public.management_update_requirement_rooms(uuid, uuid[])
  to authenticated;

comment on function public.management_update_requirement_teachers(uuid, uuid[]) is
  'M17.1 EDITOR course-plan teacher assignment update. Requires all cards for the requirement to be unplaced and rebuilds only that requirement candidate domain.';

comment on function public.management_update_requirement_rooms(uuid, uuid[]) is
  'M17.1 EDITOR course-plan room assignment update. Requires all cards for the requirement to be unplaced and rebuilds only that requirement candidate domain.';

commit;
