-- Management M26.6
-- Bundle-aware candidate evaluation.
--
-- One user-visible shared lesson (for example 5A + 5B common Mathematics)
-- is backed by more than one schedule_card. The generic candidate engine
-- excludes only the card currently being assessed from occupancy, so placed
-- siblings of the same visual bundle can incorrectly appear as ROOM /
-- TEACHER / GROUP conflicts. This migration adds a bundle-scoped candidate
-- refresh that ignores only the explicitly supplied sibling card ids while
-- retaining every external conflict.
--
-- Grouped PLACE / MOVE now:
--   1. refresh and validate all explicit members against external occupancy,
--      excluding bundle siblings;
--   2. apply all explicit members;
--   3. refresh their bundle domains again;
--   4. run forced propagation once.

begin;

create or replace function public.refresh_management_candidate_domain_bundle_subset(
  p_schedule_revision_id uuid,
  p_card_ids uuid[]
)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  target_revision_count integer;
begin
  if p_card_ids is null or cardinality(p_card_ids) = 0 then
    return;
  end if;

  select count(*)
  into target_revision_count
  from public.schedule_revisions
  where id = p_schedule_revision_id
    and status = 'DRAFT';

  if target_revision_count <> 1 then
    raise exception
      'M26.6 bundle subset refresh requires one DRAFT revision: %',
      p_schedule_revision_id;
  end if;

  delete from public.schedule_card_domain_summaries summary
  where summary.card_id = any(p_card_ids);

  delete from public.schedule_card_candidate_assessments assessment
  where assessment.card_id = any(p_card_ids);

  with recursive
  target_cards as materialized (
    select
      card.id as card_id,
      card.duration_periods,
      requirement.id as requirement_id,
      requirement.instructional_group_id,
      requirement.teacher_mode,
      requirement.resource_mode,
      requirement.required_capability
    from public.schedule_cards card
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    where card.schedule_revision_id = p_schedule_revision_id
      and card.id = any(p_card_ids)
  ),
  target_requirements as materialized (
    select distinct
      requirement_id,
      teacher_mode,
      resource_mode,
      required_capability
    from target_cards
  ),
  teacher_choices as materialized (
    select
      target.requirement_id,
      assignment.teacher_id,
      null::text as unresolved_code
    from target_requirements target
    join public.course_requirement_teachers assignment
      on assignment.requirement_id = target.requirement_id
    where target.teacher_mode in ('FIXED', 'ELIGIBLE_POOL')

    union all

    select distinct
      target.requirement_id,
      null::uuid,
      case
        when target.teacher_mode = 'UNKNOWN'
          then 'TEACHER_UNKNOWN'
        else 'TEACHER_ASSIGNMENT_MISSING'
      end
    from target_requirements target
    where target.teacher_mode = 'UNKNOWN'
       or (
         target.teacher_mode in ('FIXED', 'ELIGIBLE_POOL')
         and not exists (
           select 1
           from public.course_requirement_teachers assignment
           where assignment.requirement_id = target.requirement_id
         )
       )
  ),
  room_choices as materialized (
    select
      target.requirement_id,
      assignment.room_id,
      null::text as unresolved_code
    from target_requirements target
    join public.course_requirement_rooms assignment
      on assignment.requirement_id = target.requirement_id
    where target.resource_mode in ('FIXED', 'ELIGIBLE_POOL')

    union all

    select distinct
      target.requirement_id,
      room.id,
      null::text
    from target_requirements target
    join public.rooms room
      on target.resource_mode = 'CAPABILITY'
     and target.required_capability = any(room.capabilities)
     and room.knowledge_status = 'CONFIRMED'

    union all

    select distinct
      target.requirement_id,
      room.id,
      'CAPABILITY_UNCONFIRMED'
    from target_requirements target
    join public.rooms room
      on target.resource_mode = 'CAPABILITY'
     and target.required_capability = any(room.capabilities)
     and coalesce(room.knowledge_status, 'UNKNOWN') <> 'CONFIRMED'
    where not exists (
      select 1
      from public.rooms confirmed_room
      where target.required_capability = any(confirmed_room.capabilities)
        and confirmed_room.knowledge_status = 'CONFIRMED'
    )

    union all

    select distinct
      target.requirement_id,
      null::uuid,
      case
        when target.resource_mode = 'UNKNOWN'
          then 'ROOM_UNKNOWN'
        when target.resource_mode = 'CAPABILITY'
          then 'CAPABILITY_UNRESOLVED'
        else 'ROOM_ASSIGNMENT_MISSING'
      end
    from target_requirements target
    where target.resource_mode = 'UNKNOWN'
       or (
         target.resource_mode in ('FIXED', 'ELIGIBLE_POOL')
         and not exists (
           select 1
           from public.course_requirement_rooms assignment
           where assignment.requirement_id = target.requirement_id
         )
       )
       or (
         target.resource_mode = 'CAPABILITY'
         and not exists (
           select 1
           from public.rooms room
           where target.required_capability = any(room.capabilities)
         )
       )
  ),
  occupied as materialized (
    select
      placement.card_id,
      placement.day_of_week,
      placement.start_period,
      (
        placement.start_period + occupied_card.duration_periods - 1
      )::smallint as end_period,
      placement.teacher_id,
      placement.room_id,
      occupied_requirement.instructional_group_id
    from public.placements placement
    join public.schedule_cards occupied_card
      on occupied_card.id = placement.card_id
    join public.course_requirements occupied_requirement
      on occupied_requirement.id = occupied_card.requirement_id
    where occupied_card.schedule_revision_id = p_schedule_revision_id
      and not (occupied_card.id = any(p_card_ids))
  ),
  relevant_groups as materialized (
    select distinct instructional_group_id as group_id
    from target_cards

    union

    select distinct instructional_group_id
    from occupied
  ),
  group_descendants(root_group_id, descendant_group_id) as (
    select
      relevant.group_id,
      relevant.group_id
    from relevant_groups relevant

    union

    select
      descendant.root_group_id,
      relation.right_group_id
    from group_descendants descendant
    join public.instructional_group_relations relation
      on relation.left_group_id = descendant.descendant_group_id
     and relation.relation = 'CONTAINS'
  ),
  group_conflict_pairs as materialized (
    select distinct
      left_desc.root_group_id as left_group_id,
      right_desc.root_group_id as right_group_id
    from group_descendants left_desc
    join group_descendants right_desc
      on right_desc.descendant_group_id = left_desc.descendant_group_id

    union

    select distinct
      left_desc.root_group_id,
      right_desc.root_group_id
    from group_descendants left_desc
    join public.instructional_group_relations relation
      on relation.left_group_id = left_desc.descendant_group_id
     and relation.relation = 'OVERLAPS'
    join group_descendants right_desc
      on right_desc.descendant_group_id = relation.right_group_id

    union

    select distinct
      left_desc.root_group_id,
      right_desc.root_group_id
    from group_descendants right_desc
    join public.instructional_group_relations relation
      on relation.left_group_id = right_desc.descendant_group_id
     and relation.relation = 'OVERLAPS'
    join group_descendants left_desc
      on left_desc.descendant_group_id = relation.right_group_id
  ),
  raw_assessments as materialized (
    select
      target.card_id,
      target.duration_periods,
      target.instructional_group_id,
      day_number::smallint as day_of_week,
      period_number::smallint as start_period,
      teacher.teacher_id,
      room.room_id,
      teacher.unresolved_code as teacher_unresolved_code,
      room.unresolved_code as room_unresolved_code,
      (period_number + target.duration_periods - 1)::smallint as end_period
    from target_cards target
    cross join generate_series(1, 5) as day_number
    cross join generate_series(1, 12) as period_number
    join teacher_choices teacher
      on teacher.requirement_id = target.requirement_id
    join room_choices room
      on room.requirement_id = target.requirement_id
  ),
  assessed as (
    select
      raw.*,
      (raw.end_period > 12) as outside_day,
      (
        raw.start_period <= 5
        and raw.end_period >= 6
      ) as crosses_lunch,
      exists (
        select 1
        from occupied occupancy
        where occupancy.day_of_week = raw.day_of_week
          and occupancy.start_period <= raw.end_period
          and occupancy.end_period >= raw.start_period
          and raw.teacher_id is not null
          and occupancy.teacher_id = raw.teacher_id
      ) as teacher_conflict,
      exists (
        select 1
        from occupied occupancy
        where occupancy.day_of_week = raw.day_of_week
          and occupancy.start_period <= raw.end_period
          and occupancy.end_period >= raw.start_period
          and raw.room_id is not null
          and occupancy.room_id = raw.room_id
      ) as room_conflict,
      exists (
        select 1
        from occupied occupancy
        join group_conflict_pairs conflict
          on conflict.left_group_id = raw.instructional_group_id
         and conflict.right_group_id = occupancy.instructional_group_id
        where occupancy.day_of_week = raw.day_of_week
          and occupancy.start_period <= raw.end_period
          and occupancy.end_period >= raw.start_period
      ) as group_conflict
    from raw_assessments raw
  ),
  classified as (
    select
      assessed.*,
      array_remove(
        array[
          case when assessed.outside_day then 'TIME_OUTSIDE_DAY' end,
          case when assessed.crosses_lunch then 'LUNCH_BREAK_CROSSING' end,
          case when assessed.teacher_conflict then 'TEACHER_CONFLICT' end,
          case when assessed.room_conflict then 'ROOM_CONFLICT' end,
          case when assessed.group_conflict then 'GROUP_CONFLICT' end,
          assessed.teacher_unresolved_code,
          assessed.room_unresolved_code
        ]::text[],
        null
      ) as reason_codes,
      case
        when assessed.outside_day
          or assessed.crosses_lunch
          or assessed.teacher_conflict
          or assessed.room_conflict
          or assessed.group_conflict
          then 'INVALID'
        when assessed.teacher_unresolved_code is not null
          or assessed.room_unresolved_code is not null
          then 'UNRESOLVED'
        else 'VALID'
      end as status,
      (
        assessed.teacher_id is not null
        and assessed.room_id is not null
        and assessed.teacher_unresolved_code is null
        and assessed.room_unresolved_code is null
      ) as is_complete
    from assessed
  )
  insert into public.schedule_card_candidate_assessments (
    card_id,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    status,
    is_complete,
    reason_codes,
    details
  )
  select
    classified.card_id,
    classified.day_of_week,
    classified.start_period,
    classified.teacher_id,
    classified.room_id,
    classified.status,
    classified.is_complete,
    classified.reason_codes,
    jsonb_build_object(
      'engine_version', 'M26.6-bundle-v1',
      'duration_periods', classified.duration_periods,
      'end_period', classified.end_period,
      'bundle_sibling_card_ids', to_jsonb(p_card_ids)
    )
  from classified;

  insert into public.schedule_card_domain_summaries (
    card_id,
    domain_status,
    valid_count,
    invalid_count,
    unresolved_count,
    complete_candidate_count,
    is_forced,
    is_contradiction
  )
  select
    card.id,
    case
      when count(*) filter (where assessment.status = 'UNRESOLVED') > 0
        then 'UNRESOLVED'
      when count(*) filter (where assessment.status = 'VALID') = 0
        then 'INVALID'
      else 'VALID'
    end,
    count(*) filter (where assessment.status = 'VALID')::integer,
    count(*) filter (where assessment.status = 'INVALID')::integer,
    count(*) filter (where assessment.status = 'UNRESOLVED')::integer,
    count(*) filter (where assessment.is_complete)::integer,
    (
      count(*) filter (where assessment.status = 'VALID') = 1
      and count(*) filter (where assessment.status = 'UNRESOLVED') = 0
    ),
    (
      count(*) filter (where assessment.status = 'VALID') = 0
      and count(*) filter (where assessment.status = 'UNRESOLVED') = 0
    )
  from public.schedule_cards card
  join public.schedule_card_candidate_assessments assessment
    on assessment.card_id = card.id
  where card.schedule_revision_id = p_schedule_revision_id
    and card.id = any(p_card_ids)
  group by card.id;
