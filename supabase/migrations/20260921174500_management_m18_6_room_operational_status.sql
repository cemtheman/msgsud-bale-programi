-- Management / M18.6
-- Canonical room operational status + controlled impact preview/apply.
--
-- Operational status is distinct from room capabilities:
--   ACTIVE         -> eligible for scheduling
--   MAINTENANCE    -> unavailable while under maintenance
--   OUT_OF_SERVICE -> unavailable / retired from scheduling
--
-- Candidate enforcement is implemented as a BEFORE trigger on candidate
-- assessments so every refresh path (full, incremental, move/remove, etc.)
-- applies the same ROOM_INACTIVE rule.
--
-- Published schedule projection is not mutated.

begin;

alter table public.rooms
  add column if not exists operational_status text not null default 'ACTIVE';

alter table public.rooms
  drop constraint if exists rooms_operational_status_check;

alter table public.rooms
  add constraint rooms_operational_status_check
  check (
    operational_status in ('ACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE')
  );

create index if not exists rooms_operational_status_idx
  on public.rooms (operational_status);

comment on column public.rooms.operational_status is
  'M18.6 canonical room availability: ACTIVE, MAINTENANCE, OUT_OF_SERVICE. Alias rows inherit canonical status for candidate validation.';

-- -------------------------------------------------------------------------
-- CANDIDATE-DOMAIN HARD ENFORCEMENT
-- -------------------------------------------------------------------------

create or replace function public.management_enforce_room_operational_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  if new.room_id is null then
    return new;
  end if;

  select canonical.operational_status
  into v_status
  from public.rooms selected_room
  join public.rooms canonical
    on canonical.id = coalesce(
      selected_room.canonical_room_id,
      selected_room.id
    )
  where selected_room.id = new.room_id;

  if coalesce(v_status, 'ACTIVE') <> 'ACTIVE' then
    new.status := 'INVALID';
    new.reason_codes := array(
      select distinct reason
      from unnest(
        coalesce(new.reason_codes, array[]::text[])
        || array['ROOM_INACTIVE']::text[]
      ) reason
      order by reason
    );
    new.details := coalesce(new.details, '{}'::jsonb)
      || jsonb_build_object(
        'room_operational_status',
        v_status
      );
  end if;

  return new;
end
$$;

drop trigger if exists
  management_enforce_room_operational_status_trigger
  on public.schedule_card_candidate_assessments;

create trigger management_enforce_room_operational_status_trigger
before insert or update of room_id, status, reason_codes, details
on public.schedule_card_candidate_assessments
for each row
execute function public.management_enforce_room_operational_status();

revoke all
  on function public.management_enforce_room_operational_status()
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- STATE TOKEN
-- -------------------------------------------------------------------------

create or replace function public.management_room_status_state_token(
  p_schedule_revision_id uuid,
  p_room_id uuid,
  p_operational_status text
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_room record;
  v_family_ids uuid[];
  v_affected_card_ids uuid[];
  v_placements jsonb;
begin
  select
    room.id,
    room.canonical_room_id,
    room.operational_status,
    coalesce(room.capabilities, array[]::text[]) as capabilities
  into v_room
  from public.rooms room
  where room.id = p_room_id;

  if not found then
    return null;
  end if;

  if v_room.canonical_room_id is not null then
    return null;
  end if;

  select coalesce(
    array_agg(room.id order by room.id),
    array[]::uuid[]
  )
  into v_family_ids
  from public.rooms room
  where room.id = p_room_id
     or room.canonical_room_id = p_room_id;

  select coalesce(
    array_agg(distinct card.id order by card.id),
    array[]::uuid[]
  )
  into v_affected_card_ids
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.schedule_revision_id = p_schedule_revision_id
    and (
      exists (
        select 1
        from public.course_requirement_rooms assignment
        where assignment.requirement_id = requirement.id
          and assignment.room_id = any(v_family_ids)
      )
      or (
        requirement.resource_mode = 'CAPABILITY'
        and requirement.required_capability = any(v_room.capabilities)
      )
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', placement.card_id,
        'roomId', placement.room_id,
        'dayOfWeek', placement.day_of_week,
        'startPeriod', placement.start_period
      )
      order by placement.card_id
    ),
    '[]'::jsonb
  )
  into v_placements
  from public.placements placement
  where placement.card_id = any(v_affected_card_ids);

  return md5(
    jsonb_build_object(
      'revisionId', p_schedule_revision_id,
      'roomId', p_room_id,
      'currentStatus', v_room.operational_status,
      'proposedStatus', p_operational_status,
      'familyIds', v_family_ids,
      'capabilities', v_room.capabilities,
      'affectedCardIds', v_affected_card_ids,
      'placements', v_placements
    )::text
  );
