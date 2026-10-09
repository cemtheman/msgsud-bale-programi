begin;

CREATE OR REPLACE FUNCTION public.management_commit_workspace_v2(p_schedule_revision_id uuid, p_requirement_set_id uuid, p_expected_revision_version integer, p_expected_snapshot_hash text, p_expected_baseline_hash text, p_changes jsonb, p_requirement_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_revision record;
  v_current_snapshot jsonb;
  v_intermediate_snapshot jsonb;
  v_final_snapshot jsonb;
  v_placement_result jsonb;

  v_requirement_change jsonb;
  v_requirement_id uuid;
  v_before jsonb;
  v_after jsonb;

  v_current_teacher_ids jsonb;
  v_current_room_ids jsonb;
  v_current_teacher_mode text;
  v_current_teacher_assignment_scope text;
  v_current_teacher_continuity text;
  v_current_resource_mode text;
  v_current_capability text;

  v_after_teacher_ids_json jsonb;
  v_after_room_ids_json jsonb;
  v_teacher_ids uuid[];
  v_room_ids uuid[];
  v_after_teacher_mode text;
  v_after_teacher_assignment_scope text;
  v_after_teacher_continuity text;
  v_after_resource_mode text;
  v_after_capability text;
  v_expected_teacher_mode text;
  v_expected_resource_mode text;
  v_room_strategy text;

  v_requirement_count integer;
  v_distinct_requirement_count integer;
  v_placed_count integer;
  v_teacher_changed boolean;
  v_room_changed boolean;
  v_policy_changed boolean;
  v_policy_preview jsonb;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'WORKSPACE_V2_EDITOR_REQUIRED'
      using errcode = '42501';
  end if;

  p_changes := coalesce(p_changes, '[]'::jsonb);
  p_requirement_changes := coalesce(p_requirement_changes, '[]'::jsonb);

  if jsonb_typeof(p_changes) is distinct from 'array'
     or jsonb_typeof(p_requirement_changes) is distinct from 'array' then
    raise exception 'WORKSPACE_V2_INVALID_CHANGE_ARRAY';
  end if;

  v_requirement_count := jsonb_array_length(p_requirement_changes);

  if v_requirement_count > 100 then
    raise exception 'WORKSPACE_V2_REQUIREMENT_CHANGE_TOO_LARGE';
  end if;

  select
    revision.id,
    revision.requirement_set_id,
    revision.version_number,
    revision.status
  into v_revision
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id
  for update;

  if not found then
    raise exception 'WORKSPACE_V1_REVISION_NOT_FOUND';
  end if;

  if v_revision.status <> 'DRAFT' then
    raise exception 'WORKSPACE_V1_REVISION_NOT_DRAFT';
  end if;

  if v_revision.requirement_set_id <> p_requirement_set_id then
    raise exception 'WORKSPACE_V1_REQUIREMENT_SET_STALE';
  end if;

  if v_revision.version_number <> p_expected_revision_version then
    raise exception 'WORKSPACE_V1_REVISION_VERSION_STALE';
  end if;

  v_current_snapshot :=
    public.management_preview_solver_snapshot(
      p_schedule_revision_id,
      null
    );

  if (v_current_snapshot ->> 'snapshotHash')
      is distinct from p_expected_snapshot_hash then
    raise exception 'WORKSPACE_V1_SNAPSHOT_STALE';
  end if;

  if (v_current_snapshot ->> 'baselineHash')
      is distinct from p_expected_baseline_hash then
    raise exception 'WORKSPACE_V1_BASELINE_STALE';
  end if;

  select count(distinct entry.value ->> 'requirement_id')::integer
  into v_distinct_requirement_count
  from jsonb_array_elements(p_requirement_changes) entry(value);

  if v_distinct_requirement_count <> v_requirement_count then
    raise exception 'WORKSPACE_V2_DUPLICATE_REQUIREMENT';
  end if;

  for v_requirement_change in
    select entry.value
    from jsonb_array_elements(p_requirement_changes) entry(value)
    order by entry.value ->> 'requirement_id'
  loop
    begin
      v_requirement_id :=
        nullif(v_requirement_change ->> 'requirement_id', '')::uuid;
    exception when others then
      raise exception 'WORKSPACE_V2_INVALID_REQUIREMENT_ID';
    end;

    v_before := v_requirement_change -> 'before';
    v_after := v_requirement_change -> 'after';

    if v_requirement_id is null
       or jsonb_typeof(v_before) is distinct from 'object'
       or jsonb_typeof(v_after) is distinct from 'object'
       or jsonb_typeof(v_before -> 'teacher_ids') is distinct from 'array'
       or jsonb_typeof(v_before -> 'room_ids') is distinct from 'array'
       or jsonb_typeof(v_after -> 'teacher_ids') is distinct from 'array'
       or jsonb_typeof(v_after -> 'room_ids') is distinct from 'array' then
      raise exception 'WORKSPACE_V2_INVALID_REQUIREMENT_CHANGE_SHAPE';
    end if;

    select
      requirement.teacher_mode,
      requirement.teacher_assignment_scope,
      requirement.teacher_continuity,
      requirement.resource_mode,
      requirement.required_capability
    into
      v_current_teacher_mode,
      v_current_teacher_assignment_scope,
      v_current_teacher_continuity,
      v_current_resource_mode,
      v_current_capability
    from public.course_requirements requirement
    where requirement.id = v_requirement_id
      and requirement.requirement_set_id = p_requirement_set_id
    for update;

    if not found then
      raise exception
        'WORKSPACE_V2_REQUIREMENT_NOT_IN_SET: %',
        v_requirement_id;
    end if;

    select coalesce(
      jsonb_agg(
        assignment.teacher_id::text
        order by assignment.teacher_id::text
      ),
      '[]'::jsonb
    )
    into v_current_teacher_ids
    from public.course_requirement_teachers assignment
    where assignment.requirement_id = v_requirement_id;

    select coalesce(
      jsonb_agg(
        assignment.room_id::text
        order by assignment.room_id::text
      ),
      '[]'::jsonb
    )
    into v_current_room_ids
    from public.course_requirement_rooms assignment
    where assignment.requirement_id = v_requirement_id;

    if v_current_teacher_ids is distinct from (v_before -> 'teacher_ids')
       or v_current_teacher_mode
          is distinct from nullif(v_before ->> 'teacher_mode', '')
       or v_current_teacher_assignment_scope
          is distinct from nullif(v_before ->> 'teacher_assignment_scope', '')
       or v_current_teacher_continuity
          is distinct from nullif(v_before ->> 'teacher_continuity', '')
       or v_current_resource_mode
          is distinct from nullif(v_before ->> 'resource_mode', '')
       or v_current_room_ids is distinct from (v_before -> 'room_ids')
       or v_current_capability
          is distinct from nullif(v_before ->> 'required_capability', '') then
      raise exception
        'WORKSPACE_V2_REQUIREMENT_BEFORE_STALE: %',
        v_requirement_id;
    end if;

    v_after_teacher_ids_json := v_after -> 'teacher_ids';
    v_after_room_ids_json := v_after -> 'room_ids';
    v_after_teacher_mode := nullif(v_after ->> 'teacher_mode', '');
    v_after_teacher_assignment_scope :=
      nullif(v_after ->> 'teacher_assignment_scope', '');
    v_after_teacher_continuity :=
      nullif(v_after ->> 'teacher_continuity', '');
    v_after_resource_mode := nullif(v_after ->> 'resource_mode', '');
    v_after_capability := nullif(v_after ->> 'required_capability', '');

    if not (
      (
        v_after_teacher_assignment_scope = 'REQUIREMENT'
        and v_after_teacher_continuity = 'REQUIRED'
      )
      or (
        v_after_teacher_assignment_scope = 'BLOCK'
        and v_after_teacher_continuity in ('PREFERRED', 'NONE')
      )
      or (
        v_after_teacher_assignment_scope = 'UNSPECIFIED'
        and v_after_teacher_continuity = 'NONE'
      )
    ) then
      raise exception
        'WORKSPACE_V2_TEACHER_POLICY_INVALID: %',
        v_requirement_id;
    end if;

    begin
      select coalesce(
        array_agg(value::uuid order by value::uuid),
        array[]::uuid[]
      )
      into v_teacher_ids
      from jsonb_array_elements_text(v_after_teacher_ids_json) selected(value);

      select coalesce(
        array_agg(value::uuid order by value::uuid),
        array[]::uuid[]
      )
      into v_room_ids
      from jsonb_array_elements_text(v_after_room_ids_json) selected(value);
    exception when others then
      raise exception
        'WORKSPACE_V2_INVALID_REQUIREMENT_RESOURCE_ID: %',
        v_requirement_id;
    end;

    if cardinality(v_teacher_ids) <> (
      select count(distinct selected_id)
      from unnest(v_teacher_ids) selected(selected_id)
    ) then
      raise exception
        'WORKSPACE_V2_DUPLICATE_TEACHER: %',
        v_requirement_id;
    end if;

    if cardinality(v_room_ids) <> (
      select count(distinct selected_id)
      from unnest(v_room_ids) selected(selected_id)
    ) then
      raise exception
        'WORKSPACE_V2_DUPLICATE_ROOM: %',
        v_requirement_id;
    end if;

    v_expected_teacher_mode := case
      when cardinality(v_teacher_ids) = 0 then 'UNKNOWN'
      when cardinality(v_teacher_ids) = 1 then 'FIXED'
      else 'ELIGIBLE_POOL'
    end;

    if v_after_teacher_mode is distinct from v_expected_teacher_mode then
      raise exception
        'WORKSPACE_V2_TEACHER_MODE_MISMATCH: %',
        v_requirement_id;
    end if;

    if v_after_resource_mode = 'UNKNOWN' then
      if cardinality(v_room_ids) <> 0
         or v_after_capability is not null then
        raise exception
          'WORKSPACE_V2_UNKNOWN_ROOM_SHAPE_INVALID: %',
          v_requirement_id;
      end if;
      v_room_strategy := 'UNKNOWN';
      v_expected_resource_mode := 'UNKNOWN';

    elsif v_after_resource_mode = 'CAPABILITY' then
      if cardinality(v_room_ids) <> 0
         or v_after_capability is null then
        raise exception
          'WORKSPACE_V2_CAPABILITY_ROOM_SHAPE_INVALID: %',
          v_requirement_id;
      end if;
      v_room_strategy := 'CAPABILITY';
      v_expected_resource_mode := 'CAPABILITY';

    elsif v_after_resource_mode in ('FIXED', 'ELIGIBLE_POOL') then
      if cardinality(v_room_ids) = 0
         or v_after_capability is not null then
        raise exception
          'WORKSPACE_V2_SPECIFIC_ROOM_SHAPE_INVALID: %',
          v_requirement_id;
      end if;

      v_expected_resource_mode := case
        when cardinality(v_room_ids) = 1 then 'FIXED'
        else 'ELIGIBLE_POOL'
      end;

      if v_after_resource_mode <> v_expected_resource_mode then
        raise exception
          'WORKSPACE_V2_RESOURCE_MODE_MISMATCH: %',
          v_requirement_id;
      end if;

      v_room_strategy := 'SPECIFIC';
    else
      raise exception
        'WORKSPACE_V2_RESOURCE_MODE_INVALID: %',
        v_requirement_id;
    end if;

    v_teacher_changed := (
      v_current_teacher_ids is distinct from v_after_teacher_ids_json
      or v_current_teacher_mode is distinct from v_after_teacher_mode
    );

    v_room_changed := (
      v_current_room_ids is distinct from v_after_room_ids_json
      or v_current_resource_mode is distinct from v_after_resource_mode
      or v_current_capability is distinct from v_after_capability
    );

    v_policy_changed := (
      v_current_teacher_assignment_scope
        is distinct from v_after_teacher_assignment_scope
      or v_current_teacher_continuity
        is distinct from v_after_teacher_continuity
    );

    if not v_teacher_changed and not v_room_changed and not v_policy_changed then
      raise exception
        'WORKSPACE_V2_NOOP_REQUIREMENT_CHANGE: %',
        v_requirement_id;
    end if;

    select count(*)
    into v_placed_count
    from public.placements placement
    join public.schedule_cards card
      on card.id = placement.card_id
    where card.schedule_revision_id = p_schedule_revision_id
      and card.requirement_id = v_requirement_id;

    if v_placed_count > 0 and (v_teacher_changed or v_room_changed) then
      raise exception
        'WORKSPACE_V2_REQUIREMENT_HAS_PLACEMENTS: %',
        v_requirement_id;
    end if;

    if v_teacher_changed then
      perform public.management_update_requirement_teachers(
        v_requirement_id,
        v_teacher_ids
      );
    end if;

    if v_room_changed then
      perform public.management_update_requirement_room_strategy(
        v_requirement_id,
        v_room_strategy,
        v_room_ids,
        v_after_capability
      );
    end if;

    if v_policy_changed then
      v_policy_preview :=
        public.management_preview_requirement_teacher_policy(
          v_requirement_id,
          v_after_teacher_assignment_scope,
          v_after_teacher_continuity
        );

      if coalesce((v_policy_preview ->> 'canApply')::boolean, false) is not true then
        raise exception
          'WORKSPACE_V2_TEACHER_POLICY_BLOCKED: %',
          v_requirement_id;
      end if;

      perform public.management_apply_requirement_teacher_policy(
        v_requirement_id,
        v_after_teacher_assignment_scope,
        v_after_teacher_continuity,
        v_policy_preview ->> 'stateToken'
      );
    end if;
  end loop;

  v_intermediate_snapshot :=
    public.management_preview_solver_snapshot(
      p_schedule_revision_id,
      null
    );

  if jsonb_array_length(p_changes) > 0 then
    v_placement_result :=
      public.management_commit_workspace_v1(
        p_schedule_revision_id,
        p_requirement_set_id,
        p_expected_revision_version,
        v_intermediate_snapshot ->> 'snapshotHash',
        v_intermediate_snapshot ->> 'baselineHash',
        p_changes
      );

    v_final_snapshot :=
      public.management_preview_solver_snapshot(
        p_schedule_revision_id,
        null
      );
  else
    v_final_snapshot := v_intermediate_snapshot;
  end if;

  return jsonb_build_object(
    'committed', true,
    'revisionId', p_schedule_revision_id,
    'changedCardCount',
      coalesce((v_placement_result ->> 'changedCardCount')::integer, 0),
    'changedRequirementCount', v_requirement_count,
    'removeCount',
      coalesce((v_placement_result ->> 'removeCount')::integer, 0),
    'moveCount',
      coalesce((v_placement_result ->> 'moveCount')::integer, 0),
    'placeCount',
      coalesce((v_placement_result ->> 'placeCount')::integer, 0),
    'previousSnapshotHash', p_expected_snapshot_hash,
    'previousBaselineHash', p_expected_baseline_hash,
    'snapshotHash', v_final_snapshot ->> 'snapshotHash',
    'baselineHash', v_final_snapshot ->> 'baselineHash'
  );
end
$function$
;

revoke all
  on function public.management_commit_workspace_v2(
    uuid, uuid, integer, text, text, jsonb, jsonb
  )
  from public, anon;

grant execute
  on function public.management_commit_workspace_v2(
    uuid, uuid, integer, text, text, jsonb, jsonb
  )
  to authenticated;

comment on function public.management_commit_workspace_v2(
  uuid, uuid, integer, text, text, jsonb, jsonb
) is
  'Workspace v2 atomic commit with requirement teacher/room resources and teacher assignment scope/continuity policy, followed by placement REMOVE/MOVE/PLACE in one transaction.';

commit;
