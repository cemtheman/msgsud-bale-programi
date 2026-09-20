-- Management v0.1 / M15
-- Delta Domain Engine.
--
-- Candidate assessments already tell the UI where a card may be placed. After a
-- committed occupancy change, only candidate rows whose time windows overlap
-- the old/new occupancy and whose teacher/room/group domains intersect can
-- change. M15 updates those rows in place instead of rebuilding full card/week
-- domains.
--
-- Preserved invariants:
-- - exact candidate must still be VALID at commit time
-- - no silent choice among multiple candidates
-- - deterministic forced propagation
-- - contradiction / unresolved semantics
-- - root history, undo/redo, RBAC, publication projection unchanged

begin;

create index if not exists schedule_card_candidate_card_day_start_idx
  on public.schedule_card_candidate_assessments (
    card_id,
    day_of_week,
    start_period
  );

create index if not exists schedule_card_candidate_teacher_day_start_idx
  on public.schedule_card_candidate_assessments (
    teacher_id,
    day_of_week,
    start_period,
    card_id
  )
  where teacher_id is not null;

create index if not exists schedule_card_candidate_room_day_start_idx
  on public.schedule_card_candidate_assessments (
    room_id,
    day_of_week,
    start_period,
    card_id
  )
  where room_id is not null;


-- Internal helper: re-evaluate only selected candidate rows against the
-- current placement occupancy, preserving static/unresolved reasons.
create or replace function public.revalidate_management_candidate_assessments(
  p_schedule_revision_id uuid,
  p_assessment_ids uuid[]
)
returns integer
language plpgsql
as $$
declare
  v_updated integer := 0;
  v_card_ids uuid[];
