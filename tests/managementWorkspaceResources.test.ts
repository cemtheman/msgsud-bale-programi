import { describe, expect, it } from 'vitest';

import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  prepareManagementWorkspaceResourceEditV1,
} from '@/lib/managementWorkspaceResources';
import {
  createManagementWorkspaceWorkingCopyV1,
  setManagementWorkspacePlacementV1,
} from '@/lib/managementWorkspaceWorkingCopy';

function snapshot(): ManagementWorkspaceSnapshotV1 {
  return {
    schemaVersion: 'management-workspace-v1',
    sourceSnapshotVersion: 'M39.1-v1',
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
        id: 'requirement-main',
        subjectId: 'subject-main',
        subjectName: 'K. Bale',
        groupId: 'group-main',
        groupName: '6A BALLET',
        groupType: 'BALLET',
        weeklyLoad: 2,
        preferredPartition: null,
        allowedPartitions: null,
        minDistinctDays: null,
        maxBlocksPerDay: null,
        maxConsecutivePeriods: null,
        courseCharacter: null,
        deliveryMode: null,
        teacherRequirement: 'REQUIRED',
        teacherMode: 'ELIGIBLE_POOL',
        teacherAssignmentScope: 'REQUIREMENT',
        teacherContinuity: 'REQUIRED',
        resourceMode: 'ELIGIBLE_POOL',
        requiredCapability: null,
      },
      {
        id: 'requirement-other',
        subjectId: 'subject-other',
        subjectName: 'Matematik',
        groupId: 'group-other',
        groupName: '7A',
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
        id: 'card-main-1',
        requirementId: 'requirement-main',
        blockIndex: 1,
        durationPeriods: 1,
        locked: false,
      },
      {
        id: 'card-main-2',
        requirementId: 'requirement-main',
        blockIndex: 2,
        durationPeriods: 1,
        locked: false,
      },
      {
        id: 'card-other',
        requirementId: 'requirement-other',
        blockIndex: 1,
        durationPeriods: 1,
        locked: false,
      },
    ],
    instructionalGroups: [
      {
        id: 'group-main',
        classGroupId: null,
        name: '6A BALLET',
        groupType: 'BALLET',
        termStatus: 'ACTIVE',
        knowledgeStatus: 'CONFIRMED',
      },
      {
        id: 'group-other',
        classGroupId: null,
        name: '7A',
        groupType: 'SECTION',
        termStatus: 'ACTIVE',
        knowledgeStatus: 'CONFIRMED',
      },
    ],
    instructionalGroupRelations: [],
    teacherPools: [
      { requirementId: 'requirement-main', teacherId: 'teacher-1' },
      { requirementId: 'requirement-main', teacherId: 'teacher-2' },
      { requirementId: 'requirement-other', teacherId: 'teacher-2' },
    ],
    roomPools: [
      { requirementId: 'requirement-main', roomId: 'room-1' },
      { requirementId: 'requirement-main', roomId: 'room-2' },
      { requirementId: 'requirement-other', roomId: 'room-2' },
    ],
    teachers: [
      { id: 'teacher-1', name: 'Öğretmen 1', operationalStatus: 'ACTIVE' },
      { id: 'teacher-2', name: 'Öğretmen 2', operationalStatus: 'ACTIVE' },
    ],
    teacherUnavailablePeriods: [],
    rooms: [
      {
        id: 'room-1',
        name: 'Salon 1',
        canonicalRoomId: null,
        capabilities: [],
        knowledgeStatus: 'CONFIRMED',
        operationalStatus: 'ACTIVE',
      },
      {
        id: 'room-2',
        name: 'Salon 2',
        canonicalRoomId: null,
        capabilities: [],
        knowledgeStatus: 'CONFIRMED',
        operationalStatus: 'ACTIVE',
      },
    ],
    baselinePlacements: [
      {
        cardId: 'card-main-1',
        dayOfWeek: 1,
        startPeriod: 2,
        teacherId: 'teacher-1',
        roomId: 'room-1',
      },
      {
        cardId: 'card-main-2',
        dayOfWeek: 3,
        startPeriod: 2,
        teacherId: 'teacher-1',
        roomId: 'room-1',
      },
      {
        cardId: 'card-other',
        dayOfWeek: 2,
        startPeriod: 5,
        teacherId: 'teacher-2',
        roomId: 'room-2',
      },
    ],
    baselineMetrics: {
      cardCount: 3,
      placedCardCount: 3,
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
      omissionReason: 'occupancy-relative',
    },
  };
}

describe('management workspace placement resource edits', () => {
  it('expands a required-continuity teacher change to all placed blocks', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const plan = prepareManagementWorkspaceResourceEditV1(
      source,
      copy,
      ['card-main-1'],
      'TEACHER',
      'teacher-2',
    );

    expect(plan.preview.canApply).toBe(true);
    expect(plan.preview.requestedCardIds).toEqual(['card-main-1']);
    expect(plan.preview.cardIds.sort()).toEqual([
      'card-main-1',
      'card-main-2',
    ]);
    expect(plan.preview.requirementWideExpansionCount).toBe(1);
    expect(plan.commands).toHaveLength(2);
    expect(plan.commands.every((command) => (
      command.type === 'SET_PLACEMENT'
      && command.placement.teacherId === 'teacher-2'
    ))).toBe(true);
  });

  it('rejects a local teacher change that introduces a timetable conflict', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-other',
      dayOfWeek: 1,
      startPeriod: 2,
      teacherId: 'teacher-2',
      roomId: 'room-2',
    });

    const plan = prepareManagementWorkspaceResourceEditV1(
      source,
      copy,
      ['card-main-1'],
      'TEACHER',
      'teacher-2',
    );

    expect(plan.preview.canApply).toBe(false);
    expect(plan.preview.blockReasons).toContain('TEACHER_CONFLICT');
  });

  it('changes only the selected room while preserving teacher/time', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const plan = prepareManagementWorkspaceResourceEditV1(
      source,
      copy,
      ['card-main-1'],
      'ROOM',
      'room-2',
    );

    expect(plan.preview.canApply).toBe(true);
    expect(plan.commands).toHaveLength(1);

    const command = plan.commands[0];
    expect(command.type).toBe('SET_PLACEMENT');
    if (command.type !== 'SET_PLACEMENT') return;

    expect(command.placement).toEqual({
      cardId: 'card-main-1',
      dayOfWeek: 1,
      startPeriod: 2,
      teacherId: 'teacher-1',
      roomId: 'room-2',
    });
  });

  it('invalidates a local resource preview token when placement state changes', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const before = prepareManagementWorkspaceResourceEditV1(
      source,
      copy,
      ['card-main-1'],
      'ROOM',
      'room-2',
    ).preview.stateToken;

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-main-1',
      dayOfWeek: 1,
      startPeriod: 3,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });

    const after = prepareManagementWorkspaceResourceEditV1(
      source,
      copy,
      ['card-main-1'],
      'ROOM',
      'room-2',
    ).preview.stateToken;

    expect(after).not.toBe(before);
  });
});
