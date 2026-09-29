-- Management M32.4.2
-- Manual teacher override semantics.
--
-- Correction to M32.4.1:
-- course_requirement_teachers is the planning/assignment pool used by the
-- automatic candidate engine. It is NOT a global qualification whitelist.
--
-- Manual placement override rules:
--   * any ACTIVE teacher may be selected explicitly by an editor;
--   * BLOCK scope changes only the requested placed block(s);
--   * REQUIREMENT + REQUIRED automatically expands the change to every placed
--     block of the affected requirement so continuity is preserved;
--   * the planning teacher pool is NEVER silently changed by placement override;
--   * if a REQUIREMENT+REQUIRED course still has unplaced blocks and the chosen
--     teacher is outside its planning pool, the manual override is blocked
--     until the Course Plan pool is updated explicitly.
--
-- Rooms keep M29 behavior.
-- Preview-only function performs no writes.

begin;


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
      array_agg(card_id order by card_id),
      array[]::uuid[]
    )
    into v_effective_card_ids
    from effective_cards;

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


create or replace function public.management_apply_placement_resource_change_v2(
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
  v_base_preview jsonb;
  v_result jsonb;
  v_effective_card_ids uuid[];
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M32.4.2 management EDITOR role required'
      using errcode = '42501';
  end if;

  perform 1
  from public.course_requirements requirement
  where requirement.id in (
    select distinct card.requirement_id
    from public.schedule_cards card
    where card.id = any(p_card_ids)
  )
  order by requirement.id
  for update;

  v_preview :=
    public.management_preview_placement_resource_change_v2(
      p_card_ids,
      p_resource_type,
      p_resource_id
    );

  if p_expected_state_token is null
     or p_expected_state_token is distinct from (v_preview ->> 'stateToken') then
    raise exception 'M32.4.2 placement resource preview is stale';
  end if;

  if coalesce((v_preview ->> 'canApply')::boolean, false) is not true then
    if (
      v_preview -> 'blockReasons'
      @> '["OUTSIDE_PLANNING_POOL_WITH_UNPLACED_BLOCKS"]'::jsonb
    ) then
      raise exception
        'M32.4.2 outside planning pool teacher requires course plan update for unplaced blocks';
    end if;

    raise exception 'M32.4.2 placement resource change is blocked';
  end if;

  select coalesce(
    array_agg(value::uuid order by value::uuid),
    array[]::uuid[]
  )
  into v_effective_card_ids
  from jsonb_array_elements_text(v_preview -> 'cardIds') entry(value);

  v_base_preview := public.management_preview_placement_resource_change(
    v_effective_card_ids,
    p_resource_type,
    p_resource_id
  );

  v_result := public.management_apply_placement_resource_change(
    v_effective_card_ids,
    p_resource_type,
    p_resource_id,
    v_base_preview ->> 'stateToken'
  );

  return v_result || jsonb_build_object(
    'poolExpansionCount', 0,
    'outsidePlanningPoolCount',
      coalesce((v_preview ->> 'outsidePlanningPoolCount')::integer, 0),
    'requirementWideExpansionCount',
      coalesce((v_preview ->> 'requirementWideExpansionCount')::integer, 0),
    'planningPoolChanged', false,
    'policyEngineVersion', 'M32.4.2-v1',
    'policyImpacts', v_preview -> 'policyImpacts'
  );
end
$$;


revoke all
  on function public.management_preview_placement_resource_change_v2(
    uuid[], text, uuid
  )
  from public, anon;
revoke all
  on function public.management_apply_placement_resource_change_v2(
    uuid[], text, uuid, text
  )
  from public, anon;

grant execute
  on function public.management_preview_placement_resource_change_v2(
    uuid[], text, uuid
  )
  to authenticated;
grant execute
  on function public.management_apply_placement_resource_change_v2(
    uuid[], text, uuid, text
  )
  to authenticated;

comment on function public.management_preview_placement_resource_change_v2(
  uuid[], text, uuid
) is
  'M32.4.2 manual override preview. Any ACTIVE teacher may be chosen explicitly. BLOCK scope stays block-local; REQUIREMENT+REQUIRED expands to all placed blocks. Planning pool is not silently changed.';
comment on function public.management_apply_placement_resource_change_v2(
  uuid[], text, uuid, text
) is
  'M32.4.2 stale-safe manual override. Applies M29 history-safe mutation to the policy-expanded placed-card set without changing planning pools.';

commit;
