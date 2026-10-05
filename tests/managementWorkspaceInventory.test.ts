import { describe, expect, it } from 'vitest';

import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  prepareManagementWorkspaceRoomNameEditV1,
  prepareManagementWorkspaceRoomStatusEditV1,
  prepareManagementWorkspaceTeacherNameEditV1,
  prepareManagementWorkspaceTeacherStatusEditV1,
} from '@/lib/managementWorkspaceInventoryEdits';
import {
  previewManagementWorkspaceCommandsV1,
} from '@/lib/managementWorkspaceCommands';
import {
  createManagementWorkspaceWorkingCopyV1,
  removeManagementWorkspacePlacementV1,
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
    requirements: [{
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
      resourceMode: 'FIXED',
      requiredCapability: null,
    }],
    cards: [{
      id: 'card-1',
      requirementId: 'requirement-1',
      blockIndex: 1,
      durationPeriods: 1,
      locked: false,
    }],
    instructionalGroups: [{
      id: 'group-1',
      classGroupId: 'class-1',
      name: '5A',
      groupType: 'SECTION',
      termStatus: 'ACTIVE',
      knowledgeStatus: 'CONFIRMED',
    }],
    instructionalGroupRelations: [],
    teacherPools: [{
      requirementId: 'requirement-1',
      teacherId: 'teacher-1',
    }],
    roomPools: [{
      requirementId: 'requirement-1',
      roomId: 'room-1',
    }],
    teachers: [{
      id: 'teacher-1',
      name: 'Öğretmen 1',
      operationalStatus: 'ACTIVE',
    }],
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
        id: 'room-alias',
        name: 'Salon 1 Alias',
        canonicalRoomId: 'room-1',
        capabilities: [],
        knowledgeStatus: 'CONFIRMED',
        operationalStatus: 'ACTIVE',
      },
    ],
    baselinePlacements: [{
      cardId: 'card-1',
      dayOfWeek: 1,
      startPeriod: 1,
      teacherId: 'teacher-1',
      roomId: 'room-1',
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

describe('management workspace inventory edits', () => {
  it('normalizes local teacher display names', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const plan = prepareManagementWorkspaceTeacherNameEditV1(
      copy,
      'teacher-1',
      '  Öğretmen Yeni  ',
    );

    expect(plan.resource).toMatchObject({
      resourceType: 'TEACHER',
      resourceId: 'teacher-1',
      displayName: 'Öğretmen Yeni',
      operationalStatus: 'ACTIVE',
    });
  });

  it('blocks inactivating a teacher that is still used by a local placement', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const plan = prepareManagementWorkspaceTeacherStatusEditV1(
      copy,
      'teacher-1',
      'INACTIVE',
    );
    const preview = previewManagementWorkspaceCommandsV1(
      source,
      copy,
      [plan.command],
    );

    expect(preview.applied).toBe(false);
    expect(preview.issues.map((issue) => issue.code))
      .toContain('TEACHER_INACTIVE');
  });

  it('allows teacher inactivation after the local placement is removed', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    removeManagementWorkspacePlacementV1(copy, 'card-1');

    const plan = prepareManagementWorkspaceTeacherStatusEditV1(
      copy,
      'teacher-1',
      'INACTIVE',
    );
    const preview = previewManagementWorkspaceCommandsV1(
      source,
      copy,
      [plan.command],
    );

    expect(preview.applied).toBe(true);
  });

  it('blocks non-active room status while the room family is locally placed', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const prepared = prepareManagementWorkspaceRoomStatusEditV1(
      source,
      copy,
      'room-1',
      'MAINTENANCE',
    );

    expect(prepared.preview.canApply).toBe(false);
    expect(prepared.preview.placedImpactCount).toBe(1);
    expect(prepared.preview.blockReasons).toContain('ROOM_INACTIVE');
  });

  it('blocks canonical room status when a local placement uses its alias', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    copy.placementsByCardId['card-1'] = {
      ...copy.placementsByCardId['card-1'],
      roomId: 'room-alias',
    };

    const prepared = prepareManagementWorkspaceRoomStatusEditV1(
      source,
      copy,
      'room-1',
      'OUT_OF_SERVICE',
    );

    expect(prepared.preview.canApply).toBe(false);
    expect(prepared.preview.placedImpactCount).toBe(1);
    expect(prepared.preview.placedImpacts[0].roomId).toBe('room-alias');
    expect(prepared.preview.blockReasons).toContain('ROOM_INACTIVE');
  });

  it('allows non-active room status after its local placement is removed', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    removeManagementWorkspacePlacementV1(copy, 'card-1');

    const prepared = prepareManagementWorkspaceRoomStatusEditV1(
      source,
      copy,
      'room-1',
      'OUT_OF_SERVICE',
    );

    expect(prepared.preview.canApply).toBe(true);
    expect(prepared.preview.placedImpactCount).toBe(0);
  });

  it('rejects direct alias room name edits', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    expect(() => prepareManagementWorkspaceRoomNameEditV1(
      source,
      copy,
      'room-alias',
      'Yeni Alias',
    )).toThrow('Salon alias adları Kaynaklar ekranından değiştirilemez.');
  });
});
