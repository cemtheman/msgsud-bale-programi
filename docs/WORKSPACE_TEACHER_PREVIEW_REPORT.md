# Workspace current-local teacher previews and reconciliation

11 October 2026 (Europe/Istanbul). **CODE GATE PASS — BROWSER ACCEPTANCE PENDING.**

## Selection and source

Run baseline `24101f6`, package baseline `8f312673ab6ec8f8bec8ef7d05ee255bd1d77c2b`,
branch `feat/overnight-workspace-integrity`. M42/M43.3 stay CLOSED / PASS.
Local cards are authoritative during unsaved structural edits under the existing
Management Workspace contract. Policy/reconciliation planners violated that
contract; this is an existing feature repair (user priorities 2/3/4), not M43.4.

## Reproductions and changes

Ten newly added tests failed against the package baseline:

- A locally created third block with a different teacher was omitted from the
  policy count; REQUIREMENT/REQUIRED falsely appeared applicable.
- Single/coordinated reconciliation ignored that same new block, producing a
  false NO_CHANGES result or incomplete assignment summaries.
- Structure growth did not change either preview token.
- Hydrated/locally activated courses absent from the snapshot threw not-found
  errors in policy and reconciliation despite valid local placements.
- Unsaved teacher names were replaced by snapshot labels in policy summaries.
- Teacher-pin changes left reconciliation tokens unchanged.
- Conflicts against new local cards lacked course/group details; coordinated
  conflicts could name the current teacher instead of the proposed final teacher.

Both planners now enumerate cardsById and the current requirement catalogue.
Policy uses local teacher inventory names. Reconciliation command construction,
counts, placement summaries and conflict metadata use the same local graph.
Coordinated teacher conflict attribution consults the proposed command batch.

Ephemeral V2 tokens capture deterministic current card identity/block/duration,
lock/pins/placement, requirement lifecycle and effective policy; reconciliation
also captures target existence/status and teacher pool. JSON encoding prevents
ambiguous nested separators. Tokens are not a persisted schema or RPC change.
Apply handlers already regenerate, compare and then validate the complete batch;
external occupancy is still checked there, not frozen into a token.

Acceptance criteria verified in tests:

- Every local placed block contributes to policy and reconciliation previews.
- Divergent teachers correctly block REQUIRED policy; reconciliation makes it
  applicable when all local blocks are assigned the same eligible teacher.
- Single/coordinated paths include new and hydrated-course blocks.
- Successful reconciliation preserves time/room and supports one-step batch
  Undo/Redo; a subsequent policy edit yields one structure + three placements +
  policy in a single commit payload with original snapshot identity.
- Structure growth changes tokens; Undo restores the original exact token.
- Teacher pin changes invalidate reconciliation and prevent application.
- Local names/course metadata and proposed-teacher conflict details are accurate.
- Conflict rejection preserves copy/history; existing policy-combination and
  eligibility/teacher-room-group/pin/parallel constraints remain intact.

## Verification and checkpoint

- Teacher focused 15/15; nine-file focused 155/155 PASS.
- Full suite 41 files / 371 tests PASS; one opt-in benchmark skipped.
- Frozen equivalence 43/43 (320 seeded comparisons); preview isolation 2/2 PASS.
- Final TypeScript, targeted ESLint and diff check PASS.
- Test-only fixture string-union typing was repaired; a UUID ordering assumption
  was replaced by unordered conflict membership verification. Scoped checks and
  build then passed; expectations were not weakened about teacher identity.
- Isolated production build 9/9 PASS, Node 24.19 / Next 16.3.4:
  `/workspace/partisyon-overnight-teacher-build-8f31267`,
  Build ID `Ucjq7c-GPQGtr7I4RtPOQ`. Changed runtime modules matched built source.
- Manual review confirmed only preview/planning metadata and local graph sources
  changed; batch transaction/history/Save/RPC/migrations/dependencies untouched.
- Implementation `3abab3f` (`fix: include local cards in teacher policy and reconciliation previews`),
  feature push and remote equality verified. Documentation checkpoint follows.

This package does not run in the per-slot drag path. Validation, commands and
candidates SHA256 exactly match the second package's benchmarked versions.
Its same-environment median/p95 evidence therefore applies to the unchanged
pipeline; no new speedup, AWS timing or browser profiling claim is made.

## Runtime limits, risks and next action

AWS/browser NOT RUN: no usable profile/SSH/browser tool, canonical HTTP proxy 403.
No deployment, production Save/DB writes, migration, main merge or service restart.
The current canonical release remains the user's accepted M42 record.

Smallest authenticated browser check on an isolated disposable workspace:
increase an unplaced course's block count, place the new block with a different
teacher, inspect REQUIRED policy blocker, reconcile all blocks, then Undo/Redo.
Repeat for an initially inactive course; verify complete counts/conflict names and
pin invalidation. Do not Save to real school data. Real persistence acceptance
requires a separately authorized disposable environment.

Next independent investigation: asynchronous workspace/catalogue reads may apply
late results over newer unsaved edits. If reproduced, repair that boundary with
its own code gate/checkpoint; no stronger-generation package is yet specified.
