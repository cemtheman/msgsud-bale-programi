import { describe, expect, it } from 'vitest';

import type {
  ManagementSolverSnapshotPreview,
} from '@/lib/managementSolver';
import {
  runManagementFeasibilityPrototype,
  runManagementObjectiveOptimization,
} from '@/lib/managementSolverPrototype';

function snapshot(
  overrides: Partial<ManagementSolverSnapshotPreview> = {},
): ManagementSolverSnapshotPreview {
  return {
    snapshotVersion: 'M33.0.1-v1',
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
      rules: [
        'TIME_WITHIN_DAY',
        'NO_BLOCK_ACROSS_LUNCH_BOUNDARY',
        'NO_TEACHER_OVERLAP',
        'NO_ROOM_OVERLAP',
        'NO_PARTICIPANT_GROUP_OVERLAP',
        'LOCKED_CARD_PIN',
        'REQUIREMENT_TEACHER_CONTINUITY_REQUIRED',
        'MIN_DISTINCT_DAYS_WHEN_DECLARED',
        'MAX_BLOCKS_PER_DAY_WHEN_DECLARED',
        'MAX_CONSECUTIVE_PERIODS_WHEN_DECLARED',
      ],
    },
    requirements: [{
      id: 'r1',
      subjectId: 's1',
      subjectName: 'Matematik',
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
    }],
    cards: [{
      id: 'c1',
      requirementId: 'r1',
      blockIndex: 1,
      durationPeriods: 1,
      locked: false,
    }],
    instructionalGroups: [{
      id: 'g1',
      classGroupId: 'cg1',
      name: '5A',
      groupType: 'SECTION',
      termStatus: 'ACTIVE',
      knowledgeStatus: 'CONFIRMED',
    }],
    instructionalGroupRelations: [],
    teacherPools: [{
      requirementId: 'r1',
      teacherId: 't1',
    }],
    roomPools: [{
      requirementId: 'r1',
      roomId: 'room1',
    }],
    teachers: [{
      id: 't1',
      name: 'Matematik Öğretmeni',
      operationalStatus: 'ACTIVE',
    }],
    rooms: [{
      id: 'room1',
      name: 'A101',
      canonicalRoomId: null,
      capabilities: [],
      knowledgeStatus: 'CONFIRMED',
      operationalStatus: 'ACTIVE',
    }],
    baselinePlacements: [{
      cardId: 'c1',
      dayOfWeek: 1,
      startPeriod: 1,
      teacherId: 't1',
      roomId: 'room1',
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
    candidateDomainOmissionReason: 'structural solver domains',
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
    ...overrides,
  };
}

describe('M33.2 in-memory feasibility prototype', () => {
  it('accepts a fully materialized feasible baseline without expanding the search', () => {
    const result = runManagementFeasibilityPrototype(snapshot());

    expect(result.status).toBe('FEASIBLE');
    expect(result.baselineWasFeasible).toBe(true);
    expect(result.writesPerformed).toBe(false);
    expect(result.metrics.visitedNodeCount).toBe(0);
    expect(result.metrics.baselineReuseCount).toBe(1);
    expect(result.placements[0]).toMatchObject({
      cardId: 'c1',
      dayOfWeek: 1,
      startPeriod: 1,
      teacherId: 't1',
      roomId: 'room1',
      baseline: true,
    });
  });

  it('moves an unlocked baseline card in memory when participant groups conflict', () => {
    const data = snapshot({
      requirements: [
        {
          ...snapshot().requirements[0],
          id: 'r1',
          groupId: 'gParent',
          groupName: '5A',
        },
        {
          ...snapshot().requirements[0],
          id: 'r2',
          subjectId: 's2',
          subjectName: 'Fen',
          groupId: 'gChild',
          groupName: '5A Alt Grup',
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
          id: 'gParent',
          classGroupId: 'cg1',
          name: '5A',
          groupType: 'SECTION',
          termStatus: 'ACTIVE',
          knowledgeStatus: 'CONFIRMED',
        },
        {
          id: 'gChild',
          classGroupId: 'cg1',
          name: '5A Alt Grup',
          groupType: 'SUBGROUP',
          termStatus: 'ACTIVE',
          knowledgeStatus: 'CONFIRMED',
        },
      ],
      instructionalGroupRelations: [{
        leftGroupId: 'gParent',
        rightGroupId: 'gChild',
        relation: 'CONTAINS',
      }],
      teacherPools: [
        { requirementId: 'r1', teacherId: 't1' },
        { requirementId: 'r2', teacherId: 't2' },
      ],
      roomPools: [
        { requirementId: 'r1', roomId: 'room1' },
        { requirementId: 'r2', roomId: 'room2' },
      ],
      teachers: [
        { id: 't1', name: 'Ö1', operationalStatus: 'ACTIVE' },
        { id: 't2', name: 'Ö2', operationalStatus: 'ACTIVE' },
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
          startPeriod: 1,
          teacherId: 't2',
          roomId: 'room2',
        },
      ],
      baselineMetrics: {
        ...snapshot().baselineMetrics,
        cardCount: 2,
        placedCardCount: 2,
      },
    });

    const result = runManagementFeasibilityPrototype(data);

    expect(result.status).toBe('FEASIBLE');
    expect(result.baselineWasFeasible).toBe(false);
    expect(result.placements).toHaveLength(2);

    const [left, right] = result.placements;
    expect(
      left.dayOfWeek !== right.dayOfWeek
      || left.startPeriod !== right.startPeriod,
    ).toBe(true);
    expect(result.changedCards?.length).toBeGreaterThan(0);
    expect(
      result.baselineIssues?.some(
        (issue) => issue.codes.includes('BASELINE_GROUP_CONFLICT'),
      ),
    ).toBe(true);
  });

  it('keeps an active manual baseline teacher outside the planning pool', () => {
    const base = snapshot();
    const result = runManagementFeasibilityPrototype(snapshot({
      teachers: [
        ...base.teachers,
        {
          id: 'manual-teacher',
          name: 'Manuel Öğretmen',
          operationalStatus: 'ACTIVE',
        },
      ],
      baselinePlacements: [{
        cardId: 'c1',
        dayOfWeek: 1,
        startPeriod: 1,
        teacherId: 'manual-teacher',
        roomId: 'room1',
      }],
    }));

    expect(result.status).toBe('FEASIBLE');
    expect(result.baselineWasFeasible).toBe(true);
    expect(result.metrics.visitedNodeCount).toBe(0);
    expect(result.metrics.baselineReuseCount).toBe(1);
    expect(result.baselineIssues).toEqual([]);
    expect(result.changedCards).toEqual([]);
    expect(result.placements[0].teacherId).toBe('manual-teacher');
  });

  it('keeps an active manual baseline room outside the planning pool', () => {
    const base = snapshot();
    const result = runManagementFeasibilityPrototype(snapshot({
      rooms: [
        ...base.rooms,
        {
          id: 'manual-room',
          name: 'B Salon',
          canonicalRoomId: null,
          capabilities: [],
          knowledgeStatus: 'CONFIRMED',
          operationalStatus: 'ACTIVE',
        },
      ],
      baselinePlacements: [{
        cardId: 'c1',
        dayOfWeek: 1,
        startPeriod: 1,
        teacherId: 't1',
        roomId: 'manual-room',
      }],
    }));

    expect(result.status).toBe('FEASIBLE');
    expect(result.baselineWasFeasible).toBe(true);
    expect(result.metrics.visitedNodeCount).toBe(0);
    expect(result.metrics.baselineReuseCount).toBe(1);
    expect(result.baselineIssues).toEqual([]);
    expect(result.changedCards).toEqual([]);
    expect(result.placements[0].roomId).toBe('manual-room');
  });

  it('still rejects a real max-consecutive baseline violation', () => {
    const base = snapshot();
    const requirement = {
      ...base.requirements[0],
      weeklyLoad: 2,
      maxConsecutivePeriods: 1,
    };

    const result = runManagementFeasibilityPrototype(snapshot({
      requirements: [requirement],
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
          startPeriod: 2,
          teacherId: 't1',
          roomId: 'room1',
        },
      ],
      baselineMetrics: {
        ...base.baselineMetrics,
        cardCount: 2,
        placedCardCount: 2,
      },
    }));

    expect(result.status).toBe('FEASIBLE');
    expect(result.baselineWasFeasible).toBe(false);
    expect(
      result.baselineIssues?.some((issue) =>
        issue.codes.includes('BASELINE_MAX_CONSECUTIVE_PERIODS')),
    ).toBe(true);
  });

  it('keeps UNKNOWN room mode provisional instead of treating it as a blocker', () => {
    const base = snapshot();
    const result = runManagementFeasibilityPrototype(snapshot({
      requirements: [{
        ...base.requirements[0],
        resourceMode: 'UNKNOWN',
      }],
      roomPools: [],
      rooms: [],
      baselinePlacements: [{
        cardId: 'c1',
        dayOfWeek: null,
        startPeriod: null,
        teacherId: null,
        roomId: null,
      }],
      baselineMetrics: {
        ...base.baselineMetrics,
        placedCardCount: 0,
        unplacedCardCount: 1,
      },
      readiness: {
        ...base.readiness,
        provisionalInputs: [{
          code: 'RESOURCE_MODE_UNKNOWN',
          count: 1,
          hardBlocker: false,
          resolutionStatus: 'PROVISIONAL_UNKNOWN',
        }],
      },
    }));

    expect(result.status).toBe('FEASIBLE');
    expect(result.placements[0].roomId).toBeNull();
    expect(result.placements[0].provisionalRoom).toBe(true);
  });

  it('enforces REQUIREMENT + REQUIRED teacher continuity', () => {
    const base = snapshot();
    const requirement = {
      ...base.requirements[0],
      teacherMode: 'ELIGIBLE_POOL',
      teacherAssignmentScope: 'REQUIREMENT',
      teacherContinuity: 'REQUIRED',
      weeklyLoad: 2,
    };

    const result = runManagementFeasibilityPrototype(snapshot({
      requirements: [requirement],
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
      teacherPools: [
        { requirementId: 'r1', teacherId: 't1' },
        { requirementId: 'r1', teacherId: 't2' },
      ],
      teachers: [
        { id: 't1', name: 'Ö1', operationalStatus: 'ACTIVE' },
        { id: 't2', name: 'Ö2', operationalStatus: 'ACTIVE' },
      ],
      baselinePlacements: [
        {
          cardId: 'c1',
          dayOfWeek: null,
          startPeriod: null,
          teacherId: null,
          roomId: null,
        },
        {
          cardId: 'c2',
          dayOfWeek: null,
          startPeriod: null,
          teacherId: null,
          roomId: null,
        },
      ],
      baselineMetrics: {
        ...base.baselineMetrics,
        cardCount: 2,
        placedCardCount: 0,
        unplacedCardCount: 2,
      },
    }));

    expect(result.status).toBe('FEASIBLE');
    expect(result.placements).toHaveLength(2);
    expect(result.placements[0].teacherId).toBeTruthy();
    expect(result.placements[1].teacherId).toBe(
      result.placements[0].teacherId,
    );
  });

  it('treats teacher hard unavailability as a structural solver constraint', () => {
    const base = snapshot();
    const result = runManagementFeasibilityPrototype(snapshot({
      teacherUnavailablePeriods: [{
        teacherId: 't1',
        dayOfWeek: 1,
        period: 1,
      }],
    }));

    expect(result.status).toBe('FEASIBLE');
    expect(result.baselineWasFeasible).toBe(false);
    expect(
      result.baselineIssues?.some((issue) =>
        issue.codes.includes('BASELINE_TEACHER_UNAVAILABLE'),
      ),
    ).toBe(true);
    expect(
      result.placements.some((placement) => (
        placement.teacherId === 't1'
        && placement.dayOfWeek === 1
        && placement.startPeriod === 1
      )),
    ).toBe(false);
    expect(result.placements[0]).not.toMatchObject({
      dayOfWeek: 1,
      startPeriod: 1,
      baseline: true,
    });
    expect(result.writesPerformed).toBe(false);
    expect(base.teachers[0].operationalStatus).toBe('ACTIVE');
  });

  it('rejects a locked card with no materialized baseline placement', () => {
    const base = snapshot();
    const result = runManagementFeasibilityPrototype(snapshot({
      cards: [{
        ...base.cards[0],
        locked: true,
      }],
      baselinePlacements: [{
        cardId: 'c1',
        dayOfWeek: null,
        startPeriod: null,
        teacherId: null,
        roomId: null,
      }],
    }));

    expect(result.status).toBe('INFEASIBLE');
    expect(result.reasons).toContain('LOCKED_CARD_BASELINE_MISSING');
  });
});


