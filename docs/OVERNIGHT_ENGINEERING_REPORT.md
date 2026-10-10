# Partisyon overnight engineering handoff

11 October 2026 (Europe/Istanbul). **Four packages: CODE GATE PASS — BROWSER ACCEPTANCE PENDING.**

## Source, safety and selection

- Exact run baseline: `24101f6e96914a32097965a4e1cb6f498244536a`,
  canonical GitHub/AWS branch `feat/m42-pin-resource-acceptance`.
- Development branch: `feat/overnight-workspace-integrity`, created from that exact
  verified remote checkpoint. Initial local checkout was clean `98307f5`; the
  later canonical acceptance was fetched/reviewed first. One worktree, no stashes.
- Accepted M42 and M43.3 remain CLOSED / PASS. Historical pending labels reconciled
  in AGENTS, continuation roadmap and milestone report upper summaries; old records
  retained. No defined M43.4 scope exists, so no new milestone number was invented.
- Existing atomic operation/current-copy/Save contracts and the user's defect-first
  priorities selected four reproduced bounded engineering repairs, not extra UI
  features or a speculative full-auto redesign.

## Package gates and checkpoints

| Existing engineering package | Why selected / behavior fixed | Package baseline | Code checkpoint | Focused gate | Full suite |
| --- | --- | --- | --- | --- | --- |
| Bulk resource selection integrity | Stale/missing/unplaced selections silently applied a subset; now entire selection blocks with no executable commands | `24101f6` | `b1e5200a094f51808c2370fa84b484219cb05413` | 109/109 (6 files); resource 21/21 | 356/356 |
| Active local requirement aggregate rules | Inactive course falsely blocked Save; newly activated hydrated courses skipped four hard rules | `5e3a389` | `769006232bf07b17edd0c1e69a7a23be7f914b25` | 140/140 (8 files); structure 14/14 | 361/361 |
| Current-local teacher policy/reconciliation | New local cards/courses omitted, stale tokens/names/conflict metadata; corrected local graph and proposed-teacher attribution | `8f31267` | `3abab3f4046593ad7ed9ede92a315ccff8c2f871` | 155/155 (9 files); teacher 15/15 | 371/371 |
| Asynchronous workspace/catalogue reads | Late reads discarded new edits or preference/history; current diff guard, captured-row integrity and unknown-input edit guard | `fe07409` | `5791e09` | 156/156 (10 files); refresh 15/15 | 386/386 |

Separate documentation checkpoints after the first three packages: `5e3a389`,
`8f31267`, `fe07409`. Final documentation checkpoint is the published branch tip:
`git ls-remote origin refs/heads/feat/overnight-workspace-integrity`.
A commit cannot embed its own SHA; this report identifies the exact code checkpoints
and the branch that resolves its final documentation SHA. Native HTTPS push and
remote equality were verified after every checkpoint. No force push or main merge.

Final full suite: **42 files / 386 tests PASS**, **36 added regressions**;
one opt-in benchmark file/test skipped, never counted as a pass. TypeScript PASS
at each package; all four isolated production builds PASS, each 9/9 pages.
Frozen reference equivalence remains **43/43 PASS**, including 320 seeded EDIT/COMMIT
comparisons; frozen drag preview isolation remains **2/2 PASS**. Frozen references,
production dependencies/lockfile, DB RPC and migrations unchanged.

Final module lint: zero errors, one pre-existing warning. Whole page lint remains
an existing **42 errors / 8 warnings**, with **zero introduced diagnostics** after
position/rule comparison to package baseline. It is not falsely marked PASS.
Manual scoped review and git diff check passed. Tree clean after checkpoints;
no unrelated files staged or discarded.

## Production build and runtime evidence

| Package | Isolated export | Build ID |
| --- | --- | --- |
| Selection | `/workspace/partisyon-overnight-selection-build-24101f6` | `iYDGrPB2fDxKnrewnYOZ4` |
| Active requirements | `/workspace/partisyon-overnight-active-build-5e3a389` | `E65JIFGy1KodD6lmW-t56` |
| Teacher previews | `/workspace/partisyon-overnight-teacher-build-8f31267` | `Ucjq7c-GPQGtr7I4RtPOQ` |
| Async reads (final) | `/workspace/partisyon-overnight-refresh-build-fe07409` | `rGM8I4IPSVjZ-T8Lbbmer` |

All used container Node **24.19.0** / Next **16.3.4**, not AWS Node 24.21.0.
Final changed runtime sources matched the built export. Temporary local port 3003
anonymous smoke returned HTTP 200 for `/`, `/yonetim`, manifest, then shut down.
This confirms production start/anonymous serving only; no browser login occurred.

