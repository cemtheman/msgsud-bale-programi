-- Management / M28
-- Resource inventory lifecycle: create/delete resources + teacher active state.
--
-- Teachers are soft-retired with operational_status so history remains intact
-- and a returning teacher can be reactivated. Rooms retain the existing
-- ACTIVE/MAINTENANCE/OUT_OF_SERVICE lifecycle.
--
-- Physical DELETE is intentionally restricted to truly unused resources.

begin;

alter table public.teachers
  add column if not exists operational_status text not null default 'ACTIVE';

alter table public.teachers
  drop constraint if exists teachers_operational_status_check;

alter table public.teachers
  add constraint teachers_operational_status_check
  check (operational_status in ('ACTIVE', 'INACTIVE'));

create index if not exists teachers_operational_status_idx
  on public.teachers (operational_status);

comment on column public.teachers.operational_status is
  'M28 teacher availability. INACTIVE keeps historical identity but removes the teacher from new scheduling choices.';

create or replace function public.management_enforce_teacher_operational_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  if new.teacher_id is null then
    return new;
  end if;

  select teacher.operational_status
  into v_status
  from public.teachers teacher
  where teacher.id = new.teacher_id;

  if coalesce(v_status, 'ACTIVE') <> 'ACTIVE' then
    new.status := 'INVALID';
    new.reason_codes := array(
      select distinct reason
      from unnest(
        coalesce(new.reason_codes, array[]::text[])
        || array['TEACHER_INACTIVE']::text[]
      ) reason
      order by reason
    );
    new.details := coalesce(new.details, '{}'::jsonb)
      || jsonb_build_object('teacher_operational_status', v_status);
  end if;

  return new;
end
$$;

drop trigger if exists
  zzzz_management_enforce_teacher_operational_status_trigger
  on public.schedule_card_candidate_assessments;

create trigger zzzz_management_enforce_teacher_operational_status_trigger
before insert or update of teacher_id, status, reason_codes, details
on public.schedule_card_candidate_assessments
for each row
execute function public.management_enforce_teacher_operational_status();

revoke all
  on function public.management_enforce_teacher_operational_status()
  from public, anon, authenticated;

create or replace function public.management_create_teacher_resource(
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M28 management EDITOR role required'
      using errcode = '42501';
  end if;

  if length(v_name) = 0 then
    raise exception 'M28 resource name cannot be empty';
  end if;
  if length(v_name) > 120 then
    raise exception 'M28 resource name too long';
  end if;
  if exists (
    select 1 from public.teachers
    where lower(btrim(name)) = lower(v_name)
  ) then
    raise exception 'M28 resource name already exists';
  end if;

  insert into public.teachers (id, name, operational_status)
  values (gen_random_uuid(), v_name, 'ACTIVE')
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'name', v_name,
    'resourceType', 'TEACHER',
    'publishedChanged', false
  );
end
$$;

create or replace function public.management_create_room_resource(
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M28 management EDITOR role required'
      using errcode = '42501';
  end if;

  if length(v_name) = 0 then
    raise exception 'M28 resource name cannot be empty';
  end if;
  if length(v_name) > 120 then
    raise exception 'M28 resource name too long';
  end if;
  if exists (
    select 1 from public.rooms
    where canonical_room_id is null
      and lower(btrim(name)) = lower(v_name)
  ) then
    raise exception 'M28 resource name already exists';
  end if;

  insert into public.rooms (
    id,
    name,
    canonical_room_id,
    capabilities,
    knowledge_status,
    operational_status
  )
  values (
    gen_random_uuid(),
    v_name,
    null,
    array[]::text[],
    'UNKNOWN',
    'ACTIVE'
  )
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'name', v_name,
    'resourceType', 'ROOM',
    'publishedChanged', false
  );
end
$$;

