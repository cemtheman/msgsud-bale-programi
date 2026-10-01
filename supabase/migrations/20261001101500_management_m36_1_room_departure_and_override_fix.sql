-- Management / M36.1
-- Placement-resource preview card-id fix + controlled room departure.
--
-- 1) Fixes M32.4.2 effective_cards alias regression:
--    effective_cards exposes "id", not "card_id".
-- 2) Adds room archival/clear semantics symmetric to teacher departure:
--    day/time/teacher remain fixed while room links may be cleared.
-- 3) Keeps departure fast: no synchronous candidate-domain rebuild.

begin;

alter table public.rooms
  add column if not exists archived_at timestamptz null;

create index if not exists rooms_archived_at_idx
  on public.rooms (archived_at);

comment on column public.rooms.archived_at is
  'M36 logical deletion marker. Archived canonical rooms remain for FK/history integrity but are hidden from active management inventory.';

create or replace function public.management_preview_placement_resource_change_v2(
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
  v_requested_card_ids uuid[] := coalesce(p_card_ids, array[]::uuid[]);
  v_effective_card_ids uuid[] := coalesce(p_card_ids, array[]::uuid[]);
  v_revision_id uuid;
  v_base jsonb;
  v_policy_reasons text[] := array[]::text[];
  v_all_reasons text[] := array[]::text[];
  v_outside_pool_count integer := 0;
  v_requirement_wide_count integer := 0;
  v_outside_pool_with_unplaced_count integer := 0;
  v_policy_impacts jsonb := '[]'::jsonb;
  v_state_token text;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M32.4.2 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_resource_type not in ('TEACHER', 'ROOM') then
    raise exception 'M32.4.2 invalid resource type';
  end if;

  select card.schedule_revision_id
  into v_revision_id
  from public.schedule_cards card
  where card.id = any(v_requested_card_ids)
  order by card.id
  limit 1;

  if v_revision_id is null then
    raise exception 'M32.4.2 selected cards not found';
  end if;

  if p_resource_type = 'TEACHER' then
    -- REQUIREMENT+REQUIRED means a manual teacher change is a course-level
    -- placement decision, not a single-block mutation. Expand only to placed
    -- cards; unplaced blocks remain governed by the planning pool.
    with selected_requirements as (
      select distinct
        requirement.id as requirement_id,
        requirement.teacher_assignment_scope,
        requirement.teacher_continuity
      from public.schedule_cards card
      join public.course_requirements requirement
        on requirement.id = card.requirement_id
      where card.id = any(v_requested_card_ids)
    ),
    effective_cards as (
      select distinct card.id
      from public.schedule_cards card
      join selected_requirements selected
        on selected.requirement_id = card.requirement_id
      join public.placements placement
        on placement.card_id = card.id
      where card.schedule_revision_id = v_revision_id
        and (
          card.id = any(v_requested_card_ids)
          or (
            selected.teacher_assignment_scope = 'REQUIREMENT'
            and selected.teacher_continuity = 'REQUIRED'
          )
        )
    )
    select coalesce(
      array_agg(effective.id order by effective.id),
      array[]::uuid[]
    )
    into v_effective_card_ids
    from effective_cards effective;

    with selected_requirements as (
      select distinct
        requirement.id as requirement_id,
        requirement.teacher_assignment_scope,
        requirement.teacher_continuity,
        subject.name as subject_name,
        instructional_group.name as group_name
      from public.schedule_cards card
      join public.course_requirements requirement
        on requirement.id = card.requirement_id
      join public.subjects subject
        on subject.id = requirement.subject_id
      join public.instructional_groups instructional_group
        on instructional_group.id = requirement.instructional_group_id
      where card.id = any(v_requested_card_ids)
    ),
    policy_state as (
      select
        selected.requirement_id,
        selected.subject_name,
        selected.group_name,
        selected.teacher_assignment_scope,
        selected.teacher_continuity,
        exists (
          select 1
          from public.course_requirement_teachers assignment
          where assignment.requirement_id = selected.requirement_id
            and assignment.teacher_id = p_resource_id
        ) as in_planning_pool,
        (
          select count(*)::integer
          from public.schedule_cards card
          where card.schedule_revision_id = v_revision_id
            and card.requirement_id = selected.requirement_id
            and not exists (
              select 1
              from public.placements placement
              where placement.card_id = card.id
            )
        ) as unplaced_block_count,
        (
          select count(*)::integer
          from public.schedule_cards card
          join public.placements placement
            on placement.card_id = card.id
          where card.schedule_revision_id = v_revision_id
            and card.requirement_id = selected.requirement_id
        ) as placed_block_count,
        (
          select count(*)::integer
          from public.schedule_cards card
          where card.id = any(v_requested_card_ids)
            and card.requirement_id = selected.requirement_id
        ) as requested_block_count
      from selected_requirements selected
    )
    select
      count(*) filter (
        where not state.in_planning_pool
      )::integer,
      count(*) filter (
        where state.teacher_assignment_scope = 'REQUIREMENT'
          and state.teacher_continuity = 'REQUIRED'
          and state.placed_block_count > state.requested_block_count
      )::integer,
      count(*) filter (
        where state.teacher_assignment_scope = 'REQUIREMENT'
          and state.teacher_continuity = 'REQUIRED'
          and not state.in_planning_pool
          and state.unplaced_block_count > 0
      )::integer,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'requirementId', state.requirement_id,
            'subjectName', state.subject_name,
            'groupName', state.group_name,
            'teacherAssignmentScope', state.teacher_assignment_scope,
            'teacherContinuity', state.teacher_continuity,
            'inPlanningPool', state.in_planning_pool,
            'placedBlockCount', state.placed_block_count,
            'requestedBlockCount', state.requested_block_count,
            'unplacedBlockCount', state.unplaced_block_count,
            'requirementWide', (
              state.teacher_assignment_scope = 'REQUIREMENT'
              and state.teacher_continuity = 'REQUIRED'
            )
          )
          order by state.requirement_id
        ),
        '[]'::jsonb
      )
    into
      v_outside_pool_count,
      v_requirement_wide_count,
      v_outside_pool_with_unplaced_count,
      v_policy_impacts
    from policy_state state;

    if v_outside_pool_with_unplaced_count > 0 then
      v_policy_reasons := array_append(
        v_policy_reasons,
        'OUTSIDE_PLANNING_POOL_WITH_UNPLACED_BLOCKS'
      );
    end if;
  end if;

  v_base := public.management_preview_placement_resource_change(
    v_effective_card_ids,
    p_resource_type,
    p_resource_id
  );

  select coalesce(
    array_agg(distinct reason order by reason),
    array[]::text[]
  )
  into v_all_reasons
  from (
    select jsonb_array_elements_text(
      coalesce(v_base -> 'blockReasons', '[]'::jsonb)
    ) as reason
    union all
    select unnest(v_policy_reasons) as reason
  ) reasons;

  v_state_token := md5(
    jsonb_build_object(
      'baseStateToken', v_base ->> 'stateToken',
      'requestedCardIds', to_jsonb(v_requested_card_ids),
      'effectiveCardIds', to_jsonb(v_effective_card_ids),
      'resourceType', p_resource_type,
      'resourceId', p_resource_id,
      'policyImpacts', v_policy_impacts
    )::text
  );

  return v_base || jsonb_build_object(
    'requestedCardIds', to_jsonb(v_requested_card_ids),
    'cardIds', to_jsonb(v_effective_card_ids),
    'affectedCardCount', cardinality(v_effective_card_ids),
    'canApply', (
      coalesce((v_base ->> 'canApply')::boolean, false)
      and cardinality(v_policy_reasons) = 0
    ),
    'blockReasons', to_jsonb(v_all_reasons),
    'poolExpansionCount', 0,
    'outsidePlanningPoolCount', v_outside_pool_count,
    'requirementWideExpansionCount', v_requirement_wide_count,
    'planningPoolChanged', false,
    'policyImpacts', v_policy_impacts,
    'stateToken', v_state_token,
    'policyEngineVersion', 'M32.4.2-v1'
  );
