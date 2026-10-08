import { describe, expect, it } from 'vitest';

import type { ManagementBoardData } from '@/lib/managementBoard';
import type { ManagementWorkspaceWorkingCopyV1 } from '@/lib/managementWorkspaceWorkingCopy';
import { projectManagementBoardFromWorkspaceV1 } from '@/lib/managementWorkspaceBoardAdapter';

function board(): ManagementBoardData {
  return {
    revisionId: 'revision-1',
    cards: [
      {
        id: 'card-1',
        requirementId: 'requirement-1',
        blockIndex: 1,
        durationPeriods: 1,
        locked: false,
        subjectId: 'subject-1',
        subjectName: 'Türkçe',
        groupId: 'group-1',
        groupName: '5A',
        groupType: 'SECTION',
        classCodes: ['5A'],
        audienceTargets: ['SECTION'],
        weeklyLoad: 1,
        teacherMode: 'FIXED',
        teacherRequirement: 'REQUIRED',
        teacherAssignmentScope: 'REQUIREMENT',
        teacherContinuity: 'REQUIRED',
        resolvedRequirementTeacherId: 'teacher-1',
        teacherContinuityConflict: false,
        teacherIds: ['teacher-1'],
        teacherNames: ['Öğretmen 1'],
        resourceMode: 'ELIGIBLE_POOL',
        roomIds: ['room-1'],
        roomNames: ['105A'],
        courseCharacter: 'CULTURE',
        deliveryMode: 'STANDARD',
        knowledgeStatus: 'CONFIRMED',
        domainStatus: 'VALID',
        validCount: 1,
        invalidCount: 0,
        unresolvedCount: 0,
        isForced: false,
        isContradiction: false,
        placement: {
          dayOfWeek: 1,
          startPeriod: 1,
          teacherId: 'teacher-1',
          teacherName: 'Öğretmen 1',
          roomId: 'room-1',
          roomName: '105A',
          moveTransactionId: 'tx-1',
        },
      },
    ],
    classRows: [],
    teacherRows: [],
    roomRows: [],
    teacherNamesById: {
      'teacher-1': 'Öğretmen 1',
    },
    roomNamesById: {
      'room-1': '105A',
    },
  };
}

