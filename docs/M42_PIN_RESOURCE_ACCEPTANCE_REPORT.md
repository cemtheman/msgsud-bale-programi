# M42 — Pin / local resource acceptance hardening

Date: 11 October 2026, Europe/Istanbul.

**Current M42 status: CLOSED / PASS.** Final canonical acceptance checkpoint
`24101f6` supersedes every PENDING/NOT RUN label in the historical engineering
report below. AWS full suite 350/350, equivalence 43/43, TypeScript/build 9/9,
browser functional 5/5 and Save / Reload / Restore / Reload PASS. Promoted release
`/home/ubuntu/partisyon-m42-acceptance`, Build ID `FWDpU_8fSNVyi-jkEaLdP`,
`msgsud-dev.service` port 3000 active / HTTP 200; temporary port 3001 inactive.
M43.3 remains CLOSED / PASS. This canonical result was supplied/recorded after
the original isolated run; overnight Codex did not independently repeat it.

## Historical engineering report before final AWS/browser acceptance

**CODE GATE PASS — BROWSER ACCEPTANCE PENDING.**
This does not close full M42 acceptance or reopen M43.3.

## Selection and starting state

The roadmap in `MAC_CONTINUATION.md` section 30 defines teacher inputs, load
objectives, subject time preferences and fine-grained pins before stronger
generation. Later records close the load/provenance and time-preference work.
M42 foundation and local pin code gates passed, and the two notice defects were
accepted on AWS on 9 October. Teacher/room pin paths, linked cards, Undo/Redo,
Save/reload and baseline restoration remain explicitly unaccepted.

`M43.4 planning` is the only M43.4 mention at starting HEAD; there is no scope,
implementation contract or acceptance definition. The next suitable bounded
engineering package is therefore the existing M42 pin/resource acceptance
chain, with corrections based on reproduced defects, not a new M43.4 feature.

- Starting remote feature HEAD: `4552528737e5c43b8a08cbdcc9ecf8ea3fe12352`.
- Implementation: `9aafec4ada6674c43fe06c5aab317064e1c549a7`.
- Follow-up branch: `feat/m42-pin-resource-acceptance`, created from that exact HEAD.
- Implementation push and remote HEAD equality: verified through native Git.
- Final documentation checkpoint: branch tip; obtain its exact SHA with
  `git rev-parse HEAD` or `git ls-remote origin refs/heads/feat/m42-pin-resource-acceptance`.
- Initial container checkout: branch `work`, `84be062`; clean tracked/untracked
  status, one worktree, no stashes. Dependencies/lockfile unchanged between the
  original checkout and `4552528`. Existing local servers/build outputs were
  identified; no build was run in their `.next` directory.
- AWS canonical source remains `6dd5dff`, accepted documentation `4552528`,
  release `/home/ubuntu/partisyon-m43-build-6dd5dff`, service `msgsud-dev.service`,
  port 3000, Build ID `nND5t_DJLmV8WUnxUYhon`.

M43.3 CLOSED / PASS is established by the later canonical acceptance/promotion
records and the user's explicit port-3000 drag confirmation in this request.
Earlier PENDING/BLOCKED records describe the 10 October isolated run only.

## Reproduced defects and corrections

1. Resource edit expansion read teacher policy from the immutable snapshot.
   With an unsaved REQUIREMENT/REQUIRED -> BLOCK/NONE edit, it incorrectly
   changed siblings and rejected a valid edit because a sibling teacher was
   pinned. With the reverse local edit, it omitted required sibling changes.
   Expansion now reads the current working-copy policy and card membership.
   Unsaved structural cards are included rather than silently ignored.
2. The validator used local policy for per-card checks but snapshot policy for
   requirement-wide continuity. A BLOCK -> REQUIRED edit could therefore let
   a direct command/commit preparation accept divergent teachers, while the
   reverse edit was incorrectly blocked. Requirement-wide continuity now uses
   the same current local policy. No conflict or pin rule was relaxed.
3. Resource preview tokens only captured placements. Pin/policy changes without
   a move reused the old token. The ephemeral V2 token also captures card
   identity/duration/full lock, all pin dimensions and current scope/continuity.
   It remains deterministic; Undo to the same state restores the same token.
   Existing UI apply paths regenerate the preview and compare the token before
   executing; they still revalidate the complete batch.
4. Inspector/bulk preview translations lacked local pin/full-lock issue codes.
   They now explain the affected dimension and tell the user which sabitleme or
   kilit to remove, instead of rendering a raw backend-style code.

Initial new reproduction tests failed **3/3** against the starting source.
After the expansion correction, the flexible-policy test still failed; that
isolated the independent validator defect. Both causes were corrected.
Initial test-only API/readonly-fixture errors were fixed without weakening
expectations. Production dependencies, migrations and DB RPC contracts did not
change.

## Acceptance criteria and evidence

| Criterion | Result |
| --- | --- |
| Unsaved BLOCK policy edits only the requested card, preserving pinned sibling | PASS |
| Unsaved REQUIRED policy expands all placed siblings; pinned member rejects the entire batch | PASS |
| Direct command and COMMIT preparation reject newly introduced teacher continuity violations | PASS |
| Pin/policy changes invalidate the resource preview without requiring a move | PASS |
| Selected multi-card room edit fails atomically on a pinned member, without changing copy/history | PASS |
| Teacher/room pins still allow a time move preserving those resource identities | PASS |
| Unpin -> requirement-wide edit -> one-step batch Undo/Redo works | PASS |
| Undo to baseline clears diff and yields no Save payload | PASS |
| Redo yields one v13 payload with exact placement/pin before/after and original snapshot hash | PASS |
| Simulated saved snapshot rebases to clean local state | PASS, unit simulation only |
| Locally created structural cards join the same requirement-wide edit | PASS |
| Pin/full-lock preview errors use actionable Turkish copy | PASS |
| Actual authenticated AWS/browser Save/reload/pin acceptance | NOT RUN / PENDING |