end
$$;


create or replace function public.management_room_departure_scope(
  p_schedule_revision_id uuid,
  p_room_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requirement_set_id uuid;
begin
  select revision.requirement_set_id
  into v_requirement_set_id
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id;

  if v_requirement_set_id is null then
    raise exception 'M36.1 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  return jsonb_build_object(
    'requirementIds',
    coalesce(
      (
        select jsonb_agg(link.requirement_id order by link.requirement_id)
        from public.course_requirement_rooms link
        join public.course_requirements requirement
          on requirement.id = link.requirement_id
        where requirement.requirement_set_id = v_requirement_set_id
          and link.room_id = p_room_id
      ),
      '[]'::jsonb
    ),
    'placementCardIds',
    coalesce(
      (
        select jsonb_agg(placement.card_id order by placement.card_id)
        from public.placements placement
        join public.schedule_cards card
          on card.id = placement.card_id
        where card.schedule_revision_id = p_schedule_revision_id
          and placement.room_id = p_room_id
      ),
      '[]'::jsonb
    )
  );
end
$$;


create or replace function public.management_room_departure_state(
  p_schedule_revision_id uuid,
  p_room_id uuid,
  p_scope jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_name text;
  v_status text;
  v_archived_at timestamptz;
  v_display_name text;
begin
  select
    room.name,
    room.operational_status,
    room.archived_at,
    coalesce(override_row.display_name, room.name)
  into
    v_name,
    v_status,
    v_archived_at,
    v_display_name
  from public.rooms room
  left join public.management_room_name_overrides override_row
    on override_row.schedule_revision_id = p_schedule_revision_id
   and override_row.room_id = room.id
  where room.id = p_room_id;

  if v_name is null then
    return jsonb_build_object(
      'exists', false,
      'scope', coalesce(p_scope, '{}'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'exists', true,
    'name', v_name,
    'displayName', v_display_name,
    'operationalStatus', v_status,
    'archivedAt', v_archived_at,
    'scope', coalesce(p_scope, '{}'::jsonb),
    'requirementLinks',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'requirementId', scope_item.requirement_id,
            'linked', exists (
              select 1
              from public.course_requirement_rooms assignment
              where assignment.requirement_id = scope_item.requirement_id
                and assignment.room_id = p_room_id
            ),
            'resourceMode', (
              select requirement.resource_mode
              from public.course_requirements requirement
              where requirement.id = scope_item.requirement_id
            ),
            'requiredCapability', (
              select requirement.required_capability
              from public.course_requirements requirement
              where requirement.id = scope_item.requirement_id
            )
          )
          order by scope_item.requirement_id
        )
        from (
          select value::uuid as requirement_id
          from jsonb_array_elements_text(
            coalesce(p_scope -> 'requirementIds', '[]'::jsonb)
          )
        ) scope_item
      ),
      '[]'::jsonb
    ),
    'placementLinks',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'cardId', scope_item.card_id,
            'roomId', placement.room_id
          )
          order by scope_item.card_id
        )
        from (
          select value::uuid as card_id
          from jsonb_array_elements_text(
            coalesce(p_scope -> 'placementCardIds', '[]'::jsonb)
          )
        ) scope_item
        left join public.placements placement
          on placement.card_id = scope_item.card_id
      ),
      '[]'::jsonb
    )
  );
