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
    requirementTimePreferencesById: {},
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

  it('projects local teacher load targets into the solver snapshot before Save', () => {
    const copy = workingCopy();
    copy.teacherPlanningById.t1 = {
      teacherId: 't1',
      minimumLoad: 2,
      targetLoad: 4,
      maximumLoad: 6,
    };

    const projected = projectManagementSolverWorkspacePlacementsV1(
      workspace(),
      copy,
      6,
    );

    expect(projected.preview.teacherLoadTargets).toEqual([{
      teacherId: 't1',
      minimumLoad: 2,
      targetLoad: 4,
      maximumLoad: 6,
    }]);
  });

  it('projects local subject time preferences into the solver snapshot before Save', () => {
    const copy = workingCopy();
    copy.requirementTimePreferencesById.r1 = {
      requirementId: 'r1',
      preferredDays: [4, 2],
      preferredStartPeriods: [6, 3],
    };

    const projected = projectManagementSolverWorkspacePlacementsV1(
      workspace(),
      copy,
      7,
    );

    expect(projected.preview.subjectTimePreferences).toEqual([{
      requirementId: 'r1',
      preferredDays: [2, 4],
      preferredStartPeriods: [3, 6],
    }]);
  });

  it('changes the local solver hash when objective inputs change', () => {
    const copy = workingCopy();

    const first = projectManagementSolverWorkspacePlacementsV1(
      workspace(),
      copy,
      8,
    );

    copy.teacherPlanningById.t1 = {
      teacherId: 't1',
      minimumLoad: null,
      targetLoad: 5,
      maximumLoad: null,
    };

    const second = projectManagementSolverWorkspacePlacementsV1(
      workspace(),
      copy,
      8,
    );

    expect(second.preview.baselineHash).not.toBe(first.preview.baselineHash);
    expect(second.preview.snapshotHash).not.toBe(first.preview.snapshotHash);
  });


  it('preserves server objective inputs until matching local inputs are hydrated', () => {
    const source = workspace();
    source.preview.teacherLoadTargets = [{
      teacherId: 't1',
      minimumLoad: 1,
      targetLoad: 3,
      maximumLoad: 5,
    }];
    source.preview.subjectTimePreferences = [{
      requirementId: 'r1',
      preferredDays: [5],
      preferredStartPeriods: [8],
    }];

    const projected = projectManagementSolverWorkspacePlacementsV1(
      source,
      workingCopy(),
      9,
    );

    expect(projected.preview.teacherLoadTargets).toEqual([{
      teacherId: 't1',
      minimumLoad: 1,
      targetLoad: 3,
      maximumLoad: 5,
    }]);
    expect(projected.preview.subjectTimePreferences).toEqual([{
      requirementId: 'r1',
      preferredDays: [5],
      preferredStartPeriods: [8],
    }]);
  });

  it('lets explicit local empty inputs clear server objective inputs', () => {
    const source = workspace();
    source.preview.teacherLoadTargets = [{
      teacherId: 't1',
      minimumLoad: 1,
      targetLoad: 3,
      maximumLoad: 5,
    }];
    source.preview.subjectTimePreferences = [{
      requirementId: 'r1',
      preferredDays: [5],
      preferredStartPeriods: [8],
    }];

    const copy = workingCopy();
    copy.teacherPlanningById.t1 = {
      teacherId: 't1',
      minimumLoad: null,
      targetLoad: null,
      maximumLoad: null,
    };
    copy.requirementTimePreferencesById.r1 = {
      requirementId: 'r1',
      preferredDays: [],
      preferredStartPeriods: [],
    };

    const projected = projectManagementSolverWorkspacePlacementsV1(
      source,
      copy,
      10,
    );

    expect(projected.preview.teacherLoadTargets).toEqual([]);
    expect(projected.preview.subjectTimePreferences).toEqual([]);
  });


  it('projects unsaved card pins into the local solver snapshot', () => {
    const copy = workingCopy();
    copy.cardsById.c1 = {
      id: 'c1',
      requirementId: 'r1',
      blockIndex: 1,
      durationPeriods: 1,
      locked: false,
      timePinned: true,
      teacherPinned: false,
      roomPinned: true,
      baselineExists: true,
    };

    const projected = projectManagementSolverWorkspacePlacementsV1(
      workspace(),
      copy,
      11,
    );

    expect(projected.preview.cards.find((card) => card.id === 'c1'))
      .toMatchObject({
        timePinned: true,
        teacherPinned: false,
        roomPinned: true,
      });
  });

});
