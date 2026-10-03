import { describe, expect, it } from 'vitest';

import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  createManagementWorkspaceWorkingCopyV1,
  setManagementWorkspacePlacementV1,
} from '@/lib/managementWorkspaceWorkingCopy';
import { prepareManagementWorkspaceCommitV1 } from '@/lib/managementWorkspaceCommit';

function snapshot(): ManagementWorkspaceSnapshotV1 {
  return {
    schemaVersion: 'management-workspace-v1',
    sourceSnapshotVersion: 'M33.0.1-v1',
    identity: {
      revisionId: 'revision-1',
      requirementSetId: 'requirement-set-1',
      revisionVersion: 7,
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
        id: 'card-b',
        requirementId: 'requirement-1',
        blockIndex: 2,
        durationPeriods: 1,
        locked: false,
      },
      {
        id: 'card-a',
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
    ],
    baselinePlacements: [
      {
        cardId: 'card-a',
        dayOfWeek: 1,
        startPeriod: 1,
        teacherId: 'teacher-1',
        roomId: 'room-1',
      },
      {
        cardId: 'card-b',
        dayOfWeek: 1,
        startPeriod: 2,
        teacherId: 'teacher-1',
        roomId: 'room-1',
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

describe('management workspace commit v1', () => {
  it('builds a deterministic atomic commit payload from the local diff', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-b',
      dayOfWeek: 2,
      startPeriod: 3,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });
    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-a',
      dayOfWeek: 2,
      startPeriod: 1,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.issues).toEqual([]);
    expect(prepared.payload?.revisionId).toBe('revision-1');
    expect(prepared.payload?.revisionVersion).toBe(7);
    expect(prepared.payload?.snapshotHash).toBe('snapshot-hash');
    expect(prepared.payload?.baselineHash).toBe('baseline-hash');
    expect(prepared.payload?.changes.map((change) => change.card_id))
      .toEqual(['card-a', 'card-b']);
  });

  it('does not prepare a commit when the working copy matches baseline', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(false);
    expect(prepared.issues).toEqual([]);
    expect(prepared.payload).toBeNull();
  });

  it('blocks commit preparation when final hard validation fails', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-b',
      dayOfWeek: 1,
      startPeriod: 1,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(false);
    expect(prepared.payload).toBeNull();
    expect(prepared.issues.map((issue) => issue.code))
      .toContain('TEACHER_CONFLICT');
  });
});
