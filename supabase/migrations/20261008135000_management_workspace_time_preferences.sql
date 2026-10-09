-- Management Workspace v12: requirement time preferences join the atomic Save boundary.
--
-- Contract:
-- - time preference edits are local before Save
-- - v12 verifies their baseline state against the current draft
-- - preference writes and the existing v11 workspace commit run in one transaction
-- - any later v11 failure rolls preference writes back as well

create or replace function public.management_commit_workspace_v12(
  p_schedule_revision_id uuid,
  p_requirement_set_id uuid,
  p_expected_revision_version integer,
  p_expected_snapshot_hash text,
  p_expected_baseline_hash text,
  p_changes jsonb,
  p_requirement_changes jsonb,
  p_resource_changes jsonb,
  p_teacher_planning_changes jsonb,
  p_teacher_availability_changes jsonb,
  p_room_profile_changes jsonb,
  p_resource_creates jsonb,
  p_resource_deletes jsonb,
  p_structure_changes jsonb,
  p_time_preference_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_current_snapshot jsonb;
  v_intermediate_snapshot jsonb;
  v_final_snapshot jsonb;
  v_workspace_result jsonb;
  v_change jsonb;
  v_requirement_id uuid;
  v_current_days smallint[];
  v_current_periods smallint[];
  v_before_days smallint[];
  v_before_periods smallint[];
  v_after_days smallint[];
  v_after_periods smallint[];
  v_time_preference_count integer := 0;
begin
  if not public.has_management_role('EDITOR') then
    raise exception 'WORKSPACE_V12_EDITOR_REQUIRED'
      using errcode = '42501';
  end if;

  p_time_preference_changes :=
    coalesce(p_time_preference_changes, '[]'::jsonb);

  if jsonb_typeof(p_time_preference_changes) is distinct from 'array' then
    raise exception 'WORKSPACE_V12_TIME_PREFERENCES_INVALID';
  end if;

  v_current_snapshot := public.management_preview_solver_snapshot(
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

  for v_change in
    select item.value
    from jsonb_array_elements(p_time_preference_changes) item(value)
    order by item.value ->> 'requirement_id'
  loop
    v_requirement_id := (v_change ->> 'requirement_id')::uuid;

    if not exists (
      select 1
      from public.course_requirements requirement
      where requirement.id = v_requirement_id
        and requirement.requirement_set_id = p_requirement_set_id
    ) then
      raise exception
        'WORKSPACE_V12_TIME_PREFERENCE_REQUIREMENT_INVALID: %',
        v_requirement_id;
    end if;

    select
      coalesce(preference.preferred_days, array[]::smallint[]),
      coalesce(preference.preferred_start_periods, array[]::smallint[])
    into
      v_current_days,
      v_current_periods
    from public.management_requirement_time_preferences preference
    where preference.requirement_id = v_requirement_id;

    if not found then
      v_current_days := array[]::smallint[];
      v_current_periods := array[]::smallint[];
    end if;

    select coalesce(
      array_agg(value::smallint order by value::smallint),
      array[]::smallint[]
    )
    into v_before_days
    from jsonb_array_elements_text(
      coalesce(v_change #> '{before,preferred_days}', '[]'::jsonb)
    ) value;

    select coalesce(
      array_agg(value::smallint order by value::smallint),
      array[]::smallint[]
    )
    into v_before_periods
    from jsonb_array_elements_text(
      coalesce(
        v_change #> '{before,preferred_start_periods}',
        '[]'::jsonb
      )
    ) value;

    if v_current_days is distinct from v_before_days
       or v_current_periods is distinct from v_before_periods then
      raise exception
        'WORKSPACE_V12_TIME_PREFERENCE_STALE: %',
        v_requirement_id;
    end if;

    select coalesce(
      array_agg(distinct value::smallint order by value::smallint),
      array[]::smallint[]
    )
    into v_after_days
    from jsonb_array_elements_text(
      coalesce(v_change #> '{after,preferred_days}', '[]'::jsonb)
    ) value;

    select coalesce(
      array_agg(distinct value::smallint order by value::smallint),
      array[]::smallint[]
    )
    into v_after_periods
    from jsonb_array_elements_text(
      coalesce(
        v_change #> '{after,preferred_start_periods}',
        '[]'::jsonb
      )
    ) value;

    perform public.management_set_requirement_time_preferences(
      p_schedule_revision_id,
      v_requirement_id,
      v_after_days,
      v_after_periods
    );

    v_time_preference_count := v_time_preference_count + 1;
  end loop;

  -- Preference edits participate in snapshotHash. We already checked the
  -- caller's original snapshot above, so delegate v11 using the new
  -- intermediate snapshot produced inside this same transaction.
  v_intermediate_snapshot := public.management_preview_solver_snapshot(
    p_schedule_revision_id,
    null
  );

  v_workspace_result := public.management_commit_workspace_v11(
    p_schedule_revision_id,
    p_requirement_set_id,
    p_expected_revision_version,
    v_intermediate_snapshot ->> 'snapshotHash',
    v_intermediate_snapshot ->> 'baselineHash',
    coalesce(p_changes, '[]'::jsonb),
    coalesce(p_requirement_changes, '[]'::jsonb),
    coalesce(p_resource_changes, '[]'::jsonb),
    coalesce(p_teacher_planning_changes, '[]'::jsonb),
    coalesce(p_teacher_availability_changes, '[]'::jsonb),
    coalesce(p_room_profile_changes, '[]'::jsonb),
    coalesce(p_resource_creates, '[]'::jsonb),
    coalesce(p_resource_deletes, '[]'::jsonb),
    coalesce(p_structure_changes, '[]'::jsonb)
  );

  v_final_snapshot := public.management_preview_solver_snapshot(
    p_schedule_revision_id,
    null
  );

  return v_workspace_result || jsonb_build_object(
    'changedTimePreferenceCount', v_time_preference_count,
    'previousSnapshotHash', p_expected_snapshot_hash,
    'previousBaselineHash', p_expected_baseline_hash,
    'snapshotHash', v_final_snapshot ->> 'snapshotHash',
    'baselineHash', v_final_snapshot ->> 'baselineHash'
  );
end
$function$;

revoke all on function public.management_commit_workspace_v12(
  uuid, uuid, integer, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;

grant execute on function public.management_commit_workspace_v12(
  uuid, uuid, integer, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;

comment on function public.management_commit_workspace_v12(
  uuid, uuid, integer, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) is
  'Workspace v12 atomic commit. Adds requirement day/start-period preferences to the local workspace Save boundary before delegating all existing v11 placement/resource/structure/lifecycle semantics.';