end
$$;

revoke all
  on function public.management_room_status_state_token(
    uuid,
    uuid,
    text
  )
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- PREVIEW
-- -------------------------------------------------------------------------

create or replace function public.management_preview_room_operational_status(
  p_schedule_revision_id uuid,
  p_room_id uuid,
  p_operational_status text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_status text;
  v_room record;
  v_family_ids uuid[];
  v_affected_requirements jsonb;
  v_affected_requirement_count integer;
  v_affected_card_ids uuid[];
  v_affected_card_count integer;
  v_placed_impacts jsonb;
  v_placed_impact_count integer;
  v_has_changes boolean;
  v_can_apply boolean;
  v_block_reasons jsonb := '[]'::jsonb;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M18.6 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_operational_status is null
     or p_operational_status not in (
       'ACTIVE',
       'MAINTENANCE',
       'OUT_OF_SERVICE'
     ) then
    raise exception 'M18.6 invalid room operational status';
  end if;

  select revision.status
  into v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id;

  if v_revision_status is null then
    raise exception 'M18.6 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M18.6 room status preview requires DRAFT revision';
  end if;

  select
    room.id,
    room.name,
    room.canonical_room_id,
    room.operational_status,
    coalesce(room.capabilities, array[]::text[]) as capabilities
  into v_room
  from public.rooms room
  where room.id = p_room_id;

  if not found then
    raise exception 'M18.6 room not found: %', p_room_id;
  end if;

  if v_room.canonical_room_id is not null then
    raise exception
      'M18.6 room aliases do not have independent operational status';
  end if;

  select coalesce(
    array_agg(room.id order by room.id),
    array[]::uuid[]
  )
  into v_family_ids
  from public.rooms room
  where room.id = p_room_id
     or room.canonical_room_id = p_room_id;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'requirementId', requirement.id,
          'subjectName', subject.name,
          'groupName', instructional_group.name,
          'resourceMode', requirement.resource_mode,
          'requiredCapability', requirement.required_capability,
          'explicitlyUsesRoom', exists (
            select 1
            from public.course_requirement_rooms assignment
            where assignment.requirement_id = requirement.id
              and assignment.room_id = any(v_family_ids)
          )
        )
        order by subject.name, instructional_group.name, requirement.id
      ),
      '[]'::jsonb
    ),
    count(*)
  into
    v_affected_requirements,
    v_affected_requirement_count
  from public.course_requirements requirement
  join public.schedule_revisions revision
    on revision.requirement_set_id = requirement.requirement_set_id
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  where revision.id = p_schedule_revision_id
    and (
      exists (
        select 1
        from public.course_requirement_rooms assignment
        where assignment.requirement_id = requirement.id
          and assignment.room_id = any(v_family_ids)
      )
      or (
        requirement.resource_mode = 'CAPABILITY'
        and requirement.required_capability = any(v_room.capabilities)
      )
    );

  select
    coalesce(
      array_agg(distinct card.id order by card.id),
      array[]::uuid[]
    ),
    count(distinct card.id)
  into
    v_affected_card_ids,
    v_affected_card_count
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.schedule_revision_id = p_schedule_revision_id
    and (
      exists (
        select 1
        from public.course_requirement_rooms assignment
        where assignment.requirement_id = requirement.id
          and assignment.room_id = any(v_family_ids)
      )
      or (
        requirement.resource_mode = 'CAPABILITY'
        and requirement.required_capability = any(v_room.capabilities)
      )
    );

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cardId', card.id,
          'requirementId', requirement.id,
          'subjectName', subject.name,
          'groupName', instructional_group.name,
          'roomId', placement.room_id,
          'dayOfWeek', placement.day_of_week,
          'startPeriod', placement.start_period
        )
        order by placement.day_of_week, placement.start_period, card.id
      ),
      '[]'::jsonb
    ),
    count(*)
  into
    v_placed_impacts,
    v_placed_impact_count
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  join public.subjects subject
    on subject.id = requirement.subject_id
  join public.instructional_groups instructional_group
    on instructional_group.id = requirement.instructional_group_id
  where card.schedule_revision_id = p_schedule_revision_id
    and placement.room_id = any(v_family_ids);

  v_has_changes :=
    v_room.operational_status is distinct from p_operational_status;

  v_can_apply :=
    v_has_changes
    and not (
      p_operational_status <> 'ACTIVE'
      and v_placed_impact_count > 0
    );

  if not v_has_changes then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array('NO_CHANGES');
  end if;

  if p_operational_status <> 'ACTIVE'
     and v_placed_impact_count > 0 then
    v_block_reasons :=
      v_block_reasons || jsonb_build_array('PLACED_ROOM_USAGE');
  end if;

  return jsonb_build_object(
    'roomId', p_room_id,
    'revisionId', p_schedule_revision_id,
    'roomName', v_room.name,
    'currentStatus', v_room.operational_status,
    'proposedStatus', p_operational_status,
    'hasChanges', v_has_changes,
    'canApply', v_can_apply,
    'blockReasons', v_block_reasons,
    'affectedRequirements', v_affected_requirements,
    'affectedRequirementCount', v_affected_requirement_count,
    'affectedCardIds', to_jsonb(v_affected_card_ids),
    'candidateRebuildCardCount', v_affected_card_count,
    'placedImpacts', v_placed_impacts,
    'placedImpactCount', v_placed_impact_count,
    'stateToken', public.management_room_status_state_token(
      p_schedule_revision_id,
      p_room_id,
      p_operational_status
    )
  );
