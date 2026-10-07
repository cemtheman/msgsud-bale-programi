-- Use exact-target validation for large atomic MOVE bundles instead of
-- rebuilding the full candidate domain for every already-placed bundle card.
-- The fast writer preserves one DB transaction and normal hard-availability
-- triggers; the validator also checks active/eligible teacher and room choices.

CREATE OR REPLACE FUNCTION public.management_move_card_bundle(p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_item jsonb;
  v_index integer;
  v_bundle_size integer;
  v_distinct_card_count integer;
  v_matched_card_count integer;
  v_revision_id uuid;
  v_revision_ids uuid[];
  v_card_ids uuid[];
  v_bundle_card_ids jsonb;
  v_bundle_id uuid;
  v_transaction_id uuid;
  v_last_transaction_id uuid;
  v_candidate_status text;
  v_candidate_complete boolean;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M33.4.1 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'M33.4.1 MOVE bundle requires a JSON array';
  end if;

  v_bundle_size := jsonb_array_length(p_items);
  if v_bundle_size < 1 or v_bundle_size > 72 then
    raise exception 'M33.4.1 MOVE bundle requires 1..72 cards';
  end if;

  select
    count(distinct entry.value ->> 'card_id'),
    array_agg(distinct (entry.value ->> 'card_id')::uuid),
    jsonb_agg(entry.value ->> 'card_id' order by entry.ordinality)
  into
    v_distinct_card_count,
    v_card_ids,
    v_bundle_card_ids
  from jsonb_array_elements(p_items) with ordinality
    as entry(value, ordinality);

  if v_distinct_card_count <> v_bundle_size then
    raise exception 'M33.4.1 MOVE bundle contains duplicate card ids';
  end if;

  select
    count(*),
    array_agg(distinct card.schedule_revision_id)
  into
    v_matched_card_count,
    v_revision_ids
  from public.schedule_cards card
  where card.id = any(v_card_ids);

  if v_matched_card_count <> v_bundle_size
     or v_revision_ids is null
     or cardinality(v_revision_ids) <> 1 then
    raise exception
      'M33.4.1 MOVE bundle requires known cards from one revision';
  end if;

  v_revision_id := v_revision_ids[1];

  if not exists (
    select 1
    from public.schedule_revisions revision
    where revision.id = v_revision_id
      and revision.status = 'DRAFT'
  ) then
    raise exception 'M33.4.1 MOVE bundle requires DRAFT revision';
  end if;

  if exists (
    select 1
    from public.schedule_cards card
    where card.id = any(v_card_ids)
      and card.locked
  ) then
    raise exception 'M33.4.1 MOVE bundle contains locked card';
  end if;

  if (
    select count(*)
    from public.placements placement
    where placement.card_id = any(v_card_ids)
  ) <> v_bundle_size then
    raise exception 'M33.4.1 MOVE bundle requires all cards to be placed';
  end if;

  -- Validate only the requested target assignments. Building the full
  -- 5x12xteacherxroom candidate domain for every already-placed bundle member
  -- is unnecessary here and can exceed the PostgREST statement timeout for
  -- solver-sized workspace commits.
  perform public.management_validate_solver_move_bundle(
    v_revision_id,
    p_items
  );

  for v_item, v_index in
    select entry.value, entry.ordinality::integer
    from jsonb_array_elements(p_items) with ordinality
      as entry(value, ordinality)
  loop
    v_transaction_id :=
      public.management_write_move_member_fast(
        nullif(v_item ->> 'card_id', '')::uuid,
        nullif(v_item ->> 'day_of_week', '')::smallint,
        nullif(v_item ->> 'start_period', '')::smallint,
        nullif(v_item ->> 'teacher_id', '')::uuid,
        nullif(v_item ->> 'room_id', '')::uuid,
        'WORKSPACE_V1-fast-bundle'
      );

    if v_bundle_id is null then
      v_bundle_id := v_transaction_id;
    end if;

    perform public.management_tag_bundle_root(
      v_transaction_id,
      v_bundle_id,
      v_index,
      v_bundle_size,
      v_bundle_card_ids
    );

    v_last_transaction_id := v_transaction_id;
  end loop;

  if v_last_transaction_id is null then
    raise exception 'M33.4.1 MOVE bundle produced no transaction';
  end if;

  perform public.management_tag_bundle_root(
    v_last_transaction_id,
    v_bundle_id,
    v_bundle_size,
    v_bundle_size,
    v_bundle_card_ids
  );

  return v_last_transaction_id;
end
$function$;

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


  -- Validate the exact selected teacher/room resources without materializing
  -- every possible candidate for every card in the bundle.
  with requested as materialized (
    select
      nullif(entry.value ->> 'card_id', '')::uuid as card_id,
      nullif(entry.value ->> 'teacher_id', '')::uuid as teacher_id,
      nullif(entry.value ->> 'room_id', '')::uuid as room_id
    from jsonb_array_elements(p_items) entry(value)
  ),
  enriched as materialized (
    select
      requested.*,
      requirement.id as requirement_id,
      requirement.teacher_mode,
      requirement.resource_mode,
      requirement.required_capability
    from requested
    join public.schedule_cards card
      on card.id = requested.card_id
     and card.schedule_revision_id = p_schedule_revision_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
  )
  select count(*)::integer
  into v_invalid_count
  from enriched target
  where target.teacher_id is null
     or target.room_id is null
     or not exists (
       select 1
       from public.teachers teacher
       where teacher.id = target.teacher_id
         and teacher.active
         and teacher.operational_status = 'ACTIVE'
     )
     or (
       target.teacher_mode in ('FIXED', 'ELIGIBLE_POOL')
       and not exists (
         select 1
         from public.course_requirement_teachers assignment
         where assignment.requirement_id = target.requirement_id
           and assignment.teacher_id = target.teacher_id
       )
     )
     or target.teacher_mode = 'UNKNOWN'
     or not exists (
       select 1
       from public.rooms room
       where room.id = target.room_id
         and room.active
         and room.operational_status = 'ACTIVE'
     )
     or (
       target.resource_mode in ('FIXED', 'ELIGIBLE_POOL')
       and not exists (
         select 1
         from public.course_requirement_rooms assignment
         where assignment.requirement_id = target.requirement_id
           and assignment.room_id = target.room_id
       )
     )
     or (
       target.resource_mode = 'CAPABILITY'
       and not exists (
         select 1
         from public.rooms room
         where room.id = target.room_id
           and target.required_capability = any(room.capabilities)
           and room.knowledge_status = 'CONFIRMED'
       )
     )
     or target.resource_mode = 'UNKNOWN';

  if v_invalid_count > 0 then
    raise exception
      'M33.4.2 proposal contains ineligible or inactive teacher/room resources';
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
