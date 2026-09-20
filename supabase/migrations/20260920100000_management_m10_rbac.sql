-- Management v0.1 / M10
-- Management access boundary + RBAC.
--
-- Roles:
--   VIEWER  -> read management draft/domain state
--   EDITOR  -> VIEWER + invoke controlled scheduling commands
--   ADMIN   -> EDITOR + reserved for later publish/access administration
--
-- Browser clients never receive direct write privileges on management tables.
-- The only browser write path in M10 is through SECURITY DEFINER wrapper RPCs
-- that re-check the authenticated Supabase user against management_memberships.
--
-- Existing published/student/teacher read projection is untouched.

begin;

create table public.management_memberships (
  user_id uuid primary key,
  role text not null
    check (role in ('VIEWER', 'EDITOR', 'ADMIN')),
  active boolean not null default true,
  granted_at timestamptz not null default now(),
  granted_by uuid null,
  note text null,
  constraint management_memberships_note_not_blank
    check (note is null or length(btrim(note)) > 0)
);

comment on table public.management_memberships is
  'M10 authoritative management RBAC membership keyed by Supabase auth.uid(). Deliberately no browser write policy; membership administration remains DB/service-controlled in M10.';

comment on column public.management_memberships.user_id is
  'Supabase authenticated user UUID (auth.uid()). No auth.users FK is required for access correctness; stale/nonexistent UUID rows grant access to nobody.';

alter table public.management_memberships enable row level security;

revoke all on public.management_memberships from anon, authenticated;

grant select on public.management_memberships to authenticated;

create policy management_membership_self_read
  on public.management_memberships
  for select
  to authenticated
  using (
    active
    and user_id = auth.uid()
  );

create or replace function public.management_role_rank(
  p_role text
)
returns integer
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select case p_role
    when 'VIEWER' then 10
    when 'EDITOR' then 20
    when 'ADMIN' then 30
    else 0
  end
$$;

revoke all
  on function public.management_role_rank(text)
  from public, anon, authenticated;

create or replace function public.current_management_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select membership.role
  from public.management_memberships membership
  where membership.user_id = auth.uid()
    and membership.active
  limit 1
$$;

revoke all
  on function public.current_management_role()
  from public, anon;

grant execute
  on function public.current_management_role()
  to authenticated;

create or replace function public.has_management_role(
  p_required_role text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current_role text;
  v_current_rank integer;
  v_required_rank integer;
begin
  if p_required_role not in ('VIEWER', 'EDITOR', 'ADMIN') then
    return false;
  end if;

  select public.current_management_role()
  into v_current_role;

  v_current_rank := coalesce(
    public.management_role_rank(v_current_role),
    0
  );

  v_required_rank := public.management_role_rank(p_required_role);

  return v_current_rank >= v_required_rank;
end
$$;

revoke all
  on function public.has_management_role(text)
  from public, anon;

grant execute
  on function public.has_management_role(text)
  to authenticated;

create or replace function public.management_access_context()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'role', public.current_management_role(),
    'can_view', public.has_management_role('VIEWER'),
    'can_edit', public.has_management_role('EDITOR'),
    'can_admin', public.has_management_role('ADMIN')
  )
$$;

revoke all
  on function public.management_access_context()
  from public, anon;

grant execute
  on function public.management_access_context()
  to authenticated;


-- -------------------------------------------------------------------------
-- READ BOUNDARY
-- -------------------------------------------------------------------------
-- Management domain tables remain RLS-protected. Any active management role
-- may read them. No authenticated direct INSERT/UPDATE/DELETE is granted.

grant select on public.requirement_sets to authenticated;
grant select on public.instructional_groups to authenticated;
grant select on public.instructional_group_relations to authenticated;
grant select on public.course_requirements to authenticated;
grant select on public.course_requirement_teachers to authenticated;
grant select on public.course_requirement_rooms to authenticated;
grant select on public.course_requirement_source_sessions to authenticated;
grant select on public.schedule_revisions to authenticated;
grant select on public.schedule_cards to authenticated;
grant select on public.placements to authenticated;
grant select on public.move_transactions to authenticated;
grant select on public.schedule_card_candidate_assessments to authenticated;
grant select on public.schedule_card_domain_summaries to authenticated;

revoke insert, update, delete
  on public.requirement_sets
  from anon, authenticated;
