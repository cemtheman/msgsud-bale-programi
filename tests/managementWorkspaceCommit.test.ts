import { describe, expect, it } from 'vitest';

import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  createManagementWorkspaceWorkingCopyV1,
  setManagementWorkspacePlacementV1,
  setManagementWorkspaceRequirementRoomsV1,
  setManagementWorkspaceRequirementTeacherPolicyV1,
  setManagementWorkspaceRequirementTeachersV1,
  setManagementWorkspaceTeacherInventoryV1,
  setManagementWorkspaceTeacherAvailabilityV1,
  setManagementWorkspaceTeacherPlanningV1,
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

  it('includes deterministic resource inventory changes in the atomic payload', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspaceTeacherInventoryV1(
      copy,
      'teacher-1',
      {
        displayName: 'Öğretmen Yeni',
      },
    );

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.payload?.changes).toEqual([]);
    expect(prepared.payload?.requirementChanges).toEqual([]);
    expect(prepared.payload?.resourceChanges).toEqual([
      {
        resource_type: 'TEACHER',
        resource_id: 'teacher-1',
        before: {
          display_name: 'Öğretmen 1',
          operational_status: 'ACTIVE',
        },
        after: {
          display_name: 'Öğretmen Yeni',
          operational_status: 'ACTIVE',
        },
      },
    ]);
  });

  it('includes deterministic requirement resource changes in the atomic payload', () => {
    const source: ManagementWorkspaceSnapshotV1 = {
      ...snapshot(),
      baselinePlacements: [],
      baselineMetrics: {
        ...snapshot().baselineMetrics,
        placedCardCount: 0,
        unplacedCardCount: 2,
      },
    };
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

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.payload?.changes).toEqual([]);
    expect(prepared.payload?.requirementChanges).toEqual([
      {
        requirement_id: 'requirement-1',
        before: {
          teacher_ids: ['teacher-1'],
          teacher_mode: 'FIXED',
          teacher_assignment_scope: 'REQUIREMENT',
          teacher_continuity: 'REQUIRED',
          resource_mode: 'ELIGIBLE_POOL',
          room_ids: ['room-1'],
          required_capability: null,
        },
        after: {
          teacher_ids: [],
          teacher_mode: 'UNKNOWN',
          teacher_assignment_scope: 'REQUIREMENT',
          teacher_continuity: 'REQUIRED',
          resource_mode: 'CAPABILITY',
          room_ids: [],
          required_capability: 'BALLET_STUDIO',
        },
      },
    ]);
  });

  it('allows policy-only plan changes on a placed baseline requirement', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspaceRequirementTeacherPolicyV1(
      copy,
      'requirement-1',
      {
        teacherAssignmentScope: 'BLOCK',
        teacherContinuity: 'NONE',
      },
    );

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.issues).toEqual([]);
    expect(prepared.payload?.changes).toEqual([]);
    expect(prepared.payload?.requirementChanges).toEqual([
      {
        requirement_id: 'requirement-1',
        before: {
          teacher_ids: ['teacher-1'],
          teacher_mode: 'FIXED',
          teacher_assignment_scope: 'REQUIREMENT',
          teacher_continuity: 'REQUIRED',
          resource_mode: 'ELIGIBLE_POOL',
          room_ids: ['room-1'],
          required_capability: null,
        },
        after: {
          teacher_ids: ['teacher-1'],
          teacher_mode: 'FIXED',
          teacher_assignment_scope: 'BLOCK',
          teacher_continuity: 'NONE',
          resource_mode: 'ELIGIBLE_POOL',
          room_ids: ['room-1'],
          required_capability: null,
        },
      },
    ]);
  });

  it('blocks plan resource edits while the baseline requirement is placed', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspaceRequirementTeachersV1(
      copy,
      'requirement-1',
      [],
    );

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(false);
    expect(prepared.issues.map((issue) => issue.code))
      .toContain('REQUIREMENT_RESOURCES_REQUIRE_UNPLACED');
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
  it('allows commit when only inherited baseline issues remain unchanged', () => {
    const source: ManagementWorkspaceSnapshotV1 = {
      ...snapshot(),
      teacherPools: [],
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-b',
      dayOfWeek: 2,
      startPeriod: 3,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.issues).toEqual([]);
    expect(prepared.payload?.changes.map((change) => change.card_id))
      .toEqual(['card-b']);
  });

  it('still blocks commit when the local edit introduces a new hard issue', () => {
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
    expect(prepared.issues.map((issue) => issue.code))
      .toContain('TEACHER_CONFLICT');
  });


  it('includes deterministic teacher planning changes in the atomic payload', () => {
    const source = {
      ...snapshot(),
      teacherLoadTargets: [{
        teacherId: 'teacher-1',
        minimumLoad: 4,
        targetLoad: 6,
        maximumLoad: 8,
      }],
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspaceTeacherPlanningV1(copy, 'teacher-1', {
      minimumLoad: 5,
      targetLoad: 7,
      maximumLoad: 9,
    });

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.payload?.teacherPlanningChanges).toEqual([{
      teacher_id: 'teacher-1',
      before: {
        minimum_load: 4,
        target_load: 6,
        maximum_load: 8,
      },
      after: {
        minimum_load: 5,
        target_load: 7,
        maximum_load: 9,
      },
    }]);
  });


  it('includes deterministic teacher availability changes in the atomic payload', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspaceTeacherAvailabilityV1(copy, 'teacher-1', [
      { dayOfWeek: 3, period: 2 },
      { dayOfWeek: 1, period: 4 },
    ]);

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.payload?.teacherAvailabilityChanges).toEqual([{
      teacher_id: 'teacher-1',
      before: [],
      after: [
        { day_of_week: 1, period: 4 },
        { day_of_week: 3, period: 2 },
      ],
    }]);
  });

});
