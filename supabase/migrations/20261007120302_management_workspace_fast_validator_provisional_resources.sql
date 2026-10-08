-- Preserve provisional NULL teacher/room states and active manual
-- resources outside planning pools on the fast workspace bundle validator.
-- Selected non-null resources must still be active and operational.

CREATE OR REPLACE FUNCTION public.management_validate_solver_move_bundle(p_schedule_revision_id uuid, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_conflict_count integer;
  v_invalid_count integer;
begin
  -- Validate basic time bounds and lunch crossing.
  with requested as materialized (
    select
      nullif(entry.value ->> 'card_id', '')::uuid as card_id,
      nullif(entry.value ->> 'day_of_week', '')::smallint as day_of_week,
      nullif(entry.value ->> 'start_period', '')::smallint as start_period,
      nullif(entry.value ->> 'teacher_id', '')::uuid as teacher_id,
      nullif(entry.value ->> 'room_id', '')::uuid as room_id
    from jsonb_array_elements(p_items) entry(value)
  ),
  enriched as materialized (
    select
      requested.*,
      card.duration_periods,
      requirement.instructional_group_id
    from requested
    join public.schedule_cards card
      on card.id = requested.card_id
     and card.schedule_revision_id = p_schedule_revision_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
  )
  select count(*)::integer
  into v_invalid_count
  from enriched
  where day_of_week not between 1 and 5
     or start_period not between 1 and 12
     or start_period + duration_periods - 1 > 12
     or (
       start_period <= 5
       and start_period + duration_periods - 1 >= 6
     );

  if v_invalid_count > 0 then
    raise exception 'M33.4.2 proposal contains invalid time footprints';
  end if;


  -- Validate only resources that are actually selected. Null teacher/room
  -- values are valid provisional states in the management model; manual
  -- active resources may also legitimately sit outside the planning pool.
  with requested as materialized (
    select
      nullif(entry.value ->> 'teacher_id', '')::uuid as teacher_id,
      nullif(entry.value ->> 'room_id', '')::uuid as room_id
    from jsonb_array_elements(p_items) entry(value)
  )
  select count(*)::integer
  into v_invalid_count
  from requested target
  where (
    target.teacher_id is not null
    and not exists (
      select 1
      from public.teachers teacher
      where teacher.id = target.teacher_id
        and teacher.active
        and teacher.operational_status = 'ACTIVE'
    )
  )
  or (
    target.room_id is not null
    and not exists (
      select 1
      from public.rooms room
      where room.id = target.room_id
        and room.active
        and room.operational_status = 'ACTIVE'
    )
  );

  if v_invalid_count > 0 then
    raise exception
      'M33.4.2 proposal contains inactive teacher/room resources';
  end if;

  -- External occupancy: requested cards are removed as one decision set.
  with requested as materialized (
    select
      nullif(entry.value ->> 'card_id', '')::uuid as card_id,
      nullif(entry.value ->> 'day_of_week', '')::smallint as day_of_week,
      nullif(entry.value ->> 'start_period', '')::smallint as start_period,
      nullif(entry.value ->> 'teacher_id', '')::uuid as teacher_id,
      nullif(entry.value ->> 'room_id', '')::uuid as room_id
    from jsonb_array_elements(p_items) entry(value)
  ),
  enriched as materialized (
    select
      requested.*,
      card.duration_periods,
      requirement.instructional_group_id
    from requested
    join public.schedule_cards card
      on card.id = requested.card_id
     and card.schedule_revision_id = p_schedule_revision_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
  ),
  occupied as materialized (
    select
      placement.card_id,
      placement.day_of_week,
      placement.start_period,
      occupied_card.duration_periods,
      placement.teacher_id,
      placement.room_id,
      occupied_requirement.instructional_group_id
    from public.placements placement
    join public.schedule_cards occupied_card
      on occupied_card.id = placement.card_id
    join public.course_requirements occupied_requirement
      on occupied_requirement.id = occupied_card.requirement_id
    where occupied_card.schedule_revision_id = p_schedule_revision_id
      and not exists (
        select 1
        from requested
        where requested.card_id = occupied_card.id
      )
  )
  select count(*)::integer
  into v_conflict_count
  from enriched target
  join occupied blocker
    on blocker.day_of_week = target.day_of_week
   and blocker.start_period <=
        target.start_period + target.duration_periods - 1
   and blocker.start_period + blocker.duration_periods - 1
        >= target.start_period
   and (
     (
       target.teacher_id is not null
       and blocker.teacher_id = target.teacher_id
     )
     or (
       target.room_id is not null
       and blocker.room_id = target.room_id
     )
     or public.management_instructional_groups_conflict(
       target.instructional_group_id,
       blocker.instructional_group_id
     )
   );

  if v_conflict_count > 0 then
    raise exception
      'M33.4.2 proposal conflicts with current external occupancy';
  end if;

  -- Internal occupancy: no two requested targets may collide with one another.
  with requested as materialized (
    select
      row_number() over () as row_no,
      nullif(entry.value ->> 'card_id', '')::uuid as card_id,
      nullif(entry.value ->> 'day_of_week', '')::smallint as day_of_week,
      nullif(entry.value ->> 'start_period', '')::smallint as start_period,
      nullif(entry.value ->> 'teacher_id', '')::uuid as teacher_id,
      nullif(entry.value ->> 'room_id', '')::uuid as room_id
    from jsonb_array_elements(p_items) entry(value)
  ),
  enriched as materialized (
    select
      requested.*,
      card.duration_periods,
      requirement.instructional_group_id
    from requested
    join public.schedule_cards card
      on card.id = requested.card_id
     and card.schedule_revision_id = p_schedule_revision_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
  )
  select count(*)::integer
  into v_conflict_count
  from enriched left_item
  join enriched right_item
    on left_item.row_no < right_item.row_no
   and left_item.day_of_week = right_item.day_of_week
   and left_item.start_period <=
        right_item.start_period + right_item.duration_periods - 1
   and right_item.start_period <=
        left_item.start_period + left_item.duration_periods - 1
   and (
     (
       left_item.teacher_id is not null
       and left_item.teacher_id = right_item.teacher_id
     )
     or (
       left_item.room_id is not null
       and left_item.room_id = right_item.room_id
     )
     or public.management_instructional_groups_conflict(
       left_item.instructional_group_id,
       right_item.instructional_group_id
     )
   );

  if v_conflict_count > 0 then
    raise exception
      'M33.4.2 proposal contains internal teacher, room, or group conflicts';
  end if;
end
$function$;
