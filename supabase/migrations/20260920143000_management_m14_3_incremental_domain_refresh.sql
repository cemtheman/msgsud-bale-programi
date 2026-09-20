-- Management v0.1 / M14.3
-- Incremental candidate-domain refresh for scheduling mutations.
--
-- M14.2 made a full refresh substantially cheaper, but live MOVE still reached
-- the browser RPC statement timeout. The remaining cost is architectural:
-- rebuilding all ~26k hypothetical candidates after every single occupancy
-- change is unnecessary.
--
-- M14.3 keeps the same scheduling invariants but refreshes only cards whose
-- domains can change because of the placement that was added, removed, or
-- moved. Forced propagation uses this incremental refresh after each root/AUTO
-- placement instead of rebuilding the entire revision.
--
-- No silent choice is introduced. Exact VALID candidates, deterministic forced
-- propagation, contradictions, history, undo/redo, and publication semantics
-- remain unchanged.

begin;

create or replace function public.refresh_management_candidate_domain_subset(
  p_schedule_revision_id uuid,
  p_card_ids uuid[]
)
returns void
language plpgsql
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
      'M14.3 subset refresh requires one DRAFT revision: %',
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
        where occupancy.card_id <> raw.card_id
          and occupancy.day_of_week = raw.day_of_week
          and occupancy.start_period <= raw.end_period
          and occupancy.end_period >= raw.start_period
          and raw.teacher_id is not null
          and occupancy.teacher_id = raw.teacher_id
      ) as teacher_conflict,
      exists (
        select 1
        from occupied occupancy
        where occupancy.card_id <> raw.card_id
          and occupancy.day_of_week = raw.day_of_week
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
        where occupancy.card_id <> raw.card_id
          and occupancy.day_of_week = raw.day_of_week
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
      'engine_version', 'M14.3-v0.1',
      'duration_periods', classified.duration_periods,
      'end_period', classified.end_period
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

create or replace function public.refresh_management_candidate_domain_after_change(
  p_schedule_revision_id uuid,
  p_changed_card_id uuid,
  p_old_teacher_id uuid,
  p_old_room_id uuid,
  p_new_teacher_id uuid,
  p_new_room_id uuid
)
returns integer
language plpgsql
as $$
declare
  v_changed_group_id uuid;
  v_impacted_card_ids uuid[];
begin
  select requirement.instructional_group_id
  into v_changed_group_id
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.id = p_changed_card_id
    and card.schedule_revision_id = p_schedule_revision_id;

  if v_changed_group_id is null then
    raise exception
      'M14.3 changed card not found in revision: %',
      p_changed_card_id;
  end if;

  select coalesce(array_agg(distinct card.id), array[]::uuid[])
  into v_impacted_card_ids
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.schedule_revision_id = p_schedule_revision_id
    and (
      card.id = p_changed_card_id
      or public.management_instructional_groups_conflict(
        requirement.instructional_group_id,
        v_changed_group_id
      )
      or exists (
        select 1
        from public.schedule_card_candidate_assessments assessment
        where assessment.card_id = card.id
          and assessment.teacher_id is not null
          and assessment.teacher_id in (
            p_old_teacher_id,
            p_new_teacher_id
          )
      )
      or exists (
        select 1
        from public.schedule_card_candidate_assessments assessment
        where assessment.card_id = card.id
          and assessment.room_id is not null
          and assessment.room_id in (
            p_old_room_id,
            p_new_room_id
          )
      )
    );

  perform public.refresh_management_candidate_domain_subset(
    p_schedule_revision_id,
    v_impacted_card_ids
  );

  return cardinality(v_impacted_card_ids);
end
$$;

create or replace function public.propagate_management_forced_cards(
  p_schedule_revision_id uuid,
  p_root_transaction_id uuid,
  p_parent_transaction_id uuid
)
returns integer
language plpgsql
as $$
declare
  v_root_count integer;
  v_parent_count integer;
  v_parent_transaction_id uuid := p_parent_transaction_id;
  v_parent_payload jsonb;
  v_parent_card_id uuid;
  v_old_teacher_id uuid;
  v_old_room_id uuid;
  v_new_teacher_id uuid;
  v_new_room_id uuid;
  v_forced_card_id uuid;
  v_candidate_id uuid;
  v_day_of_week smallint;
  v_start_period smallint;
  v_teacher_id uuid;
  v_room_id uuid;
  v_auto_transaction_id uuid;
  v_auto_count integer := 0;
begin
  if p_schedule_revision_id is null
     or p_root_transaction_id is null
     or p_parent_transaction_id is null then
    raise exception
      'M14.3 propagation requires revision, root transaction, and parent transaction';
  end if;

  select count(*)
  into v_root_count
  from public.move_transactions mt
  where mt.id = p_root_transaction_id
    and mt.schedule_revision_id = p_schedule_revision_id
    and mt.actor_type = 'USER'
    and mt.action in ('PLACE', 'MOVE')
    and mt.root_transaction_id is null
    and mt.parent_transaction_id is null
    and mt.reverted_at is null
    and mt.payload ->> 'source' = 'MANUAL';

  if v_root_count <> 1 then
    raise exception
      'M14.3 propagation root must be one active manual USER PLACE/MOVE root: %',
      p_root_transaction_id;
  end if;

  select count(*)
  into v_parent_count
  from public.move_transactions mt
  where mt.id = p_parent_transaction_id
    and mt.schedule_revision_id = p_schedule_revision_id
    and mt.reverted_at is null
    and (
      mt.id = p_root_transaction_id
      or mt.root_transaction_id = p_root_transaction_id
    );

  if v_parent_count <> 1 then
    raise exception
      'M14.3 propagation parent is outside active root chain: %',
      p_parent_transaction_id;
  end if;

  loop
    if v_auto_count > 289 then
      raise exception 'M14.3 propagation exceeded card safety bound';
    end if;

    select mt.payload
    into v_parent_payload
    from public.move_transactions mt
    where mt.id = v_parent_transaction_id
      and mt.schedule_revision_id = p_schedule_revision_id
      and mt.reverted_at is null;

    if v_parent_payload is null then
      raise exception
        'M14.3 active propagation parent payload not found: %',
        v_parent_transaction_id;
    end if;

    v_parent_card_id :=
      nullif(v_parent_payload ->> 'card_id', '')::uuid;
    v_old_teacher_id :=
      nullif(v_parent_payload -> 'before' ->> 'teacher_id', '')::uuid;
    v_old_room_id :=
      nullif(v_parent_payload -> 'before' ->> 'room_id', '')::uuid;
    v_new_teacher_id :=
      nullif(v_parent_payload -> 'after' ->> 'teacher_id', '')::uuid;
    v_new_room_id :=
      nullif(v_parent_payload -> 'after' ->> 'room_id', '')::uuid;

    perform public.refresh_management_candidate_domain_after_change(
      p_schedule_revision_id,
      v_parent_card_id,
      v_old_teacher_id,
      v_old_room_id,
      v_new_teacher_id,
      v_new_room_id
    );

    if exists (
      select 1
      from public.schedule_card_domain_summaries summary
      join public.schedule_cards card
        on card.id = summary.card_id
      where card.schedule_revision_id = p_schedule_revision_id
        and summary.is_contradiction
        and not exists (
          select 1
          from public.placements placement
          where placement.card_id = card.id
        )
    ) then
      exit;
    end if;

    v_forced_card_id := null;
    v_candidate_id := null;
    v_day_of_week := null;
    v_start_period := null;
    v_teacher_id := null;
    v_room_id := null;

    select
      card.id,
      assessment.id,
      assessment.day_of_week,
      assessment.start_period,
      assessment.teacher_id,
      assessment.room_id
    into
      v_forced_card_id,
      v_candidate_id,
      v_day_of_week,
      v_start_period,
      v_teacher_id,
      v_room_id
    from public.schedule_card_domain_summaries summary
    join public.schedule_cards card
      on card.id = summary.card_id
    join public.schedule_card_candidate_assessments assessment
      on assessment.card_id = card.id
     and assessment.status = 'VALID'
     and assessment.is_complete
    where card.schedule_revision_id = p_schedule_revision_id
      and summary.is_forced
      and summary.unresolved_count = 0
      and not exists (
        select 1
        from public.placements placement
        where placement.card_id = card.id
      )
    order by
      card.requirement_id::text,
      card.block_index,
      card.id::text
    limit 1;

    if v_forced_card_id is null then
      exit;
    end if;

    if v_candidate_id is null
       or v_teacher_id is null
       or v_room_id is null then
      raise exception
        'M14.3 forced domain produced incomplete candidate for card %',
        v_forced_card_id;
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
      p_schedule_revision_id,
      p_root_transaction_id,
      v_parent_transaction_id,
      'AUTO',
      'PLACE',
      jsonb_build_object(
        'source', 'FORCED_PROPAGATION',
        'engine_version', 'M14.3-v0.1',
        'propagation_step', v_auto_count + 1,
        'candidate_assessment_id', v_candidate_id,
        'card_id', v_forced_card_id,
        'before', null,
        'after', jsonb_build_object(
          'day_of_week', v_day_of_week,
          'start_period', v_start_period,
          'teacher_id', v_teacher_id,
          'room_id', v_room_id
        )
      )
    )
    returning id into v_auto_transaction_id;

    insert into public.placements (
      card_id,
      day_of_week,
      start_period,
      teacher_id,
      room_id,
      move_transaction_id
    )
    values (
      v_forced_card_id,
      v_day_of_week,
      v_start_period,
      v_teacher_id,
      v_room_id,
      v_auto_transaction_id
    );

    v_auto_count := v_auto_count + 1;
    v_parent_transaction_id := v_auto_transaction_id;
  end loop;

  return v_auto_count;
