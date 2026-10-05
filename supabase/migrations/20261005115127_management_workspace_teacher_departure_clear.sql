begin;

create or replace function public.management_commit_workspace_v4(
  p_schedule_revision_id uuid,
  p_requirement_set_id uuid,
  p_expected_revision_version integer,
  p_expected_snapshot_hash text,
  p_expected_baseline_hash text,
  p_changes jsonb,
  p_requirement_changes jsonb,
  p_resource_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_current_snapshot jsonb;
  v_after_departure_snapshot jsonb;
  v_workspace_result jsonb;

  v_departure_resource jsonb;
  v_departure_teacher_id uuid;
  v_departure_scope jsonb;
  v_departure_preview jsonb;
  v_departure_result jsonb;
  v_departure_candidate_count integer := 0;

  v_requirement_ids uuid[] := array[]::uuid[];
  v_card_ids uuid[] := array[]::uuid[];

  v_remaining_changes jsonb := '[]'::jsonb;
  v_remaining_requirement_changes jsonb := '[]'::jsonb;
  v_remaining_resource_changes jsonb := '[]'::jsonb;

  v_expected_requirement_count integer := 0;
  v_actual_requirement_count integer := 0;
  v_expected_card_count integer := 0;
  v_actual_card_count integer := 0;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'WORKSPACE_V4_EDITOR_REQUIRED'
      using errcode = '42501';
  end if;

  p_changes := coalesce(p_changes, '[]'::jsonb);
  p_requirement_changes := coalesce(p_requirement_changes, '[]'::jsonb);
  p_resource_changes := coalesce(p_resource_changes, '[]'::jsonb);

  if jsonb_typeof(p_changes) is distinct from 'array'
     or jsonb_typeof(p_requirement_changes) is distinct from 'array'
     or jsonb_typeof(p_resource_changes) is distinct from 'array' then
    raise exception 'WORKSPACE_V4_INVALID_CHANGE_ARRAY';
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

  select count(*)::integer
  into v_departure_candidate_count
  from jsonb_array_elements(p_resource_changes) entry(value)
  where upper(coalesce(entry.value ->> 'resource_type', '')) = 'TEACHER'
    and entry.value -> 'before' ->> 'operational_status' = 'ACTIVE'
    and entry.value -> 'after' ->> 'operational_status' = 'INACTIVE'
    and btrim(coalesce(entry.value -> 'before' ->> 'display_name', ''))
        = btrim(coalesce(entry.value -> 'after' ->> 'display_name', ''))
    and (
      exists (
        select 1
        from jsonb_array_elements(p_changes) placement_change(value)
        where placement_change.value -> 'before' ->> 'teacher_id'
              = entry.value ->> 'resource_id'
          and nullif(
                placement_change.value -> 'after' ->> 'teacher_id',
                ''
              ) is null
      )
      or exists (
        select 1
        from jsonb_array_elements(p_requirement_changes) requirement_change(value)
        where (requirement_change.value -> 'before' -> 'teacher_ids')
                ? (entry.value ->> 'resource_id')
          and not (
            (requirement_change.value -> 'after' -> 'teacher_ids')
              ? (entry.value ->> 'resource_id')
          )
      )
    );

  if v_departure_candidate_count > 1 then
    raise exception 'WORKSPACE_V4_MULTIPLE_TEACHER_DEPARTURES_UNSUPPORTED';
  end if;

  if v_departure_candidate_count = 1 then
    select entry.value
    into v_departure_resource
    from jsonb_array_elements(p_resource_changes) entry(value)
    where upper(coalesce(entry.value ->> 'resource_type', '')) = 'TEACHER'
      and entry.value -> 'before' ->> 'operational_status' = 'ACTIVE'
      and entry.value -> 'after' ->> 'operational_status' = 'INACTIVE'
      and btrim(coalesce(entry.value -> 'before' ->> 'display_name', ''))
          = btrim(coalesce(entry.value -> 'after' ->> 'display_name', ''))
      and (
        exists (
          select 1
          from jsonb_array_elements(p_changes) placement_change(value)
          where placement_change.value -> 'before' ->> 'teacher_id'
                = entry.value ->> 'resource_id'
            and nullif(
                  placement_change.value -> 'after' ->> 'teacher_id',
                  ''
                ) is null
        )
        or exists (
          select 1
          from jsonb_array_elements(p_requirement_changes) requirement_change(value)
          where (requirement_change.value -> 'before' -> 'teacher_ids')
                  ? (entry.value ->> 'resource_id')
            and not (
              (requirement_change.value -> 'after' -> 'teacher_ids')
                ? (entry.value ->> 'resource_id')
            )
        )
      )
    limit 1;

    begin
      v_departure_teacher_id :=
        nullif(v_departure_resource ->> 'resource_id', '')::uuid;
    exception when others then
      raise exception 'WORKSPACE_V4_INVALID_DEPARTURE_TEACHER_ID';
    end;

    if v_departure_teacher_id is null then
      raise exception 'WORKSPACE_V4_INVALID_DEPARTURE_TEACHER_ID';
    end if;

    v_departure_scope :=
      public.management_teacher_departure_scope(
        p_schedule_revision_id,
        v_departure_teacher_id
      );

    select coalesce(
      array_agg(value::uuid order by value::uuid),
      array[]::uuid[]
    )
    into v_requirement_ids
    from jsonb_array_elements_text(
      coalesce(v_departure_scope -> 'requirementIds', '[]'::jsonb)
    ) selected(value);

    select coalesce(
      array_agg(value::uuid order by value::uuid),
      array[]::uuid[]
    )
    into v_card_ids
    from jsonb_array_elements_text(
      coalesce(v_departure_scope -> 'placementCardIds', '[]'::jsonb)
    ) selected(value);

    v_expected_requirement_count := cardinality(v_requirement_ids);
    v_expected_card_count := cardinality(v_card_ids);

    select count(*)::integer
    into v_actual_requirement_count
    from jsonb_array_elements(p_requirement_changes) entry(value)
    where nullif(entry.value ->> 'requirement_id', '')::uuid
          = any(v_requirement_ids)
      and (entry.value -> 'before' -> 'teacher_ids')
            ? v_departure_teacher_id::text
      and not (
        (entry.value -> 'after' -> 'teacher_ids')
          ? v_departure_teacher_id::text
      )
      and (entry.value -> 'before' -> 'room_ids')
            = (entry.value -> 'after' -> 'room_ids')
      and (entry.value -> 'before' ->> 'resource_mode')
            is not distinct from
          (entry.value -> 'after' ->> 'resource_mode')
      and (entry.value -> 'before' ->> 'required_capability')
            is not distinct from
          (entry.value -> 'after' ->> 'required_capability')
      and (entry.value -> 'before' ->> 'teacher_assignment_scope')
            is not distinct from
          (entry.value -> 'after' ->> 'teacher_assignment_scope')
      and (entry.value -> 'before' ->> 'teacher_continuity')
            is not distinct from
          (entry.value -> 'after' ->> 'teacher_continuity');

    if v_actual_requirement_count <> v_expected_requirement_count then
      raise exception 'WORKSPACE_V4_DEPARTURE_REQUIREMENT_DELTA_MISMATCH';
    end if;

    select count(*)::integer
    into v_actual_card_count
    from jsonb_array_elements(p_changes) entry(value)
    where nullif(entry.value ->> 'card_id', '')::uuid = any(v_card_ids)
      and entry.value -> 'before' ->> 'teacher_id'
            = v_departure_teacher_id::text
      and nullif(entry.value -> 'after' ->> 'teacher_id', '') is null
      and (entry.value -> 'before' ->> 'day_of_week')
            is not distinct from
          (entry.value -> 'after' ->> 'day_of_week')
      and (entry.value -> 'before' ->> 'start_period')
            is not distinct from
          (entry.value -> 'after' ->> 'start_period')
      and (entry.value -> 'before' ->> 'room_id')
            is not distinct from
          (entry.value -> 'after' ->> 'room_id');

    if v_actual_card_count <> v_expected_card_count then
      raise exception 'WORKSPACE_V4_DEPARTURE_PLACEMENT_DELTA_MISMATCH';
    end if;

    v_departure_preview :=
      public.management_preview_teacher_departure(
        p_schedule_revision_id,
        v_departure_teacher_id
      );

    v_departure_result :=
      public.management_apply_teacher_departure(
        p_schedule_revision_id,
        v_departure_teacher_id,
        'INACTIVATE_CLEAR',
        v_departure_preview ->> 'stateToken'
      );

    select coalesce(jsonb_agg(entry.value), '[]'::jsonb)
    into v_remaining_changes
    from jsonb_array_elements(p_changes) entry(value)
    where not (
      nullif(entry.value ->> 'card_id', '')::uuid = any(v_card_ids)
    );

    select coalesce(jsonb_agg(entry.value), '[]'::jsonb)
    into v_remaining_requirement_changes
    from jsonb_array_elements(p_requirement_changes) entry(value)
    where not (
      nullif(entry.value ->> 'requirement_id', '')::uuid
        = any(v_requirement_ids)
    );

    select coalesce(jsonb_agg(entry.value), '[]'::jsonb)
    into v_remaining_resource_changes
    from jsonb_array_elements(p_resource_changes) entry(value)
    where not (
      upper(coalesce(entry.value ->> 'resource_type', '')) = 'TEACHER'
      and nullif(entry.value ->> 'resource_id', '')::uuid
            = v_departure_teacher_id
    );

    v_after_departure_snapshot :=
      public.management_preview_solver_snapshot(
        p_schedule_revision_id,
        null
      );

    v_workspace_result :=
      public.management_commit_workspace_v3(
        p_schedule_revision_id,
        p_requirement_set_id,
        p_expected_revision_version,
        v_after_departure_snapshot ->> 'snapshotHash',
        v_after_departure_snapshot ->> 'baselineHash',
        v_remaining_changes,
        v_remaining_requirement_changes,
        v_remaining_resource_changes
      );

    return jsonb_build_object(
      'committed', true,
      'revisionId', p_schedule_revision_id,
      'changedCardCount',
        coalesce(
          (v_workspace_result ->> 'changedCardCount')::integer,
          0
        ) + coalesce(
          (v_departure_result ->> 'placedBlockCount')::integer,
          0
        ),
      'changedRequirementCount',
        coalesce(
          (v_workspace_result ->> 'changedRequirementCount')::integer,
          0
        ) + coalesce(
          (v_departure_result ->> 'assignmentCount')::integer,
          0
        ),
      'changedResourceCount',
        coalesce(
          (v_workspace_result ->> 'changedResourceCount')::integer,
          0
        ) + 1,
      'removeCount',
        coalesce((v_workspace_result ->> 'removeCount')::integer, 0),
      'moveCount',
        coalesce((v_workspace_result ->> 'moveCount')::integer, 0),
      'placeCount',
        coalesce((v_workspace_result ->> 'placeCount')::integer, 0),
      'previousSnapshotHash', p_expected_snapshot_hash,
      'previousBaselineHash', p_expected_baseline_hash,
      'snapshotHash', v_workspace_result ->> 'snapshotHash',
      'baselineHash', v_workspace_result ->> 'baselineHash'
    );
  end if;

  return public.management_commit_workspace_v3(
    p_schedule_revision_id,
    p_requirement_set_id,
    p_expected_revision_version,
    p_expected_snapshot_hash,
    p_expected_baseline_hash,
    p_changes,
    p_requirement_changes,
    p_resource_changes
  );
end
$function$;

revoke all
  on function public.management_commit_workspace_v4(
    uuid, uuid, integer, text, text, jsonb, jsonb, jsonb
  )
  from public, anon;

grant execute
  on function public.management_commit_workspace_v4(
    uuid, uuid, integer, text, text, jsonb, jsonb, jsonb
  )
  to authenticated;

comment on function public.management_commit_workspace_v4(
  uuid, uuid, integer, text, text, jsonb, jsonb, jsonb
) is
  'Workspace v4 atomic commit. Detects one exact teacher INACTIVATE_CLEAR delta package, delegates that package to M35 teacher departure, then commits remaining workspace deltas through v3 in the same transaction.';

commit;
