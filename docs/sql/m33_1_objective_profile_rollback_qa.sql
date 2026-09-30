-- M33.1 rollback-only objective profile QA
--
-- Verifies the M33 profile RPC contract used by the M33.1 UI:
--   * unsupported objectives cannot be activated
--   * supported weights normalize correctly
--   * DRAFT profile can be created
--   * the same profile can be made ACTIVE
--   * ACTIVE profile makes objectiveProfileReady=true
--   * with current hard-ready input, solverPrototypeReady=true
--   * all profile writes are rolled back
--
-- No production state survives this script.

begin;

do $$
declare
  v_revision_id uuid;
  v_requirement_set_id uuid;
  v_invalid jsonb;
  v_draft jsonb;
  v_active jsonb;
  v_profiles jsonb;
  v_preview jsonb;
  v_profile_id uuid;
begin
  select
    revision.id,
    revision.requirement_set_id
  into
    v_revision_id,
    v_requirement_set_id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.status = 'DRAFT'
    and requirement_set.status = 'DRAFT'
    and requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
  order by revision.version_number desc
  limit 1;

  if v_revision_id is null then
    raise exception 'M33.1 QA active DRAFT revision not found';
  end if;

  v_invalid := public.management_validate_solver_objective_weights(
    jsonb_build_object(
      'changeCost', 250,
      'teacherLoadBalance', 250
    )
  );

  if coalesce((v_invalid ->> 'valid')::boolean, true) then
    raise exception
      'M33.1 QA unsupported teacherLoadBalance unexpectedly validated';
  end if;

  if not (
    v_invalid -> 'unsupportedEnabled'
    @> '["teacherLoadBalance"]'::jsonb
  ) then
    raise exception
      'M33.1 QA unsupported objective reason missing: %',
      v_invalid;
  end if;

  v_draft := public.management_upsert_solver_objective_profile(
    null,
    v_requirement_set_id,
    '__M33_1_ROLLBACK_QA__',
    'Rollback-only QA profile',
    jsonb_build_object(
      'changeCost', 500,
      'preferredTeacherContinuity', 250,
      'teacherIdleGaps', 750,
      'roomStability', 250
    ),
    'DRAFT'
  );

  v_profile_id := (v_draft ->> 'id')::uuid;

  if v_profile_id is null
     or v_draft ->> 'status' <> 'DRAFT' then
    raise exception
      'M33.1 QA draft profile creation failed: %',
      v_draft;
  end if;

  v_profiles :=
    public.management_list_solver_objective_profiles(
      v_requirement_set_id
    );

  if not exists (
    select 1
    from jsonb_array_elements(v_profiles) profile(value)
    where profile.value ->> 'id' = v_profile_id::text
      and profile.value ->> 'status' = 'DRAFT'
  ) then
    raise exception
      'M33.1 QA draft profile missing from list';
  end if;

  v_active := public.management_upsert_solver_objective_profile(
    v_profile_id,
    v_requirement_set_id,
    '__M33_1_ROLLBACK_QA__',
    'Rollback-only QA profile',
    jsonb_build_object(
      'changeCost', 500,
      'preferredTeacherContinuity', 250,
      'teacherIdleGaps', 750,
      'roomStability', 250
    ),
    'ACTIVE'
  );

  if v_active ->> 'status' <> 'ACTIVE' then
    raise exception
      'M33.1 QA profile activation failed: %',
      v_active;
  end if;

  v_preview :=
    public.management_preview_solver_snapshot(
      v_revision_id,
      v_profile_id
    );

  if not coalesce(
    (v_preview -> 'readiness' ->> 'hardInputReady')::boolean,
    false
  ) then
    raise exception
      'M33.1 QA hard input unexpectedly not ready: %',
      v_preview -> 'readiness' -> 'hardBlockers';
  end if;

  if not coalesce(
    (v_preview -> 'readiness' ->> 'objectiveProfileReady')::boolean,
    false
  ) then
    raise exception
      'M33.1 QA active supported profile is not objective-ready';
  end if;

  if not coalesce(
    (v_preview -> 'readiness' ->> 'solverPrototypeReady')::boolean,
    false
  ) then
    raise exception
      'M33.1 QA expected solverPrototypeReady with hard-ready input + active profile';
  end if;

  if (
    v_preview -> 'objectiveProfile' -> 'weights' ->> 'teacherIdleGaps'
  )::integer <> 750 then
    raise exception
      'M33.1 QA objective weight did not round-trip';
  end if;

  raise notice
    'M33.1 ROLLBACK QA PASS: profile %, snapshot %, baseline %',
    v_profile_id,
    v_preview ->> 'snapshotHash',
    v_preview ->> 'baselineHash';
end
$$;

rollback;
