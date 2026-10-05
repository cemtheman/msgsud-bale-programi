import { describe, expect, it } from 'vitest';

import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  createManagementWorkspaceWorkingCopyV1,
  setManagementWorkspacePlacementV1,
} from '@/lib/managementWorkspaceWorkingCopy';
import {
  findManagementWorkspaceParallelBundleV1,
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

  it('rejects breaking a baseline-linked parallel lesson bundle', () => {
    const source = baseSnapshot();
    const parallelRequirements = [
      {
        ...source.requirements[0],
        id: 'parallel-k1',
        subjectId: 'subject-k',
        subjectName: 'K. Bale',
        groupId: 'parallel-group-1',
        groupName: 'PARALLEL • 6A BALLET / 1 + 7A BALLET / 1',
        groupType: 'PARALLEL',
        weeklyLoad: 1,
        teacherRequirement: 'NONE',
        teacherMode: 'UNKNOWN',
        teacherAssignmentScope: 'BLOCK',
        teacherContinuity: 'NONE',
        resourceMode: 'UNKNOWN',
      },
      {
        ...source.requirements[0],
        id: 'parallel-k2',
        subjectId: 'subject-k',
        subjectName: 'K. Bale',
        groupId: 'parallel-group-2',
        groupName: 'PARALLEL • 6A BALLET / 2 + 7A BALLET / 2',
        groupType: 'PARALLEL',
        weeklyLoad: 2,
        teacherRequirement: 'NONE',
        teacherMode: 'UNKNOWN',
        teacherAssignmentScope: 'BLOCK',
        teacherContinuity: 'NONE',
        resourceMode: 'UNKNOWN',
      },
      {
        ...source.requirements[0],
        id: 'parallel-point',
        subjectId: 'subject-point',
        subjectName: 'Point',
        groupId: 'parallel-group-1',
        groupName: 'PARALLEL • 6A BALLET / 1 + 7A BALLET / 1',
        groupType: 'PARALLEL',
        weeklyLoad: 1,
        teacherRequirement: 'NONE',
        teacherMode: 'UNKNOWN',
        teacherAssignmentScope: 'BLOCK',
        teacherContinuity: 'NONE',
        resourceMode: 'UNKNOWN',
      },
    ];
    const parallelCards = [
      {
        id: 'parallel-card-k1',
        requirementId: 'parallel-k1',
        blockIndex: 1,
        durationPeriods: 1,
        locked: false,
      },
      {
        id: 'parallel-card-k2',
        requirementId: 'parallel-k2',
        blockIndex: 1,
        durationPeriods: 2,
        locked: false,
      },
      {
        id: 'parallel-card-point',
        requirementId: 'parallel-point',
        blockIndex: 1,
        durationPeriods: 1,
        locked: false,
      },
    ];
    const parallelGroups = [
      {
        id: 'parallel-group-1',
        classGroupId: null,
        name: 'PARALLEL • 6A BALLET / 1 + 7A BALLET / 1',
        groupType: 'PARALLEL',
        termStatus: 'ACTIVE',
        knowledgeStatus: 'CONFIRMED',
      },
      {
        id: 'parallel-group-2',
        classGroupId: null,
        name: 'PARALLEL • 6A BALLET / 2 + 7A BALLET / 2',
        groupType: 'PARALLEL',
        termStatus: 'ACTIVE',
        knowledgeStatus: 'CONFIRMED',
      },
    ];
    const parallelPlacements = [
      {
        cardId: 'parallel-card-k1',
        dayOfWeek: 4,
        startPeriod: 7,
        teacherId: null,
        roomId: null,
      },
      {
        cardId: 'parallel-card-k2',
        dayOfWeek: 4,
        startPeriod: 7,
        teacherId: null,
        roomId: null,
      },
      {
        cardId: 'parallel-card-point',
        dayOfWeek: 4,
        startPeriod: 8,
        teacherId: null,
        roomId: null,
      },
    ];
    const snapshot = {
      ...source,
      requirements: [...source.requirements, ...parallelRequirements],
      cards: [...source.cards, ...parallelCards],
      instructionalGroups: [...source.instructionalGroups, ...parallelGroups],
      baselinePlacements: [...source.baselinePlacements, ...parallelPlacements],
    };
    const copy = createManagementWorkspaceWorkingCopyV1(snapshot);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'parallel-card-point',
      dayOfWeek: 4,
      startPeriod: 9,
      teacherId: null,
      roomId: null,
    });

    expect(
      validateManagementWorkspaceV1(snapshot, copy, 'EDIT').issues
        .map((issue) => issue.code),
    ).toContain('PARALLEL_BUNDLE_BROKEN');
  });

  it('allows a linked parallel lesson bundle to translate as one geometry', () => {
    const source = baseSnapshot();
    const requirements = [
      {
        ...source.requirements[0],
        id: 'bundle-a',
        subjectId: 'subject-k',
        subjectName: 'K. Bale',
        groupId: 'bundle-group-1',
        groupName: 'PARALLEL • 6A BALLET / 1 + 7A BALLET / 1',
        groupType: 'PARALLEL',
        teacherRequirement: 'NONE',
        teacherMode: 'UNKNOWN',
        teacherAssignmentScope: 'BLOCK',
        teacherContinuity: 'NONE',
        resourceMode: 'UNKNOWN',
      },
      {
        ...source.requirements[0],
        id: 'bundle-b',
        subjectId: 'subject-k',
        subjectName: 'K. Bale',
        groupId: 'bundle-group-2',
        groupName: 'PARALLEL • 6A BALLET / 2 + 7A BALLET / 2',
        groupType: 'PARALLEL',
        teacherRequirement: 'NONE',
        teacherMode: 'UNKNOWN',
        teacherAssignmentScope: 'BLOCK',
        teacherContinuity: 'NONE',
        resourceMode: 'UNKNOWN',
      },
      {
        ...source.requirements[0],
        id: 'bundle-point',
        subjectId: 'subject-point',
        subjectName: 'Point',
        groupId: 'bundle-group-1',
        groupName: 'PARALLEL • 6A BALLET / 1 + 7A BALLET / 1',
        groupType: 'PARALLEL',
        teacherRequirement: 'NONE',
        teacherMode: 'UNKNOWN',
        teacherAssignmentScope: 'BLOCK',
        teacherContinuity: 'NONE',
        resourceMode: 'UNKNOWN',
      },
    ];
    const cards = [
      { id: 'bundle-card-a', requirementId: 'bundle-a', blockIndex: 1, durationPeriods: 1, locked: false },
      { id: 'bundle-card-b', requirementId: 'bundle-b', blockIndex: 1, durationPeriods: 2, locked: false },
      { id: 'bundle-card-point', requirementId: 'bundle-point', blockIndex: 1, durationPeriods: 1, locked: false },
    ];
    const groups = [
      {
        id: 'bundle-group-1',
        classGroupId: null,
        name: 'PARALLEL • 6A BALLET / 1 + 7A BALLET / 1',
        groupType: 'PARALLEL',
        termStatus: 'ACTIVE',
        knowledgeStatus: 'CONFIRMED',
      },
      {
        id: 'bundle-group-2',
        classGroupId: null,
        name: 'PARALLEL • 6A BALLET / 2 + 7A BALLET / 2',
        groupType: 'PARALLEL',
        termStatus: 'ACTIVE',
        knowledgeStatus: 'CONFIRMED',
      },
    ];
    const placements = [
      { cardId: 'bundle-card-a', dayOfWeek: 4, startPeriod: 7, teacherId: null, roomId: null },
      { cardId: 'bundle-card-b', dayOfWeek: 4, startPeriod: 7, teacherId: null, roomId: null },
      { cardId: 'bundle-card-point', dayOfWeek: 4, startPeriod: 8, teacherId: null, roomId: null },
    ];
    const snapshot = {
      ...source,
      requirements: [...source.requirements, ...requirements],
      cards: [...source.cards, ...cards],
      instructionalGroups: [...source.instructionalGroups, ...groups],
      baselinePlacements: [...source.baselinePlacements, ...placements],
    };
    const bundle = findManagementWorkspaceParallelBundleV1(
      snapshot,
      'bundle-card-point',
    );

    expect(bundle).not.toBeNull();
    expect(bundle?.cardIds.sort()).toEqual([
      'bundle-card-a',
      'bundle-card-b',
      'bundle-card-point',
    ]);
    expect(bundle?.offsetsByCardId).toEqual({
      'bundle-card-a': 0,
      'bundle-card-b': 0,
      'bundle-card-point': 1,
    });

    const copy = createManagementWorkspaceWorkingCopyV1(snapshot);

    [
      ['bundle-card-a', 9],
      ['bundle-card-b', 9],
      ['bundle-card-point', 10],
    ].forEach(([cardId, startPeriod]) => {
      setManagementWorkspacePlacementV1(copy, {
        cardId: cardId as string,
        dayOfWeek: 5,
        startPeriod: startPeriod as number,
        teacherId: null,
        roomId: null,
      });
    });

    expect(
      validateManagementWorkspaceV1(snapshot, copy, 'EDIT').issues
        .map((issue) => issue.code),
    ).not.toContain('PARALLEL_BUNDLE_BROKEN');
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
