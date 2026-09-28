# Partisyon — Teacher Assignment Policy / Solver-Ready Design

Date: 2026-09-28
Status: architecture decision record / implementation plan

## 1. Why the current model is insufficient

The current model has two concepts:

- `course_requirements.teacher_mode`: `FIXED | ELIGIBLE_POOL | UNKNOWN`
- `course_requirement_teachers`: eligible teacher identities for a requirement

This answers **who may teach** but not **at what scope the choice is made**.

Today `ELIGIBLE_POOL` therefore carries two incompatible meanings:

1. choose one teacher from the pool for the whole course/section;
2. choose a teacher independently for each weekly block.

These are different scheduling problems.

Examples confirmed in the active draft:

- 10A / 10B Mathematics: one section + one subject should keep one teacher across all weekly blocks.
- Ballet and Solfege: different weekly blocks may legitimately use different teachers.
- A single-teacher `FIXED` requirement is unaffected by this distinction until its pool is widened.

## 2. External-system findings

### FET

FET official mode does not allocate a teacher from a qualified pool. Each activity normally has an exact teacher. Teacher allocation is treated as a separate planning problem (block planning / custom allocation modes).

Implication for Partisyon:
- teacher eligibility and teacher allocation are distinct concerns;
- a solver-ready model must represent the teacher assignment decision explicitly.

References:
- https://lalescu.ro/liviu/fet/forum/index.php?topic=6791.0
- https://lalescu.ro/liviu/fet/forum/index.php?topic=5926.0
- https://lalescu.ro/liviu/fet/forum/index.php?topic=4274.0

### aSc TimeTables

aSc can express teacher/student relationships such as keeping the same teacher across courses, while also supporting course/section structures where allocation is more flexible.

Implication:
- “same teacher” should be an explicit relationship/policy, not inferred merely from pool size.

Reference:
- https://www.help.asctimetables.com/text.php?id=1274&lang=en

### UniTime

UniTime separates feasibility checking, optimization, interactive suggestions and commit. Its Suggestions view explains conflicts created by alternative placements before applying them.

Implication:
- Partisyon should move toward Validate → Feasibility → Optimize → Explain → Human Review → Commit.
- assistant options must report downstream impact, not only “directly applicable”.

Reference:
- https://help.unitime.org/manuals/courses-solver

### Timefold

Timefold models timetable quality with hard and soft constraints. Teacher/room/student conflicts are hard; stability, gaps and similar preferences may be soft.

Implication:
- Partisyon needs explicit hard/soft preference semantics before full automation.

Reference:
- https://docs.timefold.ai/timefold-solver/1.x/quickstart/shared/school-timetabling/school-timetabling-constraints

### Bilsa / Turkish school workflow

Bilsa publicly describes automatic timetable generation using teacher load and class time constraints, with centralized data exchange and e-Okul integration.

Implication:
- e-Okul should be an import/export boundary, not Partisyon's internal domain model.
- teacher load and administrative constraints must become first-class solver inputs.

Reference:
- https://www.bilsa.com.tr/urunlerimiz/windows/haftalik-ders-dagitim/index.html
- https://www.bilsa.com.tr/urunlerimiz/okulsis/haftalik-ders-dagitim/

## 3. Preserve the existing core model

The following parts are structurally sound and should remain:

### course_requirements
Curriculum-level demand:
- subject
- instructional group
- weekly load
- allowed/preferred partition
- day/block structural limits
- teacher eligibility mode
- room eligibility mode

### schedule_cards
One generated weekly block of a requirement:
- block index
- duration
- lock state

### placements
Concrete timetable decision for a block:
- day / start
- teacher
- room

This Requirement → Card → Placement hierarchy is already appropriate for a solver.

## 4. Separate teacher eligibility from teacher allocation policy

Keep:

```
teacher_mode
  FIXED
  ELIGIBLE_POOL
  UNKNOWN
```

Meaning:
- FIXED: eligibility has one resolved teacher.
- ELIGIBLE_POOL: more than one teacher is eligible.
- UNKNOWN: teacher identity is not yet resolved.

Add two independent policy dimensions:

```
teacher_assignment_scope
  REQUIREMENT
  BLOCK
  UNSPECIFIED
```

```
teacher_continuity
  REQUIRED
  PREFERRED
  NONE
```

Valid intended combinations:

| assignment scope | continuity | meaning |
|---|---|---|
| REQUIREMENT | REQUIRED | choose once, use on every block |
| BLOCK | PREFERRED | blocks may differ, solver prefers continuity |
| BLOCK | NONE | each block independent |
| UNSPECIFIED | NONE | legacy/manual-compatible state; full-auto readiness warning |

The first implementation should not allow invalid combinations such as REQUIREMENT + NONE.

## 5. Examples

### 10A Mathematics

```
teacher_mode = ELIGIBLE_POOL
teacher_assignment_scope = REQUIREMENT
teacher_continuity = REQUIRED
```

Teacher becomes a requirement-level solver variable. All cards share it.

### Solfege / Ballet flexible blocks

```
teacher_mode = ELIGIBLE_POOL
teacher_assignment_scope = BLOCK
teacher_continuity = NONE
```

Each card may choose independently from the eligible pool.

A later school may choose:

```
teacher_assignment_scope = BLOCK
teacher_continuity = PREFERRED
```

to permit exceptions while minimizing teacher changes.

### One fixed teacher

```
teacher_mode = FIXED
teacher_assignment_scope = REQUIREMENT
teacher_continuity = REQUIRED
```

This matches current behavior naturally.

