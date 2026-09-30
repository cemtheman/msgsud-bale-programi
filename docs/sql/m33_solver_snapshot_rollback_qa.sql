-- M33 rollback-only solver snapshot QA
--
-- Verifies:
--   * deterministic snapshot hash for unchanged draft input
--   * candidate assessments are deliberately excluded
--   * baseline hash is stable
--   * hard-ready input can be captured and read back identically
--   * captured row is rolled back at the end
--
-- No production state survives this script.

begin;

do $$
declare
  v_revision_id uuid;
  v_first jsonb;
  v_second jsonb;
  v_capture jsonb;
  v_stored jsonb;
  v_snapshot_id uuid;
begin
  select revision.id
  into v_revision_id
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
    raise exception 'M33 QA active DRAFT revision not found';
  end if;

  v_first :=
    public.management_preview_solver_snapshot(v_revision_id, null);
  v_second :=
    public.management_preview_solver_snapshot(v_revision_id, null);

  if v_first ->> 'snapshotHash'
     is distinct from v_second ->> 'snapshotHash' then
    raise exception
      'M33 QA snapshot hash is not deterministic: % vs %',
      v_first ->> 'snapshotHash',
      v_second ->> 'snapshotHash';
  end if;

  if v_first ->> 'baselineHash'
     is distinct from v_second ->> 'baselineHash' then
    raise exception
      'M33 QA baseline hash is not deterministic';
  end if;

  if coalesce(
    (v_first ->> 'candidateDomainIncluded')::boolean,
    true
  ) then
    raise exception
      'M33 QA occupancy-relative candidate domain must not be embedded';
  end if;

  if not coalesce(
    (v_first -> 'readiness' ->> 'hardInputReady')::boolean,
    false
  ) then
    raise exception
      'M33 QA hard input is not ready. Blockers: %',
      v_first -> 'readiness' -> 'hardBlockers';
  end if;

  if coalesce(
    (v_first -> 'readiness' ->> 'objectiveProfileReady')::boolean,
    true
  ) then
    raise exception
      'M33 QA null objective profile must not be treated as objective-ready';
  end if;

  v_capture :=
    public.management_capture_solver_snapshot(v_revision_id, null);

  v_snapshot_id := (v_capture ->> 'snapshotId')::uuid;

  if v_snapshot_id is null then
    raise exception 'M33 QA capture returned no snapshot id';
  end if;

  v_stored :=
    public.management_get_solver_snapshot(v_snapshot_id);

  if v_stored ->> 'snapshotHash'
     is distinct from v_first ->> 'snapshotHash' then
    raise exception
      'M33 QA stored snapshot hash differs from preview';
  end if;

  if v_stored ->> 'baselineHash'
     is distinct from v_first ->> 'baselineHash' then
    raise exception
      'M33 QA stored baseline hash differs from preview';
  end if;

  if (
    (v_stored -> 'snapshot') ->> 'snapshotHash'
  ) is distinct from v_first ->> 'snapshotHash' then
    raise exception
      'M33 QA stored snapshot payload differs from preview';
  end if;

  raise notice
    'M33 ROLLBACK QA PASS: revision %, snapshot %, hash %, baseline %, metrics %',
    v_revision_id,
    v_snapshot_id,
    v_first ->> 'snapshotHash',
    v_first ->> 'baselineHash',
    v_first -> 'baselineMetrics';
end
$$;

rollback;