end
$$;

create or replace function public.move_management_card(
  p_card_id uuid,
  p_day_of_week smallint,
  p_start_period smallint,
  p_teacher_id uuid,
  p_room_id uuid
)
returns uuid
language plpgsql
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
  v_candidate_id uuid;
  v_candidate_status text;
  v_reason_codes text[];
  v_transaction_id uuid;
  v_auto_count integer;
  v_contradiction_count integer;
  v_forced_remaining_count integer;
  v_unplaced_count integer;
  v_stop_reason text;
begin
  if p_card_id is null then
    raise exception 'M8 move requires card_id';
  end if;

  if p_day_of_week is null or p_day_of_week < 1 or p_day_of_week > 5 then
    raise exception 'M8 move requires day_of_week 1..5';
  end if;

  if p_start_period is null or p_start_period < 1 or p_start_period > 12 then
    raise exception 'M8 move requires start_period 1..12';
  end if;

  if p_teacher_id is null or p_room_id is null then
    raise exception 'M8 move requires resolved teacher and room';
  end if;

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
    raise exception 'M8 placed card not found: %', p_card_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M8 move requires DRAFT revision, found %', v_revision_status;
  end if;

  if v_locked then
    raise exception 'M8 move rejected for locked card: %', p_card_id;
  end if;

  if v_before_day = p_day_of_week
     and v_before_start = p_start_period
     and v_before_teacher = p_teacher_id
     and v_before_room = p_room_id then
    raise exception 'M8 move is a no-op for card %', p_card_id;
  end if;

  -- M14.3 exact-target safety without a full-revision rebuild.
  -- Recompute only the moved card's domain against current occupancy, then
  -- validate the requested complete candidate. This keeps the command current
  -- even when unrelated cards have older generated_at timestamps under the
  -- incremental refresh model.
  perform public.refresh_management_candidate_domain_subset(
    v_revision_id,
    array[p_card_id]::uuid[]
  );

  select
    assessment.id,
    assessment.status,
    assessment.reason_codes
  into
    v_candidate_id,
    v_candidate_status,
    v_reason_codes
  from public.schedule_card_candidate_assessments assessment
  where assessment.card_id = p_card_id
    and assessment.day_of_week = p_day_of_week
    and assessment.start_period = p_start_period
    and assessment.teacher_id = p_teacher_id
    and assessment.room_id = p_room_id;

  if v_candidate_id is null then
    raise exception
      'M8 move candidate not found for card %, day %, period %, teacher %, room %',
      p_card_id,
      p_day_of_week,
      p_start_period,
      p_teacher_id,
      p_room_id;
  end if;

  if v_candidate_status <> 'VALID' then
    raise exception
      'M8 move candidate is %, reasons %',
      v_candidate_status,
      coalesce(v_reason_codes, array[]::text[]);
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
      'engine_version', 'M14.3-v0.1',
      'candidate_assessment_id', v_candidate_id,
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
      )
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

  v_auto_count := public.propagate_management_forced_cards(
    v_revision_id,
    v_transaction_id,
    v_transaction_id
  );

  select count(*)
  into v_contradiction_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card on card.id = summary.card_id
  where card.schedule_revision_id = v_revision_id
    and summary.is_contradiction
    and not exists (
      select 1
      from public.placements placement
      where placement.card_id = card.id
    );

  select count(*)
  into v_forced_remaining_count
  from public.schedule_card_domain_summaries summary
  join public.schedule_cards card on card.id = summary.card_id
  where card.schedule_revision_id = v_revision_id
    and summary.is_forced
    and not exists (
      select 1
      from public.placements placement
      where placement.card_id = card.id
    );

  select count(*)
  into v_unplaced_count
  from public.schedule_cards card
  where card.schedule_revision_id = v_revision_id
    and not exists (
      select 1
      from public.placements placement
      where placement.card_id = card.id
    );

  if v_contradiction_count > 0 then
    v_stop_reason := 'CONTRADICTION';
  elsif v_unplaced_count = 0 then
    v_stop_reason := 'COMPLETE';
  elsif v_forced_remaining_count > 0 then
    raise exception 'M8 move propagation stopped with % forced cards remaining',
      v_forced_remaining_count;
  else
    v_stop_reason := 'NO_FORCED_CANDIDATE';
  end if;

  update public.move_transactions mt
  set payload = mt.payload || jsonb_build_object(
    'propagation_auto_count', v_auto_count,
    'propagation_stop_reason', v_stop_reason,
    'propagation_contradiction_count', v_contradiction_count,
    'remaining_unplaced_count', v_unplaced_count
  )
  where mt.id = v_transaction_id;

  return v_transaction_id;
end
$$;





comment on function public.move_management_card(uuid, smallint, smallint, uuid, uuid) is
  'M14.3 MOVE command. Revalidates only the moved card domain, applies the move, then uses incremental forced propagation.';

revoke all
  on function public.move_management_card(uuid, smallint, smallint, uuid, uuid)
  from public, anon, authenticated;

comment on function public.refresh_management_candidate_domain_subset(uuid, uuid[]) is
  'M14.3 internal candidate-domain rebuild for a selected card set only.';

comment on function public.refresh_management_candidate_domain_after_change(uuid, uuid, uuid, uuid, uuid, uuid) is
  'M14.3 determines cards affected by one occupancy mutation and refreshes only those domains.';

comment on function public.propagate_management_forced_cards(uuid, uuid, uuid) is
  'M14.3 deterministic forced propagation using incremental domain refresh after each root/AUTO placement.';

revoke all
  on function public.refresh_management_candidate_domain_subset(uuid, uuid[])
  from public, anon, authenticated;

revoke all
  on function public.refresh_management_candidate_domain_after_change(uuid, uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

revoke all
  on function public.propagate_management_forced_cards(uuid, uuid, uuid)
  from public, anon, authenticated;

commit;
