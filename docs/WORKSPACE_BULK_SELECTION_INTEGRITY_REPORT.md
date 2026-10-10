# Workspace bulk resource selection integrity

11 October 2026 (Europe/Istanbul). **CODE GATE PASS — BROWSER ACCEPTANCE PENDING.**

## Selection and safety

Baseline `24101f6e96914a32097965a4e1cb6f498244536a`, accepted canonical branch
`feat/m42-pin-resource-acceptance`; overnight branch `feat/overnight-workspace-integrity`.
M42 and M43.3 remain CLOSED / PASS. Roadmap section 30 has no defined M43.4.
The user's priority 1/2 and existing grouped-card atomicy contract select this
reproduced defect before new features; no milestone number is introduced.

Initial local HEAD `98307f5`, clean tree, one worktree, no stash. Fetched/reviewed
the newer `24101f6` acceptance and created the new branch from that exact commit.
No reset/clean/force/main merge. AWS backup/stash/release/systemd assets untouched.

## Problem, correction and acceptance criteria

The planner discarded unknown requested IDs and skipped requested cards without
a complete placement. A stale combined selection could therefore change only
its surviving cards while claiming success. A missing placement entry could
also cause an unrelated diff exception before a useful preview was returned.

- Keep the full deduplicated requested selection, including absent card IDs.
- Validate every requested card/placement before generating commands.
- If one requested member is missing/unplaced/partial, block the whole edit and
  return zero commands. The UI already checks canApply before execution; even
  executing the blocked plan cannot mutate any subset or local history.
- Preserve requirement-wide teacher expansion, valid selection behavior,
  duplicate handling and members already assigned the chosen resource.
- Include absent requested IDs in the deterministic preview token; removing
  them changes the token. Explain CARD_NOT_FOUND/CARD_NOT_PLACED in Turkish.

Five new reproductions failed at baseline. After correction all six added
regressions pass, alongside existing pin/continuity/conflict/Undo/Redo/Save tests.
No business constraint, RPC, migration, dependency or persistence format changed.

## Verification

Container Node 24.19.0 / Next 16.3.4, not canonical Node 24.21.0.

- Resource focused file: 21/21 PASS.
- Six-file focused regression: 109/109 PASS.
- Full suite: 41 files / 356 tests PASS; one opt-in benchmark intentionally skipped.
- Frozen reference equivalence: 43/43 PASS (320 seeded EDIT/COMMIT comparisons).
- Frozen preview isolation/actual active-day comparisons: 2/2 PASS.
- TypeScript `npx tsc --noEmit`, targeted ESLint and `git diff --check`: PASS.
- Isolated production build: PASS, 9/9 pages, directory
  `/workspace/partisyon-overnight-selection-build-24101f6`,
  Build ID `iYDGrPB2fDxKnrewnYOZ4`.
- Manual source/diff review: scoped selection guard and translations, no
  change to execution/history transaction mechanics. Blocked plans are harmless.

M43.3 validation/commands/candidates runtime files are unchanged by this package.
Added work is linear in selected cards and runs only for resource-edit preview;
there is no additional per-slot drag work. No benchmark claim is fabricated.

## Checkpoint, limits and next work

Implementation `b1e5200` (`fix: reject partial bulk resource selections`), pushed
on the overnight feature branch and remote HEAD equality verified. Documentation
checkpoint is the subsequent branch tip. No unrelated tracked/untracked files.

AWS credentials/config sections are empty; no SSH identity, no callable AWS or
browser tool. Read-only canonical HTTP probe returned platform proxy 403.
AWS testing and authenticated browser acceptance: NOT RUN. No deploy/DB Save,
service restart, migration or production mutation. Current M42 runtime acceptance
is the prior user's canonical record, not a test performed during this run.

Execution incident: one build command mistakenly used the local checkout cwd
rather than its prepared export. It completed and renewed local ignored `.next`
and generated ignored PWA output; no tracked side effects. The validation build
then ran successfully in the separate directory above. AWS was inaccessible and
unaffected; local servers were not restarted. Further build commands explicitly
assert their isolated cwd. This report does not claim the local source `.next`
was preserved.

Minimal later browser check, using an isolated authenticated release and no
production Save: open a multi-card resource preview, remove one selected member
locally, then attempt apply. It must reject or require reselection, preserve all
remaining assignments and history; complete selections must still apply/undo
as one batch. Canonical port 3000 must remain on its accepted release.

Next independent investigation: local ACTIVE/INACTIVE requirement aggregate
rules at Save and teacher-policy previews after local structural card creation.
Those have not been declared accepted or implemented in this checkpoint.
