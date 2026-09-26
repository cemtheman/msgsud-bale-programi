-- Management / M29
-- In-place teacher/room change with impact preview.
--
-- Removes the blanket "placed lesson => resource editor disabled" behavior
-- for the weekly timetable. A selected ACTIVE teacher/room is previewed
-- against current external occupancy. Safe changes are applied atomically
-- through the existing M26.8 MOVE bundle path, preserving history/undo.

begin;

create or replace function public.management_preview_placement_resource_change(
  p_card_ids uuid[],
  p_resource_type text,
  p_resource_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_card_ids uuid[] := coalesce(p_card_ids, array[]::uuid[]);
  v_card_count integer;
  v_revision_id uuid;
  v_revision_ids uuid[];
  v_revision_count integer;
  v_resource_name text;
  v_resource_active boolean := false;
  v_has_changes boolean := false;
  v_affected_requirement_count integer := 0;
  v_pool_expansion_count integer := 0;
  v_block_reasons text[] := array[]::text[];
  v_conflicts jsonb := '[]'::jsonb;
  v_state_token text;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M29 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_resource_type not in ('TEACHER', 'ROOM') then
    raise exception 'M29 invalid resource type';
  end if;

  if p_resource_id is null then
    raise exception 'M29 resource id is required';
  end if;

  select count(distinct value.card_id)
  into v_card_count
  from unnest(v_card_ids) as value(card_id);

  if v_card_count < 1 or v_card_count > 24
     or v_card_count <> cardinality(v_card_ids) then
    raise exception 'M29 requires 1..24 distinct card ids';
  end if;

  select
    count(distinct card.schedule_revision_id),
    array_agg(
      distinct card.schedule_revision_id
      order by card.schedule_revision_id
    )
  into
    v_revision_count,
    v_revision_ids
  from public.schedule_cards card
  where card.id = any(v_card_ids);

  if v_revision_ids is not null then
    v_revision_id := v_revision_ids[1];
  end if;

  if v_revision_count <> 1
     or (
       select count(*)
       from public.schedule_cards card
       where card.id = any(v_card_ids)
     ) <> v_card_count then
    raise exception 'M29 cards must belong to one known revision';
  end if;

  if not exists (
    select 1
    from public.schedule_revisions revision
    where revision.id = v_revision_id
      and revision.status = 'DRAFT'
  ) then
    raise exception 'M29 requires DRAFT revision';
  end if;

  if (
    select count(*)
    from public.placements placement
    where placement.card_id = any(v_card_ids)
  ) <> v_card_count then
    raise exception 'M29 all selected cards must be placed';
  end if;

  if exists (
    select 1
    from public.schedule_cards card
    where card.id = any(v_card_ids)
      and card.locked
  ) then
    v_block_reasons := array_append(v_block_reasons, 'CARD_LOCKED');
  end if;

  if p_resource_type = 'TEACHER' then
    select
      teacher.name,
      teacher.operational_status = 'ACTIVE'
    into
      v_resource_name,
      v_resource_active
    from public.teachers teacher
    where teacher.id = p_resource_id;

    if v_resource_name is null then
      raise exception 'M29 teacher not found';
    end if;

    if not v_resource_active then
      v_block_reasons := array_append(v_block_reasons, 'RESOURCE_INACTIVE');
    end if;

    select exists (
      select 1
      from public.placements placement
      where placement.card_id = any(v_card_ids)
        and placement.teacher_id is distinct from p_resource_id
    )
    into v_has_changes;

    select count(distinct card.requirement_id)
    into v_pool_expansion_count
    from public.schedule_cards card
    where card.id = any(v_card_ids)
      and not exists (
        select 1
        from public.course_requirement_teachers assignment
        where assignment.requirement_id = card.requirement_id
          and assignment.teacher_id = p_resource_id
      );

    with target as (
      select
        card.id as card_id,
        placement.day_of_week,
        placement.start_period,
        (
          placement.start_period + card.duration_periods - 1
        )::smallint as end_period
      from public.schedule_cards card
      join public.placements placement
        on placement.card_id = card.id
      where card.id = any(v_card_ids)
    ),
    conflict_rows as (
      select distinct
        target.card_id,
        occupied.id as blocking_card_id,
        subject.name as subject_name,
        instructional_group.name as group_name,
        occupied_placement.day_of_week,
        occupied_placement.start_period
      from target
      join public.placements occupied_placement
        on occupied_placement.teacher_id = p_resource_id
       and occupied_placement.day_of_week = target.day_of_week
      join public.schedule_cards occupied
        on occupied.id = occupied_placement.card_id
       and occupied.schedule_revision_id = v_revision_id
      join public.course_requirements requirement
        on requirement.id = occupied.requirement_id
      join public.subjects subject
        on subject.id = requirement.subject_id
      join public.instructional_groups instructional_group
        on instructional_group.id = requirement.instructional_group_id
      where not (occupied.id = any(v_card_ids))
        and occupied_placement.start_period <= target.end_period
        and (
          occupied_placement.start_period + occupied.duration_periods - 1
        ) >= target.start_period
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cardId', conflict.card_id,
          'blockingCardId', conflict.blocking_card_id,
          'subjectName', conflict.subject_name,
          'groupName', conflict.group_name,
          'dayOfWeek', conflict.day_of_week,
          'startPeriod', conflict.start_period,
          'conflictType', 'TEACHER_CONFLICT'
        )
        order by
          conflict.day_of_week,
          conflict.start_period,
          conflict.blocking_card_id
      ),
      '[]'::jsonb
    )
    into v_conflicts
    from conflict_rows conflict;

    if jsonb_array_length(v_conflicts) > 0 then
      v_block_reasons := array_append(v_block_reasons, 'TEACHER_CONFLICT');
    end if;
  else
    select
      room.name,
      room.operational_status = 'ACTIVE'
      and room.canonical_room_id is null
    into
      v_resource_name,
      v_resource_active
    from public.rooms room
    where room.id = p_resource_id;

    if v_resource_name is null then
      raise exception 'M29 room not found';
    end if;

    if not v_resource_active then
      v_block_reasons := array_append(v_block_reasons, 'RESOURCE_INACTIVE');
    end if;

    if exists (
      select 1
      from public.schedule_cards card
      join public.course_requirements requirement
        on requirement.id = card.requirement_id
      join public.rooms room
        on room.id = p_resource_id
      where card.id = any(v_card_ids)
        and requirement.resource_mode = 'CAPABILITY'
        and (
          requirement.required_capability is null
          or not (
            requirement.required_capability = any(
              coalesce(room.capabilities, array[]::text[])
            )
          )
          or coalesce(room.knowledge_status, 'UNKNOWN') <> 'CONFIRMED'
        )
    ) then
      v_block_reasons := array_append(v_block_reasons, 'CAPABILITY_MISMATCH');
    end if;

    select exists (
      select 1
      from public.placements placement
      where placement.card_id = any(v_card_ids)
        and placement.room_id is distinct from p_resource_id
    )
    into v_has_changes;

    select count(distinct card.requirement_id)
    into v_pool_expansion_count
    from public.schedule_cards card
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    where card.id = any(v_card_ids)
      and requirement.resource_mode <> 'CAPABILITY'
      and not exists (
        select 1
        from public.course_requirement_rooms assignment
        where assignment.requirement_id = card.requirement_id
          and assignment.room_id = p_resource_id
      );

    with target as (
      select
        card.id as card_id,
        placement.day_of_week,
        placement.start_period,
        (
          placement.start_period + card.duration_periods - 1
        )::smallint as end_period
      from public.schedule_cards card
      join public.placements placement
        on placement.card_id = card.id
      where card.id = any(v_card_ids)
    ),
    conflict_rows as (
      select distinct
        target.card_id,
        occupied.id as blocking_card_id,
        subject.name as subject_name,
        instructional_group.name as group_name,
        occupied_placement.day_of_week,
        occupied_placement.start_period
      from target
      join public.placements occupied_placement
        on occupied_placement.room_id = p_resource_id
       and occupied_placement.day_of_week = target.day_of_week
      join public.schedule_cards occupied
        on occupied.id = occupied_placement.card_id
       and occupied.schedule_revision_id = v_revision_id
      join public.course_requirements requirement
        on requirement.id = occupied.requirement_id
      join public.subjects subject
        on subject.id = requirement.subject_id
      join public.instructional_groups instructional_group
        on instructional_group.id = requirement.instructional_group_id
      where not (occupied.id = any(v_card_ids))
        and occupied_placement.start_period <= target.end_period
        and (
          occupied_placement.start_period + occupied.duration_periods - 1
        ) >= target.start_period
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cardId', conflict.card_id,
          'blockingCardId', conflict.blocking_card_id,
          'subjectName', conflict.subject_name,
          'groupName', conflict.group_name,
          'dayOfWeek', conflict.day_of_week,
          'startPeriod', conflict.start_period,
          'conflictType', 'ROOM_CONFLICT'
        )
        order by
          conflict.day_of_week,
          conflict.start_period,
          conflict.blocking_card_id
      ),
      '[]'::jsonb
    )
    into v_conflicts
    from conflict_rows conflict;

    if jsonb_array_length(v_conflicts) > 0 then
      v_block_reasons := array_append(v_block_reasons, 'ROOM_CONFLICT');
    end if;
  end if;

  if not v_has_changes then
    v_block_reasons := array_append(v_block_reasons, 'NO_CHANGES');
  end if;

  select count(distinct card.requirement_id)
  into v_affected_requirement_count
  from public.schedule_cards card
  where card.id = any(v_card_ids);

  select md5(
    jsonb_build_object(
      'cardIds', (
        select jsonb_agg(card.id order by card.id)
        from public.schedule_cards card
        where card.id = any(v_card_ids)
      ),
      'placements', (
        select jsonb_agg(
          jsonb_build_object(
            'cardId', placement.card_id,
            'day', placement.day_of_week,
            'start', placement.start_period,
            'teacherId', placement.teacher_id,
            'roomId', placement.room_id
          )
          order by placement.card_id
        )
        from public.placements placement
        where placement.card_id = any(v_card_ids)
      ),
      'resourceType', p_resource_type,
      'resourceId', p_resource_id,
      'teacherStatus', (
        select operational_status
        from public.teachers
        where id = p_resource_id
      ),
      'roomStatus', (
        select operational_status
        from public.rooms
        where id = p_resource_id
      ),
      'teacherPools', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'requirementId', assignment.requirement_id,
              'teacherId', assignment.teacher_id
            )
            order by assignment.requirement_id, assignment.teacher_id
          ),
          '[]'::jsonb
        )
        from public.course_requirement_teachers assignment
        where assignment.requirement_id in (
          select card.requirement_id
          from public.schedule_cards card
          where card.id = any(v_card_ids)
        )
      ),
      'roomPools', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'requirementId', assignment.requirement_id,
              'roomId', assignment.room_id
            )
            order by assignment.requirement_id, assignment.room_id
          ),
          '[]'::jsonb
        )
        from public.course_requirement_rooms assignment
        where assignment.requirement_id in (
          select card.requirement_id
          from public.schedule_cards card
          where card.id = any(v_card_ids)
        )
      )
    )::text
  )
  into v_state_token;

  return jsonb_build_object(
    'cardIds', to_jsonb(v_card_ids),
    'resourceType', p_resource_type,
    'resourceId', p_resource_id,
    'resourceName', v_resource_name,
    'hasChanges', v_has_changes,
    'canApply', (
      v_has_changes
      and cardinality(v_block_reasons) = 0
    ),
    'blockReasons', to_jsonb(v_block_reasons),
    'conflicts', v_conflicts,
    'affectedCardCount', v_card_count,
    'affectedRequirementCount', v_affected_requirement_count,
    'poolExpansionCount', v_pool_expansion_count,
    'stateToken', v_state_token
  );
