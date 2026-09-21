-- Management / M18.2
-- Draft-only resource display-name overrides.
--
-- IMPORTANT:
-- teachers.name and rooms.name are read directly by the public schedule.
-- Editing those base rows would bypass the draft/publish boundary.
--
-- M18.2 therefore stores display-name corrections on the DRAFT revision.
-- Management UI may resolve these overrides; public schedule remains unchanged
-- until a future explicit publish/reconciliation step.

begin;

create table public.management_teacher_name_overrides (
  schedule_revision_id uuid not null
    references public.schedule_revisions(id) on delete cascade,
  teacher_id uuid not null
    references public.teachers(id) on delete cascade,
  display_name text not null,
  updated_by uuid null,
  updated_at timestamptz not null default now(),
  primary key (schedule_revision_id, teacher_id),
  constraint management_teacher_name_override_nonempty
    check (length(btrim(display_name)) > 0),
  constraint management_teacher_name_override_length
    check (length(btrim(display_name)) <= 120)
);

create index management_teacher_name_overrides_teacher_idx
  on public.management_teacher_name_overrides (teacher_id);

create table public.management_room_name_overrides (
  schedule_revision_id uuid not null
    references public.schedule_revisions(id) on delete cascade,
  room_id uuid not null
    references public.rooms(id) on delete cascade,
  display_name text not null,
  updated_by uuid null,
  updated_at timestamptz not null default now(),
  primary key (schedule_revision_id, room_id),
  constraint management_room_name_override_nonempty
    check (length(btrim(display_name)) > 0),
  constraint management_room_name_override_length
    check (length(btrim(display_name)) <= 120)
);

create index management_room_name_overrides_room_idx
  on public.management_room_name_overrides (room_id);


-- -------------------------------------------------------------------------
-- READ BOUNDARY
-- -------------------------------------------------------------------------

alter table public.management_teacher_name_overrides
  enable row level security;

alter table public.management_room_name_overrides
  enable row level security;

revoke all
  on public.management_teacher_name_overrides
  from anon, authenticated;

revoke all
  on public.management_room_name_overrides
  from anon, authenticated;

grant select
  on public.management_teacher_name_overrides
  to authenticated;

grant select
  on public.management_room_name_overrides
  to authenticated;

create policy management_teacher_name_overrides_read
  on public.management_teacher_name_overrides
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy management_room_name_overrides_read
  on public.management_room_name_overrides
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));


-- -------------------------------------------------------------------------
-- TEACHER DISPLAY NAME
-- -------------------------------------------------------------------------