describe('M40 teacher load objective', () => {
  const loadOnlyWeights = {
    changeCost: 0,
    preferredTeacherContinuity: 0,
    teacherIdleGaps: 0,
    roomStability: 0,
    teacherLoadBalance: 1000,
    subjectTimePreference: 0,
  };

  it('blocks load optimization when relevant teacher targets are incomplete', () => {
    const result = runManagementObjectiveOptimization(
      snapshot({
        teacherLoadReadiness: {
          ready: false,
          relevantTeacherCount: 1,
          configuredTeacherCount: 0,
          targetConfiguredTeacherCount: 0,
          missingTargetTeacherCount: 1,
          partialTeacherCount: 0,
          baselineBelowMinimumTeacherCount: 0,
          baselineAboveMaximumTeacherCount: 0,
          baselineTargetDeviationPeriods: 0,
          baselineRangeViolationPeriods: 0,
        },
      }),
      loadOnlyWeights,
    );

    expect(result.status).toBe('BLOCKED');
    expect(result.reasons).toContain('TEACHER_LOAD_INPUT_NOT_READY');
    expect(result.writesPerformed).toBe(false);
  });

  it('moves load toward explicit teacher targets when load balance is enabled', () => {
    const base = snapshot();

    const result = runManagementObjectiveOptimization(
      snapshot({
        requirements: [{
          ...base.requirements[0],
          teacherMode: 'ELIGIBLE_POOL',
        }],
        teacherPools: [
          { requirementId: 'r1', teacherId: 't1' },
          { requirementId: 'r1', teacherId: 't2' },
        ],
        teachers: [
          { id: 't1', name: 'Ö1', operationalStatus: 'ACTIVE' },
          { id: 't2', name: 'Ö2', operationalStatus: 'ACTIVE' },
        ],
        teacherLoadTargets: [
          {
            teacherId: 't1',
            minimumLoad: 0,
            targetLoad: 0,
            maximumLoad: 0,
            actualLoadPeriods: 1,
            relevant: true,
          },
          {
            teacherId: 't2',
            minimumLoad: 1,
            targetLoad: 1,
            maximumLoad: 1,
            actualLoadPeriods: 0,
            relevant: true,
          },
        ],
        teacherLoadReadiness: {
          ready: true,
          relevantTeacherCount: 2,
          configuredTeacherCount: 2,
          targetConfiguredTeacherCount: 2,
          missingTargetTeacherCount: 0,
          partialTeacherCount: 0,
          baselineBelowMinimumTeacherCount: 1,
          baselineAboveMaximumTeacherCount: 1,
          baselineTargetDeviationPeriods: 2,
          baselineRangeViolationPeriods: 2,
        },
        baselineMetrics: {
          ...base.baselineMetrics,
          teacherLoadTargetDeviationPeriods: 2,
          teacherLoadRangeViolationPeriods: 2,
        },
      }),
      loadOnlyWeights,
      {
        maxIterations: 4,
        maxNeighborsPerCard: 48,
      },
    );

    expect(result.status).toBe('IMPROVED');
    expect(result.baselineMetrics.teacherLoadTargetDeviationPeriods).toBe(2);
    expect(result.baselineMetrics.teacherLoadRangeViolationPeriods).toBe(2);
    expect(result.proposedMetrics.teacherLoadTargetDeviationPeriods).toBe(0);
    expect(result.proposedMetrics.teacherLoadRangeViolationPeriods).toBe(0);
    expect(result.placements[0].teacherId).toBe('t2');
    expect(result.writesPerformed).toBe(false);
  });
});
