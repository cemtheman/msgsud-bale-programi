-- M33 solver snapshot readiness preview
-- Regenerated canonical copy — 2026-09-30
--
-- Read-only. No objective profile is selected implicitly.
-- Shows the current DRAFT solver-input readiness and baseline metrics without
-- dumping the full snapshot JSON.
--
-- M33.0.1 semantics:
--   resource_mode=UNKNOWN is not a hard blocker.
--   It is reported under provisionalInputs as M22 PROVISIONAL_UNKNOWN.

with active_revision as (
  select revision.id
  from public.schedule_revisions revision
  join public.requirement_sets requirement_set
    on requirement_set.id = revision.requirement_set_id
  where revision.status = 'DRAFT'
    and requirement_set.status = 'DRAFT'
    and requirement_set.academic_year = '2026-2027'
    and requirement_set.term = 1
  order by revision.version_number desc
  limit 1
),
preview as (
  select public.management_preview_solver_snapshot(
    active_revision.id,
    null
  ) as value
  from active_revision
)
select
  value ->> 'snapshotVersion' as snapshot_version,
  value ->> 'solverEngineStatus' as solver_engine_status,
  value ->> 'snapshotHash' as snapshot_hash,
  value ->> 'baselineHash' as baseline_hash,

  (value -> 'readiness' ->> 'hardInputReady')::boolean
    as hard_input_ready,
  (value -> 'readiness' ->> 'objectiveProfileReady')::boolean
    as objective_profile_ready,
  (value -> 'readiness' ->> 'solverPrototypeReady')::boolean
    as solver_prototype_ready,

  value -> 'readiness' -> 'hardBlockers'
    as hard_blockers,
  value -> 'readiness' -> 'provisionalInputs'
    as provisional_inputs,
  value -> 'readiness' ->> 'resourceUnknownSemantics'
    as resource_unknown_semantics,
  value -> 'readiness' -> 'missingOptionalModelInputs'
    as missing_optional_model_inputs,

  value -> 'baselineMetrics'
    as baseline_metrics,
  value -> 'objectiveCatalog'
    as objective_catalog,

  (value ->> 'candidateDomainIncluded')::boolean
    as candidate_domain_included,
  value ->> 'candidateDomainOmissionReason'
    as candidate_domain_omission_reason
from preview;
