import { describe, expect, it } from 'vitest';
import {
  deriveManagementHealth,
} from '@/lib/managementHealth';
import type {
  ManagementBoardCard,
  ManagementBoardData,
} from '@/lib/managementBoard';
import type { ManagementOverview } from '@/lib/managementOverview';

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

function board(cards: ManagementBoardCard[]): ManagementBoardData {
  return {
    revisionId: 'revision',
    cards,
    classRows: [],
    teacherRows: [],
    roomRows: [],
    teacherNamesById: {},
    teacherOperationalStatusById: {},
    roomNamesById: {},
  };
}

function overview(cards: ManagementBoardCard[]): ManagementOverview {
  const placedCount = cards.filter((item) => item.placement).length;
  return {
    revisionId: 'revision',
    versionNumber: 2,
    cardCount: cards.length,
    placedCount,
    unplacedCount: cards.length - placedCount,
    lockedCount: 0,
    forcedCount: 0,
    unresolvedCount: cards.filter((item) => item.unresolvedCount > 0).length,
    contradictionCount: cards.filter((item) => item.isContradiction).length,
    activeMoveCount: 0,
    touchedCardIds: [],
    placementsByDay: { 1: placedCount, 2: 0, 3: 0, 4: 0, 5: 0 },
  };
}

describe('management operational health gaps', () => {
  it('blocks a placed required-teacher lesson even when persisted domain says valid', () => {
    const source = card('math', {
      unresolvedCount: 0,
      placement: {
        ...card('base').placement!,
        teacherId: null,
        teacherName: null,
      },
    });

    const result = deriveManagementHealth(
      board([source]),
      overview([source]),
      'ORTAOKUL',
    );

    expect(result?.status).toBe('YAYIN_ENGELLI');
    expect(result?.blockers).toContainEqual(
      expect.objectContaining({
        id: 'placed-teacher-missing',
        count: 1,
        action: 'OPEN_TEACHER',
        cardIds: ['math'],
      }),
    );
  });

  it('blocks a placed lesson with a required room strategy but no room', () => {
    const source = card('science', {
      placement: {
        ...card('base').placement!,
        roomId: null,
        roomName: null,
      },
    });

    const result = deriveManagementHealth(
      board([source]),
      overview([source]),
      'ORTAOKUL',
    );

    expect(result?.blockers).toContainEqual(
      expect.objectContaining({
        id: 'placed-room-missing',
        count: 1,
        action: 'OPEN_ROOM',
        cardIds: ['science'],
      }),
    );
  });

  it('does not treat an optional teacher or UNKNOWN room strategy as a direct gap', () => {
    const source = card('optional', {
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

    const result = deriveManagementHealth(
      board([source]),
      overview([source]),
      'ORTAOKUL',
    );

    expect(result?.blockers.map((issue) => issue.id)).not.toContain(
      'placed-teacher-missing',
    );
    expect(result?.blockers.map((issue) => issue.id)).not.toContain(
      'placed-room-missing',
    );
  });

  it('does not double-count a direct resource gap as generic unresolved health', () => {
    const source = card('stale-domain', {
      unresolvedCount: 12,
      placement: {
        ...card('base').placement!,
        teacherId: null,
        teacherName: null,
      },
    });

    const result = deriveManagementHealth(
      board([source]),
      overview([source]),
      'ORTAOKUL',
    );

    expect(result?.blockers.map((issue) => issue.id)).toContain(
      'placed-teacher-missing',
    );
    expect(result?.warnings.map((issue) => issue.id)).not.toContain(
      'unresolved-inherited',
    );
  });
});
