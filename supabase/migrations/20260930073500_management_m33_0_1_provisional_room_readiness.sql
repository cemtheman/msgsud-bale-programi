-- Management M33.0.1
-- Solver readiness semantics aligned with M22 provisional resources.
--
-- M33 initially treated resource_mode=UNKNOWN as a hard-input blocker.
-- M22 explicitly defines UNKNOWN room identity as schedulable provisional state:
-- UNKNOWN != ABSENT != UNAVAILABLE.
--
-- Therefore UNKNOWN room strategy belongs in snapshot readiness warnings, not
-- hard blockers. No requirement/resource rows are rewritten here.

begin;


-- Preserve the applied M33 implementation as a private base function so the
-- correction remains additive and auditable.
alter function public.management_preview_solver_snapshot(uuid, uuid)
  rename to management_preview_solver_snapshot_m33_base;

revoke all
  on function public.management_preview_solver_snapshot_m33_base(uuid, uuid)
  from public, anon, authenticated;


create or replace function public.management_preview_solver_snapshot(
  p_schedule_revision_id uuid,
  p_objective_profile_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_base jsonb;
  v_readiness jsonb;
  v_filtered_blockers jsonb;
  v_hard_ready boolean;
  v_objective_ready boolean;
  v_unknown_count integer := 0;
  v_unknown_with_baseline_room integer := 0;
  v_unknown_without_baseline_room integer := 0;
  v_provisional_inputs jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_snapshot_hash text;
  v_baseline_hash text;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('VIEWER') then
    raise exception 'M33.0.1 management VIEWER role required'
      using errcode = '42501';
  end if;

  v_base :=
    public.management_preview_solver_snapshot_m33_base(
      p_schedule_revision_id,
      p_objective_profile_id
    );

  v_readiness := coalesce(v_base -> 'readiness', '{}'::jsonb);

  select coalesce(
    jsonb_agg(blocker.value order by blocker.value ->> 'code'),
    '[]'::jsonb
  )
  into v_filtered_blockers
  from jsonb_array_elements(
    coalesce(v_readiness -> 'hardBlockers', '[]'::jsonb)
  ) blocker(value)
  where blocker.value ->> 'code' <> 'RESOURCE_MODE_UNKNOWN';

  select
    count(distinct requirement.id)::integer,
    count(distinct requirement.id) filter (
      where exists (
        select 1
        from public.schedule_cards card
        join public.placements placement
          on placement.card_id = card.id
        where card.schedule_revision_id = p_schedule_revision_id
          and card.requirement_id = requirement.id
          and placement.room_id is not null
      )
    )::integer,
    count(distinct requirement.id) filter (
      where not exists (
        select 1
        from public.schedule_cards card
        join public.placements placement
          on placement.card_id = card.id
        where card.schedule_revision_id = p_schedule_revision_id
          and card.requirement_id = requirement.id
          and placement.room_id is not null
      )
    )::integer
  into
    v_unknown_count,
    v_unknown_with_baseline_room,
    v_unknown_without_baseline_room
  from public.course_requirements requirement
  join public.schedule_revisions revision
    on revision.requirement_set_id = requirement.requirement_set_id
  where revision.id = p_schedule_revision_id
    and requirement.term_status = 'ACTIVE'
    and requirement.resource_mode = 'UNKNOWN';

  if v_unknown_count > 0 then
    v_provisional_inputs := jsonb_build_array(
      jsonb_build_object(
        'code', 'RESOURCE_MODE_UNKNOWN',
        'count', v_unknown_count,
        'resolutionStatus', 'PROVISIONAL_UNKNOWN',
        'hardBlocker', false,
        'withBaselineRoomEvidence', v_unknown_with_baseline_room,
        'withoutBaselineRoomEvidence', v_unknown_without_baseline_room,
        'meaning',
          'Salon stratejisi bilinmiyor; M22 semantiğiyle planlanabilir ancak salon kimliği provisional kalır.'
      )
    );
  end if;

  v_hard_ready := jsonb_array_length(v_filtered_blockers) = 0;
  v_objective_ready := coalesce(
    (v_readiness ->> 'objectiveProfileReady')::boolean,
    false
  );

  v_readiness :=
    v_readiness
    || jsonb_build_object(
      'hardInputReady', v_hard_ready,
      'solverPrototypeReady',
        v_hard_ready and v_objective_ready,
      'hardBlockers', v_filtered_blockers,
      'provisionalInputs', v_provisional_inputs,
      'resourceUnknownSemantics', 'M22_PROVISIONAL_UNKNOWN'
    );

  v_payload :=
    (v_base - 'snapshotHash' - 'baselineHash')
    || jsonb_build_object(
      'snapshotVersion', 'M33.0.1-v1',
      'readiness', v_readiness
    );

  v_baseline_hash := v_base ->> 'baselineHash';
  v_snapshot_hash := md5(v_payload::text);

  return v_payload || jsonb_build_object(
    'snapshotHash', v_snapshot_hash,
    'baselineHash', v_baseline_hash
  );
end
$$;

revoke all
  on function public.management_preview_solver_snapshot(uuid, uuid)
  from public, anon;

grant execute
  on function public.management_preview_solver_snapshot(uuid, uuid)
  to authenticated;


create or replace function public.management_capture_solver_snapshot(
  p_schedule_revision_id uuid,
  p_objective_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot jsonb;
  v_snapshot_version text;
  v_snapshot_hash text;
  v_baseline_hash text;
  v_snapshot_id uuid;
begin
  if session_user <> 'postgres'
     and not public.has_management_role('EDITOR') then
    raise exception 'M33.0.1 management EDITOR role required'
      using errcode = '42501';
  end if;

  perform 1
  from public.schedule_revisions revision
  where revision.id = p_schedule_revision_id
    and revision.status = 'DRAFT'
  for share;

  if not found then
    raise exception 'M33.0.1 capture requires DRAFT revision';
  end if;

  v_snapshot :=
    public.management_preview_solver_snapshot(
      p_schedule_revision_id,
      p_objective_profile_id
    );

  v_snapshot_version := v_snapshot ->> 'snapshotVersion';
  v_snapshot_hash := v_snapshot ->> 'snapshotHash';
  v_baseline_hash := v_snapshot ->> 'baselineHash';

  if not coalesce(
    ((v_snapshot -> 'readiness') ->> 'hardInputReady')::boolean,
    false
  ) then
    raise exception
      'M33.0.1 snapshot capture blocked by hard input readiness: %',
      (v_snapshot -> 'readiness' -> 'hardBlockers')::text;
  end if;

  insert into public.management_solver_snapshots (
    schedule_revision_id,
    objective_profile_id,
    snapshot_version,
    snapshot_hash,
    baseline_hash,
    snapshot,
    readiness
  )
  values (
    p_schedule_revision_id,
    p_objective_profile_id,
    v_snapshot_version,
    v_snapshot_hash,
    v_baseline_hash,
    v_snapshot,
    v_snapshot -> 'readiness'
  )
  on conflict (schedule_revision_id, snapshot_hash)
  do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    select stored.id
    into v_snapshot_id
    from public.management_solver_snapshots stored
    where stored.schedule_revision_id = p_schedule_revision_id
      and stored.snapshot_hash = v_snapshot_hash;
  end if;

  return jsonb_build_object(
    'snapshotId', v_snapshot_id,
    'revisionId', p_schedule_revision_id,
    'objectiveProfileId', p_objective_profile_id,
    'snapshotVersion', v_snapshot_version,
    'snapshotHash', v_snapshot_hash,
    'baselineHash', v_baseline_hash,
    'readiness', v_snapshot -> 'readiness',
    'baselineMetrics', v_snapshot -> 'baselineMetrics',
    'solverEngineStatus', 'SNAPSHOT_ONLY',
    'captured', true
  );
end
$$;

revoke all
  on function public.management_capture_solver_snapshot(uuid, uuid)
  from public, anon;

grant execute
  on function public.management_capture_solver_snapshot(uuid, uuid)
  to authenticated;


comment on function public.management_preview_solver_snapshot(uuid, uuid) is
  'M33.0.1 solver snapshot preview. Aligns M33 readiness with M22: resource_mode UNKNOWN is schedulable provisional input, not a hard blocker. Other M33 hard blockers remain unchanged.';

comment on function public.management_capture_solver_snapshot(uuid, uuid) is
  'M33.0.1 immutable solver snapshot capture using corrected M22-aligned provisional room readiness semantics.';

commit;