end
$$;

create or replace function public.management_apply_placement_resource_change(
  p_card_ids uuid[],
  p_resource_type text,
  p_resource_id uuid,
  p_expected_state_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_preview jsonb;
  v_current_token text;
  v_revision_id uuid;
  v_resource_name text;
  v_pool_expansion_count integer;
  v_items jsonb;
  v_transaction_id uuid;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M29 management EDITOR role required'
      using errcode = '42501';
  end if;

  v_preview := public.management_preview_placement_resource_change(
    p_card_ids,
    p_resource_type,
    p_resource_id
  );

  v_current_token := v_preview ->> 'stateToken';

  if p_expected_state_token is null
     or p_expected_state_token is distinct from v_current_token then
    raise exception 'M29 preview is stale';
  end if;

  if coalesce((v_preview ->> 'canApply')::boolean, false) is not true then
    raise exception 'M29 resource change is blocked';
  end if;

  v_resource_name := v_preview ->> 'resourceName';
  v_pool_expansion_count :=
    coalesce((v_preview ->> 'poolExpansionCount')::integer, 0);

  select card.schedule_revision_id
  into v_revision_id
  from public.schedule_cards card
  where card.id = any(p_card_ids)
  order by card.id
  limit 1;

  if p_resource_type = 'TEACHER' then
    insert into public.course_requirement_teachers (
      requirement_id,
      teacher_id
    )
    select distinct
      card.requirement_id,
      p_resource_id
    from public.schedule_cards card
    where card.id = any(p_card_ids)
    on conflict do nothing;

    with counts as (
      select
        card.requirement_id,
        count(distinct assignment.teacher_id)::integer as teacher_count
      from public.schedule_cards card
      join public.course_requirement_teachers assignment
        on assignment.requirement_id = card.requirement_id
      where card.id = any(p_card_ids)
      group by card.requirement_id
    )
    update public.course_requirements requirement
    set teacher_mode = case
      when counts.teacher_count <= 0 then 'UNKNOWN'
      when counts.teacher_count = 1 then 'FIXED'
      else 'ELIGIBLE_POOL'
    end
    from counts
    where requirement.id = counts.requirement_id;
  else
    insert into public.course_requirement_rooms (
      requirement_id,
      room_id
    )
    select distinct
      card.requirement_id,
      p_resource_id
    from public.schedule_cards card
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    where card.id = any(p_card_ids)
      and requirement.resource_mode <> 'CAPABILITY'
    on conflict do nothing;

    with counts as (
      select
        card.requirement_id,
        count(distinct assignment.room_id)::integer as room_count
      from public.schedule_cards card
      join public.course_requirements current_requirement
        on current_requirement.id = card.requirement_id
      join public.course_requirement_rooms assignment
        on assignment.requirement_id = card.requirement_id
      where card.id = any(p_card_ids)
        and current_requirement.resource_mode <> 'CAPABILITY'
      group by card.requirement_id
    )
    update public.course_requirements requirement
    set
      resource_mode = case
        when counts.room_count <= 0 then 'UNKNOWN'
        when counts.room_count = 1 then 'FIXED'
        else 'ELIGIBLE_POOL'
      end,
      required_capability = null
    from counts
    where requirement.id = counts.requirement_id;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'card_id', card.id,
      'day_of_week', placement.day_of_week,
      'start_period', placement.start_period,
      'teacher_id', case
        when p_resource_type = 'TEACHER'
          then p_resource_id
        else placement.teacher_id
      end,
      'room_id', case
        when p_resource_type = 'ROOM'
          then p_resource_id
        else placement.room_id
      end
    )
    order by card.id
  )
  into v_items
  from public.schedule_cards card
  join public.placements placement
    on placement.card_id = card.id
  where card.id = any(p_card_ids);

  v_transaction_id := public.management_move_card_bundle(v_items);

  return jsonb_build_object(
    'applied', true,
    'resourceType', p_resource_type,
    'resourceId', p_resource_id,
    'resourceName', v_resource_name,
    'affectedCardCount', cardinality(p_card_ids),
    'poolExpansionCount', v_pool_expansion_count,
    'transactionId', v_transaction_id,
    'publishedChanged', false
  );
end
$$;

revoke all
  on function public.management_preview_placement_resource_change(uuid[], text, uuid)
  from public, anon;
revoke all
  on function public.management_apply_placement_resource_change(uuid[], text, uuid, text)
  from public, anon;

grant execute
  on function public.management_preview_placement_resource_change(uuid[], text, uuid)
  to authenticated;
grant execute
  on function public.management_apply_placement_resource_change(uuid[], text, uuid, text)
  to authenticated;

comment on function public.management_preview_placement_resource_change(uuid[], text, uuid) is
  'M29 preview-only in-place teacher/room change for one card or visual bundle. Checks active resource, current slot conflicts, capability compatibility and requirement-pool expansion.';
comment on function public.management_apply_placement_resource_change(uuid[], text, uuid, text) is
  'M29 safe apply for placement resource changes. Expands the relevant requirement pool if needed, refreshes candidate domain, and delegates to M26.8 atomic MOVE so history/undo remain intact.';

commit;