create or replace function public.management_set_teacher_operational_status(
  p_schedule_revision_id uuid,
  p_teacher_id uuid,
  p_operational_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_status text;
  v_current_status text;
  v_card_ids uuid[];
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M28 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_operational_status not in ('ACTIVE', 'INACTIVE') then
    raise exception 'M28 invalid teacher operational status';
  end if;

  select status into v_revision_status
  from public.schedule_revisions
  where id = p_schedule_revision_id
  for update;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M28 teacher status requires DRAFT revision';
  end if;

  select operational_status into v_current_status
  from public.teachers
  where id = p_teacher_id
  for update;

  if v_current_status is null then
    raise exception 'M28 teacher not found';
  end if;

  if p_operational_status = 'INACTIVE'
     and exists (
       select 1
       from public.placements placement
       join public.schedule_cards card
         on card.id = placement.card_id
       where card.schedule_revision_id = p_schedule_revision_id
         and placement.teacher_id = p_teacher_id
     ) then
    raise exception 'M28 teacher is used by active draft placements';
  end if;

  select coalesce(
    array_agg(distinct card.id order by card.id),
    array[]::uuid[]
  )
  into v_card_ids
  from public.schedule_cards card
  join public.course_requirement_teachers assignment
    on assignment.requirement_id = card.requirement_id
  where card.schedule_revision_id = p_schedule_revision_id
    and assignment.teacher_id = p_teacher_id;

  update public.teachers
  set operational_status = p_operational_status
  where id = p_teacher_id;

  if cardinality(v_card_ids) > 0 then
    perform public.refresh_management_candidate_domain_subset(
      p_schedule_revision_id,
      v_card_ids
    );
  end if;

  return jsonb_build_object(
    'teacherId', p_teacher_id,
    'operationalStatus', p_operational_status,
    'candidateRebuildCardCount', cardinality(v_card_ids),
    'publishedChanged', false
  );
end
$$;

create or replace function public.management_delete_teacher_resource(
  p_teacher_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_name text;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M28 management EDITOR role required'
      using errcode = '42501';
  end if;

  select name into v_name
  from public.teachers
  where id = p_teacher_id
  for update;

  if v_name is null then
    raise exception 'M28 teacher not found';
  end if;

  if exists (
    select 1 from public.course_requirement_teachers
    where teacher_id = p_teacher_id
  ) or exists (
    select 1 from public.placements
    where teacher_id = p_teacher_id
  ) then
    raise exception 'M28 resource is still referenced';
  end if;

  begin
    delete from public.teachers where id = p_teacher_id;
  exception when foreign_key_violation then
    raise exception 'M28 resource is still referenced';
  end;

  return jsonb_build_object(
    'id', p_teacher_id,
    'resourceType', 'TEACHER',
    'deleted', true,
    'publishedChanged', false
  );
end
$$;

create or replace function public.management_delete_room_resource(
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_name text;
  v_canonical uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M28 management EDITOR role required'
      using errcode = '42501';
  end if;

  select name, canonical_room_id
  into v_name, v_canonical
  from public.rooms
  where id = p_room_id
  for update;

  if v_name is null then
    raise exception 'M28 room not found';
  end if;

  if v_canonical is not null then
    raise exception 'M28 room aliases are not deleted directly';
  end if;

  if exists (
    select 1 from public.rooms
    where canonical_room_id = p_room_id
  ) then
    raise exception 'M28 canonical room has aliases';
  end if;

  if exists (
    select 1 from public.course_requirement_rooms
    where room_id = p_room_id
  ) or exists (
    select 1 from public.placements
    where room_id = p_room_id
  ) then
    raise exception 'M28 resource is still referenced';
  end if;

  begin
    delete from public.rooms where id = p_room_id;
  exception when foreign_key_violation then
    raise exception 'M28 resource is still referenced';
  end;

  return jsonb_build_object(
    'id', p_room_id,
    'resourceType', 'ROOM',
    'deleted', true,
    'publishedChanged', false
  );
end
$$;

-- Keep M17.1 contract but reject inactive teachers from new assignment pools.
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
    raise exception 'M28 management EDITOR role required'
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

  select count(*) into v_placed_count
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
        and teacher.operational_status = 'ACTIVE'
    )
  ) then
    raise exception 'M28 teacher selection contains unknown or inactive teacher';
  end if;

  delete from public.course_requirement_teachers
  where requirement_id = p_requirement_id;

  insert into public.course_requirement_teachers (
    requirement_id,
    teacher_id
  )
  select p_requirement_id, teacher_id
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

revoke all on function public.management_create_teacher_resource(text)
  from public, anon;
revoke all on function public.management_create_room_resource(text)
  from public, anon;
revoke all on function public.management_set_teacher_operational_status(uuid,uuid,text)
  from public, anon;
revoke all on function public.management_delete_teacher_resource(uuid)
  from public, anon;
revoke all on function public.management_delete_room_resource(uuid)
  from public, anon;

grant execute on function public.management_create_teacher_resource(text)
  to authenticated;
grant execute on function public.management_create_room_resource(text)
  to authenticated;
grant execute on function public.management_set_teacher_operational_status(uuid,uuid,text)
  to authenticated;
grant execute on function public.management_delete_teacher_resource(uuid)
  to authenticated;
grant execute on function public.management_delete_room_resource(uuid)
  to authenticated;

commit;