Execution incident recorded candidly: one first-package build mistakenly ran in
local checkout and renewed its ignored `.next`/generated PWA output. It did not
change tracked files or AWS assets. All validation builds also ran successfully
in separate exports; subsequent commands asserted isolated cwd. Existing local
servers were not restarted. The report does not claim local source build output
was preserved; older separate release directories remained intact.

## M43.3 performance

Same-process accepted `24101f6` versus corrected pipeline, existing synthetic
517-card fixture, day 5 / 12 assessments, 10 warmups / 50 alternating samples per
implementation/scenario; strict complete-output equality before timing. Linux x64,
AMD EPYC 9V74 / 5 CPUs / Node 24.19; no concurrent build/test during measurement.

| Drag pipeline | Baseline median / p95 ms | Corrected median / p95 ms |
| --- | --- | --- |
| Single | 48.16 / 53.45 | 47.34 / 56.26 |
| Multi-period | 50.46 / 61.24 | 50.82 / 54.87 |
| Parallel | 49.11 / 57.63 | 49.28 / 57.54 |
| Dense slot | 67.96 / 76.62 | 67.76 / 77.41 |

Median -1.71%..+0.71%, p95 -10.42%..+5.25%; no material regression observed.
These are same-container synthetic distributions, not browser frames or AWS
t3.small measurements. Do not compare percentages to another environment.
Validation/commands/candidates source fingerprints match this measured version
on final source; later changes add no per-slot work. Full driver/config/raw samples
and exact source identities: `WORKSPACE_ACTIVE_REQUIREMENT_BENCHMARK.json`.

## AWS, acceptance and remaining risks

**AWS/browser NOT RUN during this run.** Configured profile files have no sections,
SSH identity is absent, no callable AWS/browser tool; canonical read-only HTTP
probe returned platform proxy 403. No request to the production database, Save,
DB migration, deployment, main merge or canonical service restart was performed.
All named AWS releases/backups/stashes/validation backups/systemd rollback assets
were inaccessible and untouched, not independently inventoried.

Latest canonical runtime from the user's accepted `24101f6` record:
`/home/ubuntu/partisyon-m42-acceptance`, Build ID `FWDpU_8fSNVyi-jkEaLdP`,
`msgsud-dev.service` port 3000 active/HTTP 200; temporary AWS port 3001 inactive.
Previous M43 release and backups preserved by the prior accepted promotion.
M42/M43.3 acceptance is not reopened by these independent fixes.

Four new packages reach **CODE GATE PASS — BROWSER ACCEPTANCE PENDING**;
none is falsely CLOSED. Their authenticated runtime/UI/persistence checks remain.
No observed failing new code tests or TypeScript/build gate remains. Existing
page lint debt stays open. Local edits remain in memory (no durable crash/reload
recovery); real server conflicts still require explicit stale-state resolution,
not an automatic rebase. Runtime interaction needs actual browser evidence.

## Smallest morning acceptance

Keep accepted port 3000 and release/rollback unchanged. When canonical access is
available, inspect source dirty tree/worktrees/stashes first and prepare this exact
feature tip in a new isolated release; do not blindly pull into the main workspace.
Use a disposable authenticated workspace; no Save to real school data.

1. Preview a multi-card resource edit, remove a member locally, then apply: all
   assignments/history must remain untouched; a complete selection still applies
   and undoes as one batch.
2. Remove a minimum-day course's placements, deactivate it: Save preparation must
   be allowed; Undo restores the active course's minimum-day requirement. Activate
   an initially inactive course: its declared daily/continuity rules must enforce.
3. Add/place a local block with a different teacher: REQUIRED policy must block;
   reconcile all blocks, verify counts/names, pin guard and one-step Undo/Redo.
4. Slow a workspace read, edit during the wait, release the response: edit/dirty
   badge/history/Save preview must survive. Repeat for cleared preferences and a
   catalogue read; not-yet-loaded preferences must wait instead of guessing empty.

A real persistence test requires a separately authorized disposable database.
After recorded runtime/browser gates pass, close these packages. Stronger/full-auto
or role-aware teaching is next design work in the long-term roadmap; there is no
predefined M43.4 scope to implement without further product definition.

Individual reports: `WORKSPACE_BULK_SELECTION_INTEGRITY_REPORT.md`,
`WORKSPACE_ACTIVE_REQUIREMENT_VALIDATION_REPORT.md`, `WORKSPACE_TEACHER_PREVIEW_REPORT.md`,
`WORKSPACE_ASYNC_READ_INTEGRITY_REPORT.md`. Canonical diary and current roadmap:
`AGENTS.md`, `MAC_CONTINUATION.md` section 30 and final chronological entries.
