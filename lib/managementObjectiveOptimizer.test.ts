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
    snapshotVersion: 'M33-v1',
    solverEngineStatus: 'SNAPSHOT_ONLY',
    snapshotHash: 'snapshot-hash',
    baselineHash: 'baseline-hash',
    meta: {
      revisionId: 'revision',
      requirementSetId: 'set',
      revisionVersion: 1,
      academicYear: '2026-2027',
      term: 1,
    },
    hardConstraintContract: {
      days: [1, 2, 3, 4, 5],
      periods: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      rules: [],
    },
    requirements: [
      {
        id: 'r1',
        subjectId: 's1',
        subjectName: 'Ders 1',
        groupId: 'g1',
        groupName: '5A',
        groupType: 'SECTION',
        weeklyLoad: 1,
        preferredPartition: null,
        allowedPartitions: null,
        minDistinctDays: null,
        maxBlocksPerDay: null,
        maxConsecutivePeriods: null,
        courseCharacter: null,
        deliveryMode: null,
        teacherRequirement: 'REQUIRED',
        teacherMode: 'FIXED',
        teacherAssignmentScope: 'BLOCK',
        teacherContinuity: 'NONE',
        resourceMode: 'FIXED',
        requiredCapability: null,
      },
      {
        id: 'r2',
        subjectId: 's2',
        subjectName: 'Ders 2',
        groupId: 'g2',
        groupName: '6A',
        groupType: 'SECTION',
        weeklyLoad: 1,
        preferredPartition: null,
        allowedPartitions: null,
        minDistinctDays: null,
        maxBlocksPerDay: null,
        maxConsecutivePeriods: null,
        courseCharacter: null,
        deliveryMode: null,
        teacherRequirement: 'REQUIRED',
        teacherMode: 'FIXED',
        teacherAssignmentScope: 'BLOCK',
        teacherContinuity: 'NONE',
        resourceMode: 'FIXED',
        requiredCapability: null,
      },
    ],
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
        requirementId: 'r2',
        blockIndex: 1,
        durationPeriods: 1,
        locked: false,
      },
    ],
    instructionalGroups: [
      {
        id: 'g1',
        classGroupId: 'cg1',
        name: '5A',
        groupType: 'SECTION',
        termStatus: 'ACTIVE',
        knowledgeStatus: 'CONFIRMED',
      },
      {
        id: 'g2',
        classGroupId: 'cg2',
        name: '6A',
        groupType: 'SECTION',
        termStatus: 'ACTIVE',
        knowledgeStatus: 'CONFIRMED',
      },
    ],
    instructionalGroupRelations: [],
    teacherPools: [
      { requirementId: 'r1', teacherId: 't1' },
      { requirementId: 'r2', teacherId: 't1' },
    ],
    roomPools: [
      { requirementId: 'r1', roomId: 'room1' },
      { requirementId: 'r2', roomId: 'room2' },
    ],
    teachers: [
      {
        id: 't1',
        name: 'Öğretmen',
        operationalStatus: 'ACTIVE',
      },
    ],
    rooms: [
      {
        id: 'room1',
        name: 'A101',
        canonicalRoomId: null,
        capabilities: [],
        knowledgeStatus: 'CONFIRMED',
        operationalStatus: 'ACTIVE',
      },
      {
        id: 'room2',
        name: 'A102',
        canonicalRoomId: null,
        capabilities: [],
        knowledgeStatus: 'CONFIRMED',
        operationalStatus: 'ACTIVE',
      },
    ],
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
        teacherId: 't1',
        roomId: 'room2',
      },
    ],
    baselineMetrics: {
      cardCount: 2,
      placedCardCount: 2,
      unplacedCardCount: 0,
      lockedCardCount: 0,
      changeCost: 0,
      preferredTeacherContinuityBreaks: 0,
      teacherIdleGapPeriods: 1,
      roomStabilityBreaks: 0,
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
      resourceUnknownSemantics: 'M22_PROVISIONAL_UNKNOWN',
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

describe('M33.3 weighted objective optimization', () => {
  it('reduces teacher gaps when that is the only active priority', () => {
    const result = runManagementObjectiveOptimization(
      baseSnapshot(),
      {
        ...ZERO_WEIGHTS,
        teacherIdleGaps: 1000,
      },
      {
        maxIterations: 4,
        maxNeighborsPerCard: 40,
      },
    );

    expect(result.status).toBe('IMPROVED');
    expect(result.writesPerformed).toBe(false);
    expect(result.baselineMetrics.teacherIdleGapPeriods).toBe(1);
    expect(result.proposedMetrics.teacherIdleGapPeriods).toBe(0);
    expect(result.proposedMetrics.changeCost).toBe(1);
    expect(result.changedCards).toHaveLength(1);

    const moved = result.placements.find(
      (placement) => placement.cardId === 'c2',
    );
    expect(moved?.dayOfWeek).toBe(1);
    expect(moved?.startPeriod).toBe(2);
  });

  it('keeps the baseline when preserving it ties the gap improvement', () => {
    const result = runManagementObjectiveOptimization(
      baseSnapshot(),
      {
        ...ZERO_WEIGHTS,
        changeCost: 1000,
        teacherIdleGaps: 1000,
      },
      {
        maxIterations: 4,
        maxNeighborsPerCard: 40,
      },
    );

    expect(result.status).toBe('UNCHANGED');
    expect(result.proposedMetrics.changeCost).toBe(0);
    expect(result.proposedMetrics.teacherIdleGapPeriods).toBe(1);
    expect(result.changedCards).toEqual([]);
  });

  it('reduces room changes for blocks of the same requirement', () => {
    const data = baseSnapshot();
    data.requirements = [{
      ...data.requirements[0],
      weeklyLoad: 2,
    }];
    data.cards = [
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
    ];
    data.instructionalGroups = [data.instructionalGroups[0]];
    data.teacherPools = [
      { requirementId: 'r1', teacherId: 't1' },
    ];
    data.roomPools = [
      { requirementId: 'r1', roomId: 'room1' },
      { requirementId: 'r1', roomId: 'room2' },
    ];
    data.baselinePlacements = [
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
        startPeriod: 2,
        teacherId: 't1',
        roomId: 'room2',
      },
    ];
    data.baselineMetrics = {
      ...data.baselineMetrics,
      roomStabilityBreaks: 1,
      teacherIdleGapPeriods: 0,
    };

    const result = runManagementObjectiveOptimization(
      data,
      {
        ...ZERO_WEIGHTS,
        roomStability: 1000,
      },
      {
        maxIterations: 4,
        maxNeighborsPerCard: 40,
      },
    );

    expect(result.status).toBe('IMPROVED');
    expect(result.baselineMetrics.roomStabilityBreaks).toBe(1);
    expect(result.proposedMetrics.roomStabilityBreaks).toBe(0);
    expect(result.proposedMetrics.changeCost).toBe(1);
  });

  it('blocks optimization when no supported priority is active', () => {
    const result = runManagementObjectiveOptimization(
      baseSnapshot(),
      ZERO_WEIGHTS,
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.reasons).toContain(
      'NO_ACTIVE_SUPPORTED_PRIORITIES',
    );
    expect(result.writesPerformed).toBe(false);
  });
});