Validation in the isolated Codex container (Node **24.19.0**, Next **16.3.4**):

- Resource regression file: **15/15 PASS**, including **11 new tests**.
- Focused nine-file gate: **141/141 PASS**.
- Full suite: **41 files / 350 tests PASS**; one opt-in benchmark file/test
  intentionally skipped, not counted as a pass.
- M43 frozen-reference equivalence: **43/43 PASS**, including 320 seeded
  EDIT/COMMIT comparisons. Frozen reference modules were not modified. The
  intentional local-policy semantic correction is covered separately by the
  new tests; equivalence is claimed for the existing corpus, not every policy edit.
- Frozen preview isolation/active-day candidate comparisons: **2/2 PASS**.
- `npx tsc --noEmit`: **PASS** on final source/tests.
- Targeted ESLint: zero errors, one pre-existing unused `cards` variable warning
  in the validator; unrelated cleanup was not added.
- `git diff --check`: **PASS**.
- Isolated `npm run build`: **PASS**, TypeScript/PWA, **9/9 static pages**.
  Directory `/workspace/partisyon-pin-policy-build-4552528`, Build ID
  `AoHAFZVV8fCLqjxqQkqdz`. All changed runtime modules were byte-compared against
  the built source after final validation.
- Isolated production server, port 3002: `/`, `/yonetim` and
  `/manifest.webmanifest` returned **HTTP 200** with expected Partisyon/MSGSÜ
  content. Anonymous rendering is not authenticated management acceptance.

## M43.3 performance preservation

Accepted `4552528` validation/commands/candidates were exported with `git show`.
Only their mutual imports were redirected to those exported modules. They and
the corrected code ran in the same Vitest process against identical existing
`schoolSnapshot(517)` fixtures, active day 5, all 12 period assessments. Full
candidate results were strictly equal before timing. No internal profiler or
timing assertions were enabled. Each scenario used 10 warmups and 50 measured
samples per implementation, alternating execution order. This independent
opt-in comparison completed **1/1 PASS**.

Linux x64, Node 24.19.0, AMD EPYC 9V74, five exposed logical CPUs. Synthetic
fixture, not real draft data, AWS t3.small or browser frames. Do not compare its
absolute times with the earlier Intel container or AWS measurements.

| Complete drag candidate pipeline | Accepted median/p95 ms | Corrected median/p95 ms |
| --- | --- | --- |
| Single | 48.79 / 55.61 | 49.95 / 55.33 |
| Multi-period | 47.11 / 51.96 | 47.89 / 53.99 |
| Parallel | 47.26 / 50.29 | 47.83 / 49.99 |
| Dense slot | 63.70 / 71.84 | 64.33 / 74.19 |

Median differences are approximately **+1.0% to +2.4%**; no material loss of the
accepted optimization was observed in this experiment. No timing SLA or browser
claim follows from these samples. The slot index, malformed-index fallback,
issue-key Set, per-requirement placement index, placement-only preview copy,
baseline reuse and active-day restriction remain intact.

Raw samples, method, environment, exact baseline/implementation commits and
runtime SHA256 fingerprints: `M42_PIN_RESOURCE_BENCHMARK.json`.
Temporary accepted modules, benchmark driver/config and output are retained
outside the checkout at `/workspace/partisyon-run-artifacts`. The existing
versioned M43 benchmark remains available for comparisons to its pre-M43 oracle.

## Runtime limits and safe next step

There is no callable AWS/browser connector, SSH identity/Tailscale client or
usable AWS credential profile in this container. Available AWS config/credentials
files were checked for section/field names only and were empty. Read-only HTTP
to the recorded canonical Tailscale endpoint returned proxy **403 Forbidden**.
No EC2 command, service restart, migration, production DB write, main merge or
deployment occurred. The previous AWS stash, backup directory, validation backup,
promoted release and systemd rollback configuration were not accessed or changed.

Remaining M42 browser acceptance requires an authenticated, canonical session:

1. Prepare this feature in a separate release; retain the current port 3000
   release/service/rollback and inspect canonical dirty tree/stashes before any
   checkout update. Do not blindly pull in `/home/ubuntu/msgsud-bale-programi`.
2. Confirm teacher/room pins block selected and linked/bulk changes, and the
   translated reason names the pinned dimension. Check time moves preserving
   pinned resources, plus the two directions of unsaved teacher-policy edits.
3. Exercise unpin -> linked teacher edit -> multi-step Undo/Redo. Verify no DB
   persistence before Save and no fall-through to legacy server history.
4. In a separately authorized controlled persistence test, Save once, reload,
   verify pins/resources together and restore the approved baseline. The current
   run did not perform or authorize production acceptance writes.
5. Record the actual AWS/browser result. Only then close full M42 acceptance and
   define the next roadmap engineering scope. M43.3 remains CLOSED / PASS.

Final decision: **CODE GATE PASS — BROWSER ACCEPTANCE PENDING**.