create or replace function public.management_set_teacher_display_name(
  p_schedule_revision_id uuid,
  p_teacher_id uuid,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_status text;
  v_base_name text;
  v_display_name text;
  v_overridden boolean;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M18.2 management EDITOR role required'
      using errcode = '42501';
  end if;

  select revision.status
  into v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id
  for update;

  if v_revision_status is null then
    raise exception 'M18.2 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M18.2 resource override requires DRAFT revision';
  end if;

  select teacher.name
  into v_base_name
  from public.teachers teacher
  where teacher.id = p_teacher_id;

  if v_base_name is null then
    raise exception 'M18.2 teacher not found: %', p_teacher_id;
  end if;

  v_display_name := btrim(coalesce(p_display_name, ''));

  if length(v_display_name) = 0 then
    raise exception 'M18.2 teacher display name cannot be empty';
  end if;

  if length(v_display_name) > 120 then
    raise exception 'M18.2 teacher display name is too long';
  end if;

  if v_display_name = btrim(v_base_name) then
    delete from public.management_teacher_name_overrides override_row
    where override_row.schedule_revision_id = p_schedule_revision_id
      and override_row.teacher_id = p_teacher_id;

    v_overridden := false;
    v_display_name := v_base_name;
  else
    insert into public.management_teacher_name_overrides (
      schedule_revision_id,
      teacher_id,
      display_name,
      updated_by,
      updated_at
    )
    values (
      p_schedule_revision_id,
      p_teacher_id,
      v_display_name,
      auth.uid(),
      clock_timestamp()
    )
    on conflict (schedule_revision_id, teacher_id)
    do update set
      display_name = excluded.display_name,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

    v_overridden := true;
  end if;

  return jsonb_build_object(
    'resourceType', 'TEACHER',
    'resourceId', p_teacher_id,
    'baseName', v_base_name,
    'displayName', v_display_name,
    'overridden', v_overridden,
    'publishedChanged', false
  );
end
$$;

revoke all
  on function public.management_set_teacher_display_name(
    uuid,
    uuid,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.management_set_teacher_display_name(
    uuid,
    uuid,
    text
  )
  to authenticated;


-- -------------------------------------------------------------------------
-- ROOM DISPLAY NAME
-- -------------------------------------------------------------------------

create or replace function public.management_set_room_display_name(
  p_schedule_revision_id uuid,
  p_room_id uuid,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_status text;
  v_base_name text;
  v_canonical_room_id uuid;
  v_display_name text;
  v_overridden boolean;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M18.2 management EDITOR role required'
      using errcode = '42501';
  end if;

  select revision.status
  into v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id
  for update;

  if v_revision_status is null then
    raise exception 'M18.2 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M18.2 resource override requires DRAFT revision';
  end if;

  select
    room.name,
    room.canonical_room_id
  into
    v_base_name,
    v_canonical_room_id
  from public.rooms room
  where room.id = p_room_id;

  if v_base_name is null then
    raise exception 'M18.2 room not found: %', p_room_id;
  end if;

  if v_canonical_room_id is not null then
    raise exception
      'M18.2 room alias names are not edited from resource inventory';
  end if;

  v_display_name := btrim(coalesce(p_display_name, ''));

  if length(v_display_name) = 0 then
    raise exception 'M18.2 room display name cannot be empty';
  end if;

  if length(v_display_name) > 120 then
    raise exception 'M18.2 room display name is too long';
  end if;

  if v_display_name = btrim(v_base_name) then
    delete from public.management_room_name_overrides override_row
    where override_row.schedule_revision_id = p_schedule_revision_id
      and override_row.room_id = p_room_id;

    v_overridden := false;
    v_display_name := v_base_name;
  else
    insert into public.management_room_name_overrides (
      schedule_revision_id,
      room_id,
      display_name,
      updated_by,
      updated_at
    )
    values (
      p_schedule_revision_id,
      p_room_id,
      v_display_name,
      auth.uid(),
      clock_timestamp()
    )
    on conflict (schedule_revision_id, room_id)
    do update set
      display_name = excluded.display_name,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

    v_overridden := true;
  end if;

  return jsonb_build_object(
    'resourceType', 'ROOM',
    'resourceId', p_room_id,
    'baseName', v_base_name,
    'displayName', v_display_name,
    'overridden', v_overridden,
    'publishedChanged', false
  );
end
$$;

revoke all
  on function public.management_set_room_display_name(
    uuid,
    uuid,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.management_set_room_display_name(
    uuid,
    uuid,
    text
  )
  to authenticated;

comment on table public.management_teacher_name_overrides is
  'M18.2 DRAFT-only teacher display-name corrections. Base teachers.name remains the published/public value.';

comment on table public.management_room_name_overrides is
  'M18.2 DRAFT-only canonical-room display-name corrections. Base rooms.name remains the published/public value.';

comment on function public.management_set_teacher_display_name(uuid, uuid, text) is
  'M18.2 EDITOR-only DRAFT teacher display-name override. Passing the base name clears the override. Does not mutate public teachers.name.';

comment on function public.management_set_room_display_name(uuid, uuid, text) is
  'M18.2 EDITOR-only DRAFT canonical-room display-name override. Passing the base name clears the override. Does not mutate public rooms.name.';

commit;
