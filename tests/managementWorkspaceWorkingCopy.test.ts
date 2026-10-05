import { describe, expect, it } from 'vitest';

import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  MANAGEMENT_WORKSPACE_COPY_SCHEMA_VERSION,
  createManagementWorkspaceWorkingCopyV1,
  diffManagementWorkspaceV1,
  removeManagementWorkspacePlacementV1,
  setManagementWorkspacePlacementV1,
  setManagementWorkspaceRequirementRoomsV1,
  setManagementWorkspaceRoomInventoryV1,
  setManagementWorkspaceTeacherInventoryV1,
  setManagementWorkspaceRequirementTeachersV1,
} from '@/lib/managementWorkspaceWorkingCopy';

function snapshot(): ManagementWorkspaceSnapshotV1 {
  return {
    schemaVersion: 'management-workspace-v1',
    sourceSnapshotVersion: 'M33.0.1-v1',
    identity: {
      revisionId: 'revision-1',
      requirementSetId: 'requirement-set-1',
      revisionVersion: 3,
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

describe('management workspace working copy v1', () => {
  it('creates an independent mutable copy for every card', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    expect(copy.schemaVersion).toBe(
      MANAGEMENT_WORKSPACE_COPY_SCHEMA_VERSION,
    );
    expect(copy.placementsByCardId['card-1']).toEqual({
      cardId: 'card-1',
      dayOfWeek: 1,
      startPeriod: 1,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });
    expect(copy.placementsByCardId['card-2']).toEqual({
      cardId: 'card-2',
      dayOfWeek: null,
      startPeriod: null,
      teacherId: null,
      roomId: null,
    });

    copy.placementsByCardId['card-1'].dayOfWeek = 4;

    expect(source.baselinePlacements[0].dayOfWeek).toBe(1);
  });

  it('produces an empty diff before local edits', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    expect(diffManagementWorkspaceV1(source, copy)).toEqual({
      baseline: source.identity,
      hasChanges: false,
      dirtyCardIds: [],
      dirtyRequirementIds: [],
      dirtyResourceIds: [],
      placementChanges: [],
      requirementResourceChanges: [],
      inventoryChanges: [],
    });
  });

  it('tracks local move, assignment and remove changes without touching baseline', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-1',
      dayOfWeek: 3,
      startPeriod: 2,
      teacherId: null,
      roomId: 'room-1',
    });
    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-2',
      dayOfWeek: 5,
      startPeriod: 1,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });

    let diff = diffManagementWorkspaceV1(source, copy);

    expect(diff.hasChanges).toBe(true);
    expect(diff.dirtyCardIds).toEqual(['card-1', 'card-2']);
    expect(diff.placementChanges).toHaveLength(2);
    expect(diff.placementChanges[0].before.dayOfWeek).toBe(1);
    expect(diff.placementChanges[0].after.dayOfWeek).toBe(3);

    removeManagementWorkspacePlacementV1(copy, 'card-1');
    diff = diffManagementWorkspaceV1(source, copy);

    expect(diff.placementChanges[0].after).toEqual({
      cardId: 'card-1',
      dayOfWeek: null,
      startPeriod: null,
      teacherId: null,
      roomId: null,
    });
    expect(source.baselinePlacements[0].dayOfWeek).toBe(1);
  });

  it('tracks local resource inventory name and status changes', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspaceTeacherInventoryV1(
      copy,
      'teacher-1',
      {
        displayName: 'Türkçe Öğretmeni A',
      },
    );
    setManagementWorkspaceRoomInventoryV1(
      copy,
      'room-1',
      {
        operationalStatus: 'MAINTENANCE',
      },
    );

    const diff = diffManagementWorkspaceV1(source, copy);

    expect(diff.hasChanges).toBe(true);
    expect(diff.dirtyResourceIds).toEqual(['room-1', 'teacher-1']);
    expect(diff.inventoryChanges).toHaveLength(2);
    expect(diff.inventoryChanges).toEqual([
      {
        resourceType: 'ROOM',
        resourceId: 'room-1',
        before: {
          resourceType: 'ROOM',
          resourceId: 'room-1',
          displayName: '105A',
          operationalStatus: 'ACTIVE',
        },
        after: {
          resourceType: 'ROOM',
          resourceId: 'room-1',
          displayName: '105A',
          operationalStatus: 'MAINTENANCE',
        },
      },
      {
        resourceType: 'TEACHER',
        resourceId: 'teacher-1',
        before: {
          resourceType: 'TEACHER',
          resourceId: 'teacher-1',
          displayName: 'Türkçe Öğretmeni',
          operationalStatus: 'ACTIVE',
        },
        after: {
          resourceType: 'TEACHER',
          resourceId: 'teacher-1',
          displayName: 'Türkçe Öğretmeni A',
          operationalStatus: 'ACTIVE',
        },
      },
    ]);
  });

  it('tracks local requirement teacher and room resource changes', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspaceRequirementTeachersV1(
      copy,
      'requirement-1',
      [],
    );
    setManagementWorkspaceRequirementRoomsV1(
      copy,
      'requirement-1',
      {
        resourceMode: 'CAPABILITY',
        roomIds: [],
        requiredCapability: 'BALLET_STUDIO',
      },
    );

    const diff = diffManagementWorkspaceV1(source, copy);

    expect(diff.hasChanges).toBe(true);
    expect(diff.dirtyRequirementIds).toEqual(['requirement-1']);
    expect(diff.requirementResourceChanges).toHaveLength(1);
    expect(diff.requirementResourceChanges[0].before.teacherIds)
      .toEqual(['teacher-1']);
    expect(diff.requirementResourceChanges[0].after).toMatchObject({
      teacherIds: [],
      teacherMode: 'UNKNOWN',
      resourceMode: 'CAPABILITY',
      roomIds: [],
      requiredCapability: 'BALLET_STUDIO',
    });
    expect(source.teacherPools).toEqual([
      {
        requirementId: 'requirement-1',
        teacherId: 'teacher-1',
      },
    ]);
  });

  it('rejects invalid teacher policy values at the snapshot boundary', () => {
    const base = snapshot();
    const source = {
      ...base,
      requirements: [
        {
          ...base.requirements[0],
          teacherAssignmentScope: 'INVALID_SCOPE',
        },
        ...base.requirements.slice(1),
      ],
    };

    expect(() => createManagementWorkspaceWorkingCopyV1(source))
      .toThrow('Workspace snapshot geçersiz öğretmen kapsamı içeriyor');
  });

  it('rejects diffing a working copy created from another baseline', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const other = {
      ...snapshot(),
      identity: {
        ...snapshot().identity,
        snapshotHash: 'different-snapshot',
      },
    };

    expect(() => diffManagementWorkspaceV1(other, copy))
      .toThrow(/farklı bir baseline snapshot/);
  });

  it('rejects edits for cards outside the workspace', () => {
    const copy = createManagementWorkspaceWorkingCopyV1(snapshot());

    expect(() => setManagementWorkspacePlacementV1(copy, {
      cardId: 'missing-card',
      dayOfWeek: 1,
      startPeriod: 1,
      teacherId: null,
      roomId: null,
    })).toThrow(/kartı bulunamadı/);
  });
});
