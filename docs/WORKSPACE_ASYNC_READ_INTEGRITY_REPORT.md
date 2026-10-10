# Workspace asynchronous read integrity

11 October 2026 (Europe/Istanbul). **CODE GATE PASS — BROWSER ACCEPTANCE PENDING.**

## Selection, source and reproduction

Run baseline `24101f6`, package baseline `fe074099f955713d76ca84836044c31202c6b735`,
branch `feat/overnight-workspace-integrity`. This is the existing snapshot/working
copy/history separation and safe Save contract (user priorities 1/2/4).
M42/M43.3 remain CLOSED / PASS; no M43.4 number or new solver feature is invented.

The Program loader always installed a new working copy after asynchronous reads.
A local edit made while those reads were pending (for example after Save's broad
refresh starts) could disappear along with its history. Testing only the React
workspaceDirty flag when a request starts cannot protect later edits.

The same risk existed in catalogue hydration: every read reset local preferences
while leaving their undo operation intact, and rewrote catalogue before-values.
This could remove a pending Save change or make Undo/Redo disagree with the copy.

The old loader behavior was extracted unchanged into the now-tested production
refresh helper. Eight reproductions failed before correction: four deferred-read
edit types, missing/mismatched incoming workspace, two preference editing/clearing
cases and in-place catalogue baseline rebase. An initial array test-table setup
error was corrected before counting those eight genuine failures.

## Correction and acceptance criteria

- At response installation, compute the real diff against the current snapshot,
  using current refs, after all reads and before changing overview/board/refs.
- When dirty, keep the exact original snapshot/copy/history, including original
  revision/hash and pending history. Do not install different/missing incoming
  data. Display a Turkish preservation message. No automatic merge or stale
  before-state bypass; later Save still uses the original RPC stale guards.
- When clean and incoming snapshot/board match, install fresh copy/empty history
  as before; clean unavailable/mismatched data stays unavailable.
- Capture each catalogue row once per working-copy baseline. The initialized
  preference entry records that capture; repeated reads cannot replace local
  preferences or catalogue before-values. Fresh copies may capture new server
  values; previously unseen inactive rows still hydrate normally.
- UI preference edits wait until the course's real preference inputs are loaded.
  Missing input is not a known empty preference. Loaded empty arrays remain valid;
  edit preparation deduplicates/sorts without mutating caller input arrays.

Fifteen focused tests verify these criteria: deferred promises are completed only
after actual commands alter the copy/history; surviving Save payloads retain old
identity. Undo clears diff; Redo restores it. Preference payloads retain exact
original before/edited after, including explicit clearing. Repeated server row
changes cannot silently rebase; a fresh matching snapshot/copy can capture them.

## Verification, review and performance

Container Node 24.19.0 / Next 16.3.4, not canonical Node 24.21.0.

- Refresh focused 15/15; ten-file focused 156/156 PASS.
- Final full suite: 42 files / 386 tests PASS; one opt-in benchmark skipped.
- Frozen reference equivalence 43/43 (320 seeded comparisons); preview isolation
  2/2 PASS. TypeScript and diff check PASS.
- Changed modules/tests lint: 0 errors, 1 unchanged unused baselineResourceLifecycle
  warning. **Whole management page lint is not PASS:** original and final each
  have 42 errors/8 warnings. Unchanged-line SequenceMatcher mapping compared rule,
  severity, node type, position and message first line: zero new diagnostics.
  Existing React refs/hook lint debt was not hidden or broadly rewritten.
- Manual review: guard runs synchronously immediately before installing loaded
  state; server board/overview are untouched on preserve. No per-slot pipeline,
  command transaction, DB/RPC/migration/dependency contract changed.
- Isolated production build 9/9 PASS:
  `/workspace/partisyon-overnight-refresh-build-fe07409`,
  Build ID `rGM8I4IPSVjZ-T8Lbbmer`. Changed runtime files byte-match built source.
- Separate local timed production smoke, port 3003: `/`, `/yonetim`, manifest
  HTTP 200 with expected content. Timer shut down the smoke process. This was
  anonymous HTTP evidence, not authenticated browser functional acceptance.

Measured validation/commands/candidates SHA256 match the second package's drag
benchmark on final source. The added diff runs once at read installation;
hydration/preference preparation is outside the drag hot path. Its identical
full-candidate result/performance evidence remains applicable; no AWS/browser
latency claim follows. No additional per-slot work was added.

## Checkpoint, limitations and next step

Implementation `5791e09` (`fix: preserve local edits across asynchronous workspace reads`),
feature push and remote equality verified. Documentation checkpoint follows.
Existing canonical AWS release/service/backup/stash/systemd state untouched.
AWS/browser NOT RUN: empty profiles/no SSH/browser tool, HTTP proxy 403. No
production Save, DB changes/migration, deployment, main merge or AWS restart.

Local edits remain in memory; this does not add durable crash/reload recovery.
A truly stale server revision still requires explicit conflict resolution or
Undo and refresh; the patch intentionally does not rebase or bypass stale checks.
The captured row's server changes are picked up only in a fresh working copy.

Minimal browser acceptance on an isolated authenticated disposable environment:
slow a workspace refresh request, make a local move/pin/preference edit while it
is pending, release the request and verify the exact edit, dirty badge, Undo/Redo
and Save preview survive. Repeat after an isolated authorized Save refresh, and
with a repeated catalogue read/cleared preference. Verify not-yet-loaded preferences
cannot be edited and become editable after hydration. No Save to real school data.

This completes four bounded code/build packages. The next gate is their actual
browser/runtime acceptance; larger generator/team-teaching work has no defined
new numbered implementation scope in the current roadmap.
