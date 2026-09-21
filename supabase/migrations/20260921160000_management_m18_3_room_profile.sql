-- Management / M18.3
-- Controlled canonical-room capability / knowledge profile editing.
--
-- Room capabilities and knowledge status drive CAPABILITY-mode candidate
-- generation. Changes are therefore previewed against the active DRAFT and
-- blocked when they would invalidate an already placed CAPABILITY card.
--
-- FIXED / ELIGIBLE_POOL requirements are intentionally unaffected.
-- Published schedule_sessions + session_groups are never mutated.

begin;

-- -------------------------------------------------------------------------
-- INTERNAL STATE TOKEN
-- -------------------------------------------------------------------------

create or replace function public.management_room_profile_state_token(
  p_schedule_revision_id uuid,
  p_room_id uuid,
  p_capabilities text[],
  p_knowledge_status text
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_room record;
  v_new_capabilities text[];
  v_affected_capabilities text[];
  v_confirmation_changed boolean;
  v_requirements jsonb;
  v_cards jsonb;
  v_placements jsonb;
  v_teacher_assignments jsonb;
begin
  select
    room.id,
    room.canonical_room_id,
    array(
      select distinct btrim(capability)
      from unnest(coalesce(room.capabilities, array[]::text[])) capability
      where length(btrim(capability)) > 0
      order by btrim(capability)
    ) as capabilities,
    coalesce(room.knowledge_status, 'UNKNOWN') as knowledge_status
  into v_room
  from public.rooms room
  where room.id = p_room_id;

  if not found then
    return null;
  end if;

  select coalesce(
    array_agg(distinct btrim(value) order by btrim(value)),
    array[]::text[]
  )
  into v_new_capabilities
  from unnest(coalesce(p_capabilities, array[]::text[])) value
  where length(btrim(value)) > 0;

  v_confirmation_changed :=
    (v_room.knowledge_status = 'CONFIRMED')
      is distinct from
    (p_knowledge_status = 'CONFIRMED');

  select coalesce(
    array_agg(capability order by capability),
    array[]::text[]
  )
  into v_affected_capabilities
  from (
    select capability
    from (
      select unnest(v_room.capabilities) as capability
      union
      select unnest(v_new_capabilities) as capability
    ) all_capabilities
    where v_confirmation_changed
       or (
         (capability = any(v_room.capabilities))
           is distinct from
         (capability = any(v_new_capabilities))
       )
  ) affected;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', requirement.id,
        'resourceMode', requirement.resource_mode,
        'requiredCapability', requirement.required_capability,
        'teacherMode', requirement.teacher_mode,
        'instructionalGroupId', requirement.instructional_group_id
      )
      order by requirement.id
    ),
    '[]'::jsonb
  )
  into v_requirements
  from public.course_requirements requirement
  join public.schedule_revisions revision
    on revision.requirement_set_id = requirement.requirement_set_id
  where revision.id = p_schedule_revision_id
    and requirement.resource_mode = 'CAPABILITY'
    and requirement.required_capability = any(v_affected_capabilities);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', card.id,
        'requirementId', card.requirement_id,
        'blockIndex', card.block_index,
        'durationPeriods', card.duration_periods,
        'locked', card.locked
      )
      order by card.requirement_id, card.block_index, card.id
    ),
    '[]'::jsonb
  )
  into v_cards
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.schedule_revision_id = p_schedule_revision_id
    and requirement.resource_mode = 'CAPABILITY'
    and requirement.required_capability = any(v_affected_capabilities);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cardId', placement.card_id,
        'dayOfWeek', placement.day_of_week,
        'startPeriod', placement.start_period,
        'teacherId', placement.teacher_id,
        'roomId', placement.room_id,
        'moveTransactionId', placement.move_transaction_id
      )
      order by placement.card_id
    ),
    '[]'::jsonb
  )
  into v_placements
  from public.placements placement
  join public.schedule_cards card
    on card.id = placement.card_id
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.schedule_revision_id = p_schedule_revision_id
    and requirement.resource_mode = 'CAPABILITY'
    and requirement.required_capability = any(v_affected_capabilities);

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
  into v_teacher_assignments
  from public.course_requirement_teachers assignment
  join public.course_requirements requirement
    on requirement.id = assignment.requirement_id
  join public.schedule_revisions revision
    on revision.requirement_set_id = requirement.requirement_set_id
  where revision.id = p_schedule_revision_id
    and requirement.resource_mode = 'CAPABILITY'
    and requirement.required_capability = any(v_affected_capabilities);

  return md5(
    jsonb_build_object(
      'revisionId', p_schedule_revision_id,
      'roomId', v_room.id,
      'canonicalRoomId', v_room.canonical_room_id,
      'currentCapabilities', v_room.capabilities,
      'currentKnowledgeStatus', v_room.knowledge_status,
      'proposedCapabilities', v_new_capabilities,
      'proposedKnowledgeStatus', p_knowledge_status,
      'affectedCapabilities', v_affected_capabilities,
      'requirements', v_requirements,
      'cards', v_cards,
      'placements', v_placements,
      'teacherAssignments', v_teacher_assignments
    )::text
  );