end
$$;


create or replace function public.management_apply_room_departure_state(
  p_schedule_revision_id uuid,
  p_room_id uuid,
  p_target jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_scope jsonb := coalesce(p_target -> 'scope', '{}'::jsonb);
  v_item jsonb;
  v_current jsonb;
begin
  perform public.management_assert_resource_history_revision(
    p_schedule_revision_id
  );

  if not coalesce((p_target ->> 'exists')::boolean, false) then
    raise exception 'M36.1 room departure target must preserve room identity';
  end if;

  if not exists (
    select 1 from public.rooms room where room.id = p_room_id
  ) then
    raise exception 'M36.1 room departure target not found';
  end if;

  update public.rooms
  set
    operational_status = p_target ->> 'operationalStatus',
    archived_at = nullif(p_target ->> 'archivedAt', '')::timestamptz
  where id = p_room_id;

  for v_item in
    select value
    from jsonb_array_elements(
      coalesce(p_target -> 'requirementLinks', '[]'::jsonb)
    )
  loop
    if coalesce((v_item ->> 'linked')::boolean, false) then
      insert into public.course_requirement_rooms (
        requirement_id,
        room_id
      )
      values (
        (v_item ->> 'requirementId')::uuid,
        p_room_id
      )
      on conflict (requirement_id, room_id) do nothing;
    else
      delete from public.course_requirement_rooms assignment
      where assignment.requirement_id =
          (v_item ->> 'requirementId')::uuid
        and assignment.room_id = p_room_id;
    end if;

    update public.course_requirements requirement
    set
      resource_mode = v_item ->> 'resourceMode',
      required_capability = nullif(v_item ->> 'requiredCapability', '')
    where requirement.id = (v_item ->> 'requirementId')::uuid;
  end loop;

  for v_item in
    select value
    from jsonb_array_elements(
      coalesce(p_target -> 'placementLinks', '[]'::jsonb)
    )
  loop
    update public.placements placement
    set
      room_id = nullif(v_item ->> 'roomId', '')::uuid,
      updated_at = clock_timestamp()
    where placement.card_id = (v_item ->> 'cardId')::uuid;

    if not found then
      raise exception 'M36.1 expected placement is missing for card %',
        v_item ->> 'cardId';
    end if;
  end loop;

  -- Deliberately no synchronous candidate-domain rebuild here.
  -- Live resource state / current requirement pool is authoritative and the
  -- M36 operational-gap/publication gates read placements directly.

  v_current := public.management_room_departure_state(
    p_schedule_revision_id,
    p_room_id,
    v_scope
  );

  if v_current is distinct from p_target then
    raise exception
      'M36.1 room departure history replay did not reach exact target state';
  end if;
end
$$;


create or replace function public.management_preview_room_departure(
  p_schedule_revision_id uuid,
  p_room_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_revision_status text;
  v_scope jsonb;
  v_state jsonb;
  v_assignment_count integer;
  v_active_requirement_count integer;
  v_placement_count integer;
  v_alias_count integer;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M36.1 management EDITOR role required'
      using errcode = '42501';
  end if;

  select revision.status
  into v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M36.1 room departure preview requires DRAFT revision';
  end if;

  if not exists (
    select 1
    from public.rooms room
    where room.id = p_room_id
      and room.canonical_room_id is null
      and room.archived_at is null
  ) then
    raise exception 'M36.1 active canonical room resource not found';
  end if;

  v_scope := public.management_room_departure_scope(
    p_schedule_revision_id,
    p_room_id
  );

  v_state := public.management_room_departure_state(
    p_schedule_revision_id,
    p_room_id,
    v_scope
  );

  v_assignment_count := jsonb_array_length(
    coalesce(v_scope -> 'requirementIds', '[]'::jsonb)
  );
  v_placement_count := jsonb_array_length(
    coalesce(v_scope -> 'placementCardIds', '[]'::jsonb)
  );

  select count(*)
  into v_active_requirement_count
  from jsonb_array_elements_text(
    coalesce(v_scope -> 'requirementIds', '[]'::jsonb)
  ) item(value)
  join public.course_requirements requirement
    on requirement.id = item.value::uuid
  where requirement.term_status = 'ACTIVE';

  select count(*)
  into v_alias_count
  from public.rooms alias
  where alias.canonical_room_id = p_room_id
    and alias.archived_at is null;

  return jsonb_build_object(
    'roomId', p_room_id,
    'roomName', v_state ->> 'displayName',
    'operationalStatus', v_state ->> 'operationalStatus',
    'assignmentCount', v_assignment_count,
    'activeRequirementCount', v_active_requirement_count,
    'placedBlockCount', v_placement_count,
    'aliasCount', v_alias_count,
    'stateToken', md5(v_state::text),
    'publishedChanged', false
  );
end
$$;


create or replace function public.management_apply_room_departure(
  p_schedule_revision_id uuid,
  p_room_id uuid,
  p_mode text,
  p_expected_state_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_scope jsonb;
  v_before jsonb;
  v_after jsonb;
  v_requirement_links jsonb;
  v_placement_links jsonb;
  v_archived_at timestamptz;
  v_history_id uuid;
  v_assignment_count integer;
  v_placement_count integer;
  v_alias_count integer;
begin
  if p_mode not in (
    'OUT_OF_SERVICE_KEEP',
    'OUT_OF_SERVICE_CLEAR',
    'ARCHIVE_CLEAR'
  ) then
    raise exception 'M36.1 unsupported room departure mode: %', p_mode;
  end if;

  perform public.management_assert_resource_history_revision(
    p_schedule_revision_id
  );

  perform 1
  from public.rooms room
  where room.id = p_room_id
    and room.canonical_room_id is null
    and room.archived_at is null
  for update;

  if not found then
    raise exception 'M36.1 active canonical room resource not found';
  end if;

  v_scope := public.management_room_departure_scope(
    p_schedule_revision_id,
    p_room_id
  );

  v_before := public.management_room_departure_state(
    p_schedule_revision_id,
    p_room_id,
    v_scope
  );

  if md5(v_before::text) is distinct from p_expected_state_token then
    raise exception 'M36.1 room departure preview is stale';
  end if;

  select count(*)
  into v_alias_count
  from public.rooms alias
  where alias.canonical_room_id = p_room_id
    and alias.archived_at is null;

  if p_mode = 'ARCHIVE_CLEAR' and v_alias_count > 0 then
    raise exception
      'M36.1 canonical room with aliases cannot be archived directly';
  end if;

  v_after := jsonb_set(
    v_before,
    '{operationalStatus}',
    to_jsonb('OUT_OF_SERVICE'::text),
    true
  );

  if p_mode in ('OUT_OF_SERVICE_CLEAR', 'ARCHIVE_CLEAR') then
    select coalesce(
      jsonb_agg(
        item.value || jsonb_build_object(
          'linked', false,
          'resourceMode',
          case (
            select count(*)
            from public.course_requirement_rooms assignment
            where assignment.requirement_id =
                (item.value ->> 'requirementId')::uuid
              and assignment.room_id <> p_room_id
          )
            when 0 then item.value ->> 'resourceMode'
            when 1 then 'FIXED'
            else 'ELIGIBLE_POOL'
          end,
          'requiredCapability',
          case (
            select count(*)
            from public.course_requirement_rooms assignment
            where assignment.requirement_id =
                (item.value ->> 'requirementId')::uuid
              and assignment.room_id <> p_room_id
          )
            when 0 then item.value ->> 'requiredCapability'
            else null
          end
        )
        order by item.ordinality
      ),
      '[]'::jsonb
    )
    into v_requirement_links
    from jsonb_array_elements(
      coalesce(v_before -> 'requirementLinks', '[]'::jsonb)
    ) with ordinality as item(value, ordinality);

    select coalesce(
      jsonb_agg(
        item.value || jsonb_build_object('roomId', null)
        order by item.ordinality
      ),
      '[]'::jsonb
    )
    into v_placement_links
    from jsonb_array_elements(
      coalesce(v_before -> 'placementLinks', '[]'::jsonb)
    ) with ordinality as item(value, ordinality);

    v_after := jsonb_set(
      v_after,
      '{requirementLinks}',
      v_requirement_links,
      true
    );
    v_after := jsonb_set(
      v_after,
      '{placementLinks}',
      v_placement_links,
      true
    );
  end if;

  if p_mode = 'ARCHIVE_CLEAR' then
    v_archived_at := clock_timestamp();
    v_after := jsonb_set(
      v_after,
      '{archivedAt}',
      to_jsonb(v_archived_at),
      true
    );
  else
    v_after := jsonb_set(
      v_after,
      '{archivedAt}',
      'null'::jsonb,
      true
    );
  end if;

  if v_before is not distinct from v_after then
    raise exception 'M36.1 room departure refuses no-op';
  end if;

  perform public.management_apply_room_departure_state(
    p_schedule_revision_id,
    p_room_id,
    v_after
  );

  v_history_id := public.management_record_resource_history(
    p_schedule_revision_id,
    'ROOM_DEPARTURE',
    'ROOM',
    p_room_id,
    v_before,
    v_after
  );

  v_assignment_count := jsonb_array_length(
    coalesce(v_scope -> 'requirementIds', '[]'::jsonb)
  );
  v_placement_count := jsonb_array_length(
    coalesce(v_scope -> 'placementCardIds', '[]'::jsonb)
  );

  -- v_alias_count was locked/validated before mutation.

  return jsonb_build_object(
    'applied', true,
    'roomId', p_room_id,
    'roomName', v_before ->> 'displayName',
    'mode', p_mode,
    'assignmentCount', v_assignment_count,
    'placedBlockCount', v_placement_count,
    'aliasCount', v_alias_count,
    'candidateRebuildCardCount', 0,
    'historyTransactionId', v_history_id,
    'archived', p_mode = 'ARCHIVE_CLEAR',
    'publishedChanged', false
  );
end
$$;


create or replace function public.management_record_resource_history(
  p_schedule_revision_id uuid,
  p_operation text,
  p_resource_type text,
  p_resource_id uuid,
  p_before jsonb,
  p_after jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_transaction_id uuid;
  v_resource_name text;
begin
  if p_operation not in (
    'TEACHER_NAME',
    'ROOM_NAME',
    'TEACHER_STATUS',
    'ROOM_PROFILE',
    'ROOM_STATUS',
    'TEACHER_CREATE',
    'ROOM_CREATE',
    'TEACHER_DELETE',
    'ROOM_DELETE',
    'TEACHER_DEPARTURE',
    'ROOM_DEPARTURE'
  ) then
    raise exception 'M34 unsupported resource operation: %',
      p_operation;
  end if;

  if p_resource_type not in ('TEACHER', 'ROOM') then
    raise exception 'M34 unsupported resource type: %',
      p_resource_type;
  end if;

  if p_before is not distinct from p_after then
    raise exception 'M34 resource history refuses no-op';
  end if;

  v_resource_name := coalesce(
    p_after ->> 'displayName',
    p_before ->> 'displayName',
    p_after ->> 'name',
    p_before ->> 'name',
    case when p_resource_type = 'TEACHER' then 'Öğretmen' else 'Salon' end
  );

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
    null,
    null,
    'USER',
    'RESOURCE',
    jsonb_build_object(
      'source', 'MANUAL',
      'engine_version', 'M34.0-v1',
      'resource_operation', p_operation,
      'resource_type', p_resource_type,
      'resource_id', p_resource_id,
      'resource_name', v_resource_name,
      'before', p_before,
      'after', p_after
    )
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end
$$;

create or replace function public.management_history_resource_current_state(
  p_schedule_revision_id uuid,
  p_operation text,
  p_resource_type text,
  p_resource_id uuid,
  p_reference_state jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_operation = 'TEACHER_DEPARTURE' then
    if p_resource_type <> 'TEACHER' then
      raise exception 'M35 teacher departure type mismatch';
    end if;

    return public.management_teacher_departure_state(
      p_schedule_revision_id,
      p_resource_id,
      p_reference_state -> 'scope'
    );
  end if;

  if p_operation = 'ROOM_DEPARTURE' then
    if p_resource_type <> 'ROOM' then
      raise exception 'M36.1 room departure type mismatch';
    end if;

    return public.management_room_departure_state(
      p_schedule_revision_id,
      p_resource_id,
      p_reference_state -> 'scope'
    );
  end if;

  return public.management_resource_history_state(
    p_schedule_revision_id,
    p_resource_type,
    p_resource_id
  );
end
$$;

create or replace function public.management_history_resource_apply_state(
  p_schedule_revision_id uuid,
  p_operation text,
  p_resource_type text,
  p_resource_id uuid,
  p_target jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_operation = 'TEACHER_DEPARTURE' then
    if p_resource_type <> 'TEACHER' then
      raise exception 'M35 teacher departure type mismatch';
    end if;

    perform public.management_apply_teacher_departure_state(
      p_schedule_revision_id,
      p_resource_id,
      p_target
    );
    return;
  end if;

  if p_operation = 'ROOM_DEPARTURE' then
    if p_resource_type <> 'ROOM' then
      raise exception 'M36.1 room departure type mismatch';
    end if;

    perform public.management_apply_room_departure_state(
      p_schedule_revision_id,
      p_resource_id,
      p_target
    );
    return;
  end if;

  perform public.management_apply_resource_history_state(
    p_schedule_revision_id,
    p_operation,
    p_resource_type,
    p_resource_id,
    p_target
  );
end
$$;

revoke all on function public.management_room_departure_scope(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.management_room_departure_state(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.management_apply_room_departure_state(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.management_history_resource_current_state(uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.management_history_resource_apply_state(uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;

revoke all on function public.management_preview_room_departure(uuid, uuid)
  from public, anon;
revoke all on function public.management_apply_room_departure(uuid, uuid, text, text)
  from public, anon;

grant execute on function public.management_preview_room_departure(uuid, uuid)
  to authenticated;
grant execute on function public.management_apply_room_departure(uuid, uuid, text, text)
  to authenticated;

comment on function public.management_preview_placement_resource_change_v2(uuid[], text, uuid) is
  'M36.1 corrected M32.4.2 manual override preview. Fixes effective-card id aggregation while retaining manual teacher policy semantics.';

comment on function public.management_preview_room_departure(uuid, uuid) is
  'M36.1 preview for retiring/archiving a canonical room while preserving lesson slots.';

comment on function public.management_apply_room_departure(uuid, uuid, text, text) is
  'M36.1 atomic room departure. Can keep existing room placements, clear room links while preserving day/time/teacher, or archive the canonical room. One global RESOURCE history root.';

commit;