begin
  if p_assessment_ids is null or cardinality(p_assessment_ids) = 0 then
    return 0;
  end if;

  select coalesce(array_agg(distinct assessment.card_id), array[]::uuid[])
  into v_card_ids
  from public.schedule_card_candidate_assessments assessment
  join public.schedule_cards card
    on card.id = assessment.card_id
  where assessment.id = any(p_assessment_ids)
    and card.schedule_revision_id = p_schedule_revision_id;

  if cardinality(v_card_ids) = 0 then
    return 0;
  end if;

  with target as materialized (
    select
      assessment.id,
      assessment.card_id,
      assessment.day_of_week,
      assessment.start_period,
      assessment.teacher_id,
      assessment.room_id,
      card.duration_periods,
      requirement.instructional_group_id,
      array(
        select reason
        from unnest(assessment.reason_codes) as reason
        where reason not in (
          'TEACHER_CONFLICT',
          'ROOM_CONFLICT',
          'GROUP_CONFLICT'
        )
      )::text[] as static_reason_codes
    from public.schedule_card_candidate_assessments assessment
    join public.schedule_cards card
      on card.id = assessment.card_id
    join public.course_requirements requirement
      on requirement.id = card.requirement_id
    where assessment.id = any(p_assessment_ids)
      and card.schedule_revision_id = p_schedule_revision_id
  ),
  recalculated as materialized (
    select
      target.*,
      exists (
        select 1
        from public.placements placement
        join public.schedule_cards occupied_card
          on occupied_card.id = placement.card_id
        where occupied_card.schedule_revision_id = p_schedule_revision_id
          and occupied_card.id <> target.card_id
          and placement.day_of_week = target.day_of_week
          and placement.start_period <= (
            target.start_period + target.duration_periods - 1
          )
          and (
            placement.start_period + occupied_card.duration_periods - 1
          ) >= target.start_period
          and target.teacher_id is not null
          and placement.teacher_id = target.teacher_id
      ) as teacher_conflict,
      exists (
        select 1
        from public.placements placement
        join public.schedule_cards occupied_card
          on occupied_card.id = placement.card_id
        where occupied_card.schedule_revision_id = p_schedule_revision_id
          and occupied_card.id <> target.card_id
          and placement.day_of_week = target.day_of_week
          and placement.start_period <= (
            target.start_period + target.duration_periods - 1
          )
          and (
            placement.start_period + occupied_card.duration_periods - 1
          ) >= target.start_period
          and target.room_id is not null
          and placement.room_id = target.room_id
      ) as room_conflict,
      exists (
        select 1
        from public.placements placement
        join public.schedule_cards occupied_card
          on occupied_card.id = placement.card_id
        join public.course_requirements occupied_requirement
          on occupied_requirement.id = occupied_card.requirement_id
        where occupied_card.schedule_revision_id = p_schedule_revision_id
          and occupied_card.id <> target.card_id
          and placement.day_of_week = target.day_of_week
          and placement.start_period <= (
            target.start_period + target.duration_periods - 1
          )
          and (
            placement.start_period + occupied_card.duration_periods - 1
          ) >= target.start_period
          and public.management_instructional_groups_conflict(
            target.instructional_group_id,
            occupied_requirement.instructional_group_id
          )
      ) as group_conflict
    from target
  ),
  classified as materialized (
    select
      recalculated.*,
      (
        recalculated.static_reason_codes && array[
          'TEACHER_UNKNOWN',
          'TEACHER_ASSIGNMENT_MISSING',
          'ROOM_UNKNOWN',
          'ROOM_ASSIGNMENT_MISSING',
          'CAPABILITY_UNCONFIRMED',
          'CAPABILITY_UNRESOLVED'
        ]::text[]
      ) as has_unresolved,
      exists (
        select 1
        from unnest(recalculated.static_reason_codes) as reason
        where reason <> all(array[
          'TEACHER_UNKNOWN',
          'TEACHER_ASSIGNMENT_MISSING',
          'ROOM_UNKNOWN',
          'ROOM_ASSIGNMENT_MISSING',
          'CAPABILITY_UNCONFIRMED',
          'CAPABILITY_UNRESOLVED'
        ]::text[])
      ) as has_hard_static
    from recalculated
  ),
  final as materialized (
    select
      classified.*,
      array_cat(
        classified.static_reason_codes,
        array_remove(
          array[
            case when classified.teacher_conflict then 'TEACHER_CONFLICT' end,
            case when classified.room_conflict then 'ROOM_CONFLICT' end,
            case when classified.group_conflict then 'GROUP_CONFLICT' end
          ]::text[],
          null
        )
      )::text[] as new_reason_codes,
      case
        when classified.has_hard_static
          or classified.teacher_conflict
          or classified.room_conflict
          or classified.group_conflict
          then 'INVALID'
        when classified.has_unresolved
          then 'UNRESOLVED'
        else 'VALID'
      end as new_status
    from classified
  )
  update public.schedule_card_candidate_assessments assessment
  set
    status = final.new_status,
    is_complete = (
      final.teacher_id is not null
      and final.room_id is not null
      and not final.has_unresolved
    ),
    reason_codes = final.new_reason_codes,
    details = assessment.details || jsonb_build_object(
      'engine_version', 'M15-v0.1'
    ),
    generated_at = now()
  from final
  where assessment.id = final.id;

  get diagnostics v_updated = row_count;

  with aggregate as materialized (
    select
      assessment.card_id,
      count(*) filter (where assessment.status = 'VALID')::integer
        as valid_count,
      count(*) filter (where assessment.status = 'INVALID')::integer
        as invalid_count,
      count(*) filter (where assessment.status = 'UNRESOLVED')::integer
        as unresolved_count,
      count(*) filter (where assessment.is_complete)::integer
        as complete_candidate_count
    from public.schedule_card_candidate_assessments assessment
    where assessment.card_id = any(v_card_ids)
    group by assessment.card_id
  )
  insert into public.schedule_card_domain_summaries (
    card_id,
    domain_status,
    valid_count,
    invalid_count,
    unresolved_count,
    complete_candidate_count,
    is_forced,
    is_contradiction,
    generated_at
  )
  select
    aggregate.card_id,
    case
      when aggregate.unresolved_count > 0 then 'UNRESOLVED'
      when aggregate.valid_count = 0 then 'INVALID'
      else 'VALID'
    end,
    aggregate.valid_count,
    aggregate.invalid_count,
    aggregate.unresolved_count,
    aggregate.complete_candidate_count,
    (
      aggregate.valid_count = 1
      and aggregate.unresolved_count = 0
    ),
    (
      aggregate.valid_count = 0
      and aggregate.unresolved_count = 0
    ),
    now()
  from aggregate
  on conflict (card_id) do update
  set
    domain_status = excluded.domain_status,
    valid_count = excluded.valid_count,
    invalid_count = excluded.invalid_count,
    unresolved_count = excluded.unresolved_count,
    complete_candidate_count = excluded.complete_candidate_count,
    is_forced = excluded.is_forced,
    is_contradiction = excluded.is_contradiction,
    generated_at = excluded.generated_at;

  return v_updated;
