import { describe, expect, it } from 'vitest';

import type {
  ManagementSolverObjectiveWeights,
  ManagementSolverSnapshotPreview,
} from '@/lib/managementSolver';
import {
  runManagementObjectiveOptimization,
} from '@/lib/managementSolverPrototype';

const ZERO_WEIGHTS: ManagementSolverObjectiveWeights = {
  changeCost: 0,
  preferredTeacherContinuity: 0,
  teacherIdleGaps: 0,
  roomStability: 0,
  teacherLoadBalance: 0,
  subjectTimePreference: 0,
};

function baseSnapshot(): ManagementSolverSnapshotPreview {
  return {
    snapshotVersion: 'objective-acceptance-v1',
    solverEngineStatus: 'SNAPSHOT_ONLY',
    snapshotHash: 'snapshot',
    baselineHash: 'baseline',
    meta: {
      revisionId: 'revision',
      requirementSetId: 'set',
      revisionVersion: 1,
      academicYear: '2026-2027',
      term: 1,
    },
    hardConstraintContract: {
      days: [1, 2],
      periods: [1, 2, 3, 4],
      rules: [],
    },
    requirements: [{
      id: 'r1',
      subjectId: 's1',
      subjectName: 'Test Dersi',
      groupId: 'g1',
      groupName: '5A',
      groupType: 'SECTION',
      weeklyLoad: 1,
      preferredPartition: [1],
      allowedPartitions: [[1]],
      minDistinctDays: null,
      maxBlocksPerDay: null,
      maxConsecutivePeriods: null,
      courseCharacter: null,
      deliveryMode: null,
      teacherRequirement: 'NONE',
      teacherMode: 'UNKNOWN',
      teacherAssignmentScope: 'UNSPECIFIED',
      teacherContinuity: 'NONE',
      resourceMode: 'UNKNOWN',
      requiredCapability: null,
    }],
    cards: [{
      id: 'c1',
      requirementId: 'r1',
      blockIndex: 1,
      durationPeriods: 1,
      locked: false,
    }],
    instructionalGroups: [],
    instructionalGroupRelations: [],
    teacherPools: [],
    roomPools: [],
    teachers: [],
    rooms: [],
    baselinePlacements: [{
      cardId: 'c1',
      dayOfWeek: 1,
      startPeriod: 1,
      teacherId: null,
      roomId: null,
    }],
    baselineMetrics: {
      cardCount: 1,
      placedCardCount: 1,
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
    candidateDomainOmissionReason: 'unit-test',
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
  };
}

describe('management objective search acceptance', () => {
  it('moves a card toward its preferred day when subject time preference is active', () => {
    const snapshot = baseSnapshot();
    snapshot.subjectTimePreferences = [{
      requirementId: 'r1',
      preferredDays: [2],
      preferredStartPeriods: [1],
    }];

    const result = runManagementObjectiveOptimization(
      snapshot,
      {
        ...ZERO_WEIGHTS,
        subjectTimePreference: 1000,
      },
      {
        maxIterations: 4,
        maxNeighborsPerCard: 16,
      },
    );

    expect(result.status).toBe('IMPROVED');
    expect(result.baselineMetrics.subjectTimePreferencePenalty).toBe(1);
    expect(result.proposedMetrics.subjectTimePreferencePenalty).toBe(0);
    expect(result.placements).toEqual([expect.objectContaining({
      cardId: 'c1',
      dayOfWeek: 2,
      startPeriod: 1,
    })]);
  });

  it('reassigns a flexible card toward configured teacher load targets', () => {
    const snapshot = baseSnapshot();
    snapshot.requirements[0] = {
      ...snapshot.requirements[0],
      teacherRequirement: 'REQUIRED',
      teacherMode: 'ELIGIBLE_POOL',
      teacherAssignmentScope: 'BLOCK',
    };
    snapshot.teachers = [
      {
        id: 't1',
        name: 'Öğretmen 1',
        operationalStatus: 'ACTIVE',
      },
      {
        id: 't2',
        name: 'Öğretmen 2',
        operationalStatus: 'ACTIVE',
      },
    ];
    snapshot.teacherPools = [
      { requirementId: 'r1', teacherId: 't1' },
      { requirementId: 'r1', teacherId: 't2' },
    ];
    snapshot.teacherLoadTargets = [
      {
        teacherId: 't1',
        minimumLoad: null,
        targetLoad: 0,
        maximumLoad: null,
      },
      {
        teacherId: 't2',
        minimumLoad: null,
        targetLoad: 1,
        maximumLoad: null,
      },
    ];
    snapshot.baselinePlacements[0] = {
      ...snapshot.baselinePlacements[0],
      teacherId: 't1',
    };

    const result = runManagementObjectiveOptimization(
      snapshot,
      {
        ...ZERO_WEIGHTS,
        teacherLoadBalance: 1000,
      },
      {
        maxIterations: 4,
        maxNeighborsPerCard: 32,
      },
    );

    expect(result.status).toBe('IMPROVED');
    expect(result.baselineMetrics.teacherLoadDeviationPeriods).toBe(2);
    expect(result.proposedMetrics.teacherLoadDeviationPeriods).toBe(0);
    expect(result.placements).toEqual([expect.objectContaining({
      cardId: 'c1',
      teacherId: 't2',
    })]);
  });

  it('does not improve teacher load by dropping an existing optional teacher assignment', () => {
    const snapshot = baseSnapshot();
    snapshot.requirements[0] = {
      ...snapshot.requirements[0],
      teacherRequirement: 'OPTIONAL',
      teacherMode: 'ELIGIBLE_POOL',
      teacherAssignmentScope: 'BLOCK',
    };
    snapshot.teachers = [{
      id: 't1',
      name: 'Öğretmen 1',
      operationalStatus: 'ACTIVE',
    }];
    snapshot.teacherPools = [
      { requirementId: 'r1', teacherId: 't1' },
    ];
    snapshot.teacherLoadTargets = [{
      teacherId: 't1',
      minimumLoad: null,
      targetLoad: 0,
      maximumLoad: null,
    }];
    snapshot.baselinePlacements[0] = {
      ...snapshot.baselinePlacements[0],
      teacherId: 't1',
    };

    const result = runManagementObjectiveOptimization(
      snapshot,
      {
        ...ZERO_WEIGHTS,
        teacherLoadBalance: 1000,
      },
      {
        maxIterations: 4,
        maxNeighborsPerCard: 32,
      },
    );

    expect(result.baselineMetrics.teacherLoadDeviationPeriods).toBe(1);
    expect(result.proposedMetrics.teacherLoadDeviationPeriods).toBe(1);
    expect(result.placements).toEqual([expect.objectContaining({
      cardId: 'c1',
      teacherId: 't1',
    })]);
    expect(result.status).toBe('UNCHANGED');
  });

});
