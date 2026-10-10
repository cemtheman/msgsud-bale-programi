# M43.3 — Fast Slot Validation / Drag Preview Performance

Date: 10 October 2026 (Europe/Istanbul).

**Current M43.3 status (11 October 2026): CLOSED / PASS.**

Canonical acceptance is recorded at source `6dd5dff` and documentation checkpoint `4552528`: AWS 339/339 tests, 43/43 equivalence and 320 deterministic comparisons, TypeScript and isolated production build PASS. Promoted release `/home/ubuntu/partisyon-m43-build-6dd5dff`, Build ID `nND5t_DJLmV8WUnxUYhon`, serves `msgsud-dev.service` on port 3000. The user subsequently confirmed smooth drag on port 3000 in the next autonomous-run request. Numeric browser profiling remains optional and was not collected.

The original report below is historical evidence from the isolated 10 October run. Its PENDING/BLOCKED labels and access/reconciliation steps do **not** reopen the accepted milestone. The new M42 pin/resource hardening is separate; see `M42_PIN_RESOURCE_ACCEPTANCE_REPORT.md`.

## Historical 10 October engineering report

**Engineering gate at that time: CODE/PERFORMANCE GATE PASS — BROWSER ACCEPTANCE PENDING.**
**Overall closure at that time: BLOCKED — canonical AWS reconciliation and browser acceptance not performed.**

## Source and access evidence

- Repository: `cemtheman/msgsud-bale-programi`.
- Branch: `feat/m43-3-fast-slot-validation`.
- Starting remote HEAD: `2c1cdb426084a244d0ecbbe79e88793b66f4ece7`.
- Published implementation checkpoint: `123fae6e190f1ee99b1fb64a9b4441d93d7d3c19`.
- Canonical environment remains AWS EC2, eu-north-1 Stockholm, Ubuntu, t3.small, 2 vCPU / 2 GiB RAM / 4 GiB swap, `/home/ubuntu/msgsud-bale-programi`, Node 24.21.0, `msgsud-dev.service`.
- This run used a separate clean GitHub clone in the Work container. No AWS files, service or `.next` output were modified. HTTP connection failed; SSH returned `Network is unreachable`; the cloud browser displayed `502 Bad Gateway / Connection refused`. No Tailscale client or SSH identity was available in this container.
- The cloud browser request ended at `https://100.96.180.112:3000/yonetim`; no application page or authenticated drag interaction was observed.
- GitHub started with a clean working tree and matching upstream. Neither the user's backup nor a reference module existed in the clone. Their existence on AWS was not inspected.
- AWS uncommitted changes reported by user: `lib/managementWorkspaceCommands.ts`, `lib/managementWorkspaceValidation.ts`, `docs/MAC_CONTINUATION.md`; backup `lib/managementWorkspaceValidation.ts.backup-m43-20261010200603` must remain untracked and preserved.
- Library terminal record `Yapıştırılan metin(20261010-200529).txt` supplied the earlier full validation diff and profiling block; the later user task described the `malformedIndices` improvement. These are evidence of the earlier approach, not a current AWS filesystem snapshot. Commands/continuation uncommitted contents remain unverified.
- GitHub's 9 October continuation records were present; its M43.3/10 October records had not yet been pushed. User-reported M43.3.1 294 tests/build PASS and ~183 ms are historical observations, not results produced by this run.

## Optimization and behavior preservation

1. Index bounded integer footprints by day/period. Retain original placement indices and increasing pair traversal. Multi-period candidates are deduplicated; exact day and overlap predicates remain unchanged.
2. Build `malformedIndices` once. Non-safe-integer, reversed, fractional and spans over 257 occupied periods use the original pair scan. The bound limits extra indexing work; it does not reject an interval or change its validity.
3. Use a per-validation Set with the identical issue key for deduplication, replacing repeated scans/re-sorts of the growing issue list. Original issue/card ordering and final sort remain intact.
4. Group placed cards by requirement once, replacing a full placed-card scan for every requirement.
5. For placement/remove-only preview batches, copy the placement map and retain read-only shared card/resource state. Placement setters replace entries. Full clones remain for resource, structure, pin and mixed batches. Execute, Save and history paths retain their previous behavior. Deeply frozen inputs prove preview cannot mutate the source.
6. Preserve M43.3.1's active-day restriction and baseline-validation reuse. No new long-lived cache or incremental hard-rule shortcuts.
7. Existing drag timing is silent by default and enabled only with `NODE_ENV=development` and `NEXT_PUBLIC_M43_PROFILE=1`. No per-slot profiler was introduced. The AWS-only `[M43.3.2 profile]` / `[M43.3.2 validation]` blocks were not copied; reconcile them on AWS before acceptance.