end
$$;

-- Exact drop validation: refresh one candidate row only. Missing rows fall back
-- to the existing one-card rebuild so static assignment changes remain safe.
create or replace function public.refresh_management_candidate_exact(
  p_schedule_revision_id uuid,
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
  v_assessment_id uuid;
begin
  select assessment.id
  into v_assessment_id
  from public.schedule_card_candidate_assessments assessment
  join public.schedule_cards card
    on card.id = assessment.card_id
  where assessment.card_id = p_card_id
    and card.schedule_revision_id = p_schedule_revision_id
    and assessment.day_of_week = p_day_of_week
    and assessment.start_period = p_start_period
    and assessment.teacher_id = p_teacher_id
    and assessment.room_id = p_room_id;

  if v_assessment_id is null then
    perform public.refresh_management_candidate_domain_subset(
      p_schedule_revision_id,
      array[p_card_id]::uuid[]
    );

    select assessment.id
    into v_assessment_id
    from public.schedule_card_candidate_assessments assessment
    where assessment.card_id = p_card_id
      and assessment.day_of_week = p_day_of_week
      and assessment.start_period = p_start_period
      and assessment.teacher_id = p_teacher_id
      and assessment.room_id = p_room_id;
  end if;

  if v_assessment_id is null then
    raise exception
      'M15 exact candidate not found for card %, day %, period %, teacher %, room %',
      p_card_id,
      p_day_of_week,
      p_start_period,
      p_teacher_id,
      p_room_id;
  end if;

  perform public.revalidate_management_candidate_assessments(
    p_schedule_revision_id,
    array[v_assessment_id]::uuid[]
  );

  return v_assessment_id;
end
$$;

-- Delta refresh: identify cards whose domains can change because one occupancy
-- was added, removed, or moved; then re-evaluate only candidate rows whose time
-- windows overlap the old/new occupancy windows.
create or replace function public.refresh_management_candidate_domain_delta(
  p_schedule_revision_id uuid,
  p_changed_card_id uuid,
  p_old_day smallint,
  p_old_start smallint,
  p_old_teacher_id uuid,
  p_old_room_id uuid,
  p_new_day smallint,
  p_new_start smallint,
  p_new_teacher_id uuid,
  p_new_room_id uuid
)
returns integer
language plpgsql
as $$
declare
  v_changed_group_id uuid;
  v_changed_duration smallint;
  v_impacted_card_ids uuid[];
  v_assessment_ids uuid[];
begin
  select
    requirement.instructional_group_id,
    card.duration_periods
  into
    v_changed_group_id,
    v_changed_duration
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.id = p_changed_card_id
    and card.schedule_revision_id = p_schedule_revision_id;

  if v_changed_group_id is null or v_changed_duration is null then
    raise exception
      'M15 changed card not found in revision: %',
      p_changed_card_id;
  end if;

  select coalesce(array_agg(distinct card.id), array[]::uuid[])
  into v_impacted_card_ids
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.schedule_revision_id = p_schedule_revision_id
    and card.id <> p_changed_card_id
    and (
      public.management_instructional_groups_conflict(
        requirement.instructional_group_id,
        v_changed_group_id
      )
      or exists (
        select 1
        from public.schedule_card_candidate_assessments assessment
        where assessment.card_id = card.id
          and (
            (p_old_teacher_id is not null and assessment.teacher_id = p_old_teacher_id)
            or
            (p_new_teacher_id is not null and assessment.teacher_id = p_new_teacher_id)
          )
      )
      or exists (
        select 1
        from public.schedule_card_candidate_assessments assessment
        where assessment.card_id = card.id
          and (
            (p_old_room_id is not null and assessment.room_id = p_old_room_id)
            or
            (p_new_room_id is not null and assessment.room_id = p_new_room_id)
          )
      )
    );

  if cardinality(v_impacted_card_ids) = 0 then
    return 0;
  end if;

  select coalesce(array_agg(assessment.id), array[]::uuid[])
  into v_assessment_ids
  from public.schedule_card_candidate_assessments assessment
  join public.schedule_cards card
    on card.id = assessment.card_id
  where assessment.card_id = any(v_impacted_card_ids)
    and (
      (
        p_old_day is not null
        and p_old_start is not null
        and assessment.day_of_week = p_old_day
        and assessment.start_period <= (
          p_old_start + v_changed_duration - 1
        )
        and (
          assessment.start_period + card.duration_periods - 1
        ) >= p_old_start
      )
      or
      (
        p_new_day is not null
        and p_new_start is not null
        and assessment.day_of_week = p_new_day
        and assessment.start_period <= (
          p_new_start + v_changed_duration - 1
        )
        and (
          assessment.start_period + card.duration_periods - 1
        ) >= p_new_start
      )
    );

  return public.revalidate_management_candidate_assessments(
    p_schedule_revision_id,
    v_assessment_ids
  );
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
  v_old_day smallint;
  v_old_start smallint;
  v_old_teacher_id uuid;
  v_old_room_id uuid;
  v_new_day smallint;
  v_new_start smallint;
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
      'M15 propagation requires revision, root transaction, and parent transaction';
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
      'M15 propagation root must be one active manual USER PLACE/MOVE root: %',
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
      'M15 propagation parent is outside active root chain: %',
      p_parent_transaction_id;
  end if;

  loop
    if v_auto_count > 289 then
      raise exception 'M15 propagation exceeded card safety bound';
    end if;

    select mt.payload
    into v_parent_payload
    from public.move_transactions mt
    where mt.id = v_parent_transaction_id
      and mt.schedule_revision_id = p_schedule_revision_id
      and mt.reverted_at is null;

    if v_parent_payload is null then
      raise exception
        'M15 active propagation parent payload not found: %',
        v_parent_transaction_id;
    end if;

    v_parent_card_id :=
      nullif(v_parent_payload ->> 'card_id', '')::uuid;
    v_old_day :=
      nullif(v_parent_payload -> 'before' ->> 'day_of_week', '')::smallint;
    v_old_start :=
      nullif(v_parent_payload -> 'before' ->> 'start_period', '')::smallint;
    v_old_teacher_id :=
      nullif(v_parent_payload -> 'before' ->> 'teacher_id', '')::uuid;
    v_old_room_id :=
      nullif(v_parent_payload -> 'before' ->> 'room_id', '')::uuid;
    v_new_day :=
      nullif(v_parent_payload -> 'after' ->> 'day_of_week', '')::smallint;
    v_new_start :=
      nullif(v_parent_payload -> 'after' ->> 'start_period', '')::smallint;
    v_new_teacher_id :=
      nullif(v_parent_payload -> 'after' ->> 'teacher_id', '')::uuid;
    v_new_room_id :=
      nullif(v_parent_payload -> 'after' ->> 'room_id', '')::uuid;

    perform public.refresh_management_candidate_domain_delta(
      p_schedule_revision_id,
      v_parent_card_id,
      v_old_day,
      v_old_start,
      v_old_teacher_id,
      v_old_room_id,
      v_new_day,
      v_new_start,
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
        'M15 forced domain produced incomplete candidate for card %',
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
        'engine_version', 'M15-v0.1',
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



create or replace function public.place_management_card(
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
    raise exception 'M15 manual placement requires card_id';
  end if;

  if p_day_of_week is null or p_day_of_week < 1 or p_day_of_week > 5 then
    raise exception 'M15 manual placement requires day_of_week 1..5';
  end if;

  if p_start_period is null or p_start_period < 1 or p_start_period > 12 then
    raise exception 'M15 manual placement requires start_period 1..12';
  end if;

  if p_teacher_id is null or p_room_id is null then
    raise exception 'M15 manual placement requires resolved teacher and room';
  end if;

  -- Serialize the complete USER + AUTO chain per draft revision.
  select revision.id, revision.status
  into v_revision_id, v_revision_status
  from public.schedule_cards card
  join public.schedule_revisions revision
    on revision.id = card.schedule_revision_id
  where card.id = p_card_id
  for update of revision;

  if v_revision_id is null then
    raise exception 'M15 card not found: %', p_card_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M15 card belongs to non-DRAFT revision: %', v_revision_status;
  end if;

  if exists (
    select 1
    from public.placements placement
    where placement.card_id = p_card_id
  ) then
    raise exception 'M15 card is already placed: %', p_card_id;
  end if;

  v_candidate_id := public.refresh_management_candidate_exact(
    v_revision_id,
    p_card_id,
    p_day_of_week,
    p_start_period,
    p_teacher_id,
    p_room_id
  );

  select
    assessment.status,
    assessment.reason_codes
  into
    v_candidate_status,
    v_reason_codes
  from public.schedule_card_candidate_assessments assessment
  where assessment.id = v_candidate_id;

  if v_candidate_id is null then
    raise exception
      'M15 candidate not found for card %, day %, period %, teacher %, room %',
      p_card_id,
      p_day_of_week,
      p_start_period,
      p_teacher_id,
      p_room_id;
  end if;

  if v_candidate_status <> 'VALID' then
    raise exception
      'M15 candidate is %, reasons %',
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
    'PLACE',
    jsonb_build_object(
      'source', 'MANUAL',
      'engine_version', 'M15-v0.1',
      'candidate_assessment_id', v_candidate_id,
      'card_id', p_card_id,
      'before', null,
      'after', jsonb_build_object(
        'day_of_week', p_day_of_week,
        'start_period', p_start_period,
        'teacher_id', p_teacher_id,
        'room_id', p_room_id
      )
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

  v_auto_count := public.propagate_management_forced_cards(
    v_revision_id,
    v_transaction_id,
    v_transaction_id
  );

  -- The propagation helper leaves candidate domains current at its stop point.
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
    -- This should be unreachable unless the propagation invariant regresses.
    raise exception 'M15 propagation stopped with % forced cards remaining', v_forced_remaining_count;
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
    raise exception 'M15 move requires card_id';
  end if;

  if p_day_of_week is null or p_day_of_week < 1 or p_day_of_week > 5 then
    raise exception 'M15 move requires day_of_week 1..5';
  end if;

  if p_start_period is null or p_start_period < 1 or p_start_period > 12 then
    raise exception 'M15 move requires start_period 1..12';
  end if;

  if p_teacher_id is null or p_room_id is null then
    raise exception 'M15 move requires resolved teacher and room';
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
    raise exception 'M15 move requires DRAFT revision, found %', v_revision_status;
  end if;

  if v_locked then
    raise exception 'M15 move rejected for locked card: %', p_card_id;
  end if;

  if v_before_day = p_day_of_week
     and v_before_start = p_start_period
     and v_before_teacher = p_teacher_id
     and v_before_room = p_room_id then
    raise exception 'M15 move is a no-op for card %', p_card_id;
  end if;

  v_candidate_id := public.refresh_management_candidate_exact(
    v_revision_id,
    p_card_id,
    p_day_of_week,
    p_start_period,
    p_teacher_id,
    p_room_id
  );

  select
    assessment.status,
    assessment.reason_codes
  into
    v_candidate_status,
    v_reason_codes
  from public.schedule_card_candidate_assessments assessment
  where assessment.id = v_candidate_id;

  if v_candidate_id is null then
    raise exception
      'M15 move candidate not found for card %, day %, period %, teacher %, room %',
      p_card_id,
      p_day_of_week,
      p_start_period,
      p_teacher_id,
      p_room_id;
  end if;

  if v_candidate_status <> 'VALID' then
    raise exception
      'M15 move candidate is %, reasons %',
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
      'engine_version', 'M15-v0.1',
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
    raise exception 'M15 move propagation stopped with % forced cards remaining',
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







create or replace function public.remove_management_card(
  p_card_id uuid
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
  v_transaction_id uuid;
  v_remaining_placements integer;
  v_forced_count integer;
  v_contradiction_count integer;
begin
  if p_card_id is null then
    raise exception 'M15 remove requires card_id';
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
    raise exception 'M8 placed card not found for remove: %', p_card_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M15 remove requires DRAFT revision, found %', v_revision_status;
  end if;

  if v_locked then
    raise exception 'M15 remove rejected for locked card: %', p_card_id;
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
    'REMOVE',
    jsonb_build_object(
      'source', 'MANUAL',
      'engine_version', 'M15-v0.1',
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
      'after', null
    )
  )
  returning id into v_transaction_id;

  delete from public.placements placement
  where placement.id = v_placement_id;

  -- M14.4: the removed card must stay in the unscheduled pool until the human
  -- acts, so REMOVE still does not propagate. Refresh only domains affected by
  -- releasing this placement instead of rebuilding the complete revision.
  perform public.refresh_management_candidate_domain_delta(
    v_revision_id,
    p_card_id,
    v_before_day,
    v_before_start,
    v_before_teacher,
    v_before_room,
    null,
    null,
    null,
    null
  );

  select count(*)
  into v_remaining_placements
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  where card.schedule_revision_id = v_revision_id;

  select count(*)
  into v_forced_count
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

  update public.move_transactions mt
  set payload = mt.payload || jsonb_build_object(
    'propagation_auto_count', 0,
    'propagation_stop_reason', 'MANUAL_REMOVE',
    'remaining_placement_count', v_remaining_placements,
    'post_remove_forced_count', v_forced_count,
    'post_remove_contradiction_count', v_contradiction_count,
    'candidate_domain_refresh', 'PASS'
  )
  where mt.id = v_transaction_id;

  return v_transaction_id;
end
$$;





comment on function public.revalidate_management_candidate_assessments(uuid, uuid[]) is
  'M15 internal row-level revalidation. Recomputes dynamic occupancy conflicts only for selected candidate assessments and updates their card summaries.';

comment on function public.refresh_management_candidate_exact(uuid, uuid, smallint, smallint, uuid, uuid) is
  'M15 exact drop validation. Revalidates one candidate assessment against current occupancy; falls back to one-card rebuild only if the row is missing.';

comment on function public.refresh_management_candidate_domain_delta(uuid, uuid, smallint, smallint, uuid, uuid, smallint, smallint, uuid, uuid) is
  'M15 delta engine. Revalidates only candidate rows whose time windows and participant/resource domains can be affected by one placement occupancy change.';

comment on function public.propagate_management_forced_cards(uuid, uuid, uuid) is
  'M15 deterministic forced propagation using row-level delta domain updates after each root/AUTO occupancy change.';

comment on function public.place_management_card(uuid, smallint, smallint, uuid, uuid) is
  'M15 manual PLACE. Exact target row is live-revalidated; propagation uses delta domain updates.';

comment on function public.move_management_card(uuid, smallint, smallint, uuid, uuid) is
  'M15 manual MOVE. Exact target row is live-revalidated; old/new occupancy windows update candidate domains by delta.';

comment on function public.remove_management_card(uuid) is
  'M15 manual REMOVE. Released occupancy updates only overlapping affected candidate rows; explicit remove still does not propagate.';

revoke all
  on function public.revalidate_management_candidate_assessments(uuid, uuid[])
  from public, anon, authenticated;

revoke all
  on function public.refresh_management_candidate_exact(uuid, uuid, smallint, smallint, uuid, uuid)
  from public, anon, authenticated;

revoke all
  on function public.refresh_management_candidate_domain_delta(uuid, uuid, smallint, smallint, uuid, uuid, smallint, smallint, uuid, uuid)
  from public, anon, authenticated;

revoke all
  on function public.propagate_management_forced_cards(uuid, uuid, uuid)
  from public, anon, authenticated;

revoke all
  on function public.place_management_card(uuid, smallint, smallint, uuid, uuid)
  from public, anon, authenticated;

revoke all
  on function public.move_management_card(uuid, smallint, smallint, uuid, uuid)
  from public, anon, authenticated;

revoke all
  on function public.remove_management_card(uuid)
  from public, anon, authenticated;


commit;
