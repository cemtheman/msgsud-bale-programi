# Workspace active local requirement validation

11 October 2026 (Europe/Istanbul). **CODE GATE PASS — BROWSER ACCEPTANCE PENDING.**

## Selection and baseline

Run baseline `24101f6` (M42/M43.3 CLOSED / PASS); package baseline
`5e3a389edfe8c449071ea8a2cb65e2af1d518d1d`, branch `feat/overnight-workspace-integrity`.
Existing Ders Planı activation/deactivation and atomic Save contracts select this
integrity correction after bulk selection. No M43.4 scope or milestone is invented.

## Reproduction and correction

Per-card validation projected the active working-copy catalogue; requirement-wide
rules still iterated snapshot.requirements. This used two different course sets:

- Remove baseline placements, then deactivate a course with minDistinctDays:
  editing succeeds but Save incorrectly demands placements for the inactive course.
- Hydrate an initially inactive course absent from the active snapshot, activate
  it locally and place new cards: aggregate maxBlocksPerDay, maxConsecutivePeriods,
  required teacher continuity and minDistinctDays were never checked.

Five new integration tests failed against package baseline. A one-line runtime
source change makes the aggregate loop reuse the existing active local map.
Indexing/preview/baseline reuse and all issue conditions remain unchanged.

Acceptance criteria (all PASS in unit/integration tests):

- Inactive courses never acquire placement completion requirements; Save payload
  retains structural deactivation and removal before/after with original hash.
- Undo deactivation restores ACTIVE and its minimum-day rule; Undo removal
  returns baseline/no diff; two Redo operations restore valid deactivation Save.
- Hydrated active courses enforce all four declared aggregate rules.
- Invalid EDIT batches leave working copy/history unchanged. COMMIT rejects a
  deliberately malformed local graph and produces no payload.
- minDistinctDays remains a COMMIT completion rule; incremental EDIT is allowed.
- Satisfying each rule permits commands and commit preparation for the same new
  course, with one structure change, two placements and original revision identity.
- Inactive hydrated rows remain harmless until activation. Existing teacher,
  room/group conflicts, pin and parallel semantics retain reference equivalence.

## Verification

Node 24.19.0 / Next 16.3.4 container, not AWS Node 24.21.0.

- Structure focused 14/14, eight-file gate 140/140 PASS.
- Final full suite: 41 files / 361 tests PASS; one opt-in benchmark skipped.
- Frozen equivalence 43/43 (320 seeded comparisons); preview isolation 2/2 PASS.
- TypeScript and diff check PASS; targeted lint 0 errors, one unchanged pre-existing
  unused cards-map warning. Manual diff review confirmed only course-set selection
  changed, no validation rule, database or history protocol was weakened.
- Isolated production build PASS, 9/9 pages:
  `/workspace/partisyon-overnight-active-build-5e3a389`,
  Build ID `E65JIFGy1KodD6lmW-t56`. Runtime source matched build export.

## Drag regression measurement

Accepted `24101f6` validation/commands/candidates exported with git show, mutual
imports redirected to frozen copies. Same process, fixture schoolSnapshot(517),
active day 5, 12 period assessments, identical inputs; strict complete-result
equality before timing. No concurrent build/test while timing. Ten warmups and
50 alternating measurements per implementation/scenario; external full pipeline
timing, profiling off. Linux x64 / AMD EPYC 9V74 / five logical CPUs / Node 24.19.

| Scenario | Accepted median / p95 ms | Corrected median / p95 ms |
| --- | --- | --- |
| Single | 48.16 / 53.45 | 47.34 / 56.26 |
| Multi-period | 50.46 / 61.24 | 50.82 / 54.87 |
| Parallel | 49.11 / 57.63 | 49.28 / 57.54 |
| Dense slot | 67.96 / 76.62 | 67.76 / 77.41 |

Median differences -1.71%..+0.71%, p95 -10.42%..+5.25%. No material performance
regression observed; distributions fluctuate, no timing SLA is asserted. This is
synthetic same-container evidence, not AWS/browser/frame acceptance. Do not compare
absolute times or percentages with other environments or earlier Intel samples.

Raw 400 samples, exact baseline/implementation SHA, runtime fingerprints and
complete benchmark driver/config: `WORKSPACE_ACTIVE_REQUIREMENT_BENCHMARK.json`.
Prepared frozen modules/driver retained in `/workspace/partisyon-overnight-benchmark`.
Re-run with `npx vitest run --config /workspace/partisyon-overnight-benchmark/vitest.config.mts`
without concurrent build/test. Frozen modules can be regenerated from accepted
commit paths; the driver/config sources are also embedded in the JSON artifact.

## Checkpoint and runtime boundary

Implementation `7690062` (`fix: validate aggregate rules against active local requirements`),
feature push and remote equality verified. Documentation checkpoint follows.
M42/M43.3 stay CLOSED / PASS; these new behaviors await authenticated acceptance.
AWS/browser NOT RUN: no usable credentials/SSH/browser tool; canonical HTTP proxy
403. No deploy, production Save, DB/migration writes, main merge, restart or release
modification. Existing RPC stale-revision/hash and transaction guards unchanged.

Minimal browser check on an isolated disposable test workspace: remove placements,
deactivate a minimum-day course and inspect Save readiness without production Save;
Undo must restore the minimum-day warning. Activate an inactive course with a known
aggregate rule; invalid local placements must reject, valid placements must work.
Actual persistence acceptance must use a separately authorized disposable database.

Next independent work: teacher-policy and reconciliation previews still enumerate
snapshot cards, omitting newly generated local cards/activated courses. Reproduce
and correct those previews in a separate checkpoint, keeping this package intact.