function copy(): ManagementWorkspaceWorkingCopyV1 {
  return {
    schemaVersion: 'management-workspace-copy-v1',
    baseline: {
      revisionId: 'revision-1',
      requirementSetId: 'requirement-set-1',
      revisionVersion: 1,
      academicYear: '2026-2027',
      term: 1,
      snapshotHash: 'snapshot-hash',
      baselineHash: 'baseline-hash',
    },
    placementsByCardId: {
      'card-1': {
        cardId: 'card-1',
        dayOfWeek: null,
        startPeriod: null,
        teacherId: null,
        roomId: null,
      },
    },
    cardsById: {
      'card-1': {
        id: 'card-1',
        requirementId: 'requirement-1',
        blockIndex: 1,
        durationPeriods: 1,
        locked: false,
        baselineExists: true,
      },
    },
    requirementStructureById: {
      'requirement-1': {
        requirementId: 'requirement-1',
        weeklyLoad: 1,
        preferredPartition: [1],
        allowedPartitions: [[1]],
        termStatus: 'ACTIVE',
      },
    },
    requirementCatalogById: {
      'requirement-1': {
        requirementId: 'requirement-1',
        subjectId: 'subject-1',
        subjectName: 'Türkçe',
        groupId: 'group-1',
        groupName: '5A',
        groupType: 'SECTION',
        classCodes: ['5A'],
        minDistinctDays: null,
        maxBlocksPerDay: null,
        maxConsecutivePeriods: null,
        courseCharacter: 'CULTURE',
        deliveryMode: 'STANDARD',
        teacherRequirement: 'REQUIRED',
        baselineWeeklyLoad: 1,
        baselinePreferredPartition: [1],
        baselineAllowedPartitions: [[1]],
        baselineTermStatus: 'ACTIVE',
        baselineTeacherIds: ['teacher-1'],
        baselineTeacherMode: 'FIXED',
        baselineTeacherAssignmentScope: 'REQUIREMENT',
        baselineTeacherContinuity: 'REQUIRED',
        baselineResourceMode: 'FIXED',
        baselineRoomIds: ['room-1'],
        baselineRequiredCapability: null,
      },
    },
    requirementTimePreferencesById: {},
    requirementResourcesById: {
      'requirement-1': {
        requirementId: 'requirement-1',
        teacherIds: ['teacher-1'],
        teacherMode: 'FIXED',
        teacherAssignmentScope: 'REQUIREMENT',
        teacherContinuity: 'REQUIRED',
        resourceMode: 'ELIGIBLE_POOL',
        roomIds: ['room-1'],
        requiredCapability: null,
      },
    },
    teacherInventoryById: {
      'teacher-1': {
        resourceType: 'TEACHER',
        resourceId: 'teacher-1',
        baselineDisplayName: 'Öğretmen 1',
        displayName: 'Öğretmen 1',
        operationalStatus: 'ACTIVE',
      },
    },
    roomInventoryById: {
      'room-1': {
        resourceType: 'ROOM',
        resourceId: 'room-1',
        baselineDisplayName: '105A',
        displayName: '105A',
        operationalStatus: 'ACTIVE',
      },
    },
    teacherPlanningById: {
      'teacher-1': {
        teacherId: 'teacher-1',
        minimumLoad: null,
        targetLoad: null,
        maximumLoad: null,
      },
    },
    teacherAvailabilityById: {
      'teacher-1': {
        teacherId: 'teacher-1',
        unavailablePeriods: [],
      }
    },
    roomProfileById: {
      'room-1': {
        roomId: 'room-1',
        capabilities: [],
        knowledgeStatus: 'CONFIRMED',
      }
    },
    resourceLifecycleById: {
      'teacher-1': {
        resourceType: 'TEACHER',
        resourceId: 'teacher-1',
        baselineExists: true,
        exists: true,
      },
      'room-1': {
        resourceType: 'ROOM',
        resourceId: 'room-1',
        baselineExists: true,
        exists: true,
      }
    }
  };
}