revoke insert, update, delete
  on public.instructional_groups
  from anon, authenticated;
revoke insert, update, delete
  on public.instructional_group_relations
  from anon, authenticated;
revoke insert, update, delete
  on public.course_requirements
  from anon, authenticated;
revoke insert, update, delete
  on public.course_requirement_teachers
  from anon, authenticated;
revoke insert, update, delete
  on public.course_requirement_rooms
  from anon, authenticated;
revoke insert, update, delete
  on public.course_requirement_source_sessions
  from anon, authenticated;
revoke insert, update, delete
  on public.schedule_revisions
  from anon, authenticated;
revoke insert, update, delete
  on public.schedule_cards
  from anon, authenticated;
revoke insert, update, delete
  on public.placements
  from anon, authenticated;
revoke insert, update, delete
  on public.move_transactions
  from anon, authenticated;
revoke insert, update, delete
  on public.schedule_card_candidate_assessments
  from anon, authenticated;
revoke insert, update, delete
  on public.schedule_card_domain_summaries
  from anon, authenticated;

create policy management_requirement_sets_read
  on public.requirement_sets
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy management_instructional_groups_read
  on public.instructional_groups
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy management_instructional_group_relations_read
  on public.instructional_group_relations
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy management_course_requirements_read
  on public.course_requirements
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy management_course_requirement_teachers_read
  on public.course_requirement_teachers
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy management_course_requirement_rooms_read
  on public.course_requirement_rooms
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy management_course_requirement_source_sessions_read
  on public.course_requirement_source_sessions
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy management_schedule_revisions_read
  on public.schedule_revisions
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy management_schedule_cards_read
  on public.schedule_cards
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy management_placements_read
  on public.placements
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy management_move_transactions_read
  on public.move_transactions
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy management_candidate_assessments_read
  on public.schedule_card_candidate_assessments
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));

create policy management_domain_summaries_read
  on public.schedule_card_domain_summaries
  for select
  to authenticated
  using (public.has_management_role('VIEWER'));


-- -------------------------------------------------------------------------
-- WRITE BOUNDARY
-- -------------------------------------------------------------------------
-- Existing engine functions remain private implementation details. M10 exposes
-- only role-checking wrappers to authenticated browser sessions.

revoke all
  on function public.place_management_card(uuid, smallint, smallint, uuid, uuid)
  from public, anon, authenticated;

revoke all
  on function public.move_management_card(uuid, smallint, smallint, uuid, uuid)
  from public, anon, authenticated;

revoke all
  on function public.remove_management_card(uuid)
  from public, anon, authenticated;

revoke all
  on function public.undo_management_root_transaction(uuid)
  from public, anon, authenticated;

revoke all
  on function public.redo_management_undo_transaction(uuid)
  from public, anon, authenticated;

revoke all
  on function public.propagate_management_forced_cards(uuid, uuid, uuid)
  from public, anon, authenticated;

revoke all
  on function public.refresh_management_candidate_domain(uuid)
  from public, anon, authenticated;


