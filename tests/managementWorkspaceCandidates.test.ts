import { describe, expect, it } from 'vitest';

import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  buildManagementWorkspaceMoveCandidateDetailV1,
  buildManagementWorkspacePlacementCandidateDetailV1,
} from '@/lib/managementWorkspaceCandidates';
import {
  applyManagementWorkspaceResourceBundleV1,
  createManagementWorkspaceResourceBundleV1,
  createManagementWorkspaceWorkingCopyV1,
  removeManagementWorkspacePlacementV1,
  setManagementWorkspaceRequirementRoomsV1,
  setManagementWorkspaceRequirementTeachersV1,
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
      subjectName: 'K. Bale',
      groupId: 'group-1',
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
      teacherMode: 'FIXED',
      teacherAssignmentScope: 'REQUIREMENT',
      teacherContinuity: 'REQUIRED',
      resourceMode: 'ELIGIBLE_POOL',
      requiredCapability: null,
    }],
    cards: [{
      id: 'card-1',
      requirementId: 'requirement-1',
      blockIndex: 1,
      durationPeriods: 2,
      locked: false,
    }],
    instructionalGroups: [{
      id: 'group-1',
      classGroupId: null,
      name: '6A BALLET',
      groupType: 'BALLET',
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
    rooms: [{
      id: 'room-1',
      name: 'Salon 1',
      canonicalRoomId: null,
      operationalStatus: 'ACTIVE',
      capabilities: [],
      knowledgeStatus: 'CONFIRMED',
    }],
    baselinePlacements: [{
      cardId: 'card-1',
      dayOfWeek: 2,
      startPeriod: 3,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    }],
    baselineMetrics: {
      cardCount: 1,
      placedCardCount: 1,
      unplacedCardCount: 0,
      lockedCardCount: 0,
      changeCost: 0,
      roomStabilityBreaks: 0,
      teacherIdleGapPeriods: 0,
      preferredTeacherContinuityBreaks: 0,
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

describe('management workspace local move candidates', () => {
  it('builds the drag matrix locally while preserving current resources', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const detail = buildManagementWorkspaceMoveCandidateDetailV1(
      source,
      copy,
      'card-1',
    );

    expect(detail).not.toBeNull();
    expect(detail?.assessments).toHaveLength(60);
    expect(detail?.validCandidates).toHaveLength(60);
    expect(detail?.assessments.every((candidate) => (
      candidate.teacherId === 'teacher-1'
      && candidate.roomId === 'room-1'
      && candidate.status === 'VALID'
      && candidate.isComplete
    ))).toBe(true);
  });

  it('builds pool placement candidates locally from requirement pools', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const detail = buildManagementWorkspacePlacementCandidateDetailV1(
      source,
      copy,
      'card-1',
    );

    expect(detail).not.toBeNull();
    expect(detail?.assessments).toHaveLength(60);
    expect(detail?.validCandidates).toHaveLength(60);
    expect(detail?.assessments.every((candidate) => (
      candidate.teacherId === 'teacher-1'
      && candidate.roomId === 'room-1'
      && candidate.status === 'VALID'
      && candidate.isComplete
    ))).toBe(true);
  });

  it('marks unresolved pool placement resources instead of inventing them', () => {
    const source = {
      ...snapshot(),
      teacherPools: [],
      roomPools: [],
    };

    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const detail = buildManagementWorkspacePlacementCandidateDetailV1(
      source,
      copy,
      'card-1',
    );

    expect(detail).not.toBeNull();
    expect(detail?.validCandidates).toHaveLength(0);
    expect(detail?.assessments.every((candidate) => (
      candidate.status === 'UNRESOLVED'
      && candidate.reasonCodes.includes('TEACHER_ASSIGNMENT_MISSING')
      && candidate.reasonCodes.includes('ROOM_ASSIGNMENT_MISSING')
    ))).toBe(true);
  });

  it('supports lessons that require neither teacher nor room', () => {
    const base = snapshot();
    const source = {
      ...base,
      requirements: base.requirements.map((requirement) => ({
        ...requirement,
        teacherRequirement: 'NONE',
        resourceMode: 'UNKNOWN',
      })),
      teacherPools: [],
      roomPools: [],
    };

    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const detail = buildManagementWorkspacePlacementCandidateDetailV1(
      source,
      copy,
      'card-1',
    );

    expect(detail?.validCandidates).toHaveLength(60);
    expect(detail?.validCandidates.every((candidate) => (
      candidate.teacherId === null
      && candidate.roomId === null
    ))).toBe(true);
  });

  it('uses only confirmed active capability rooms for local PLACE choices', () => {
    const base = snapshot();
    const source = {
      ...base,
      requirements: base.requirements.map((requirement) => ({
        ...requirement,
        resourceMode: 'CAPABILITY',
        requiredCapability: 'BALLET_STUDIO',
      })),
      roomPools: [],
      rooms: [
        {
          ...base.rooms[0],
          id: 'room-capable',
          capabilities: ['BALLET_STUDIO'],
          knowledgeStatus: 'CONFIRMED',
        },
        {
          ...base.rooms[0],
          id: 'room-unconfirmed',
          capabilities: ['BALLET_STUDIO'],
          knowledgeStatus: 'UNKNOWN',
        },
        {
          ...base.rooms[0],
          id: 'room-wrong',
          capabilities: ['PIANO'],
          knowledgeStatus: 'CONFIRMED',
        },
      ],
    };

    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const detail = buildManagementWorkspacePlacementCandidateDetailV1(
      source,
      copy,
      'card-1',
    );

    expect(detail?.validCandidates).toHaveLength(60);
    expect(detail?.validCandidates.every(
      (candidate) => candidate.roomId === 'room-capable',
    )).toBe(true);
  });

  it('uses unsaved local teacher and room plan changes for PLACE candidates', () => {
    const base = snapshot();
    const source: ManagementWorkspaceSnapshotV1 = {
      ...base,
      teachers: [
        ...base.teachers,
        {
          id: 'teacher-2',
          name: 'Öğretmen 2',
          operationalStatus: 'ACTIVE',
        },
      ],
      rooms: [
        ...base.rooms,
        {
          ...base.rooms[0],
          id: 'room-2',
          name: 'Salon 2',
        },
      ],
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspaceRequirementTeachersV1(
      copy,
      'requirement-1',
      ['teacher-2'],
    );
    setManagementWorkspaceRequirementRoomsV1(
      copy,
      'requirement-1',
      {
        resourceMode: 'FIXED',
        roomIds: ['room-2'],
        requiredCapability: null,
      },
    );

    const detail = buildManagementWorkspacePlacementCandidateDetailV1(
      source,
      copy,
      'card-1',
    );

    expect(detail?.validCandidates).toHaveLength(60);
    expect(detail?.validCandidates.every((candidate) => (
      candidate.teacherId === 'teacher-2'
      && candidate.roomId === 'room-2'
    ))).toBe(true);
  });

  it('removes locally inactive resources from PLACE candidates immediately', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    copy.teacherInventoryById['teacher-1'].operationalStatus = 'INACTIVE';
    copy.roomInventoryById['room-1'].operationalStatus = 'MAINTENANCE';

    const detail = buildManagementWorkspacePlacementCandidateDetailV1(
      source,
      copy,
      'card-1',
    );

    expect(detail).not.toBeNull();
    expect(detail?.validCandidates).toHaveLength(0);
    expect(detail?.assessments.every((candidate) => (
      candidate.teacherId === null
      && candidate.roomId === null
      && candidate.status === 'UNRESOLVED'
    ))).toBe(true);
  });

  it('returns null for an unplaced MOVE candidate so PLACE generation is explicit', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    removeManagementWorkspacePlacementV1(copy, 'card-1');

    expect(
      buildManagementWorkspaceMoveCandidateDetailV1(
        source,
        copy,
        'card-1',
      ),
    ).toBeNull();
  });

  it('uses local room profile when building capability room candidates', () => {
    const base = snapshot();
    const source = {
      ...base,
      requirements: base.requirements.map((requirement, index) =>
        index === 0
          ? {
              ...requirement,
              resourceMode: 'CAPABILITY',
              requiredCapability: 'STUDIO_SMALL_GROUP',
            }
          : requirement,
      ),
      rooms: base.rooms.map((room, index) =>
        index === 0
          ? {
              ...room,
              capabilities: ['STUDIO_SMALL_GROUP'],
              knowledgeStatus: 'CONFIRMED' as const,
            }
          : room,
      ),
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const before = buildManagementWorkspacePlacementCandidateDetailV1(
      source,
      copy,
      source.cards[0].id,
    );
    expect(before?.validCandidates.some(
      (candidate) => candidate.roomId === source.rooms[0].id,
    )).toBe(true);

    copy.roomProfileById[source.rooms[0].id] = {
      roomId: source.rooms[0].id,
      capabilities: [],
      knowledgeStatus: 'CONFIRMED',
    };

    const after = buildManagementWorkspacePlacementCandidateDetailV1(
      source,
      copy,
      source.cards[0].id,
    );
    expect(after?.validCandidates.some(
      (candidate) => candidate.roomId === source.rooms[0].id,
    )).toBe(false);
  });


  it('uses newly created local resources as placement candidates', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    removeManagementWorkspacePlacementV1(copy, 'card-1');

    const teacher = createManagementWorkspaceResourceBundleV1(
      copy,
      'TEACHER',
      '11111111-1111-4111-8111-111111111111',
      'Yeni Öğretmen',
    );
    const room = createManagementWorkspaceResourceBundleV1(
      copy,
      'ROOM',
      '22222222-2222-4222-8222-222222222222',
      'Yeni Salon',
    );
    applyManagementWorkspaceResourceBundleV1(
      copy,
      'TEACHER',
      teacher.lifecycle.resourceId,
      teacher,
    );
    applyManagementWorkspaceResourceBundleV1(
      copy,
      'ROOM',
      room.lifecycle.resourceId,
      room,
    );

    setManagementWorkspaceRequirementTeachersV1(
      copy,
      'requirement-1',
      [teacher.lifecycle.resourceId],
    );
    setManagementWorkspaceRequirementRoomsV1(
      copy,
      'requirement-1',
      {
        resourceMode: 'FIXED',
        roomIds: [room.lifecycle.resourceId],
        requiredCapability: null,
      },
    );

    const detail = buildManagementWorkspacePlacementCandidateDetailV1(
      source,
      copy,
      'card-1',
    );

    expect(detail?.validCandidates.some((candidate) =>
      candidate.teacherId === teacher.lifecycle.resourceId
      && candidate.roomId === room.lifecycle.resourceId
    )).toBe(true);
  });

});