describe('management workspace board adapter v1', () => {
  it('projects a local remove without mutating the server board', () => {
    const source = board();
    const projected = projectManagementBoardFromWorkspaceV1(source, copy());

    expect(projected.cards[0].placement).toBeNull();
    expect(source.cards[0].placement?.dayOfWeek).toBe(1);
  });

  it('projects local requirement resource definitions onto cards', () => {
    const source = board();
    const workingCopy = copy();

    workingCopy.requirementResourcesById['requirement-1'] = {
      requirementId: 'requirement-1',
      teacherIds: [],
      teacherMode: 'UNKNOWN',
      teacherAssignmentScope: 'BLOCK',
      teacherContinuity: 'NONE',
      resourceMode: 'UNKNOWN',
      roomIds: [],
      requiredCapability: null,
    };

    const projected = projectManagementBoardFromWorkspaceV1(
      source,
      workingCopy,
    );

    expect(projected.cards[0].teacherMode).toBe('UNKNOWN');
    expect(projected.cards[0].teacherIds).toEqual([]);
    expect(projected.cards[0].teacherNames).toEqual([]);
    expect(projected.cards[0].resourceMode).toBe('UNKNOWN');
    expect(projected.cards[0].roomIds).toEqual([]);
    expect(projected.cards[0].roomNames).toEqual([]);
    expect(source.cards[0].teacherIds).toEqual(['teacher-1']);
  });

  it('projects a dirty local inventory name into board dictionaries and placement labels', () => {
    const source = board();
    const workingCopy = copy();

    workingCopy.teacherInventoryById['teacher-1'].displayName =
      'Yerel Öğretmen Adı';
    workingCopy.roomInventoryById['room-1'].displayName =
      'Yerel Salon Adı';
    workingCopy.placementsByCardId['card-1'] = {
      cardId: 'card-1',
      dayOfWeek: 1,
      startPeriod: 1,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    };

    const projected = projectManagementBoardFromWorkspaceV1(
      source,
      workingCopy,
    );

    expect(projected.teacherNamesById['teacher-1'])
      .toBe('Yerel Öğretmen Adı');
    expect(projected.roomNamesById['room-1'])
      .toBe('Yerel Salon Adı');
    expect(projected.cards[0].placement?.teacherName)
      .toBe('Yerel Öğretmen Adı');
    expect(projected.cards[0].placement?.roomName)
      .toBe('Yerel Salon Adı');
  });

  it('projects local placement resource names from board dictionaries', () => {
    const source = board();
    const workingCopy = copy();

    workingCopy.placementsByCardId['card-1'] = {
      cardId: 'card-1',
      dayOfWeek: 3,
      startPeriod: 2,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    };

    const projected = projectManagementBoardFromWorkspaceV1(
      source,
      workingCopy,
    );

    expect(projected.cards[0].placement).toEqual({
      dayOfWeek: 3,
      startPeriod: 2,
      teacherId: 'teacher-1',
      teacherName: 'Öğretmen 1',
      roomId: 'room-1',
      roomName: '105A',
      moveTransactionId: 'tx-1',
    });
  });

  it('projects a newly activated catalog requirement into Program metadata', () => {
    const source = board();
    const workingCopy = copy();

    workingCopy.requirementCatalogById['requirement-inactive'] = {
      requirementId: 'requirement-inactive',
      subjectId: 'subject-2',
      subjectName: 'B. Uygulama',
      groupId: 'group-2',
      groupName: '5A BALLET',
      groupType: 'BALLET',
      classCodes: ['5A'],
      minDistinctDays: null,
      maxBlocksPerDay: null,
      maxConsecutivePeriods: null,
      courseCharacter: 'ART',
      deliveryMode: 'STANDARD',
      teacherRequirement: 'OPTIONAL',
      baselineWeeklyLoad: 0,
      baselinePreferredPartition: [],
      baselineAllowedPartitions: [],
      baselineTermStatus: 'INACTIVE',
      baselineTeacherIds: [],
      baselineTeacherMode: 'UNKNOWN',
      baselineTeacherAssignmentScope: 'UNSPECIFIED',
      baselineTeacherContinuity: 'NONE',
      baselineResourceMode: 'UNKNOWN',
      baselineRoomIds: [],
      baselineRequiredCapability: null,
    };
    workingCopy.requirementStructureById['requirement-inactive'] = {
      requirementId: 'requirement-inactive',
      weeklyLoad: 1,
      preferredPartition: [1],
      allowedPartitions: [[1]],
      termStatus: 'ACTIVE',
    };
    workingCopy.requirementResourcesById['requirement-inactive'] = {
      requirementId: 'requirement-inactive',
      teacherIds: [],
      teacherMode: 'UNKNOWN',
      teacherAssignmentScope: 'UNSPECIFIED',
      teacherContinuity: 'NONE',
      resourceMode: 'UNKNOWN',
      roomIds: [],
      requiredCapability: null,
    };
    workingCopy.cardsById['22222222-2222-4222-8222-222222222222'] = {
      id: '22222222-2222-4222-8222-222222222222',
      requirementId: 'requirement-inactive',
      blockIndex: 1,
      durationPeriods: 1,
      locked: false,
      baselineExists: false,
    };
    workingCopy.placementsByCardId['22222222-2222-4222-8222-222222222222'] = {
      cardId: '22222222-2222-4222-8222-222222222222',
      dayOfWeek: null,
      startPeriod: null,
      teacherId: null,
      roomId: null,
    };

    const projected = projectManagementBoardFromWorkspaceV1(
      source,
      workingCopy,
    );
    const activated = projected.cards.find(
      (card) => card.requirementId === 'requirement-inactive',
    );

    expect(activated).toMatchObject({
      subjectId: 'subject-2',
      subjectName: 'B. Uygulama',
      groupId: 'group-2',
      groupName: '5A BALLET',
      groupType: 'BALLET',
      classCodes: ['5A'],
      weeklyLoad: 1,
      teacherMode: 'UNKNOWN',
      resourceMode: 'UNKNOWN',
      domainStatus: 'UNRESOLVED',
      placement: null,
    });
  });

});