create or replace function public.management_place_card(
  p_card_id uuid,
  p_day_of_week smallint,
  p_start_period smallint,
  p_teacher_id uuid,
  p_room_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M10 management EDITOR role required'
      using errcode = '42501';
  end if;

  return public.place_management_card(
    p_card_id,
    p_day_of_week,
    p_start_period,
    p_teacher_id,
    p_room_id
  );
end
$$;

create or replace function public.management_move_card(
  p_card_id uuid,
  p_day_of_week smallint,
  p_start_period smallint,
  p_teacher_id uuid,
  p_room_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M10 management EDITOR role required'
      using errcode = '42501';
  end if;

  return public.move_management_card(
    p_card_id,
    p_day_of_week,
    p_start_period,
    p_teacher_id,
    p_room_id
  );
end
$$;

create or replace function public.management_remove_card(
  p_card_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M10 management EDITOR role required'
      using errcode = '42501';
  end if;

  return public.remove_management_card(p_card_id);
end
$$;

create or replace function public.management_undo(
  p_root_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M10 management EDITOR role required'
      using errcode = '42501';
  end if;

  return public.undo_management_root_transaction(
    p_root_transaction_id
  );
end
$$;

create or replace function public.management_redo(
  p_undo_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M10 management EDITOR role required'
      using errcode = '42501';
  end if;

  return public.redo_management_undo_transaction(
    p_undo_transaction_id
  );
end
$$;

revoke all
  on function public.management_place_card(uuid, smallint, smallint, uuid, uuid)
  from public, anon, authenticated;
revoke all
  on function public.management_move_card(uuid, smallint, smallint, uuid, uuid)
  from public, anon, authenticated;
revoke all
  on function public.management_remove_card(uuid)
  from public, anon, authenticated;
revoke all
  on function public.management_undo(uuid)
  from public, anon, authenticated;
revoke all
  on function public.management_redo(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_place_card(uuid, smallint, smallint, uuid, uuid)
  to authenticated;
grant execute
  on function public.management_move_card(uuid, smallint, smallint, uuid, uuid)
  to authenticated;
grant execute
  on function public.management_remove_card(uuid)
  to authenticated;
grant execute
  on function public.management_undo(uuid)
  to authenticated;
grant execute
  on function public.management_redo(uuid)
  to authenticated;

comment on function public.management_place_card(uuid, smallint, smallint, uuid, uuid) is
  'M10 authenticated EDITOR/ADMIN scheduling RPC wrapper for manual PLACE.';
comment on function public.management_move_card(uuid, smallint, smallint, uuid, uuid) is
  'M10 authenticated EDITOR/ADMIN scheduling RPC wrapper for manual MOVE.';
comment on function public.management_remove_card(uuid) is
  'M10 authenticated EDITOR/ADMIN scheduling RPC wrapper for manual REMOVE.';
comment on function public.management_undo(uuid) is
  'M10 authenticated EDITOR/ADMIN scheduling RPC wrapper for LIFO root UNDO.';
comment on function public.management_redo(uuid) is
  'M10 authenticated EDITOR/ADMIN scheduling RPC wrapper for safe REDO.';


-- -------------------------------------------------------------------------
-- INSTALLATION INVARIANTS
-- -------------------------------------------------------------------------

do $$
declare
  v_revision_id uuid;
  v_revision_count integer;
  v_card_count integer;
  v_summary_count integer;
  v_placement_count integer;
  v_transaction_count integer;
  v_published_session_count integer;
begin
  select count(*)
  into v_revision_count
  from public.schedule_revisions revision
  where revision.status = 'DRAFT'
    and revision.version_number = 1;

  if v_revision_count <> 1 then
    raise exception 'M10 expected one canonical v1 DRAFT revision, found %',
      v_revision_count;
  end if;

  select revision.id
  into v_revision_id
  from public.schedule_revisions revision
  where revision.status = 'DRAFT'
    and revision.version_number = 1;

  select count(*)
  into v_card_count
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id;

  if v_card_count <> 289 then
    raise exception 'M10 expected 289 cards, found %', v_card_count;
  end if;

  select count(*)
  into v_summary_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card
    on card.id = summary.card_id
  where card.schedule_revision_id = v_revision_id;

  if v_summary_count <> 289 then
    raise exception 'M10 expected 289 candidate-domain summaries, found %',
      v_summary_count;
  end if;

  select count(*)
  into v_placement_count
  from public.placements;

  select count(*)
  into v_transaction_count
  from public.move_transactions;

  if v_placement_count <> 0 or v_transaction_count <> 0 then
    raise exception
      'M10 installation requires clean rollback state: placements %, transactions %',
      v_placement_count,
      v_transaction_count;
  end if;

  select count(*)
  into v_published_session_count
  from public.schedule_sessions
  where academic_year = '2026-2027';

  if v_published_session_count <> 517 then
    raise exception
      'M10 changed published schedule projection unexpectedly: %',
      v_published_session_count;
  end if;

  update public.schedule_revisions revision
  set validation_summary =
    coalesce(revision.validation_summary, '{}'::jsonb)
    || jsonb_build_object(
      'management_access_engine_version', 'M10-v0.1',
      'management_roles', jsonb_build_array('VIEWER', 'EDITOR', 'ADMIN'),
      'management_read_rls', 'READY',
      'management_editor_rpc_boundary', 'READY',
      'management_membership_admin', 'DB_SERVICE_ONLY',
      'management_rbac_smoke_test', 'PENDING',
      'publish', 'NOT_IMPLEMENTED'
    )
  where revision.id = v_revision_id;
end
$$;

commit;
