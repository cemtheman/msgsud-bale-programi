import { describe, expect, it } from 'vitest';

import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  prepareManagementWorkspaceRoomNameEditV1,
  prepareManagementWorkspaceRoomStatusEditV1,
  prepareManagementWorkspaceTeacherDepartureV1,
  prepareManagementWorkspaceTeacherNameEditV1,
  prepareManagementWorkspaceTeacherStatusEditV1,
  previewManagementWorkspaceTeacherDepartureV1,
} from '@/lib/managementWorkspaceInventoryEdits';
import {
  executeManagementWorkspaceCommandsV1,
  previewManagementWorkspaceCommandsV1,
} from '@/lib/managementWorkspaceCommands';
import {
  createManagementWorkspaceWorkingCopyV1,
  removeManagementWorkspacePlacementV1,
} from '@/lib/managementWorkspaceWorkingCopy';
import {
  createManagementWorkspaceHistoryV1,
} from '@/lib/managementWorkspaceHistory';
import {
  prepareManagementWorkspaceCommitV1,
} from '@/lib/managementWorkspaceCommit';

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

  it('allows preserving baseline placements when a teacher is locally inactivated', () => {
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

    expect(preview.applied).toBe(true);
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

  it('prepares INACTIVATE_KEEP as one undoable local inventory command', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();

    const preview = previewManagementWorkspaceTeacherDepartureV1(
      source,
      copy,
      'teacher-1',
    );
    const prepared = prepareManagementWorkspaceTeacherDepartureV1(
      source,
      copy,
      'teacher-1',
      'INACTIVATE_KEEP',
    );
    const result = executeManagementWorkspaceCommandsV1(
      source,
      copy,
      history,
      prepared.commands,
    );

    expect(preview).toMatchObject({
      activeRequirementCount: 1,
      placedBlockCount: 1,
    });
    expect(result.applied).toBe(true);
    expect(copy.teacherInventoryById['teacher-1'].operationalStatus)
      .toBe('INACTIVE');
    expect(copy.placementsByCardId['card-1'].teacherId).toBe('teacher-1');
    expect(history.undoStack).toHaveLength(1);
    expect(prepareManagementWorkspaceCommitV1(source, copy).ready).toBe(true);
  });

  it('prepares INACTIVATE_CLEAR as one coordinated local batch', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();

    const prepared = prepareManagementWorkspaceTeacherDepartureV1(
      source,
      copy,
      'teacher-1',
      'INACTIVATE_CLEAR',
    );
    const result = executeManagementWorkspaceCommandsV1(
      source,
      copy,
      history,
      prepared.commands,
    );

    expect(result.applied).toBe(true);
    expect(copy.teacherInventoryById['teacher-1'].operationalStatus)
      .toBe('INACTIVE');
    expect(copy.requirementResourcesById['requirement-1']).toMatchObject({
      teacherIds: [],
      teacherMode: 'UNKNOWN',
    });
    expect(copy.placementsByCardId['card-1']).toMatchObject({
      dayOfWeek: 1,
      startPeriod: 1,
      teacherId: null,
      roomId: 'room-1',
    });
    expect(new Set(history.undoStack.map((entry) => entry.batchId)).size)
      .toBe(1);

    const commit = prepareManagementWorkspaceCommitV1(source, copy);
    expect(commit.ready).toBe(true);
    expect(commit.issues).toEqual([]);
    expect(commit.payload?.changes[0]?.after.teacher_id).toBeNull();
    expect(commit.payload?.requirementChanges[0]?.after.teacher_ids)
      .toEqual([]);
    expect(commit.payload?.resourceChanges[0]?.after.operational_status)
      .toBe('INACTIVE');
  });

  it('still blocks assigning a locally inactive teacher as a new placement', () => {
    const source = {
      ...snapshot(),
      baselinePlacements: [{
        ...snapshot().baselinePlacements[0],
        teacherId: null,
      }],
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const statusPlan = prepareManagementWorkspaceTeacherStatusEditV1(
      copy,
      'teacher-1',
      'INACTIVE',
    );

    const preview = previewManagementWorkspaceCommandsV1(
      source,
      copy,
      [
        statusPlan.command,
        {
          type: 'SET_PLACEMENT',
          placement: {
            ...copy.placementsByCardId['card-1'],
            teacherId: 'teacher-1',
          },
        },
      ],
    );

    expect(preview.applied).toBe(false);
    expect(preview.issues.map((issue) => issue.code))
      .toContain('TEACHER_INACTIVE');
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