Rejected approaches: cross-call caching keyed only by mutable snapshot/working-copy identity (stale-result risk); changed-card-only validation without a complete dependency graph (parallel, continuity, resource/lifecycle, commit/day-limit rules); skipping full resource diff (also validates workspace graph and throws on malformed structure); replacing the existing hard rules; dependency/migration changes.

## Equivalence and regression evidence

- Frozen test-only validator: exact baseline source from `2c1cdb4`, original Git blob `5b3efc71010df28bacd75a56c88d08a6f9c8b1a3`. Frozen commands and candidate builder are from the same commit.
- `managementWorkspaceValidationEquivalence.test.ts`: **43/43 PASS**, both EDIT/COMMIT, strict full result comparison (valid, issue fields and ordering, card/requirement/day identities, invalidCardIds), and equivalent thrown errors.
- Includes teacher/room/canonical-room/group conflicts, transitive/cyclic CONTAINS and OVERLAPS, full/partial multi-period overlaps, simultaneous conflicts, coordinated exemptions/external conflicts, intact/broken parallel bundles, all pin dimensions, malformed/absent/out-of-range day/start values, unusual/reversed/fractional durations, large non-conflicting baseline and resource/day-limit edits.
- Deterministic adversarial generator seed `0x4332`: 160 cases x 2 modes = 320 exact comparisons of 24-card inputs.
- Non-finite interval cases run only where the original validator terminates; pre-existing infinite loops for non-finite durations with assigned teachers were not redefined by this optimization.
- `m43PreviewIsolation.test.ts`: **2/2 PASS**, multiple placement/remove/mixed/resource/pin batches against frozen commands on deeply frozen source, plus actual candidate pipeline comparisons for single/multi/parallel moves at 24 and 517 cards.
- Focused validation: **17/17 PASS**; commands: **12/12 PASS**. Combined final coverage represented in the full suite: 74 focused/regression tests.
- Full suite: **41 files / 339 tests PASS**. One opt-in timing test skipped during normal suite, then separately **1/1 PASS** with `M43_BENCH=1`.
- `npx tsc --noEmit`: **PASS**.
- `npm run build` (`next build --webpack`, Next 16.3.4): **PASS**, TypeScript PASS, **9/9 static pages**. Built only in this isolated clone; no running app shares that `.next` directory.
- `git diff --check`: **PASS**; source/test diff reviewed; no runtime import of test fixtures.
- Initial test harness errors (expected missing-placement exception and read-only fixture typing) were diagnosed and fixed. No equivalence expectation was relaxed to accommodate an algorithm difference.

## Reproducible benchmark

Work container: Linux x64, Node **24.19.0**, Intel Xeon Platinum 8573C, 9 exposed logical CPUs. This is **not t3.small** and **not a browser measurement**. Fixture: **517 cards, 517 requirements, 16 groups, 16 teachers, 16 rooms**. High-cardinality synthetic fixture, not a production export; real requirement/resource distribution remains to be measured. Dense case deliberately crowds 80 cards into one period to exercise conflict-heavy draft validation.

Reference and optimized implementations run in the same process on identical input, alternating execution order. Console/in-validator profiling disabled; only external wall-clock timing. Both command-preview sides reuse an identical prevalidated baseline. Median uses sorted middle sample; p95 uses nearest-rank `ceil(0.95*n)`.

Command preview: **15 warm-ups, 70 measured repetitions** per scenario; cloning, trial operation, full candidate validation and result filtering included. Consecutive row measures all 12 previews together.

| Scenario | Before median / p95 (ms) | After median / p95 (ms) | Median improvement |
|---|---:|---:|---:|
| single | 6.51 / 11.02 | 3.90 / 6.31 | 40.0% |
| multi-period | 5.65 / 7.86 | 3.88 / 5.78 | 31.2% |
| parallel-coordinated | 5.94 / 7.03 | 3.99 / 4.69 | 32.9% |
| dense-slot | 39.74 / 46.99 | 5.32 / 7.28 | 86.6% |
| empty-slot | 5.68 / 6.36 | 3.84 / 4.63 | 32.4% |
| consecutive-12-candidates | 70.88 / 82.40 | 48.58 / 59.41 | 31.5% |

