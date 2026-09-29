-- Management M32.4
-- Runtime teacher-policy enforcement for placement resource overrides.
--
-- Adds policy-aware v2 wrappers around M29 placement resource changes.
-- Existing M29 functions remain unchanged for compatibility/history.
--
-- REQUIREMENT + REQUIRED:
--   a teacher change is allowed only if the FINAL placed blocks of every
--   affected requirement still resolve to at most one teacher.
--
-- BLOCK + NONE/PREFERRED:
--   per-block teacher override remains allowed.
--
-- Rooms are unchanged from M29 behavior.
--
-- No placement mutation during preview.

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
  v_base jsonb;
  v_base_reasons text[] := array[]::text[];
  v_policy_reasons text[] := array[]::text[];
  v_all_reasons text[] := array[]::text[];
  v_policy_impacts jsonb := '[]'::jsonb;
  v_policy_snapshot jsonb := '[]'::jsonb;
  v_state_token text;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M32.4 management EDITOR role required'
      using errcode = '42501';
  end if;

  v_base := public.management_preview_placement_resource_change(
    p_card_ids,
    p_resource_type,
    p_resource_id
  );

  if jsonb_typeof(v_base -> 'blockReasons') = 'array' then
    select coalesce(array_agg(value), array[]::text[])
    into v_base_reasons
    from jsonb_array_elements_text(v_base -> 'blockReasons') reason(value);
  end if;

  if p_resource_type = 'TEACHER' then
    with affected_requirements as (
      select distinct
        requirement.id as requirement_id,
        requirement.teacher_requirement,
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
      where card.id = any(p_card_ids)
    ),
    policy_state as (
      select
        affected.requirement_id,
        affected.teacher_requirement,
        affected.teacher_assignment_scope,
        affected.teacher_continuity,
        affected.subject_name,
        affected.group_name,
        count(placement.id)::integer as placed_block_count,
        count(placement.id) filter (
          where card.id = any(p_card_ids)
        )::integer as targeted_block_count,
        count(distinct placement.teacher_id) filter (
          where placement.teacher_id is not null
        )::integer as current_distinct_teacher_count,
        count(distinct (
          case
            when card.id = any(p_card_ids) then p_resource_id
            else placement.teacher_id
          end
        )) filter (
          where (
            case
              when card.id = any(p_card_ids) then p_resource_id
              else placement.teacher_id
            end
          ) is not null
        )::integer as final_distinct_teacher_count
      from affected_requirements affected
      join public.schedule_cards card
        on card.requirement_id = affected.requirement_id
      left join public.placements placement
        on placement.card_id = card.id
      group by
        affected.requirement_id,
        affected.teacher_requirement,
        affected.teacher_assignment_scope,
        affected.teacher_continuity,
        affected.subject_name,
        affected.group_name
    )
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'requirementId', state.requirement_id,
            'subjectName', state.subject_name,
            'groupName', state.group_name,
            'teacherRequirement', state.teacher_requirement,
            'teacherAssignmentScope', state.teacher_assignment_scope,
            'teacherContinuity', state.teacher_continuity,
            'placedBlockCount', state.placed_block_count,
            'targetedBlockCount', state.targeted_block_count,
            'currentDistinctTeacherCount',
              state.current_distinct_teacher_count,
            'finalDistinctTeacherCount',
              state.final_distinct_teacher_count,
            'blocked', (
              state.teacher_assignment_scope = 'REQUIREMENT'
              and state.teacher_continuity = 'REQUIRED'
              and state.final_distinct_teacher_count > 1
            )
          )
          order by state.requirement_id
        ),
        '[]'::jsonb
      ),
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'requirementId', state.requirement_id,
            'teacherRequirement', state.teacher_requirement,
            'teacherAssignmentScope', state.teacher_assignment_scope,
            'teacherContinuity', state.teacher_continuity,
            'finalDistinctTeacherCount',
              state.final_distinct_teacher_count
          )
          order by state.requirement_id
        ),
        '[]'::jsonb
      )
    into
      v_policy_impacts,
      v_policy_snapshot
    from policy_state state;

    if exists (
      select 1
      from jsonb_array_elements(v_policy_impacts) impact(value)
      where coalesce((impact.value ->> 'blocked')::boolean, false)
    ) then
      v_policy_reasons := array_append(
        v_policy_reasons,
        'REQUIREMENT_TEACHER_MISMATCH'
      );
    end if;
  end if;

  select coalesce(
    array_agg(distinct reason order by reason),
    array[]::text[]
  )
  into v_all_reasons
  from unnest(v_base_reasons || v_policy_reasons) reason;

  v_state_token := md5(
    jsonb_build_object(
      'baseStateToken', v_base ->> 'stateToken',
      'resourceType', p_resource_type,
      'resourceId', p_resource_id,
      'policySnapshot', v_policy_snapshot
    )::text
  );

  return v_base || jsonb_build_object(
    'canApply', (
      coalesce((v_base ->> 'canApply')::boolean, false)
      and cardinality(v_policy_reasons) = 0
    ),
    'blockReasons', to_jsonb(v_all_reasons),
    'policyImpacts', v_policy_impacts,
    'requiresRequirementWideTeacherChange', (
      p_resource_type = 'TEACHER'
      and 'REQUIREMENT_TEACHER_MISMATCH' = any(v_policy_reasons)
    ),
    'stateToken', v_state_token,
    'policyEngineVersion', 'M32.4-v1'
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
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M32.4 management EDITOR role required'
      using errcode = '42501';
  end if;

  -- Serialize assignment-policy changes for all affected requirements.
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
    raise exception 'M32.4 placement resource preview is stale';
  end if;

  if coalesce((v_preview ->> 'canApply')::boolean, false) is not true then
    if coalesce(
      (v_preview ->> 'requiresRequirementWideTeacherChange')::boolean,
      false
    ) then
      raise exception
        'M32.4 requirement teacher continuity requires requirement-wide change';
    end if;

    raise exception 'M32.4 placement resource change is blocked';
  end if;

  -- M29 still owns the actual history-safe placement override. Supply its
  -- original token after the M32.4 policy gate has passed.
  v_base_preview := public.management_preview_placement_resource_change(
    p_card_ids,
    p_resource_type,
    p_resource_id
  );

  v_result := public.management_apply_placement_resource_change(
    p_card_ids,
    p_resource_type,
    p_resource_id,
    v_base_preview ->> 'stateToken'
  );

  return v_result || jsonb_build_object(
    'policyEngineVersion', 'M32.4-v1',
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
  'M32.4 policy-aware M29 preview. REQUIREMENT+REQUIRED teacher changes are blocked if the final placed blocks would use more than one teacher; BLOCK policies remain per-placement.';
comment on function public.management_apply_placement_resource_change_v2(
  uuid[], text, uuid, text
) is
  'M32.4 stale-safe policy gate around M29 placement resource override. Actual history-safe mutation remains owned by M29.';

commit;
