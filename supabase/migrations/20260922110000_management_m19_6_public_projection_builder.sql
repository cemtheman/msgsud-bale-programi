-- Management / M19.6
-- Read-only public projection builder proof.
--
-- This migration does NOT mutate schedule_sessions or session_groups.
-- It materializes the exact row shapes that a future atomic publication would
-- write, so row counts, audience expansion, exact times, room canonicalization,
-- and safety signals can be validated before any destructive projection swap.

begin;

create or replace function public.management_preview_public_projection(
  p_schedule_revision_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision record;
  v_gate jsonb;
  v_lifecycle jsonb;

  v_sessions jsonb;
  v_groups jsonb;

  v_session_count integer;
  v_group_count integer;

  v_null_subject_count integer;
  v_null_member_count integer;
  v_inactive_room_count integer;
  v_exact_end_override_count integer;

  v_existing_notes_count integer;
  v_notes_preservation_ready boolean;

  v_projection_hash text;
  v_group_projection_hash text;
begin
  if not public.has_management_role('VIEWER') then
    raise exception 'M19.6 management VIEWER role required'
      using errcode = '42501';
  end if;

  select
    revision.id,
    revision.requirement_set_id,
    revision.status,
    requirement_set.academic_year,
    requirement_set.term
  into v_revision
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.id = p_schedule_revision_id;

  if not found then
    raise exception 'M19.6 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision.status <> 'DRAFT' then
    raise exception 'M19.6 projection preview requires DRAFT revision';
  end if;

  v_gate :=
    public.management_preview_publication(p_schedule_revision_id);

  v_lifecycle :=
    public.management_preview_publication_lifecycle(
      p_schedule_revision_id
    );

  -- Existing public notes are not represented by the current management model.
  -- Keep this visible as a safety signal rather than silently dropping data.
  select count(*)
  into v_existing_notes_count
  from public.schedule_sessions session
  where session.academic_year = v_revision.academic_year
    and session.notes is not null
    and length(btrim(session.notes)) > 0;

  v_notes_preservation_ready :=
    v_existing_notes_count = 0;

  create temporary table m196_sessions
  on commit drop
  as
  select
    row_number() over (
      order by
        card.requirement_id,
        card.block_index,
        unit.unit_offset,
        card.id
    )::integer as projection_session_ordinal,

    card.id as card_id,
    card.requirement_id,
    card.block_index,
    unit.unit_offset::integer as unit_offset,

    v_revision.academic_year::text as academic_year,
    placement.day_of_week,
    period_bounds.start_time,

    case
      when unit.unit_offset = card.duration_periods - 1
        and card.publication_end_time_override is not null
      then card.publication_end_time_override
      else period_bounds.end_time
    end as end_time,

    requirement.delivery_mode::text as session_type,
    requirement.subject_id,
    placement.teacher_id,

    coalesce(
      selected_room.canonical_room_id,
      placement.room_id
    ) as room_id,

    null::text as notes
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  join public.placements placement
    on placement.card_id = card.id
  cross join lateral generate_series(
    0,
    card.duration_periods - 1
  ) as unit(unit_offset)
  cross join lateral public.management_publication_period_bounds(
    (placement.start_period + unit.unit_offset)::smallint
  ) period_bounds
  left join public.rooms selected_room
    on selected_room.id = placement.room_id
  where card.schedule_revision_id = p_schedule_revision_id;

  create temporary table m196_groups
  on commit drop
  as
  select
    session.projection_session_ordinal,
    session.card_id,
    session.requirement_id,
    member.class_group_id,
    member.target,
    member.subgroup
  from m196_sessions session
  join lateral public.management_requirement_public_members(
    session.requirement_id
  ) member
    on true;

  select count(*)
  into v_session_count
  from m196_sessions;

  select count(*)
  into v_group_count
  from m196_groups;

  select count(*)
  into v_null_subject_count
  from m196_sessions
  where subject_id is null;

  select count(*)
  into v_null_member_count
  from m196_sessions session
  where not exists (
    select 1
    from m196_groups member
    where member.projection_session_ordinal =
      session.projection_session_ordinal
  );

  select count(*)
  into v_inactive_room_count
  from m196_sessions session
  join public.rooms room
    on room.id = session.room_id
  where room.operational_status <> 'ACTIVE';

  select count(*)
  into v_exact_end_override_count
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  where card.schedule_revision_id = p_schedule_revision_id
    and card.publication_end_time_override is not null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ordinal', session.projection_session_ordinal,
        'cardId', session.card_id,
        'requirementId', session.requirement_id,
        'blockIndex', session.block_index,
        'unitOffset', session.unit_offset,
        'academicYear', session.academic_year,
        'dayOfWeek', session.day_of_week,
        'startTime', session.start_time,
        'endTime', session.end_time,
        'sessionType', session.session_type,
        'subjectId', session.subject_id,
        'teacherId', session.teacher_id,
        'roomId', session.room_id,
        'notes', session.notes
      )
      order by session.projection_session_ordinal
    ),
    '[]'::jsonb
  )
  into v_sessions
  from m196_sessions session;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sessionOrdinal', member.projection_session_ordinal,
        'cardId', member.card_id,
        'requirementId', member.requirement_id,
        'classGroupId', member.class_group_id,
        'target', member.target,
        'subgroup', member.subgroup
      )
      order by
        member.projection_session_ordinal,
        member.class_group_id,
        member.target,
        member.subgroup nulls first
    ),
    '[]'::jsonb
  )
  into v_groups
  from m196_groups member;

  select md5(
    coalesce(
      string_agg(
        jsonb_build_object(
          'ordinal', session.projection_session_ordinal,
          'cardId', session.card_id,
          'requirementId', session.requirement_id,
          'dayOfWeek', session.day_of_week,
          'startTime', session.start_time,
          'endTime', session.end_time,
          'sessionType', session.session_type,
          'subjectId', session.subject_id,
          'teacherId', session.teacher_id,
          'roomId', session.room_id,
          'notes', session.notes
        )::text,
        '|'
        order by session.projection_session_ordinal
      ),
      ''
    )
  )
  into v_projection_hash
  from m196_sessions session;

  select md5(
    coalesce(
      string_agg(
        jsonb_build_object(
          'sessionOrdinal', member.projection_session_ordinal,
          'classGroupId', member.class_group_id,
          'target', member.target,
          'subgroup', member.subgroup
        )::text,
        '|'
        order by
          member.projection_session_ordinal,
          member.class_group_id,
          member.target,
          member.subgroup nulls first
      ),
      ''
    )
  )
  into v_group_projection_hash
  from m196_groups member;

  return jsonb_build_object(
    'revisionId', p_schedule_revision_id,
    'academicYear', v_revision.academic_year,
    'term', v_revision.term,

    'canPublish',
      coalesce((v_gate ->> 'canPublish')::boolean, false)
      and v_notes_preservation_ready
      and v_null_subject_count = 0
      and v_null_member_count = 0
      and v_inactive_room_count = 0,

    'basePublicationGate', v_gate,
    'lifecyclePreview', v_lifecycle,

    'sessionCount', v_session_count,
    'groupCount', v_group_count,
    'sessionProjectionHash', v_projection_hash,
    'groupProjectionHash', v_group_projection_hash,

    'exactEndOverrideCardCount',
      v_exact_end_override_count,

    'safety', jsonb_build_object(
      'nullSubjectCount', v_null_subject_count,
      'memberlessSessionCount', v_null_member_count,
      'inactiveRoomSessionCount', v_inactive_room_count,
      'existingPublicNotesCount', v_existing_notes_count,
      'notesPreservationReady', v_notes_preservation_ready
    ),

    'sessions', v_sessions,
    'sessionGroups', v_groups
  );
end
$$;

revoke all
  on function public.management_preview_public_projection(uuid)
  from public, anon, authenticated;

grant execute
  on function public.management_preview_public_projection(uuid)
  to authenticated;

comment on function public.management_preview_public_projection(uuid) is
  'M19.6 read-only row-level projection builder. Expands placed draft cards into period-level schedule session rows and audience session-group rows without mutating the public projection. Reports notes-preservation and projection safety signals.';


-- Public projection must remain untouched by the migration itself.
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
      'M19.6 modified public projection unexpectedly: sessions %, groups %',
      v_sessions,
      v_groups;
  end if;
end
$$;

commit;
