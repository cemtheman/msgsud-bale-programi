import { describe, expect, it } from 'vitest';
import {
  buildManagementOperationalQueue,
} from '@/lib/managementOperations';
import type { ManagementBoardCard } from '@/lib/managementBoard';

function card(
  id: string,
  overrides: Partial<ManagementBoardCard> = {},
): ManagementBoardCard {
  return {
    id,
    requirementId: `req-${id}`,
    blockIndex: 1,
    durationPeriods: 1,
    locked: false,
    subjectId: `subject-${id}`,
    subjectName: id,
    groupId: `group-${id}`,
    groupName: '5A',
    groupType: 'SECTION',
    classCodes: ['5A'],
    audienceTargets: ['SECTION'],
    weeklyLoad: 1,
    teacherMode: 'FIXED',
    teacherRequirement: 'REQUIRED',
    teacherAssignmentScope: 'REQUIREMENT',
    teacherContinuity: 'REQUIRED',
    resolvedRequirementTeacherId: null,
    teacherContinuityConflict: false,
    teacherIds: ['teacher-1'],
    teacherNames: ['Öğretmen 1'],
    resourceMode: 'FIXED',
    roomIds: ['room-1'],
    roomNames: ['B1 101'],
    courseCharacter: 'ACADEMIC',
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
      roomName: 'B1 101',
      moveTransactionId: null,
    },
    ...overrides,
  };
}

describe('management operational queue', () => {
  it('lists teacher and room gaps as separate operational tasks', () => {
    const teacherGap = card('Matematik', {
      placement: {
        ...card('base').placement!,
        teacherId: null,
        teacherName: null,
      },
    });
    const roomGap = card('Kimya', {
      placement: {
        ...card('base').placement!,
        dayOfWeek: 2,
        startPeriod: 4,
        roomId: null,
        roomName: null,
      },
    });

    const queue = buildManagementOperationalQueue(
      [roomGap, teacherGap],
      'ORTAOKUL',
    );

    expect(queue.totalCount).toBe(2);
    expect(queue.teacherCount).toBe(1);
    expect(queue.roomCount).toBe(1);
    expect(queue.items.map((item) => item.kind)).toEqual([
      'TEACHER',
      'ROOM',
    ]);
  });

  it('sorts tasks by day, period and subject', () => {
    const later = card('Türkçe', {
      placement: {
        ...card('base').placement!,
        dayOfWeek: 3,
        startPeriod: 5,
        teacherId: null,
        teacherName: null,
      },
    });
    const earlier = card('Fen', {
      placement: {
        ...card('base').placement!,
        dayOfWeek: 1,
        startPeriod: 2,
        teacherId: null,
        teacherName: null,
      },
    });

    const queue = buildManagementOperationalQueue(
      [later, earlier],
      'ORTAOKUL',
    );

    expect(queue.items.map((item) => item.subjectName)).toEqual([
      'Fen',
      'Türkçe',
    ]);
  });

  it('can create two tasks for a lesson missing both resources', () => {
    const both = card('Bale', {
      placement: {
        ...card('base').placement!,
        teacherId: null,
        teacherName: null,
        roomId: null,
        roomName: null,
      },
    });

    const queue = buildManagementOperationalQueue([both], 'ORTAOKUL');

    expect(queue.totalCount).toBe(2);
    expect(queue.items.map((item) => item.id)).toEqual([
      'TEACHER:Bale',
      'ROOM:Bale',
    ]);
  });

  it('ignores optional teacher and UNKNOWN room gaps', () => {
    const optional = card('Kulüp', {
      teacherRequirement: 'OPTIONAL',
      resourceMode: 'UNKNOWN',
      placement: {
        ...card('base').placement!,
        teacherId: null,
        teacherName: null,
        roomId: null,
        roomName: null,
      },
    });

    const queue = buildManagementOperationalQueue([optional], 'ORTAOKUL');

    expect(queue.totalCount).toBe(0);
  });
});
