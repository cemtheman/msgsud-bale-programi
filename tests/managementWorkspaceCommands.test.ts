import { describe, expect, it } from 'vitest';

import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  createManagementWorkspaceWorkingCopyV1,
  diffManagementWorkspaceV1,
} from '@/lib/managementWorkspaceWorkingCopy';
import {
  createManagementWorkspaceHistoryV1,
} from '@/lib/managementWorkspaceHistory';
import {
  executeManagementWorkspaceCommandV1,
  resetManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceCommands';

function snapshot(): ManagementWorkspaceSnapshotV1 {
  return {
    schemaVersion: 'management-workspace-v1',
    sourceSnapshotVersion: 'M33.0.1-v1',
    identity: {
      revisionId: 'revision-1',
      requirementSetId: 'requirement-set-1',
      revisionVersion: 1,
      academicYear: '2026-2027',
      term: 1,
      snapshotHash: 'snapshot-hash',
      baselineHash: 'baseline-hash',
    },
    hardConstraintContract: {
      days: [1, 2, 3, 4, 5],
      periods: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      rules: [],
    },
    requirements: [
      {
        id: 'requirement-1',
        subjectId: 'subject-1',
        subjectName: 'Türkçe',
        groupId: 'group-1',
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
        teacherAssignmentScope: 'REQUIREMENT',
        teacherContinuity: 'REQUIRED',
        resourceMode: 'ELIGIBLE_POOL',
        requiredCapability: null,
      },
      {
        id: 'requirement-2',
        subjectId: 'subject-2',
        subjectName: 'Matematik',
        groupId: 'group-2',
        groupName: '5B',
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
      {
        id: 'card-2',
        requirementId: 'requirement-2',
        blockIndex: 1,
        durationPeriods: 1,
        locked: false,
      },
    ],
    instructionalGroups: [
      {
        id: 'group-1',
        classGroupId: 'class-1',
        name: '5A',
        groupType: 'SECTION',
        termStatus: 'ACTIVE',
        knowledgeStatus: 'CONFIRMED',
      },
      {
        id: 'group-2',
        classGroupId: 'class-2',
        name: '5B',
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
      {
        requirementId: 'requirement-2',
        teacherId: 'teacher-1',
      },
    ],
    roomPools: [
      {
        requirementId: 'requirement-1',
        roomId: 'room-1',
      },
      {
        requirementId: 'requirement-2',
        roomId: 'room-2',
      },
    ],
    teachers: [
      {
        id: 'teacher-1',
        name: 'Öğretmen 1',
        operationalStatus: 'ACTIVE',
      },
    ],
    teacherUnavailablePeriods: [],
    rooms: [
      {
        id: 'room-1',
        name: '105A',
        canonicalRoomId: null,
        capabilities: [],
        knowledgeStatus: 'CONFIRMED',
        operationalStatus: 'ACTIVE',
      },
      {
        id: 'room-2',
        name: '105B',
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
      {
        cardId: 'card-2',
        dayOfWeek: 1,
        startPeriod: 2,
        teacherId: 'teacher-1',
        roomId: 'room-2',
      },
    ],
    baselineMetrics: {
      cardCount: 2,
      placedCardCount: 2,
      unplacedCardCount: 0,
      lockedCardCount: 0,
      changeCost: 0,
      preferredTeacherContinuityBreaks: 0,
      teacherIdleGapPeriods: 0,
      roomStabilityBreaks: 0,
    },
    readiness: {
      hardInputReady: true,
      hardBlockers: [],
      provisionalInputs: [],
      resourceUnknownSemantics: null,
      missingOptionalModelInputs: [],
    },
    candidateDomain: {
      included: false,
      omissionReason: 'excluded',
    },
  };
}

describe('management workspace command executor v1', () => {
  it('applies a valid local command and records one history operation', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();

    const result = executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      {
        type: 'SET_PLACEMENT',
        placement: {
          cardId: 'card-2',
          dayOfWeek: 2,
          startPeriod: 2,
          teacherId: 'teacher-1',
          roomId: 'room-2',
        },
      },
    );

    expect(result.applied).toBe(true);
    expect(result.issues).toEqual([]);
    expect(history.undoStack).toHaveLength(1);
    expect(history.nextSequence).toBe(2);
    expect(copy.placementsByCardId['card-2'].dayOfWeek).toBe(2);
    expect(diffManagementWorkspaceV1(source, copy).dirtyCardIds)
      .toEqual(['card-2']);
  });

  it('rejects an invalid command without mutating copy or history', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();

    const before = JSON.stringify(copy);
    const result = executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      {
        type: 'SET_PLACEMENT',
        placement: {
          cardId: 'card-2',
          dayOfWeek: 1,
          startPeriod: 1,
          teacherId: 'teacher-1',
          roomId: 'room-2',
        },
      },
    );

    expect(result.applied).toBe(false);
    expect(result.operation).toBeNull();
    expect(result.issues.map((issue) => issue.code))
      .toContain('TEACHER_CONFLICT');
    expect(JSON.stringify(copy)).toBe(before);
    expect(history.undoStack).toEqual([]);
    expect(history.redoStack).toEqual([]);
    expect(history.nextSequence).toBe(1);
  });

  it('rejects removing a locked card and leaves local state untouched', () => {
    const lockedSource: ManagementWorkspaceSnapshotV1 = {
      ...snapshot(),
      cards: snapshot().cards.map((card) => (
        card.id === 'card-1'
          ? { ...card, locked: true }
          : card
      )),
    };
    const copy = createManagementWorkspaceWorkingCopyV1(lockedSource);
    const history = createManagementWorkspaceHistoryV1();

    const result = executeManagementWorkspaceCommandV1(
      lockedSource,
      copy,
      history,
      {
        type: 'REMOVE_PLACEMENT',
        cardId: 'card-1',
      },
    );

    expect(result.applied).toBe(false);
    expect(result.issues.map((issue) => issue.code))
      .toContain('LOCKED_CARD_MOVED');
    expect(copy.placementsByCardId['card-1'].dayOfWeek).toBe(1);
    expect(history.undoStack).toHaveLength(0);
  });

  it('resets copy and local history back to immutable snapshot baseline', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();

    executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      {
        type: 'SET_PLACEMENT',
        placement: {
          cardId: 'card-2',
          dayOfWeek: 2,
          startPeriod: 2,
          teacherId: 'teacher-1',
          roomId: 'room-2',
        },
      },
    );

    expect(diffManagementWorkspaceV1(source, copy).hasChanges).toBe(true);
    expect(history.undoStack).toHaveLength(1);

    resetManagementWorkspaceWorkingCopyV1(
      source,
      copy,
      history,
    );

    expect(diffManagementWorkspaceV1(source, copy).hasChanges).toBe(false);
    expect(history.undoStack).toEqual([]);
    expect(history.redoStack).toEqual([]);
    expect(history.nextSequence).toBe(1);
  });
  it('allows a local remove that temporarily makes minDistinctDays incomplete', () => {
    const source: ManagementWorkspaceSnapshotV1 = {
      ...snapshot(),
      requirements: snapshot().requirements.map((requirement) => (
        requirement.id === 'requirement-1'
          ? { ...requirement, minDistinctDays: 1 }
          : requirement
      )),
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();

    const result = executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      {
        type: 'REMOVE_PLACEMENT',
        cardId: 'card-1',
      },
    );

    expect(result.applied).toBe(true);
    expect(copy.placementsByCardId['card-1'].dayOfWeek).toBeNull();
    expect(history.undoStack).toHaveLength(1);
  });

});
