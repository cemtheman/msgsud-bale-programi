# Partisyon — M33 Solver Foundation

M33 does not solve or mutate the timetable. It creates the deterministic input contract for a future solver.

## Separation

- Hard inputs define feasibility.
- Current placements are a baseline for change cost, not ground truth.
- Soft objectives are explicit human-configured weights.
- Solver output will be a later layer.

## Snapshot contents

The snapshot contains active requirements, cards, group relations, teacher/room planning pools, resource operational state, teacher assignment policy, structural requirement rules, locked cards, and current placements as `baselinePlacements`.

`schedule_card_candidate_assessments` are deliberately excluded. Those rows are occupancy-relative to the current program, so using them as global solver truth would incorrectly freeze alternatives that become possible when other cards move.

## Hard contract

Declared hard rules include day bounds, lunch-boundary crossing, teacher/room/group overlap, locked-card pins, REQUIRED teacher continuity, and declared `min_distinct_days`, `max_blocks_per_day`, and `max_consecutive_periods`.

`hardInputReady` only means the input model is coherent enough for a solver prototype; it is not a feasibility proof.

## Soft objectives

Supported objective keys are `changeCost`, `preferredTeacherContinuity`, `teacherIdleGaps`, and `roomStability`. Weights are 0..1000.

`teacherLoadBalance` and `subjectTimePreference` are reserved but cannot be enabled until explicit teacher-load targets and subject time preferences exist.

No objective profile is implicitly selected and no hidden default ranking exists. An ACTIVE profile needs at least one positive supported objective.

## Immutable capture

`management_capture_solver_snapshot()` stores an append-only application snapshot with deterministic snapshot/baseline hashes. Repeating a capture for identical input reuses the same revision+hash row.

## Planned flow

Validate → Feasibility → Optimize → Explain → Human Review → Commit

The snapshot contract is solver-library agnostic.


## M33.0.1 provisional room readiness

M33 originally treated every `resource_mode=UNKNOWN` requirement as a hard
solver-input blocker. That contradicted the established M22 resource model:
unknown room identity is schedulable as `PROVISIONAL_UNKNOWN`; it is not the
same thing as an absent or unavailable room.

The corrected readiness contract therefore keeps UNKNOWN room strategy inside
the snapshot as an explicit provisional input warning. It does not rewrite the
requirement to FIXED/ELIGIBLE_POOL and it does not infer room eligibility from a
single observed baseline room.

Hard readiness is blocked only by genuinely contradictory or unavailable input.
The snapshot exposes provisional counts separately so solver output can retain
and explain unresolved room identity.