end
$$;

revoke all
  on function public.management_preview_room_operational_status(
    uuid,
    uuid,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.management_preview_room_operational_status(
    uuid,
    uuid,
    text
  )
  to authenticated;


-- -------------------------------------------------------------------------
-- CONTROLLED APPLY
-- -------------------------------------------------------------------------

create or replace function public.management_apply_room_operational_status(
  p_schedule_revision_id uuid,
  p_room_id uuid,
  p_operational_status text,
  p_expected_state_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_status text;
  v_room record;
  v_preview jsonb;
  v_current_token text;
  v_card_ids uuid[];
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M18.6 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_expected_state_token is null
     or length(btrim(p_expected_state_token)) = 0 then
    raise exception 'M18.6 apply requires preview state token';
  end if;

  select revision.status
  into v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id
  for update;

  if v_revision_status is null then
    raise exception 'M18.6 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M18.6 room status apply requires DRAFT revision';
  end if;

  select
    room.id,
    room.canonical_room_id,
    room.operational_status
  into v_room
  from public.rooms room
  where room.id = p_room_id
  for update;

  if not found then
    raise exception 'M18.6 room not found: %', p_room_id;
  end if;

  if v_room.canonical_room_id is not null then
    raise exception
      'M18.6 room aliases do not have independent operational status';
  end if;

  v_current_token := public.management_room_status_state_token(
    p_schedule_revision_id,
    p_room_id,
    p_operational_status
  );

  if v_current_token is distinct from p_expected_state_token then
    raise exception
      'M18.6 room status preview is stale; the draft changed after preview';
  end if;

  v_preview := public.management_preview_room_operational_status(
    p_schedule_revision_id,
    p_room_id,
    p_operational_status
  );

  if not coalesce((v_preview ->> 'hasChanges')::boolean, false) then
    raise exception 'M18.6 room status apply is a no-op';
  end if;

  if not coalesce((v_preview ->> 'canApply')::boolean, false) then
    raise exception
      'M18.6 room status apply blocked: %',
      coalesce(v_preview -> 'blockReasons', '[]'::jsonb)::text;
  end if;

  select coalesce(
    array_agg(value::uuid order by value::uuid),
    array[]::uuid[]
  )
  into v_card_ids
  from jsonb_array_elements_text(
    coalesce(v_preview -> 'affectedCardIds', '[]'::jsonb)
  ) as card_value(value);

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

  v_current_token := public.management_room_status_state_token(
    p_schedule_revision_id,
    p_room_id,
    p_operational_status
  );

  if v_current_token is distinct from p_expected_state_token then
    raise exception
      'M18.6 room status preview is stale; affected data changed while applying';
  end if;

  update public.rooms room
  set operational_status = p_operational_status
  where room.id = p_room_id;

  perform public.refresh_management_candidate_domain_subset(
    p_schedule_revision_id,
    v_card_ids
  );

  return jsonb_build_object(
    'applied', true,
    'roomId', p_room_id,
    'revisionId', p_schedule_revision_id,
    'operationalStatus', p_operational_status,
    'candidateRebuildCardCount', cardinality(v_card_ids),
    'affectedRequirementCount',
      coalesce((v_preview ->> 'affectedRequirementCount')::integer, 0),
    'publishedChanged', false
  );
end
$$;

revoke all
  on function public.management_apply_room_operational_status(
    uuid,
    uuid,
    text,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.management_apply_room_operational_status(
    uuid,
    uuid,
    text,
    text
  )
  to authenticated;

comment on function public.management_preview_room_operational_status(uuid, uuid, text) is
  'M18.6 read-only impact preview for canonical room operational status. Non-active status is blocked while the room family has draft placements.';

comment on function public.management_apply_room_operational_status(uuid, uuid, text, text) is
  'M18.6 controlled canonical-room operational status apply. Refreshes only affected cards; candidate trigger invalidates non-active rooms as ROOM_INACTIVE. Published projection is untouched.';

commit;
