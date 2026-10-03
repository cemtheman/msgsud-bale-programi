import { describe, expect, it } from 'vitest';

import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  createManagementWorkspaceWorkingCopyV1,
  diffManagementWorkspaceV1,
} from '@/lib/managementWorkspaceWorkingCopy';
import {
  applyManagementWorkspacePlacementOperationV1,
  applyManagementWorkspaceRemoveOperationV1,
  canRedoManagementWorkspaceV1,
  canUndoManagementWorkspaceV1,
  createManagementWorkspaceHistoryV1,
  redoManagementWorkspaceOperationV1,
  undoManagementWorkspaceOperationV1,
} from '@/lib/managementWorkspaceHistory';

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
      periods: [1, 2, 3],
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
        weeklyLoad: 2,
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
        requirementId: 'requirement-1',
        blockIndex: 2,
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
      cardCount: 2,
      placedCardCount: 1,
      unplacedCardCount: 1,
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

describe('management workspace history v1', () => {
  it('records local operations with monotonic sequence numbers', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();

    const first = applyManagementWorkspacePlacementOperationV1(
      copy,
      history,
      {
        cardId: 'card-1',
        dayOfWeek: 2,
        startPeriod: 2,
        teacherId: 'teacher-1',
        roomId: 'room-1',
      },
    );
    const second = applyManagementWorkspaceRemoveOperationV1(
      copy,
      history,
      'card-1',
    );

    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
    expect(history.undoStack).toHaveLength(2);
    expect(history.redoStack).toHaveLength(0);
    expect(canUndoManagementWorkspaceV1(history)).toBe(true);
    expect(canRedoManagementWorkspaceV1(history)).toBe(false);
  });

  it('undoes and redoes multiple local operations without DB history', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();

    applyManagementWorkspacePlacementOperationV1(
      copy,
      history,
      {
        cardId: 'card-1',
        dayOfWeek: 3,
        startPeriod: 2,
        teacherId: 'teacher-1',
        roomId: 'room-1',
      },
    );
    applyManagementWorkspacePlacementOperationV1(
      copy,
      history,
      {
        cardId: 'card-2',
        dayOfWeek: 4,
        startPeriod: 1,
        teacherId: 'teacher-1',
        roomId: 'room-1',
      },
    );

    expect(diffManagementWorkspaceV1(source, copy).dirtyCardIds)
      .toEqual(['card-1', 'card-2']);

    expect(undoManagementWorkspaceOperationV1(copy, history)?.cardId)
      .toBe('card-2');
    expect(undoManagementWorkspaceOperationV1(copy, history)?.cardId)
      .toBe('card-1');

    expect(diffManagementWorkspaceV1(source, copy).hasChanges)
      .toBe(false);
    expect(canRedoManagementWorkspaceV1(history)).toBe(true);

    expect(redoManagementWorkspaceOperationV1(copy, history)?.cardId)
      .toBe('card-1');
    expect(redoManagementWorkspaceOperationV1(copy, history)?.cardId)
      .toBe('card-2');

    expect(diffManagementWorkspaceV1(source, copy).dirtyCardIds)
      .toEqual(['card-1', 'card-2']);
  });

  it('clears redo history after a new local edit', () => {
    const copy = createManagementWorkspaceWorkingCopyV1(snapshot());
    const history = createManagementWorkspaceHistoryV1();

    applyManagementWorkspacePlacementOperationV1(
      copy,
      history,
      {
        cardId: 'card-1',
        dayOfWeek: 2,
        startPeriod: 1,
        teacherId: 'teacher-1',
        roomId: 'room-1',
      },
    );

    undoManagementWorkspaceOperationV1(copy, history);
    expect(canRedoManagementWorkspaceV1(history)).toBe(true);

    applyManagementWorkspacePlacementOperationV1(
      copy,
      history,
      {
        cardId: 'card-2',
        dayOfWeek: 5,
        startPeriod: 2,
        teacherId: 'teacher-1',
        roomId: 'room-1',
      },
    );

    expect(canRedoManagementWorkspaceV1(history)).toBe(false);
    expect(history.redoStack).toHaveLength(0);
  });

  it('restores full placement state when undoing a remove', () => {
    const copy = createManagementWorkspaceWorkingCopyV1(snapshot());
    const history = createManagementWorkspaceHistoryV1();

    applyManagementWorkspaceRemoveOperationV1(
      copy,
      history,
      'card-1',
    );

    expect(copy.placementsByCardId['card-1']).toEqual({
      cardId: 'card-1',
      dayOfWeek: null,
      startPeriod: null,
      teacherId: null,
      roomId: null,
    });

    undoManagementWorkspaceOperationV1(copy, history);

    expect(copy.placementsByCardId['card-1']).toEqual({
      cardId: 'card-1',
      dayOfWeek: 1,
      startPeriod: 1,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });
  });

  it('returns null when undo or redo stacks are empty', () => {
    const copy = createManagementWorkspaceWorkingCopyV1(snapshot());
    const history = createManagementWorkspaceHistoryV1();

    expect(undoManagementWorkspaceOperationV1(copy, history)).toBeNull();
    expect(redoManagementWorkspaceOperationV1(copy, history)).toBeNull();
  });
});
