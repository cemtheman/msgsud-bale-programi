import { describe, expect, it } from 'vitest';

import type {
  ManagementSolverWorkspace,
} from '@/lib/managementSolver';
import type {
  ManagementOptimizationResult,
} from '@/lib/managementSolverPrototype';
import {
  prepareManagementSolverProposalApply,
} from '@/lib/managementSolverProposal';

function workspace(): ManagementSolverWorkspace {
  return {
    revisionId: 'revision-1',
    requirementSetId: 'set-1',
    activeProfileId: null,
    profiles: [],
    preview: {
      snapshotVersion: 'M33-v1',
      solverEngineStatus: 'SNAPSHOT_ONLY',
      snapshotHash: 'snapshot-1',
      baselineHash: 'baseline-1',
      meta: {
        revisionId: 'revision-1',
        requirementSetId: 'set-1',
        revisionVersion: 1,
        academicYear: '2026-2027',
        term: 1,
      },
      hardConstraintContract: {
        days: [1, 2, 3, 4, 5],
        periods: [1, 2, 3],
        rules: [],
      },
      requirements: [],
      cards: [],
      instructionalGroups: [],
      instructionalGroupRelations: [],
      teacherPools: [],
      roomPools: [],
      teachers: [],
      rooms: [],
      baselinePlacements: [],
      baselineMetrics: {
        cardCount: 0,
        placedCardCount: 0,
        unplacedCardCount: 0,
        lockedCardCount: 0,
        changeCost: 0,
        preferredTeacherContinuityBreaks: 0,
        teacherIdleGapPeriods: 0,
        roomStabilityBreaks: 0,
      },
      objectiveProfile: null,
      objectiveCatalog: [],
      candidateDomainIncluded: false,
      candidateDomainOmissionReason: 'test',
      readiness: {
        hardInputReady: true,
        objectiveProfileReady: false,
        solverPrototypeReady: false,
        hardBlockers: [],
        provisionalInputs: [],
        resourceUnknownSemantics: 'M22_PROVISIONAL_UNKNOWN',
        missingOptionalModelInputs: [],
        objectiveProfileValidation: {
          valid: true,
          normalizedWeights: {
            changeCost: 0,
            preferredTeacherContinuity: 0,
            teacherIdleGaps: 0,
            roomStability: 0,
            teacherLoadBalance: 0,
            subjectTimePreference: 0,
          },
          unknownKeys: [],
          invalidValues: [],
          unsupportedEnabled: [],
          positiveSupportedObjectiveCount: 0,
          catalog: [],
        },
      },
    },
  };
}

function result(): ManagementOptimizationResult {
  return {
    engineVersion: 'M33.3-v0',
    status: 'IMPROVED',
    snapshotHash: 'snapshot-1',
    baselineHash: 'baseline-1',
    writesPerformed: false,
    objectiveProfileUsed: true,
    weights: {
      changeCost: 1000,
      preferredTeacherContinuity: 0,
      teacherIdleGaps: 1000,
      roomStability: 0,
      teacherLoadBalance: 0,
      subjectTimePreference: 0,
    },
    baselineMetrics: {
      changeCost: 0,
      preferredTeacherContinuityBreaks: 0,
      teacherIdleGapPeriods: 5,
      roomStabilityBreaks: 0,
    },
    proposedMetrics: {
      changeCost: 1,
      preferredTeacherContinuityBreaks: 0,
      teacherIdleGapPeriods: 2,
      roomStabilityBreaks: 0,
    },
    delta: {
      changeCost: 1,
      preferredTeacherContinuityBreaks: 0,
      teacherIdleGapPeriods: -3,
      roomStabilityBreaks: 0,
    },
    baselineScore: {
      total: 5,
      components: {
        changeCost: {
          rawValue: 0,
          normalizedValue: 0,
          weight: 1000,
          contribution: 0,
        },
        preferredTeacherContinuity: {
          rawValue: 0,
          normalizedValue: 0,
          weight: 0,
          contribution: 0,
        },
        teacherIdleGaps: {
          rawValue: 5,
          normalizedValue: 5,
          weight: 1000,
          contribution: 5,
        },
        roomStability: {
          rawValue: 0,
          normalizedValue: 0,
          weight: 0,
          contribution: 0,
        },
      },
    },
    proposedScore: {
      total: 3,
      components: {
        changeCost: {
          rawValue: 1,
          normalizedValue: 1,
          weight: 1000,
          contribution: 1,
        },
        preferredTeacherContinuity: {
          rawValue: 0,
          normalizedValue: 0,
          weight: 0,
          contribution: 0,
        },
        teacherIdleGaps: {
          rawValue: 2,
          normalizedValue: 2,
          weight: 1000,
          contribution: 2,
        },
        roomStability: {
          rawValue: 0,
          normalizedValue: 0,
          weight: 0,
          contribution: 0,
        },
      },
    },
    placements: [
      {
        cardId: 'card-a',
        dayOfWeek: 1,
        startPeriod: 2,
        teacherId: 'teacher-a',
        roomId: 'room-a',
        provisionalRoom: false,
        baseline: false,
      },
      {
        cardId: 'card-b',
        dayOfWeek: 1,
        startPeriod: 3,
        teacherId: 'teacher-b',
        roomId: null,
        provisionalRoom: true,
        baseline: true,
      },
    ],
    changedCards: [],
    evaluatedMoveCount: 10,
    acceptedMoveCount: 1,
    elapsedMs: 2,
    reasons: [],
  };
}

describe('M33.4 solver proposal apply preparation', () => {
  it('builds an atomic bundle from changed final placements', () => {
    const plan = prepareManagementSolverProposalApply(
      result(),
      workspace(),
    );

    expect(plan.canApply).toBe(true);
    expect(plan.reasons).toEqual([]);
    expect(plan.items).toEqual([
      {
        cardId: 'card-a',
        dayOfWeek: 1,
        startPeriod: 2,
        teacherId: 'teacher-a',
        roomId: 'room-a',
      },
    ]);
  });

  it('rejects a proposal when the program baseline changed', () => {
    const current = workspace();
    current.preview.baselineHash = 'baseline-2';

    const plan = prepareManagementSolverProposalApply(
      result(),
      current,
    );

    expect(plan.canApply).toBe(false);
    expect(plan.reasons).toContain('BASELINE_CHANGED');
  });

  it('rejects a proposal when structural snapshot input changed', () => {
    const current = workspace();
    current.preview.snapshotHash = 'snapshot-2';

    const plan = prepareManagementSolverProposalApply(
      result(),
      current,
    );

    expect(plan.canApply).toBe(false);
    expect(plan.reasons).toContain('SNAPSHOT_CHANGED');
  });

  it('does not apply unchanged or non-improved results', () => {
    const proposal = result();
    proposal.status = 'UNCHANGED';
    proposal.placements = proposal.placements.map((placement) => ({
      ...placement,
      baseline: true,
    }));

    const plan = prepareManagementSolverProposalApply(
      proposal,
      workspace(),
    );

    expect(plan.canApply).toBe(false);
    expect(plan.reasons).toContain('PROPOSAL_NOT_IMPROVED');
    expect(plan.reasons).toContain('NO_CHANGED_PLACEMENTS');
  });
});
