import { describe, expect, it } from 'vitest';

import type {
  ManagementSolverObjectiveWeights,
  ManagementSolverWorkspace,
} from '@/lib/managementSolver';
import {
  projectManagementSolverWorkspacePlacementsV1,
} from '@/lib/managementSolverWorkspaceAdapter';
import type {
  ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

const ZERO_WEIGHTS: ManagementSolverObjectiveWeights = {
  changeCost: 0,
  preferredTeacherContinuity: 0,
  teacherIdleGaps: 0,
  roomStability: 0,
  teacherLoadBalance: 0,
  subjectTimePreference: 0,
};

function workspace(): ManagementSolverWorkspace {
  return {
    revisionId: 'revision',
    requirementSetId: 'set',
    profiles: [],
    activeProfileId: null,
    preview: {
      snapshotVersion: 'M39.2-v1',
      solverEngineStatus: 'SNAPSHOT_ONLY',
      snapshotHash: 'server-snapshot',
      baselineHash: 'server-baseline',
      meta: {
        revisionId: 'revision',
        requirementSetId: 'set',
        revisionVersion: 1,
        academicYear: '2026-2027',
        term: 1,
      },
      hardConstraintContract: {
        days: [1, 2, 3, 4, 5],
        periods: [1, 2, 3, 4, 5],
        rules: [],
      },
      requirements: [{
        id: 'r1',
        subjectId: 's1',
        subjectName: 'Türkçe',
        groupId: 'g1',
        groupName: '5A',
        groupType: 'SECTION',
        weeklyLoad: 2,
        preferredPartition: [1, 1],
        allowedPartitions: [[1, 1]],
        minDistinctDays: null,
        maxBlocksPerDay: null,
        maxConsecutivePeriods: null,
        courseCharacter: null,
        deliveryMode: null,
        teacherRequirement: 'REQUIRED',
        teacherMode: 'ELIGIBLE_POOL',
        teacherAssignmentScope: 'BLOCK',
        teacherContinuity: 'PREFERRED',
        resourceMode: 'ELIGIBLE_POOL',
        requiredCapability: null,
      }],
      cards: [
        {
          id: 'c1',
          requirementId: 'r1',
          blockIndex: 1,
          durationPeriods: 1,
          locked: false,
        },
        {
          id: 'c2',
          requirementId: 'r1',
          blockIndex: 2,
          durationPeriods: 1,
          locked: false,
        },
      ],
      instructionalGroups: [],
      instructionalGroupRelations: [],
      teacherPools: [],
      roomPools: [],
      teachers: [],
      rooms: [],
      baselinePlacements: [
        {
          cardId: 'c1',
          dayOfWeek: 1,
          startPeriod: 1,
          teacherId: 't1',
          roomId: 'room1',
        },
        {
          cardId: 'c2',
          dayOfWeek: 1,
          startPeriod: 3,
          teacherId: 't2',
          roomId: 'room2',
        },
      ],
      baselineMetrics: {
        cardCount: 2,
        placedCardCount: 2,
        unplacedCardCount: 0,
        lockedCardCount: 0,
        changeCost: 0,
        preferredTeacherContinuityBreaks: 1,
        teacherIdleGapPeriods: 0,
        roomStabilityBreaks: 1,
      },
      objectiveProfile: null,
      objectiveCatalog: [],
      candidateDomainIncluded: false,
      candidateDomainOmissionReason: 'test',
      readiness: {
        hardInputReady: true,
        objectiveProfileReady: true,
        solverPrototypeReady: true,
        hardBlockers: [],
        provisionalInputs: [],
        missingOptionalModelInputs: [],
        objectiveProfileValidation: {
          valid: true,
          normalizedWeights: ZERO_WEIGHTS,
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

function workingCopy(): ManagementWorkspaceWorkingCopyV1 {
  return {
    schemaVersion: 'management-workspace-copy-v1',
    baseline: {
      revisionId: 'revision',
      requirementSetId: 'set',
      revisionVersion: 1,
      academicYear: '2026-2027',
      term: 1,
      snapshotHash: 'server-snapshot',
      baselineHash: 'server-baseline',
    },
    placementsByCardId: {
      c1: {
        cardId: 'c1',
        dayOfWeek: 2,
        startPeriod: 2,
        teacherId: 't1',
        roomId: 'room1',
      },
      c2: {
        cardId: 'c2',
        dayOfWeek: 2,
        startPeriod: 3,
        teacherId: 't1',
        roomId: 'room1',
      },
    },
    cardsById: {},
    requirementStructureById: {},
    requirementCatalogById: {},
    requirementResourcesById: {},
    teacherInventoryById: {},
    roomInventoryById: {},
    teacherPlanningById: {},
    teacherAvailabilityById: {},
    roomProfileById: {},
    resourceLifecycleById: {},
  };
}

describe('local solver placement projection', () => {
  it('makes the local placement matrix the solver baseline', () => {
    const projected = projectManagementSolverWorkspacePlacementsV1(
      workspace(),
      workingCopy(),
      4,
    );

    expect(projected.preview.baselinePlacements).toEqual([
      {
        cardId: 'c1',
        dayOfWeek: 2,
        startPeriod: 2,
        teacherId: 't1',
        roomId: 'room1',
      },
      {
        cardId: 'c2',
        dayOfWeek: 2,
        startPeriod: 3,
        teacherId: 't1',
        roomId: 'room1',
      },
    ]);
    expect(projected.preview.baselineHash).toMatch(/^local-revision-4-/);
    expect(projected.preview.snapshotVersion).toBe('M39.2-v1-LOCAL');
    expect(projected.preview.baselineMetrics).toMatchObject({
      cardCount: 2,
      placedCardCount: 2,
      unplacedCardCount: 0,
      changeCost: 0,
      preferredTeacherContinuityBreaks: 0,
      teacherIdleGapPeriods: 0,
      roomStabilityBreaks: 0,
    });
  });

  it('changes the local baseline hash when placements change', () => {
    const copy = workingCopy();
    const first = projectManagementSolverWorkspacePlacementsV1(
      workspace(),
      copy,
      4,
    );

    copy.placementsByCardId.c2.startPeriod = 4;

    const second = projectManagementSolverWorkspacePlacementsV1(
      workspace(),
      copy,
      5,
    );

    expect(second.preview.baselineHash).not.toBe(
      first.preview.baselineHash,
    );
  });
});