end
$$;

revoke all
  on function public.management_room_profile_state_token(
    uuid,
    uuid,
    text[],
    text
  )
  from public, anon, authenticated;


-- -------------------------------------------------------------------------
-- PREVIEW
-- -------------------------------------------------------------------------

create or replace function public.management_preview_room_profile(
  p_schedule_revision_id uuid,
  p_room_id uuid,
  p_capabilities text[],
  p_knowledge_status text
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
  v_new_capabilities text[];
  v_added_capabilities text[];
  v_removed_capabilities text[];
  v_affected_capabilities text[];
  v_confirmation_changed boolean;
  v_has_changes boolean;
  v_affected_requirements jsonb;
  v_affected_requirement_count integer;
  v_affected_card_ids uuid[];
  v_affected_card_count integer;
  v_placed_impacts jsonb;
  v_placed_impact_count integer;
  v_block_reasons jsonb := '[]'::jsonb;
  v_token text;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M18.3 management EDITOR role required'
      using errcode = '42501';
  end if;

  select revision.status
  into v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id;

  if v_revision_status is null then
    raise exception 'M18.3 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M18.3 room profile preview requires DRAFT revision';
  end if;

  select
    room.id,
    room.name,
    room.canonical_room_id,
    array(
      select distinct btrim(capability)
      from unnest(coalesce(room.capabilities, array[]::text[])) capability
      where length(btrim(capability)) > 0
      order by btrim(capability)
    ) as capabilities,
    coalesce(room.knowledge_status, 'UNKNOWN') as knowledge_status
  into v_room
  from public.rooms room
  where room.id = p_room_id;

  if not found then
    raise exception 'M18.3 room not found: %', p_room_id;
  end if;

  if v_room.canonical_room_id is not null then
    raise exception
      'M18.3 room aliases are not editable resource profiles';
  end if;

  if p_knowledge_status is null
     or p_knowledge_status not in ('CONFIRMED', 'OBSERVED', 'UNKNOWN') then
    raise exception 'M18.3 invalid room knowledge status';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_capabilities, array[]::text[])) capability
    where length(btrim(capability)) = 0
       or length(btrim(capability)) > 80
  ) then
    raise exception 'M18.3 invalid room capability';
  end if;

  select coalesce(
    array_agg(distinct btrim(value) order by btrim(value)),
    array[]::text[]
  )
  into v_new_capabilities
  from unnest(coalesce(p_capabilities, array[]::text[])) value
  where length(btrim(value)) > 0;

  select coalesce(
    array_agg(capability order by capability),
    array[]::text[]
  )
  into v_added_capabilities
  from (
    select unnest(v_new_capabilities) capability
    except
    select unnest(v_room.capabilities)
  ) added;

  select coalesce(
    array_agg(capability order by capability),
    array[]::text[]
  )
  into v_removed_capabilities
  from (
    select unnest(v_room.capabilities) capability
    except
    select unnest(v_new_capabilities)
  ) removed;

  v_confirmation_changed :=
    (v_room.knowledge_status = 'CONFIRMED')
      is distinct from
    (p_knowledge_status = 'CONFIRMED');

  select coalesce(
    array_agg(capability order by capability),
    array[]::text[]
  )
  into v_affected_capabilities
  from (
    select capability
    from (
      select unnest(v_room.capabilities) capability
      union
      select unnest(v_new_capabilities) capability
    ) all_capabilities
    where v_confirmation_changed
       or capability = any(v_added_capabilities)
       or capability = any(v_removed_capabilities)
  ) affected;

  v_has_changes :=
    v_room.capabilities is distinct from v_new_capabilities
    or v_room.knowledge_status is distinct from p_knowledge_status;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'requirementId', requirement.id,
          'subjectName', subject.name,
          'groupName', instructional_group.name,
          'requiredCapability', requirement.required_capability,
          'cardCount', (
            select count(*)
            from public.schedule_cards card_count
            where card_count.schedule_revision_id = p_schedule_revision_id
              and card_count.requirement_id = requirement.id
          ),
          'placedInRoomCount', (
            select count(*)
            from public.schedule_cards placed_card
            join public.placements placement
              on placement.card_id = placed_card.id
            where placed_card.schedule_revision_id = p_schedule_revision_id
              and placed_card.requirement_id = requirement.id
              and placement.room_id = p_room_id
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
    and requirement.resource_mode = 'CAPABILITY'
    and requirement.required_capability = any(v_affected_capabilities);

  select
    coalesce(
      array_agg(card.id order by card.requirement_id, card.block_index),
      array[]::uuid[]
    ),
    count(*)
  into
    v_affected_card_ids,
    v_affected_card_count
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.schedule_revision_id = p_schedule_revision_id
    and requirement.resource_mode = 'CAPABILITY'
    and requirement.required_capability = any(v_affected_capabilities);

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cardId', card.id,
          'requirementId', requirement.id,
          'subjectName', subject.name,
          'groupName', instructional_group.name,
          'requiredCapability', requirement.required_capability,
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
    and placement.room_id = p_room_id
    and requirement.resource_mode = 'CAPABILITY'
    and (
      requirement.required_capability <> all(v_new_capabilities)
      or p_knowledge_status <> 'CONFIRMED'
    );

  if not v_has_changes then
    v_block_reasons := v_block_reasons || jsonb_build_array('NO_CHANGES');
  end if;

  if v_placed_impact_count > 0 then
    v_block_reasons :=
      v_block_reasons
      || jsonb_build_array('PLACED_CAPABILITY_INVALIDATION');
  end if;

  v_token := public.management_room_profile_state_token(
    p_schedule_revision_id,
    p_room_id,
    v_new_capabilities,
    p_knowledge_status
  );

  return jsonb_build_object(
    'roomId', p_room_id,
    'revisionId', p_schedule_revision_id,
    'roomName', v_room.name,
    'hasChanges', v_has_changes,
    'canApply', v_has_changes and v_placed_impact_count = 0,
    'blockReasons', v_block_reasons,
    'current', jsonb_build_object(
      'capabilities', v_room.capabilities,
      'knowledgeStatus', v_room.knowledge_status
    ),
    'proposed', jsonb_build_object(
      'capabilities', v_new_capabilities,
      'knowledgeStatus', p_knowledge_status
    ),
    'addedCapabilities', to_jsonb(v_added_capabilities),
    'removedCapabilities', to_jsonb(v_removed_capabilities),
    'confirmationChanged', v_confirmation_changed,
    'affectedCapabilities', to_jsonb(v_affected_capabilities),
    'affectedRequirements', v_affected_requirements,
    'affectedRequirementCount', v_affected_requirement_count,
    'affectedCardIds', to_jsonb(v_affected_card_ids),
    'candidateRebuildCardCount', v_affected_card_count,
    'placedImpacts', v_placed_impacts,
    'placedImpactCount', v_placed_impact_count,
    'stateToken', v_token
  );
end
$$;

revoke all
  on function public.management_preview_room_profile(
    uuid,
    uuid,
    text[],
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.management_preview_room_profile(
    uuid,
    uuid,
    text[],
    text
  )
  to authenticated;


-- -------------------------------------------------------------------------
-- CONTROLLED APPLY
-- -------------------------------------------------------------------------

create or replace function public.management_apply_room_profile(
  p_schedule_revision_id uuid,
  p_room_id uuid,
  p_capabilities text[],
  p_knowledge_status text,
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
  v_affected_requirement_ids uuid[];
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'M18.3 management EDITOR role required'
      using errcode = '42501';
  end if;

  if p_expected_state_token is null
     or length(btrim(p_expected_state_token)) = 0 then
    raise exception 'M18.3 apply requires preview state token';
  end if;

  select revision.status
  into v_revision_status
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id
  for update;

  if v_revision_status is null then
    raise exception 'M18.3 schedule revision not found: %',
      p_schedule_revision_id;
  end if;

  if v_revision_status <> 'DRAFT' then
    raise exception 'M18.3 room profile apply requires DRAFT revision';
  end if;

  select
    room.id,
    room.canonical_room_id
  into v_room
  from public.rooms room
  where room.id = p_room_id
  for update;

  if v_room.id is null then
    raise exception 'M18.3 room not found: %', p_room_id;
  end if;

  if v_room.canonical_room_id is not null then
    raise exception
      'M18.3 room aliases are not editable resource profiles';
  end if;

  v_current_token := public.management_room_profile_state_token(
    p_schedule_revision_id,
    p_room_id,
    p_capabilities,
    p_knowledge_status
  );

  if v_current_token is distinct from p_expected_state_token then
    raise exception
      'M18.3 room profile preview is stale; the draft changed after preview';
  end if;

  v_preview := public.management_preview_room_profile(
    p_schedule_revision_id,
    p_room_id,
    p_capabilities,
    p_knowledge_status
  );

  if not coalesce((v_preview ->> 'hasChanges')::boolean, false) then
    raise exception 'M18.3 room profile apply is a no-op';
  end if;

  if not coalesce((v_preview ->> 'canApply')::boolean, false) then
    raise exception
      'M18.3 room profile apply blocked: %',
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

  select coalesce(
    array_agg(distinct requirement.id order by requirement.id),
    array[]::uuid[]
  )
  into v_affected_requirement_ids
  from public.schedule_cards card
  join public.course_requirements requirement
    on requirement.id = card.requirement_id
  where card.schedule_revision_id = p_schedule_revision_id
    and card.id = any(v_card_ids);

  if cardinality(v_affected_requirement_ids) > 0 then
    perform 1
    from public.course_requirements requirement
    where requirement.id = any(v_affected_requirement_ids)
    for update;
  end if;

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

  -- Recheck after all relevant locks.
  v_current_token := public.management_room_profile_state_token(
    p_schedule_revision_id,
    p_room_id,
    p_capabilities,
    p_knowledge_status
  );

  if v_current_token is distinct from p_expected_state_token then
    raise exception
      'M18.3 room profile preview is stale; affected data changed while applying';
  end if;

  update public.rooms room
  set
    capabilities = array(
      select distinct btrim(value)
      from unnest(coalesce(p_capabilities, array[]::text[])) value
      where length(btrim(value)) > 0
      order by btrim(value)
    ),
    knowledge_status = p_knowledge_status
  where room.id = p_room_id;

  perform public.refresh_management_candidate_domain_subset(
    p_schedule_revision_id,
    v_card_ids
  );

  return jsonb_build_object(
    'applied', true,
    'roomId', p_room_id,
    'revisionId', p_schedule_revision_id,
    'candidateRebuildCardCount', cardinality(v_card_ids),
    'affectedRequirementCount',
      coalesce((v_preview ->> 'affectedRequirementCount')::integer, 0),
    'publishedChanged', false
  );
end
$$;

revoke all
  on function public.management_apply_room_profile(
    uuid,
    uuid,
    text[],
    text,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.management_apply_room_profile(
    uuid,
    uuid,
    text[],
    text,
    text
  )
  to authenticated;

comment on function public.management_preview_room_profile(uuid, uuid, text[], text) is
  'M18.3 read-only impact preview for canonical room capabilities / knowledge status. Blocks profiles that would invalidate an already placed CAPABILITY card.';

comment on function public.management_apply_room_profile(uuid, uuid, text[], text, text) is
  'M18.3 EDITOR controlled canonical-room profile apply. Requires exact preview token, blocks placed CAPABILITY invalidation, and refreshes only affected CAPABILITY cards. Published projection is untouched.';

commit;