Actual synchronous drag candidate builder (`buildManagementWorkspacePrevalidatedMoveCandidateDetailsV1`): active day 5, 12 period assessments, includes initial baseline validation, every slot preview and candidate detail updates. **10 warm-ups, 30 measured repetitions** per scenario.

| Scenario | Before median / p95 (ms) | After median / p95 (ms) | Median improvement |
|---|---:|---:|---:|
| single | 75.28 / 78.60 | 52.00 / 54.90 | 30.9% |
| multi-period | 78.25 / 129.48 | 52.33 / 89.08 | 33.1% |
| parallel | 95.76 / 194.79 | 61.98 / 101.02 | 35.3% |
| dense-slot | 488.72 / 521.11 | 67.73 / 71.53 | 86.1% |

The old **183 ms** observation is not a directly comparable baseline. These tables compare the frozen and optimized code under the same container conditions. Browser frame scheduling/native ghost, rendering, network, Safari behavior and t3.small performance are **PENDING**. p95 reflects host scheduling/GC and is descriptive, not an SLA.

Raw measurements: `docs/M43_3_BENCHMARK.json`.

Run:

```bash
npx vitest run tests/managementWorkspaceValidation.test.ts tests/managementWorkspaceCommands.test.ts tests/managementWorkspaceValidationEquivalence.test.ts tests/m43PreviewIsolation.test.ts
M43_BENCH=1 npx vitest run tests/m43Performance.bench.test.ts
npm test
npx tsc --noEmit
npm run build
```

Do not run the last command in the live AWS service tree without first arranging an isolated build; current service must remain available.

## Artifact classification

- `tests/fixtures/m43/referenceValidation.ts`, `referenceCommands.ts`, `referenceCandidates.ts`: retained, frozen test-only oracle modules; never wired into runtime. Useful until M43.3 AWS/browser acceptance; maintain/remove deliberately afterward. They are not alternative product implementations.
- `tests/fixtures/m43/snapshots.ts`: retained reproducible synthetic fixtures.
- Equivalence/isolation tests: retained regressions.
- `tests/m43Performance.bench.test.ts`: retained opt-in timing tool; performance comparisons do not create noisy/flaky timing assertions in the normal suite.
- `/tmp/m43-benchmark.json`: scratch output copied verbatim into the versioned evidence JSON.
- User's AWS backup: not downloaded, removed, staged or committed.

## Git and next steps

Implementation and documentation are separate feature-branch checkpoints. Terminal HTTPS push lacked credentials; the connected GitHub API published the exact local implementation tree (`dbd9cd42a16f9bea7185fd8ee9baa9ba9ea3f58b`) with an expected-parent check and a non-force ref update. No merge to main, DB write, migration, dependency change, public deploy or service restart.

### Historical M43.3 roadmap / acceptance gates — superseded by current status above

| Gate | State |
|---|---|
| M43.3.1 prior baseline reuse/active-day improvements | User-reported accepted, preserved |
| M43.3.2 behavior-preserving slot index and second optimization round | PASS in isolated clone |
| Reference/e2e/isolation regression gate | PASS |
| Full suite / TypeScript / isolated build | PASS |
| Synthetic comparable performance gate | PASS |
| Feature-branch implementation checkpoint publication | PASS; `123fae6e190f1ee99b1fb64a9b4441d93d7d3c19` |
| Current AWS dirty-tree inspection and reconciliation | BLOCKED by access |
| AWS tests / isolated build / real-data benchmark | PENDING |
| Browser native drag / pins / Undo/Redo acceptance | PENDING |
| Overall M43.3 | BLOCKED; not CLOSED |

Do **not** blindly `git pull` in the dirty AWS tree. Once canonical access exists:

1. Record branch/HEAD/status and full three-file diffs; preserve/export all existing edits and the backup without resetting or cleaning.
2. Compare those changes to `123fae6e190f1ee99b1fb64a9b4441d93d7d3c19` and the documentation checkpoint; reconcile the validation/commands/continuation edits explicitly. Remove or gate old profile logs only after inspecting them. Do not stage the user's backup.
3. Rerun equivalence, commands, full tests, TypeScript and a service-safe isolated production build on the reconciled AWS source.
4. Benchmark a representative real snapshot without modifying the database; record median/p95 on t3.small.
5. In the real browser, drag single/multi-period/parallel cards into dense and empty slots; confirm native ghost, active-day green/red targets, safe early release while loading, all pins and atomic Undo/Redo. Browser test moves must remain unsaved and be undone.
6. Update journal/roadmap and close only after all canonical/browser gates pass.