## 6. Existing active-draft evidence

The M32.3 diagnostic found 14 requirements with multiple resolved teachers.

Two are clear policy violations under the new model:
- 10A Mathematics
- 10B Mathematics

The remaining current multi-teacher cases are arts/music flexibility evidence:
- Improvisation
- Pointe/Dance Technique
- Classical Ballet
- Dance Technique
- Pilates
- Solfege
- shared/parallel ballet structures

The migration must therefore not globally enforce one teacher per requirement.

## 7. Migration strategy

### M32.3A — policy foundation

Safe, additive, no scheduling behavior change.

- add `teacher_assignment_scope`
- add `teacher_continuity`
- backfill only unambiguous states
- preserve current placements
- preserve candidate rows
- expose an audit function for:
  - REQUIRED continuity violations
  - UNSPECIFIED multi-teacher / multi-block requirements
  - flexible requirements currently using multiple teachers

No hard placement trigger yet.

### M32.3B — policy editor and health gate

Management Course Plan gains explicit teacher policy controls.

Policy changes:
- preview impact first
- cannot silently rewrite placed teachers
- if REQUIRED is selected while placements disagree, show the violating blocks and require reconciliation

Program Status gains:
- teacher-policy violations
- unspecified assignment policies that block full-auto readiness

### M32.3C — candidate engine enforcement

For `REQUIREMENT + REQUIRED`:
- before any resolved placement: full eligible pool remains available
- after exactly one teacher has been chosen: remaining cards only admit that teacher
- if existing placements disagree: candidate engine reports policy violation; it does not choose a winner

For `BLOCK + NONE`:
- current per-block behavior remains.

For `BLOCK + PREFERRED`:
- all candidates remain valid;
- assistant/solver records a soft penalty when changing teacher.

### M32.3D — placement-resource override semantics

M29 teacher override must become policy-aware:

- REQUIREMENT + REQUIRED:
  - changing one block to another teacher is not a valid isolated operation;
  - UI should offer “change teacher for the whole course” with preview.
- BLOCK:
  - per-block teacher override remains valid.
- Room override remains block-scoped unless a future room-continuity policy says otherwise.

## 8. Full-auto solver model

Future solver variables:

```
Teacher(requirement)  # REQUIREMENT scope
Teacher(card)         # BLOCK scope
Time(card)
Room(card)
```

Hard constraints:
- teacher double-booking
- student/group overlap
- room overlap
- block footprint
- lunch/day boundaries
- REQUIRED teacher continuity
- legally unavailable teacher times
- fixed/pinned decisions
- mandatory room capability

Soft objectives:
- PREFERRED teacher continuity
- teacher gaps
- teacher target load balance
- subject time-of-day preferences
- room stability
- balanced difficult-subject distribution
- preferred days/times
- minimizing changes from an accepted draft

No “best” label should be shown without explainable metrics.

## 9. Teacher load model needed for automation

Teacher eligibility is not enough.

Future teacher planning inputs should distinguish:

```
minimum_load
target_load
maximum_load
```

plus:
- branch/qualification
- unavailable times
- legal/administrative leave
- preferred times
- preferred free day
- gap limits/preferences

Maximum/unavailability may be hard.
Target load and gap minimization are optimization objectives.

## 10. Pinning / manual authority

The current card-level `locked` flag is too coarse for future automation.

Target pin model:

```
TIME
TEACHER
ROOM
STRUCTURE
```

A human must be able to say:
- keep this time, optimize teacher/room;
- keep this teacher, optimize time/room;
- keep this room, optimize time/teacher;
- keep this whole placement.

Full-auto must respect pins.

## 11. Assistant evolution

The assistant should rank by explainable impact, not by “one exact resource combination”.

Per option, eventually show:
- feasible teacher/room combination count
- teacher-policy effect
- number of other cards whose domains shrink
- number of cards made forced
- number of cards made contradictory
- teacher gap/load effect
- pedagogical preference effect
- changed-from-current penalty

Example:

```
Monday · Period 6
4 valid teacher/room combinations
Teacher policy: flexible
Other-card domain loss: 3
Teacher-gap penalty: +1
Pedagogical preference: neutral
```

Directly applicable != best.

## 12. Team teaching is a separate future problem

Current `placements.teacher_id` supports one primary teacher per card.

Do not overload teacher_assignment_scope to model:
- co-teacher
- accompanist
- assistant
- multiple simultaneous teachers

Future extension should use role-aware staff assignments, e.g.:

```
placement_staff
  placement_id
  role
  teacher_id
```

and requirement-level role policies.

This is deliberately outside M32.3A so the present timetable can evolve without a large destructive rewrite.

## 13. Automation readiness gate

Partisyon should eventually refuse **full-auto generation**, not ordinary manual editing, when unresolved policy questions remain.

Example blockers:
- ELIGIBLE_POOL + multiple cards + assignment scope UNSPECIFIED
- REQUIRED continuity but existing placements use multiple teachers
- missing teacher eligibility
- hard room requirement with no eligible room

Manual mode remains available with warnings.

## 14. Immediate implementation order

1. Replace the rejected M32.3 continuity migration with additive policy foundation.
2. Add read-only policy audit.
3. Push/validate schema without changing placements.
4. Expose policy in Course Plan UI.
5. Classify current ambiguous requirements.
6. Reconcile 10A/10B Mathematics explicitly.
7. Only then make candidate generation policy-aware.
8. Add forward-impact metrics to Placement Assistant.
9. Build solver-readiness checks.
10. Prototype full-auto solver against an immutable draft snapshot.

