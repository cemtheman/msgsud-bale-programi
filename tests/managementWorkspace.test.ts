import { describe, expect, it } from 'vitest';

import {
  createManagementWorkspaceSnapshotV1,
  MANAGEMENT_WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
} from '@/lib/managementWorkspace';
import type {
  ManagementSolverCard,
  ManagementSolverSnapshotPreview,
} from '@/lib/managementSolver';

function preview(): ManagementSolverSnapshotPreview {
  return {
    snapshotVersion: 'M33.0.1-v1',
    solverEngineStatus: 'SNAPSHOT_ONLY',
    snapshotHash: 'snapshot-hash',
    baselineHash: 'baseline-hash',
    meta: {
      revisionId: 'revision-1',
      requirementSetId: 'requirement-set-1',
      revisionVersion: 7,
      academicYear: '2026-2027',
      term: 1,
    },
    hardConstraintContract: {
      days: [1, 2, 3, 4, 5],
      periods: [1, 2, 3],
      rules: ['GROUP_OVERLAP', 'TEACHER_OVERLAP'],
    },
    requirements: [
      {
        id: 'requirement-1',
        subjectId: 'subject-1',
        subjectName: 'Türkçe',
        groupId: 'group-1',
        groupName: '5A SECTION',
        groupType: 'SECTION',
        weeklyLoad: 5,
        preferredPartition: null,
        allowedPartitions: null,
        minDistinctDays: null,
        maxBlocksPerDay: null,
        maxConsecutivePeriods: null,
        courseCharacter: null,
        deliveryMode: null,
        teacherRequirement: 'REQUIRED',
        teacherMode: 'FIXED',
        teacherAssignmentScope: 'REQUIREMENT',
        teacherContinuity: 'REQUIRED',
        resourceMode: 'ELIGIBLE_POOL',
        requiredCapability: null,
      },
    ],
    cards: [
      {
        id: 'card-1',
        requirementId: 'requirement-1',
        blockIndex: 1,
        durationPeriods: 1,
        locked: false,
      },
    ],
    instructionalGroups: [
      {
        id: 'group-1',
        classGroupId: 'class-1',
        name: '5A SECTION',
        groupType: 'SECTION',
        termStatus: 'ACTIVE',
        knowledgeStatus: 'CONFIRMED',
      },
    ],
    instructionalGroupRelations: [],
    teacherPools: [
      {
        requirementId: 'requirement-1',
        teacherId: 'teacher-1',
      },
    ],
    roomPools: [
      {
        requirementId: 'requirement-1',
        roomId: 'room-1',
      },
    ],
    teachers: [
      {
        id: 'teacher-1',
        name: 'Türkçe Öğretmeni',
        operationalStatus: 'ACTIVE',
      },
    ],
    teacherUnavailablePeriods: [
      {
        teacherId: 'teacher-1',
        dayOfWeek: 2,
        period: 3,
      },
    ],
    rooms: [
      {
        id: 'room-1',
        name: '105A',
        canonicalRoomId: null,
        capabilities: [],
        knowledgeStatus: 'CONFIRMED',
        operationalStatus: 'ACTIVE',
      },
    ],
    baselinePlacements: [
      {
        cardId: 'card-1',
        dayOfWeek: 1,
        startPeriod: 1,
        teacherId: 'teacher-1',
        roomId: 'room-1',
      },
    ],
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
    candidateDomainOmissionReason: 'Occupancy-relative candidate rows excluded.',
    readiness: {
      hardInputReady: true,
      objectiveProfileReady: false,
      solverPrototypeReady: false,
      hardBlockers: [],
      provisionalInputs: [],
      resourceUnknownSemantics: 'PROVISIONAL_UNKNOWN',
      missingOptionalModelInputs: ['OBJECTIVE_PROFILE'],
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
  };
}

describe('management workspace snapshot v1', () => {
  it('creates an immutable read-only workspace source from the solver snapshot', () => {
    const source = preview();
    const snapshot = createManagementWorkspaceSnapshotV1(source);

    expect(snapshot.schemaVersion).toBe(
      MANAGEMENT_WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    );
    expect(snapshot.identity).toEqual({
      revisionId: 'revision-1',
      requirementSetId: 'requirement-set-1',
      revisionVersion: 7,
      academicYear: '2026-2027',
      term: 1,
      snapshotHash: 'snapshot-hash',
      baselineHash: 'baseline-hash',
    });
    expect(snapshot.cards).toHaveLength(1);
    expect(snapshot.baselinePlacements[0].teacherId).toBe('teacher-1');
    expect(snapshot.teacherUnavailablePeriods).toEqual([
      {
        teacherId: 'teacher-1',
        dayOfWeek: 2,
        period: 3,
      },
    ]);
    expect(snapshot.candidateDomain.included).toBe(false);

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.cards)).toBe(true);
    expect(Object.isFrozen(snapshot.cards[0])).toBe(true);

    expect(() => {
      (snapshot.cards as ManagementSolverCard[]).push({
        id: 'card-2',
        requirementId: 'requirement-1',
        blockIndex: 2,
        durationPeriods: 1,
        locked: false,
      });
    }).toThrow();

    expect(source.cards).toHaveLength(1);
  });

  it('rejects duplicate entity ids before a workspace is created', () => {
    const source = preview();
    source.cards.push({ ...source.cards[0] });

    expect(() => createManagementWorkspaceSnapshotV1(source))
      .toThrow(/mükerrer kart kimliği/);
  });

  it('rejects references that cannot be resolved inside the snapshot', () => {
    const source = preview();
    source.baselinePlacements[0].teacherId = 'missing-teacher';

    expect(() => createManagementWorkspaceSnapshotV1(source))
      .toThrow(/placement öğretmeni snapshot'ta yok/);
  });

  it('normalizes optional workspace collections without changing solver data', () => {
    const source = preview();
    delete source.teacherUnavailablePeriods;
    delete source.readiness.provisionalInputs;
    delete source.readiness.resourceUnknownSemantics;

    const snapshot = createManagementWorkspaceSnapshotV1(source);

    expect(snapshot.teacherUnavailablePeriods).toEqual([]);
    expect(snapshot.readiness.provisionalInputs).toEqual([]);
    expect(snapshot.readiness.resourceUnknownSemantics).toBeNull();
  });
});
