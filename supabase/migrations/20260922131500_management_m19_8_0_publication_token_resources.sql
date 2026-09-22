-- Management / M19.8.0
-- Publication state-token hardening before any write-capable publication engine.
--
-- M19.3.1 covered exact end-time overrides. M19.8.0 additionally covers
-- publication-relevant resource names, draft name overrides, and course-plan
-- teacher/room assignments so a preview token cannot survive a meaningful
-- draft/resource change.
--
-- No public schedule rows are mutated.

begin;

alter function public.management_publication_state_token(uuid)
  rename to management_publication_state_token_m19_3_1;

create or replace function public.management_publication_state_token(
  p_schedule_revision_id uuid
)
returns text
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  with
  revision_context as (
    select
      revision.id,
      revision.requirement_set_id
    from public.schedule_revisions revision
    where revision.id = p_schedule_revision_id
  ),
  base_token as (
    select public.management_publication_state_token_m19_3_1(
      p_schedule_revision_id
    ) as value
  ),
  teacher_assignments as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'requirementId', assignment.requirement_id,
          'teacherId', assignment.teacher_id,
          'knowledgeStatus', assignment.knowledge_status
        )
        order by assignment.requirement_id, assignment.teacher_id
      ),
      '[]'::jsonb
    ) as value
    from public.course_requirement_teachers assignment
    join public.course_requirements requirement
      on requirement.id = assignment.requirement_id
    join revision_context context
      on context.requirement_set_id = requirement.requirement_set_id
  ),
  room_assignments as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'requirementId', assignment.requirement_id,
          'roomId', assignment.room_id,
          'knowledgeStatus', assignment.knowledge_status
        )
        order by assignment.requirement_id, assignment.room_id
      ),
      '[]'::jsonb
    ) as value
    from public.course_requirement_rooms assignment
    join public.course_requirements requirement
      on requirement.id = assignment.requirement_id
    join revision_context context
      on context.requirement_set_id = requirement.requirement_set_id
  ),
  teacher_name_overrides as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'teacherId', name_override.teacher_id,
          'baseName', teacher.name,
          'displayName', name_override.display_name
        )
        order by name_override.teacher_id
      ),
      '[]'::jsonb
    ) as value
    from public.management_teacher_name_overrides name_override
    join public.teachers teacher
      on teacher.id = name_override.teacher_id
    where name_override.schedule_revision_id = p_schedule_revision_id
  ),
  room_name_overrides as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'roomId', name_override.room_id,
          'baseName', room.name,
          'displayName', name_override.display_name,
          'canonicalRoomId', room.canonical_room_id
        )
        order by name_override.room_id
      ),
      '[]'::jsonb
    ) as value
    from public.management_room_name_overrides name_override
    join public.rooms room
      on room.id = name_override.room_id
    where name_override.schedule_revision_id = p_schedule_revision_id
  ),
  placement_resources as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cardId', card.id,
          'teacherId', placement.teacher_id,
          'teacherName', teacher.name,
          'selectedRoomId', placement.room_id,
          'canonicalRoomId', coalesce(
            selected_room.canonical_room_id,
            placement.room_id
          ),
          'canonicalRoomName', canonical_room.name,
          'canonicalRoomStatus', canonical_room.operational_status
        )
        order by card.id
      ),
      '[]'::jsonb
    ) as value
    from public.schedule_cards card
    join public.placements placement
      on placement.card_id = card.id
    left join public.teachers teacher
      on teacher.id = placement.teacher_id
    left join public.rooms selected_room
      on selected_room.id = placement.room_id
    left join public.rooms canonical_room
      on canonical_room.id = coalesce(
        selected_room.canonical_room_id,
        placement.room_id
      )
    where card.schedule_revision_id = p_schedule_revision_id
  )
  select case
    when base_token.value is null then null
    else md5(
      base_token.value
      || '|'
      || teacher_assignments.value::text
      || '|'
      || room_assignments.value::text
      || '|'
      || teacher_name_overrides.value::text
      || '|'
      || room_name_overrides.value::text
      || '|'
      || placement_resources.value::text
    )
  end
  from
    base_token,
    teacher_assignments,
    room_assignments,
    teacher_name_overrides,
    room_name_overrides,
    placement_resources
$$;

revoke all
  on function public.management_publication_state_token(uuid)
  from public, anon, authenticated;

comment on function public.management_publication_state_token(uuid) is
  'M19.8.0 publication stale-state token. Extends the prior token with course-plan resource assignments, draft resource-name overrides, and the exact names/status of resources used by placed cards.';

do $$
declare
  v_sessions integer;
  v_groups integer;
begin
  select count(*)
  into v_sessions
  from public.schedule_sessions
  where academic_year = '2026-2027';

  select count(*)
  into v_groups
  from public.session_groups group_row
  join public.schedule_sessions session_row
    on session_row.id = group_row.session_id
  where session_row.academic_year = '2026-2027';

  if v_sessions <> 517 or v_groups <> 609 then
    raise exception
      'M19.8.0 modified public projection unexpectedly: sessions %, groups %',
      v_sessions,
      v_groups;
  end if;
end
$$;

commit;
