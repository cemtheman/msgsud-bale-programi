import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

export function baseSnapshot(): Mutable<ManagementWorkspaceSnapshotV1> {
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


// Synthetic school-scale fixture; no production data or database access.
export function schoolSnapshot(count = 517): Mutable<ManagementWorkspaceSnapshotV1> {
  const source = baseSnapshot();
  const requirement = source.requirements[0];
  const group = source.instructionalGroups[0];
  source.requirements = [];
  source.cards = [];
  source.baselinePlacements = [];
  source.teacherPools = [];
  source.roomPools = [];
  source.instructionalGroups = [];
  source.teachers = [];
  source.rooms = [];
  for (let lane = 0; lane < 16; lane += 1) {
    source.instructionalGroups.push({ ...group, id: `g${lane}`, name: `Class ${lane}` });
    source.teachers.push({ id: `t${lane}`, name: `Teacher ${lane}`, operationalStatus: 'ACTIVE' });
    source.rooms.push({ ...baseSnapshot().rooms[0], id: `r${lane}`, name: `Room ${lane}` });
  }
  for (let index = 0; index < count; index += 1) {
    const lane = index % 16;
    const slot = Math.floor(index / 16);
    const requirementId = `q${index}`;
    const cardId = `c${index}`;
    source.requirements.push({ ...requirement, id: requirementId, groupId: `g${lane}`, groupName: `Class ${lane}`, weeklyLoad: 1 });
    source.cards.push({ id: cardId, requirementId, blockIndex: 1, durationPeriods: 1, locked: false });
    source.teacherPools.push({ requirementId, teacherId: `t${lane}` });
    source.roomPools.push({ requirementId, roomId: `r${lane}` });
    source.baselinePlacements.push({ cardId, dayOfWeek: Math.floor(slot / 10) + 1, startPeriod: slot % 10 + 1, teacherId: `t${lane}`, roomId: `r${lane}` });
  }
  source.baselineMetrics = { ...source.baselineMetrics, cardCount: count, placedCardCount: count };
  return source;
}