end
$$;


create or replace function public.management_refresh_card_group_candidates(
  p_card_ids jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_card_count integer;
  v_distinct_card_count integer;
  v_matched_card_count integer;
  v_revision_ids uuid[];
  v_revision_id uuid;
  v_card_ids uuid[];
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M26.6 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_card_ids is null or jsonb_typeof(p_card_ids) <> 'array' then
    raise exception 'M26.6 candidate refresh requires a JSON card-id array';
  end if;

  v_card_count := jsonb_array_length(p_card_ids);
  if v_card_count < 1 or v_card_count > 24 then
    raise exception 'M26.6 candidate refresh requires 1..24 cards';
  end if;

  select
    count(distinct entry.value),
    array_agg(distinct entry.value::uuid)
  into
    v_distinct_card_count,
    v_card_ids
  from jsonb_array_elements_text(p_card_ids) as entry(value);

  if v_distinct_card_count <> v_card_count then
    raise exception 'M26.6 candidate refresh contains duplicate card ids';
  end if;

  select
    count(*),
    array_agg(distinct card.schedule_revision_id)
  into
    v_matched_card_count,
    v_revision_ids
  from public.schedule_cards card
  where card.id = any(v_card_ids);

  if v_matched_card_count <> v_card_count
     or v_revision_ids is null
     or cardinality(v_revision_ids) <> 1 then
    raise exception 'M26.6 candidate refresh requires known cards from one revision';
  end if;

  v_revision_id := v_revision_ids[1];

  perform public.refresh_management_candidate_domain_bundle_subset(
    v_revision_id,
    v_card_ids
  );

  return v_card_count;
end
$$;


create or replace function public.management_place_bundle_member(
  p_card_id uuid,
  p_day_of_week smallint,
  p_start_period smallint,
  p_teacher_id uuid,
  p_room_id uuid
)
returns uuid
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_revision_status text;
  v_locked boolean;
  v_transaction_id uuid;
begin
  select
    revision.id,
    revision.status,
    card.locked
  into
    v_revision_id,
    v_revision_status,
    v_locked
  from public.schedule_cards card
  join public.schedule_revisions revision
    on revision.id = card.schedule_revision_id
  where card.id = p_card_id
  for update of revision;

  if v_revision_id is null then
    raise exception 'M26.6 PLACE card not found: %', p_card_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M26.6 PLACE requires DRAFT revision';
  end if;

  if v_locked then
    raise exception 'M26.6 PLACE rejected for locked card: %', p_card_id;
  end if;

  if exists (
    select 1
    from public.placements placement
    where placement.card_id = p_card_id
  ) then
    raise exception 'M26.6 PLACE card is already placed: %', p_card_id;
  end if;

  insert into public.move_transactions (
    schedule_revision_id,
    root_transaction_id,
    parent_transaction_id,
    actor_type,
    action,
    payload
  )
  values (
    v_revision_id,
    null,
    null,
    'USER',
    'PLACE',
    jsonb_build_object(
      'source', 'MANUAL',
      'engine_version', 'M26.6-bundle-member',
      'card_id', p_card_id,
      'before', null,
      'after', jsonb_build_object(
        'day_of_week', p_day_of_week,
        'start_period', p_start_period,
        'teacher_id', p_teacher_id,
        'room_id', p_room_id
      ),
      'propagation_auto_count', 0,
      'propagation_stop_reason', 'BUNDLE_PENDING'
    )
  )
  returning id into v_transaction_id;

  insert into public.placements (
    card_id,
    day_of_week,
    start_period,
    teacher_id,
    room_id,
    move_transaction_id
  )
  values (
    p_card_id,
    p_day_of_week,
    p_start_period,
    p_teacher_id,
    p_room_id,
    v_transaction_id
  );

  perform public.refresh_management_candidate_domain_delta(
    v_revision_id,
    p_card_id,
    null,
    null,
    null,
    null,
    p_day_of_week,
    p_start_period,
    p_teacher_id,
    p_room_id
  );

  return v_transaction_id;
end
$$;


create or replace function public.management_move_bundle_member(
  p_card_id uuid,
  p_day_of_week smallint,
  p_start_period smallint,
  p_teacher_id uuid,
  p_room_id uuid
)
returns uuid
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_revision_id uuid;
  v_revision_status text;
  v_locked boolean;
  v_placement_id uuid;
  v_before_day smallint;
  v_before_start smallint;
  v_before_teacher uuid;
  v_before_room uuid;
  v_before_move_transaction_id uuid;
  v_before_created_at timestamptz;
  v_transaction_id uuid;
begin
  select
    revision.id,
    revision.status,
    card.locked,
    placement.id,
    placement.day_of_week,
    placement.start_period,
    placement.teacher_id,
    placement.room_id,
    placement.move_transaction_id,
    placement.created_at
  into
    v_revision_id,
    v_revision_status,
    v_locked,
    v_placement_id,
    v_before_day,
    v_before_start,
    v_before_teacher,
    v_before_room,
    v_before_move_transaction_id,
    v_before_created_at
  from public.schedule_cards card
  join public.schedule_revisions revision
    on revision.id = card.schedule_revision_id
  join public.placements placement
    on placement.card_id = card.id
  where card.id = p_card_id
  for update of revision, placement;

  if v_revision_id is null then
    raise exception 'M26.6 MOVE placed card not found: %', p_card_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M26.6 MOVE requires DRAFT revision';
  end if;

  if v_locked then
    raise exception 'M26.6 MOVE rejected for locked card: %', p_card_id;
  end if;

  insert into public.move_transactions (
    schedule_revision_id,
    root_transaction_id,
    parent_transaction_id,
    actor_type,
    action,
    payload
  )
  values (
    v_revision_id,
    null,
    null,
    'USER',
    'MOVE',
    jsonb_build_object(
      'source', 'MANUAL',
      'engine_version', 'M26.6-bundle-member',
      'card_id', p_card_id,
      'before', jsonb_build_object(
        'placement_id', v_placement_id,
        'card_id', p_card_id,
        'day_of_week', v_before_day,
        'start_period', v_before_start,
        'teacher_id', v_before_teacher,
        'room_id', v_before_room,
        'move_transaction_id', v_before_move_transaction_id,
        'created_at', v_before_created_at
      ),
      'after', jsonb_build_object(
        'placement_id', v_placement_id,
        'card_id', p_card_id,
        'day_of_week', p_day_of_week,
        'start_period', p_start_period,
        'teacher_id', p_teacher_id,
        'room_id', p_room_id
      ),
      'propagation_auto_count', 0,
      'propagation_stop_reason', 'BUNDLE_PENDING'
    )
  )
  returning id into v_transaction_id;

  update public.placements placement
  set
    day_of_week = p_day_of_week,
    start_period = p_start_period,
    teacher_id = p_teacher_id,
    room_id = p_room_id,
    move_transaction_id = v_transaction_id,
    updated_at = now()
  where placement.id = v_placement_id;

  if not found then
    raise exception 'M26.6 MOVE lost placement for card %', p_card_id;
  end if;

  perform public.refresh_management_candidate_domain_delta(
    v_revision_id,
    p_card_id,
    v_before_day,
    v_before_start,
    v_before_teacher,
    v_before_room,
    p_day_of_week,
    p_start_period,
    p_teacher_id,
    p_room_id
  );

  return v_transaction_id;
end
$$;


create or replace function public.management_place_card_bundle(
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
    raise exception 'M26.6 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'M26.6 PLACE bundle requires a JSON array';
  end if;

  v_bundle_size := jsonb_array_length(p_items);
  if v_bundle_size < 1 or v_bundle_size > 24 then
    raise exception 'M26.6 PLACE bundle requires 1..24 cards';
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
    raise exception 'M26.6 PLACE bundle contains duplicate card ids';
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
    raise exception 'M26.6 PLACE bundle requires known cards from one revision';
  end if;

  v_revision_id := v_revision_ids[1];

  perform public.refresh_management_candidate_domain_bundle_subset(
    v_revision_id,
    v_card_ids
  );

  -- Validate every requested member before any placement is written.
  for v_item in
    select entry.value
    from jsonb_array_elements(p_items) as entry(value)
  loop
    select
      assessment.status,
      assessment.is_complete
    into
      v_candidate_status,
      v_candidate_complete
    from public.schedule_card_candidate_assessments assessment
    where assessment.card_id = nullif(v_item ->> 'card_id', '')::uuid
      and assessment.day_of_week = nullif(v_item ->> 'day_of_week', '')::smallint
      and assessment.start_period = nullif(v_item ->> 'start_period', '')::smallint
      and assessment.teacher_id = nullif(v_item ->> 'teacher_id', '')::uuid
      and assessment.room_id = nullif(v_item ->> 'room_id', '')::uuid
    limit 1;

    if v_candidate_status is distinct from 'VALID'
       or coalesce(v_candidate_complete, false) is not true then
      raise exception
        'M26.6 PLACE bundle member is not externally valid: card %, status %',
        v_item ->> 'card_id',
        coalesce(v_candidate_status, 'MISSING');
    end if;
  end loop;

  for v_item, v_index in
    select entry.value, entry.ordinality::integer
    from jsonb_array_elements(p_items) with ordinality
      as entry(value, ordinality)
  loop
    v_transaction_id := public.management_place_bundle_member(
      nullif(v_item ->> 'card_id', '')::uuid,
      nullif(v_item ->> 'day_of_week', '')::smallint,
      nullif(v_item ->> 'start_period', '')::smallint,
      nullif(v_item ->> 'teacher_id', '')::uuid,
      nullif(v_item ->> 'room_id', '')::uuid
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

  perform public.refresh_management_candidate_domain_bundle_subset(
    v_revision_id,
    v_card_ids
  );

  perform public.management_finalize_bundle_propagation(
    v_revision_id,
    v_last_transaction_id
  );

  perform public.management_tag_bundle_root(
    v_last_transaction_id,
    v_bundle_id,
    v_bundle_size,
    v_bundle_size,
    v_bundle_card_ids
  );

  return v_last_transaction_id;
end
$$;


create or replace function public.management_move_card_bundle(
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
    raise exception 'M26.6 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'M26.6 MOVE bundle requires a JSON array';
  end if;

  v_bundle_size := jsonb_array_length(p_items);
  if v_bundle_size < 1 or v_bundle_size > 24 then
    raise exception 'M26.6 MOVE bundle requires 1..24 cards';
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
    raise exception 'M26.6 MOVE bundle contains duplicate card ids';
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
    raise exception 'M26.6 MOVE bundle requires known cards from one revision';
  end if;

  v_revision_id := v_revision_ids[1];

  perform public.refresh_management_candidate_domain_bundle_subset(
    v_revision_id,
    v_card_ids
  );

  -- Evaluate the whole move against external occupancy only. Current sibling
  -- placements are intentionally excluded by the bundle-scoped refresh.
  for v_item in
    select entry.value
    from jsonb_array_elements(p_items) as entry(value)
  loop
    select
      assessment.status,
      assessment.is_complete
    into
      v_candidate_status,
      v_candidate_complete
    from public.schedule_card_candidate_assessments assessment
    where assessment.card_id = nullif(v_item ->> 'card_id', '')::uuid
      and assessment.day_of_week = nullif(v_item ->> 'day_of_week', '')::smallint
      and assessment.start_period = nullif(v_item ->> 'start_period', '')::smallint
      and assessment.teacher_id = nullif(v_item ->> 'teacher_id', '')::uuid
      and assessment.room_id = nullif(v_item ->> 'room_id', '')::uuid
    limit 1;

    if v_candidate_status is distinct from 'VALID'
       or coalesce(v_candidate_complete, false) is not true then
      raise exception
        'M26.6 MOVE bundle member is not externally valid: card %, status %',
        v_item ->> 'card_id',
        coalesce(v_candidate_status, 'MISSING');
    end if;
  end loop;

  for v_item, v_index in
    select entry.value, entry.ordinality::integer
    from jsonb_array_elements(p_items) with ordinality
      as entry(value, ordinality)
  loop
    v_transaction_id := public.management_move_bundle_member(
      nullif(v_item ->> 'card_id', '')::uuid,
      nullif(v_item ->> 'day_of_week', '')::smallint,
      nullif(v_item ->> 'start_period', '')::smallint,
      nullif(v_item ->> 'teacher_id', '')::uuid,
      nullif(v_item ->> 'room_id', '')::uuid
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

  perform public.refresh_management_candidate_domain_bundle_subset(
    v_revision_id,
    v_card_ids
  );

  perform public.management_finalize_bundle_propagation(
    v_revision_id,
    v_last_transaction_id
  );

  perform public.management_tag_bundle_root(
    v_last_transaction_id,
    v_bundle_id,
    v_bundle_size,
    v_bundle_size,
    v_bundle_card_ids
  );

  return v_last_transaction_id;
end
$$;


revoke all
  on function public.refresh_management_candidate_domain_bundle_subset(uuid, uuid[])
  from public, anon, authenticated;
revoke all
  on function public.management_place_bundle_member(uuid, smallint, smallint, uuid, uuid)
  from public, anon, authenticated;
revoke all
  on function public.management_move_bundle_member(uuid, smallint, smallint, uuid, uuid)
  from public, anon, authenticated;

revoke all
  on function public.management_refresh_card_group_candidates(jsonb)
  from public, anon;
revoke all
  on function public.management_place_card_bundle(jsonb)
  from public, anon;
revoke all
  on function public.management_move_card_bundle(jsonb)
  from public, anon;

grant execute
  on function public.management_refresh_card_group_candidates(jsonb)
  to authenticated;
grant execute
  on function public.management_place_card_bundle(jsonb)
  to authenticated;
grant execute
  on function public.management_move_card_bundle(jsonb)
  to authenticated;

comment on function public.refresh_management_candidate_domain_bundle_subset(uuid, uuid[]) is
  'M26.6 candidate-domain refresh for one visual bundle. Explicit sibling cards are ignored as occupancy only for each other; all external teacher, room and group conflicts remain active.';
comment on function public.management_refresh_card_group_candidates(jsonb) is
  'M26.6 live grouped candidate refresh using bundle-aware occupancy.';
comment on function public.management_place_card_bundle(jsonb) is
  'M26.6 atomic grouped PLACE: validate all members against external occupancy, apply all members, refresh bundle domains, then propagate once.';
comment on function public.management_move_card_bundle(jsonb) is
  'M26.6 atomic grouped MOVE: ignore current bundle siblings while validating, apply all members, refresh bundle domains, then propagate once.';

commit;
