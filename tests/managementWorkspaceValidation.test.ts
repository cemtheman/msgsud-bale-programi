import { describe, expect, it } from 'vitest';

import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  createManagementWorkspaceWorkingCopyV1,
  setManagementWorkspacePlacementV1,
} from '@/lib/managementWorkspaceWorkingCopy';
import {
  validateManagementWorkspaceV1,
} from '@/lib/managementWorkspaceValidation';

function baseSnapshot(): ManagementWorkspaceSnapshotV1 {
  return {
    schemaVersion: 'management-workspace-v1',
    sourceSnapshotVersion: 'M33.0.1-v1',
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
      {
        id: 'requirement-2',
        subjectId: 'subject-2',
        subjectName: 'Matematik',
        groupId: 'group-2',
        groupName: '5B',
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
      {
        id: 'card-3',
        requirementId: 'requirement-2',
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
      {
        id: 'group-2',
        classGroupId: 'class-2',
        name: '5B',
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
      {
        requirementId: 'requirement-2',
        teacherId: 'teacher-1',
      },
    ],
    roomPools: [
      {
        requirementId: 'requirement-1',
        roomId: 'room-1',
      },
      {
        requirementId: 'requirement-2',
        roomId: 'room-2',
      },
    ],
    teachers: [
      {
        id: 'teacher-1',
        name: 'Öğretmen 1',
        operationalStatus: 'ACTIVE',
      },
      {
        id: 'teacher-2',
        name: 'Öğretmen 2',
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
      {
        id: 'room-2',
        name: '105B',
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
      {
        cardId: 'card-2',
        dayOfWeek: 2,
        startPeriod: 1,
        teacherId: 'teacher-1',
        roomId: 'room-1',
      },
      {
        cardId: 'card-3',
        dayOfWeek: 1,
        startPeriod: 2,
        teacherId: 'teacher-1',
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
      omissionReason: 'excluded',
    },
  };
}

describe('management workspace local validation v1', () => {
  it('accepts a valid baseline working copy', () => {
    const source = baseSnapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    expect(validateManagementWorkspaceV1(source, copy)).toEqual({
      valid: true,
      issues: [],
      invalidCardIds: [],
    });
  });

  it('detects teacher and room conflicts after a local move', () => {
    const source = baseSnapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-3',
      dayOfWeek: 1,
      startPeriod: 1,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });

    const result = validateManagementWorkspaceV1(source, copy);
    const codes = result.issues.map((issue) => issue.code);

    expect(result.valid).toBe(false);
    expect(codes).toContain('TEACHER_CONFLICT');
    expect(codes).toContain('ROOM_CONFLICT');
  });

  it('detects teacher unavailability and lunch crossing', () => {
    const source = {
      ...baseSnapshot(),
      teacherUnavailablePeriods: [
        {
          teacherId: 'teacher-1',
          dayOfWeek: 3,
          period: 5,
        },
      ],
      cards: baseSnapshot().cards.map((card) => (
        card.id === 'card-1'
          ? { ...card, durationPeriods: 2 }
          : card
      )),
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-1',
      dayOfWeek: 3,
      startPeriod: 5,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });

    const codes = validateManagementWorkspaceV1(source, copy)
      .issues
      .map((issue) => issue.code);

    expect(codes).toContain('TEACHER_UNAVAILABLE');
    expect(codes).toContain('LUNCH_BREAK_CROSSING');
  });

  it('detects locked-card mutation against baseline', () => {
    const source = {
      ...baseSnapshot(),
      cards: baseSnapshot().cards.map((card) => (
        card.id === 'card-1'
          ? { ...card, locked: true }
          : card
      )),
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-1',
      dayOfWeek: 4,
      startPeriod: 1,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });

    const codes = validateManagementWorkspaceV1(source, copy)
      .issues
      .map((issue) => issue.code);

    expect(codes).toContain('LOCKED_CARD_MOVED');
  });

  it('detects required teacher continuity violations', () => {
    const source = {
      ...baseSnapshot(),
      teacherPools: [
        ...baseSnapshot().teacherPools,
        {
          requirementId: 'requirement-1',
          teacherId: 'teacher-2',
        },
      ],
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-2',
      dayOfWeek: 2,
      startPeriod: 1,
      teacherId: 'teacher-2',
      roomId: 'room-1',
    });

    const codes = validateManagementWorkspaceV1(source, copy)
      .issues
      .map((issue) => issue.code);

    expect(codes).toContain('TEACHER_CONTINUITY');
  });

  it('detects group conflict through CONTAINS hierarchy', () => {
    const source = {
      ...baseSnapshot(),
      instructionalGroups: [
        ...baseSnapshot().instructionalGroups,
        {
          id: 'group-root',
          classGroupId: null,
          name: '5. Sınıflar',
          groupType: 'COHORT',
          termStatus: 'ACTIVE',
          knowledgeStatus: 'CONFIRMED',
        },
      ],
      instructionalGroupRelations: [
        {
          leftGroupId: 'group-root',
          rightGroupId: 'group-1',
          relation: 'CONTAINS',
        },
      ],
      requirements: baseSnapshot().requirements.map((requirement) => (
        requirement.id === 'requirement-2'
          ? { ...requirement, groupId: 'group-root' }
          : requirement
      )),
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-3',
      dayOfWeek: 1,
      startPeriod: 1,
      teacherId: 'teacher-1',
      roomId: 'room-2',
    });

    const codes = validateManagementWorkspaceV1(source, copy)
      .issues
      .map((issue) => issue.code);

    expect(codes).toContain('GROUP_CONFLICT');
  });

  it('detects declared min day and daily block limits', () => {
    const source = {
      ...baseSnapshot(),
      requirements: baseSnapshot().requirements.map((requirement) => (
        requirement.id === 'requirement-1'
          ? {
              ...requirement,
              minDistinctDays: 2,
              maxBlocksPerDay: 1,
            }
          : requirement
      )),
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-2',
      dayOfWeek: 1,
      startPeriod: 3,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });

    const codes = validateManagementWorkspaceV1(source, copy)
      .issues
      .map((issue) => issue.code);

    expect(codes).toContain('MAX_BLOCKS_PER_DAY');
    expect(codes).toContain('MIN_DISTINCT_DAYS');
  });
  it('allows temporary requirement incompleteness in edit mode but blocks it at commit', () => {
    const source = {
      ...baseSnapshot(),
      requirements: baseSnapshot().requirements.map((requirement) => (
        requirement.id === 'requirement-1'
          ? { ...requirement, minDistinctDays: 2 }
          : requirement
      )),
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-2',
      dayOfWeek: null,
      startPeriod: null,
      teacherId: null,
      roomId: null,
    });

    expect(validateManagementWorkspaceV1(source, copy, 'EDIT').issues
      .map((issue) => issue.code))
      .not.toContain('MIN_DISTINCT_DAYS');
    expect(validateManagementWorkspaceV1(source, copy, 'COMMIT').issues
      .map((issue) => issue.code))
      .toContain('MIN_DISTINCT_DAYS');
  });

});
