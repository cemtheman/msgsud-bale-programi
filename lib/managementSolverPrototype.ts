import type {
  ManagementSolverBaselinePlacement,
  ManagementSolverCard,
  ManagementSolverInstructionalGroupRelation,
  ManagementSolverRequirement,
  ManagementSolverRoom,
  ManagementSolverSnapshotPreview,
  ManagementSolverTeacher,
  ManagementSolverObjectiveWeights,
} from '@/lib/managementSolver';

export type ManagementFeasibilityStatus =
  | 'FEASIBLE'
  | 'INFEASIBLE'
  | 'SEARCH_LIMIT';

export interface ManagementFeasibilityPlacement {
  cardId: string;
  dayOfWeek: number;
  startPeriod: number;
  teacherId: string | null;
  roomId: string | null;
  provisionalRoom: boolean;
  baseline: boolean;
}

export interface ManagementFeasibilityMetrics {
  cardCount: number;
  assignedCardCount: number;
  generatedCandidateCount: number;
  visitedNodeCount: number;
  backtrackCount: number;
  baselineReuseCount: number;
  provisionalRoomCount: number;
  elapsedMs: number;
}

export interface ManagementFeasibilityBaselineIssue {
  cardId: string;
  requirementId: string;
  subjectName: string;
  groupName: string;
  blockIndex: number;
  codes: string[];
}

export interface ManagementFeasibilityChangedCard {
  cardId: string;
  requirementId: string;
  subjectName: string;
  groupName: string;
  blockIndex: number;
  baseline: {
    dayOfWeek: number | null;
    startPeriod: number | null;
    teacherName: string | null;
    roomName: string | null;
  };
  proposed: {
    dayOfWeek: number;
    startPeriod: number;
    teacherName: string | null;
    roomName: string | null;
  };
  baselineIssueCodes: string[];
}

export interface ManagementFeasibilityResult {
  engineVersion: 'M33.2-v0';
  status: ManagementFeasibilityStatus;
  snapshotHash: string;
  baselineHash: string;
  baselineWasFeasible: boolean;
  writesPerformed: false;
  objectiveProfileUsed: false;
  placements: ManagementFeasibilityPlacement[];
  reasons: string[];
  metrics: ManagementFeasibilityMetrics;
  baselineIssues?: ManagementFeasibilityBaselineIssue[];
  changedCards?: ManagementFeasibilityChangedCard[];
}

export interface ManagementFeasibilityOptions {
  maxVisitedNodes?: number;
  maxCandidatesPerCard?: number;
}

interface Candidate extends ManagementFeasibilityPlacement {
  endPeriod: number;
  requirementId: string;
  groupId: string;
  durationPeriods: number;
  roomConflictKey: string | null;
}

interface SolverContext {
  snapshot: ManagementSolverSnapshotPreview;
  requirements: Map<string, ManagementSolverRequirement>;
  cards: Map<string, ManagementSolverCard>;
  baseline: Map<string, ManagementSolverBaselinePlacement>;
  activeTeacherIds: Set<string>;
  teachers: Map<string, ManagementSolverTeacher>;
  teacherUnavailableKeys: Set<string>;
  rooms: Map<string, ManagementSolverRoom>;
  activeRoomIds: Set<string>;
  teacherPools: Map<string, string[]>;
  roomPools: Map<string, string[]>;
  groupRelations: ManagementSolverInstructionalGroupRelation[];
  groupDescendants: Map<string, Set<string>>;
  maxCandidatesPerCard: number;
}

const ENGINE_VERSION = 'M33.2-v0' as const;
const DEFAULT_MAX_VISITED_NODES = 100_000;
const DEFAULT_MAX_CANDIDATES_PER_CARD = 5_000;
const LUNCH_LEFT_PERIOD = 5;
const LUNCH_RIGHT_PERIOD = 6;

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function teacherAvailabilityKey(
  teacherId: string,
  dayOfWeek: number,
  period: number,
) {
  return `${teacherId}|${dayOfWeek}|${period}`;
}

function teacherIsUnavailable(
  teacherId: string | null,
  dayOfWeek: number,
  startPeriod: number,
  durationPeriods: number,
  context: SolverContext,
) {
  if (!teacherId) return false;

  for (
    let period = startPeriod;
    period < startPeriod + durationPeriods;
    period += 1
  ) {
    if (
      context.teacherUnavailableKeys.has(
        teacherAvailabilityKey(teacherId, dayOfWeek, period),
      )
    ) {
      return true;
    }
  }

  return false;
}

function overlaps(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
) {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function baselinePlacementIsMaterialized(
  placement: ManagementSolverBaselinePlacement | undefined,
): placement is ManagementSolverBaselinePlacement & {
  dayOfWeek: number;
  startPeriod: number;
} {
  return Boolean(
    placement
    && placement.dayOfWeek != null
    && placement.startPeriod != null,
  );
}

function buildPoolMap<T extends { requirementId: string }>(
  entries: T[],
  value: (entry: T) => string,
) {
  const result = new Map<string, string[]>();

  for (const entry of entries) {
    const current = result.get(entry.requirementId) ?? [];
    current.push(value(entry));
    result.set(entry.requirementId, current);
  }

  for (const [requirementId, values] of result) {
    result.set(requirementId, unique(values).sort());
  }

  return result;
}

function buildGroupDescendants(
  relations: ManagementSolverInstructionalGroupRelation[],
) {
  const contains = new Map<string, string[]>();

  for (const relation of relations) {
    if (relation.relation !== 'CONTAINS') continue;
    const current = contains.get(relation.leftGroupId) ?? [];
    current.push(relation.rightGroupId);
    contains.set(relation.leftGroupId, current);
  }

  const memo = new Map<string, Set<string>>();

  const visit = (groupId: string, trail = new Set<string>()): Set<string> => {
    const cached = memo.get(groupId);
    if (cached) return cached;

    if (trail.has(groupId)) {
      return new Set([groupId]);
    }

    const nextTrail = new Set(trail);
    nextTrail.add(groupId);

    const result = new Set<string>([groupId]);
    for (const childId of contains.get(groupId) ?? []) {
      for (const descendant of visit(childId, nextTrail)) {
        result.add(descendant);
      }
    }

    memo.set(groupId, result);
    return result;
  };

  return { memo, visit };
}

function groupsConflict(
  leftGroupId: string,
  rightGroupId: string,
  context: SolverContext,
) {
  const left = context.groupDescendants.get(leftGroupId)
    ?? new Set([leftGroupId]);
  const right = context.groupDescendants.get(rightGroupId)
    ?? new Set([rightGroupId]);

  for (const groupId of left) {
    if (right.has(groupId)) return true;
  }

  for (const relation of context.groupRelations) {
    if (relation.relation !== 'OVERLAPS') continue;

    if (
      left.has(relation.leftGroupId)
      && right.has(relation.rightGroupId)
    ) {
      return true;
    }

    if (
      right.has(relation.leftGroupId)
      && left.has(relation.rightGroupId)
    ) {
      return true;
    }
  }

  return false;
}

function roomConflictKey(
  roomId: string | null,
  context: SolverContext,
) {
  if (!roomId) return null;
  const room = context.rooms.get(roomId);
  return room?.canonicalRoomId ?? roomId;
}

function validTimeStart(
  startPeriod: number,
  durationPeriods: number,
  allowedPeriods: number[],
) {
  const lastPeriod = allowedPeriods.length > 0
    ? Math.max(...allowedPeriods)
    : 12;
  const endPeriod = startPeriod + durationPeriods - 1;

  if (endPeriod > lastPeriod) return false;

  return !(
    startPeriod <= LUNCH_LEFT_PERIOD
    && endPeriod >= LUNCH_RIGHT_PERIOD
  );
}

function teacherChoices(
  requirement: ManagementSolverRequirement,
  baseline: ManagementSolverBaselinePlacement | undefined,
  locked: boolean,
  context: SolverContext,
) {
  if (locked && baseline?.teacherId) {
    return context.activeTeacherIds.has(baseline.teacherId)
      ? [baseline.teacherId]
      : [];
  }

  if (requirement.teacherRequirement === 'NONE') {
    return [null];
  }

  const pool = (context.teacherPools.get(requirement.id) ?? [])
    .filter((teacherId) => context.activeTeacherIds.has(teacherId));

  if (requirement.teacherRequirement === 'REQUIRED') {
    return pool;
  }

  if (requirement.teacherRequirement === 'OPTIONAL') {
    return [null, ...pool];
  }

  return pool.length > 0 ? pool : [null];
}

function capabilityRoomChoices(
  requirement: ManagementSolverRequirement,
  context: SolverContext,
) {
  if (!requirement.requiredCapability) return [];

  const matching = [...context.rooms.values()]
    .filter((room) => (
      context.activeRoomIds.has(room.id)
      && room.capabilities.includes(requirement.requiredCapability as string)
    ));

  const confirmed = matching.filter(
    (room) => room.knowledgeStatus === 'CONFIRMED',
  );
  const source = confirmed.length > 0 ? confirmed : matching;

  const seenPhysicalRooms = new Set<string>();
  const result: string[] = [];

  for (const room of source.sort((left, right) => left.id.localeCompare(right.id))) {
    const key = room.canonicalRoomId ?? room.id;
    if (seenPhysicalRooms.has(key)) continue;
    seenPhysicalRooms.add(key);
    result.push(room.id);
  }

  return result;
}

function roomChoices(
  requirement: ManagementSolverRequirement,
  baseline: ManagementSolverBaselinePlacement | undefined,
  locked: boolean,
  context: SolverContext,
) {
  if (locked) {
    if (!baseline?.roomId) {
      return requirement.resourceMode === 'UNKNOWN'
        ? [null]
        : [];
    }

    return context.activeRoomIds.has(baseline.roomId)
      ? [baseline.roomId]
      : [];
  }

  if (requirement.resourceMode === 'UNKNOWN') {
    const baselineRoom = baseline?.roomId;
    return baselineRoom && context.activeRoomIds.has(baselineRoom)
      ? [baselineRoom, null]
      : [null];
  }

  if (requirement.resourceMode === 'CAPABILITY') {
    return capabilityRoomChoices(requirement, context);
  }

  if (
    requirement.resourceMode === 'FIXED'
    || requirement.resourceMode === 'ELIGIBLE_POOL'
  ) {
    return (context.roomPools.get(requirement.id) ?? [])
      .filter((roomId) => context.activeRoomIds.has(roomId));
  }

  return [null];
}

function baselineResourceDimensionsAllowed(
  requirement: ManagementSolverRequirement,
  baseline: ManagementSolverBaselinePlacement,
  context: SolverContext,
) {
  if (
    requirement.teacherRequirement === 'REQUIRED'
    && baseline.teacherId == null
  ) {
    return false;
  }

  if (
    baseline.teacherId != null
    && !context.activeTeacherIds.has(baseline.teacherId)
  ) {
    return false;
  }

  if (requirement.resourceMode === 'UNKNOWN') {
    return (
      baseline.roomId == null
      || context.activeRoomIds.has(baseline.roomId)
    );
  }

  if (baseline.roomId == null) {
    return false;
  }

  if (!context.activeRoomIds.has(baseline.roomId)) {
    return false;
  }

  if (requirement.resourceMode === 'CAPABILITY') {
    const room = context.rooms.get(baseline.roomId);
    return Boolean(
      room
      && requirement.requiredCapability
      && room.capabilities.includes(requirement.requiredCapability)
      && room.knowledgeStatus === 'CONFIRMED',
    );
  }

  return true;
}

function rawCandidatesForCard(
  card: ManagementSolverCard,
  context: SolverContext,
) {
  const requirement = context.requirements.get(card.requirementId);
  if (!requirement) return [];

  const baseline = context.baseline.get(card.id);
  const days = context.snapshot.hardConstraintContract.days;
  const periods = context.snapshot.hardConstraintContract.periods;

  const teachers = teacherChoices(
    requirement,
    baseline,
    card.locked,
    context,
  );
  const rooms = roomChoices(
    requirement,
    baseline,
    card.locked,
    context,
  );

  if (teachers.length === 0 || rooms.length === 0) {
    return [];
  }

  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (
    dayOfWeek: number,
    startPeriod: number,
    teacherId: string | null,
    roomId: string | null,
    isBaseline: boolean,
  ) => {
    if (!days.includes(dayOfWeek)) return;
    if (!periods.includes(startPeriod)) return;
    if (!validTimeStart(startPeriod, card.durationPeriods, periods)) return;
    if (
      teacherIsUnavailable(
        teacherId,
        dayOfWeek,
        startPeriod,
        card.durationPeriods,
        context,
      )
    ) return;

    const key = [
      dayOfWeek,
      startPeriod,
      teacherId ?? 'null',
      roomId ?? 'null',
    ].join('|');

    if (seen.has(key)) return;
    seen.add(key);

    candidates.push({
      cardId: card.id,
      requirementId: card.requirementId,
      groupId: requirement.groupId,
      durationPeriods: card.durationPeriods,
      dayOfWeek,
      startPeriod,
      endPeriod: startPeriod + card.durationPeriods - 1,
      teacherId,
      roomId,
      roomConflictKey: roomConflictKey(roomId, context),
      provisionalRoom: requirement.resourceMode === 'UNKNOWN',
      baseline: isBaseline,
    });
  };

  if (
    baselinePlacementIsMaterialized(baseline)
    && baselineResourceDimensionsAllowed(
      requirement,
      baseline,
      context,
    )
  ) {
    addCandidate(
      baseline.dayOfWeek,
      baseline.startPeriod,
      baseline.teacherId,
      baseline.roomId,
      true,
    );
  }

  if (!card.locked) {
    for (const dayOfWeek of days) {
      for (const startPeriod of periods) {
        if (!validTimeStart(startPeriod, card.durationPeriods, periods)) {
          continue;
        }

        for (const teacherId of teachers) {
          for (const roomId of rooms) {
            addCandidate(
              dayOfWeek,
              startPeriod,
              teacherId,
              roomId,
              false,
            );

            if (candidates.length >= context.maxCandidatesPerCard) {
              return candidates;
            }
          }
        }
      }
    }
  }

  return candidates;
}

function longestConsecutiveRun(periods: Set<number>) {
  const sorted = [...periods].sort((left, right) => left - right);
  let longest = 0;
  let current = 0;
  let previous: number | null = null;

  for (const period of sorted) {
    if (
      previous != null
      && period === previous + 1
      && !(previous === LUNCH_LEFT_PERIOD && period === LUNCH_RIGHT_PERIOD)
    ) {
      current += 1;
    } else {
      current = 1;
    }
    longest = Math.max(longest, current);
    previous = period;
  }

  return longest;
}

function requirementAssignments(
  requirementId: string,
  assignments: Candidate[],
) {
  return assignments.filter(
    (assignment) => assignment.requirementId === requirementId,
  );
}

function respectsRequirementRules(
  candidate: Candidate,
  assignments: Candidate[],
  remainingCardsByRequirement: Map<string, number>,
  context: SolverContext,
) {
  const requirement = context.requirements.get(candidate.requirementId);
  if (!requirement) return false;

  const current = requirementAssignments(
    candidate.requirementId,
    assignments,
  );
  const proposed = [...current, candidate];

  if (
    requirement.teacherRequirement === 'REQUIRED'
    && candidate.teacherId == null
  ) {
    return false;
  }

  if (
    requirement.teacherAssignmentScope === 'REQUIREMENT'
    && requirement.teacherContinuity === 'REQUIRED'
  ) {
    const teachers = unique(
      proposed
        .map((assignment) => assignment.teacherId)
        .filter((teacherId): teacherId is string => teacherId != null),
    );

    if (teachers.length > 1) return false;

  }

  if (requirement.maxBlocksPerDay != null) {
    const blocksToday = proposed.filter(
      (assignment) => assignment.dayOfWeek === candidate.dayOfWeek,
    ).length;

    if (blocksToday > requirement.maxBlocksPerDay) {
      return false;
    }
  }

  if (requirement.maxConsecutivePeriods != null) {
    const occupied = new Set<number>();

    for (const assignment of proposed) {
      if (assignment.dayOfWeek !== candidate.dayOfWeek) continue;
      for (
        let period = assignment.startPeriod;
        period <= assignment.endPeriod;
        period += 1
      ) {
        occupied.add(period);
      }
    }

    if (
      longestConsecutiveRun(occupied)
      > requirement.maxConsecutivePeriods
    ) {
      return false;
    }
  }

  if (requirement.minDistinctDays != null) {
    const distinctDays = new Set(
      proposed.map((assignment) => assignment.dayOfWeek),
    ).size;
    const remaining = Math.max(
      remainingCardsByRequirement.get(candidate.requirementId) ?? 0,
      0,
    );

    if (distinctDays + remaining < requirement.minDistinctDays) {
      return false;
    }
  }

  return true;
}

function canAssign(
  candidate: Candidate,
  assignments: Candidate[],
  remainingCardsByRequirement: Map<string, number>,
  context: SolverContext,
) {
  if (
    teacherIsUnavailable(
      candidate.teacherId,
      candidate.dayOfWeek,
      candidate.startPeriod,
      candidate.durationPeriods,
      context,
    )
  ) {
    return false;
  }

  for (const occupied of assignments) {
    if (candidate.dayOfWeek !== occupied.dayOfWeek) continue;
    if (!overlaps(
      candidate.startPeriod,
      candidate.endPeriod,
      occupied.startPeriod,
      occupied.endPeriod,
    )) {
      continue;
    }

    if (
      candidate.teacherId != null
      && candidate.teacherId === occupied.teacherId
    ) {
      return false;
    }

    if (
      candidate.roomConflictKey != null
      && candidate.roomConflictKey === occupied.roomConflictKey
    ) {
      return false;
    }

    if (groupsConflict(candidate.groupId, occupied.groupId, context)) {
      return false;
    }
  }

  return respectsRequirementRules(
    candidate,
    assignments,
    remainingCardsByRequirement,
    context,
  );
}

function finalRequirementRulesHold(
  assignments: Candidate[],
  context: SolverContext,
) {
  for (const requirement of context.requirements.values()) {
    if (requirement.minDistinctDays == null) continue;

    const distinctDays = new Set(
      assignments
        .filter(
          (assignment) => assignment.requirementId === requirement.id,
        )
        .map((assignment) => assignment.dayOfWeek),
    ).size;

    if (distinctDays < requirement.minDistinctDays) {
      return false;
    }
  }

  return true;
}

function createContext(
  snapshot: ManagementSolverSnapshotPreview,
  maxCandidatesPerCard: number,
): SolverContext {
  const requirements = new Map(
    snapshot.requirements.map((requirement) => [
      requirement.id,
      requirement,
    ]),
  );
  const cards = new Map(
    snapshot.cards.map((card) => [card.id, card]),
  );
  const activeTeacherIds = new Set(
    snapshot.teachers
      .filter((teacher) => teacher.operationalStatus === 'ACTIVE')
      .map((teacher) => teacher.id),
  );
  const teacherPools = buildPoolMap(
    snapshot.teacherPools,
    (entry) => entry.teacherId,
  );
  const baseline = new Map(
    snapshot.baselinePlacements.map((placement) => {
      const card = cards.get(placement.cardId);
      const requirement = card
        ? requirements.get(card.requirementId)
        : null;
      const plannedTeachers = requirement
        ? (teacherPools.get(requirement.id) ?? [])
            .filter((teacherId) => activeTeacherIds.has(teacherId))
        : [];
      const effectiveTeacherId = (
        placement.teacherId == null
        && requirement?.teacherRequirement === 'REQUIRED'
        && requirement.teacherMode === 'FIXED'
        && plannedTeachers.length === 1
      )
        ? plannedTeachers[0]
        : placement.teacherId;

      return [
        placement.cardId,
        effectiveTeacherId === placement.teacherId
          ? placement
          : {
              ...placement,
              teacherId: effectiveTeacherId,
            },
      ];
    }),
  );
  const teachers = new Map(
    snapshot.teachers.map((teacher) => [teacher.id, teacher]),
  );
  const teacherUnavailableKeys = new Set(
    (snapshot.teacherUnavailablePeriods ?? []).map((slot) => (
      teacherAvailabilityKey(
        slot.teacherId,
        slot.dayOfWeek,
        slot.period,
      )
    )),
  );
  const rooms = new Map(
    snapshot.rooms.map((room) => [room.id, room]),
  );
  const activeRoomIds = new Set(
    snapshot.rooms
      .filter((room) => room.operationalStatus === 'ACTIVE')
      .map((room) => room.id),
  );
  const roomPools = buildPoolMap(
    snapshot.roomPools,
    (entry) => entry.roomId,
  );
  const groupTree = buildGroupDescendants(
    snapshot.instructionalGroupRelations,
  );

  for (const group of snapshot.instructionalGroups) {
    groupTree.visit(group.id);
  }

  return {
    snapshot,
    requirements,
    cards,
    baseline,
    activeTeacherIds,
    teachers,
    teacherUnavailableKeys,
    rooms,
    activeRoomIds,
    teacherPools,
    roomPools,
    groupRelations: snapshot.instructionalGroupRelations,
    groupDescendants: groupTree.memo,
    maxCandidatesPerCard,
  };
}

function addBaselineIssue(
  issueMap: Map<string, Set<string>>,
  cardId: string,
  code: string,
) {
  const current = issueMap.get(cardId) ?? new Set<string>();
  current.add(code);
  issueMap.set(cardId, current);
}

function baselineAudit(
  cards: ManagementSolverCard[],
  context: SolverContext,
): ManagementFeasibilityBaselineIssue[] {
  const issueMap = new Map<string, Set<string>>();
  const materialized = new Map<string, {
    card: ManagementSolverCard;
    requirement: ManagementSolverRequirement;
    placement: ManagementSolverBaselinePlacement & {
      dayOfWeek: number;
      startPeriod: number;
    };
    endPeriod: number;
    roomConflictKey: string | null;
  }>();

  for (const card of cards) {
    const requirement = context.requirements.get(card.requirementId);
    const baseline = context.baseline.get(card.id);

    if (!requirement) {
      addBaselineIssue(issueMap, card.id, 'CARD_REQUIREMENT_MISSING');
      continue;
    }

    if (!baselinePlacementIsMaterialized(baseline)) {
      addBaselineIssue(issueMap, card.id, 'BASELINE_PLACEMENT_MISSING');
      continue;
    }

    const periods = context.snapshot.hardConstraintContract.periods;
    const days = context.snapshot.hardConstraintContract.days;

    if (
      !days.includes(baseline.dayOfWeek)
      || !periods.includes(baseline.startPeriod)
      || !validTimeStart(
        baseline.startPeriod,
        card.durationPeriods,
        periods,
      )
    ) {
      addBaselineIssue(issueMap, card.id, 'BASELINE_TIME_INVALID');
    }

    if (
      requirement.teacherRequirement === 'REQUIRED'
      && baseline.teacherId == null
    ) {
      addBaselineIssue(issueMap, card.id, 'REQUIRED_TEACHER_MISSING');
    }

    if (
      baseline.teacherId != null
      && !context.activeTeacherIds.has(baseline.teacherId)
    ) {
      addBaselineIssue(issueMap, card.id, 'BASELINE_TEACHER_INACTIVE');
    }

    if (
      teacherIsUnavailable(
        baseline.teacherId,
        baseline.dayOfWeek,
        baseline.startPeriod,
        card.durationPeriods,
        context,
      )
    ) {
      addBaselineIssue(
        issueMap,
        card.id,
        'BASELINE_TEACHER_UNAVAILABLE',
      );
    }

    if (
      baseline.roomId != null
      && !context.activeRoomIds.has(baseline.roomId)
    ) {
      addBaselineIssue(issueMap, card.id, 'BASELINE_ROOM_INACTIVE');
    }

    if (
      requirement.resourceMode === 'CAPABILITY'
      && baseline.roomId != null
    ) {
      const room = context.rooms.get(baseline.roomId);
      if (
        !room
        || !requirement.requiredCapability
        || !room.capabilities.includes(requirement.requiredCapability)
        || room.knowledgeStatus !== 'CONFIRMED'
      ) {
        addBaselineIssue(
          issueMap,
          card.id,
          'BASELINE_ROOM_CAPABILITY_MISMATCH',
        );
      }
    }

    materialized.set(card.id, {
      card,
      requirement,
      placement: baseline,
      endPeriod: baseline.startPeriod + card.durationPeriods - 1,
      roomConflictKey: roomConflictKey(baseline.roomId, context),
    });
  }

  const rows = [...materialized.values()];
  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    const left = rows[leftIndex];

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < rows.length;
      rightIndex += 1
    ) {
      const right = rows[rightIndex];

      if (
        left.placement.dayOfWeek !== right.placement.dayOfWeek
        || !overlaps(
          left.placement.startPeriod,
          left.endPeriod,
          right.placement.startPeriod,
          right.endPeriod,
        )
      ) {
        continue;
      }

      if (
        left.placement.teacherId != null
        && left.placement.teacherId === right.placement.teacherId
      ) {
        addBaselineIssue(issueMap, left.card.id, 'BASELINE_TEACHER_CONFLICT');
        addBaselineIssue(issueMap, right.card.id, 'BASELINE_TEACHER_CONFLICT');
      }

      if (
        left.roomConflictKey != null
        && left.roomConflictKey === right.roomConflictKey
      ) {
        addBaselineIssue(issueMap, left.card.id, 'BASELINE_ROOM_CONFLICT');
        addBaselineIssue(issueMap, right.card.id, 'BASELINE_ROOM_CONFLICT');
      }

      if (groupsConflict(
        left.requirement.groupId,
        right.requirement.groupId,
        context,
      )) {
        addBaselineIssue(issueMap, left.card.id, 'BASELINE_GROUP_CONFLICT');
        addBaselineIssue(issueMap, right.card.id, 'BASELINE_GROUP_CONFLICT');
      }
    }
  }

  for (const requirement of context.requirements.values()) {
    const requirementRows = rows.filter(
      (row) => row.requirement.id === requirement.id,
    );
    if (requirementRows.length === 0) continue;

    if (
      requirement.teacherAssignmentScope === 'REQUIREMENT'
      && requirement.teacherContinuity === 'REQUIRED'
    ) {
      const teachers = unique(
        requirementRows
          .map((row) => row.placement.teacherId)
          .filter((teacherId): teacherId is string => teacherId != null),
      );

      if (teachers.length > 1) {
        for (const row of requirementRows) {
          addBaselineIssue(
            issueMap,
            row.card.id,
            'BASELINE_REQUIREMENT_TEACHER_CONTINUITY',
          );
        }
      }
    }

    if (requirement.minDistinctDays != null) {
      const distinctDays = new Set(
        requirementRows.map((row) => row.placement.dayOfWeek),
      ).size;

      if (distinctDays < requirement.minDistinctDays) {
        for (const row of requirementRows) {
          addBaselineIssue(
            issueMap,
            row.card.id,
            'BASELINE_MIN_DISTINCT_DAYS',
          );
        }
      }
    }

    for (const dayOfWeek of context.snapshot.hardConstraintContract.days) {
      const dayRows = requirementRows.filter(
        (row) => row.placement.dayOfWeek === dayOfWeek,
      );
      if (dayRows.length === 0) continue;

      if (
        requirement.maxBlocksPerDay != null
        && dayRows.length > requirement.maxBlocksPerDay
      ) {
        for (const row of dayRows) {
          addBaselineIssue(
            issueMap,
            row.card.id,
            'BASELINE_MAX_BLOCKS_PER_DAY',
          );
        }
      }

      if (requirement.maxConsecutivePeriods != null) {
        const occupied = new Set<number>();

        for (const row of dayRows) {
          for (
            let period = row.placement.startPeriod;
            period <= row.endPeriod;
            period += 1
          ) {
            occupied.add(period);
          }
        }

        if (
          longestConsecutiveRun(occupied)
          > requirement.maxConsecutivePeriods
        ) {
          for (const row of dayRows) {
            addBaselineIssue(
              issueMap,
              row.card.id,
              'BASELINE_MAX_CONSECUTIVE_PERIODS',
            );
          }
        }
      }
    }
  }

  return [...issueMap.entries()]
    .map(([cardId, codes]) => {
      const card = context.cards.get(cardId);
      const requirement = card
        ? context.requirements.get(card.requirementId)
        : null;

      return {
        cardId,
        requirementId: card?.requirementId ?? '',
        subjectName: requirement?.subjectName ?? 'Bilinmeyen ders',
        groupName: requirement?.groupName ?? 'Bilinmeyen grup',
        blockIndex: card?.blockIndex ?? 0,
        codes: [...codes].sort(),
      };
    })
    .sort((left, right) => (
      left.groupName.localeCompare(right.groupName, 'tr')
      || left.subjectName.localeCompare(right.subjectName, 'tr')
      || left.blockIndex - right.blockIndex
      || left.cardId.localeCompare(right.cardId)
    ));
}

function resourceName(
  id: string | null,
  values: Map<string, { name: string }>,
) {
  return id == null ? null : values.get(id)?.name ?? id;
}

function changedCardDiagnostics(
  assignments: Candidate[],
  baselineIssues: ManagementFeasibilityBaselineIssue[],
  context: SolverContext,
): ManagementFeasibilityChangedCard[] {
  const issues = new Map(
    baselineIssues.map((issue) => [issue.cardId, issue.codes]),
  );

  return assignments
    .filter((assignment) => {
      const baseline = context.baseline.get(assignment.cardId);
      if (!baselinePlacementIsMaterialized(baseline)) return true;

      return (
        baseline.dayOfWeek !== assignment.dayOfWeek
        || baseline.startPeriod !== assignment.startPeriod
        || baseline.teacherId !== assignment.teacherId
        || baseline.roomId !== assignment.roomId
      );
    })
    .map((assignment) => {
      const card = context.cards.get(assignment.cardId);
      const requirement = card
        ? context.requirements.get(card.requirementId)
        : null;
      const baseline = context.baseline.get(assignment.cardId);

      return {
        cardId: assignment.cardId,
        requirementId: assignment.requirementId,
        subjectName: requirement?.subjectName ?? 'Bilinmeyen ders',
        groupName: requirement?.groupName ?? 'Bilinmeyen grup',
        blockIndex: card?.blockIndex ?? 0,
        baseline: {
          dayOfWeek: baseline?.dayOfWeek ?? null,
          startPeriod: baseline?.startPeriod ?? null,
          teacherName: resourceName(
            baseline?.teacherId ?? null,
            context.teachers,
          ),
          roomName: resourceName(
            baseline?.roomId ?? null,
            context.rooms,
          ),
        },
        proposed: {
          dayOfWeek: assignment.dayOfWeek,
          startPeriod: assignment.startPeriod,
          teacherName: resourceName(
            assignment.teacherId,
            context.teachers,
          ),
          roomName: resourceName(
            assignment.roomId,
            context.rooms,
          ),
        },
        baselineIssueCodes: issues.get(assignment.cardId) ?? [],
      };
    })
    .sort((left, right) => (
      left.groupName.localeCompare(right.groupName, 'tr')
      || left.subjectName.localeCompare(right.subjectName, 'tr')
      || left.blockIndex - right.blockIndex
      || left.cardId.localeCompare(right.cardId)
    ));
}

function baselineCandidateForCard(
  card: ManagementSolverCard,
  context: SolverContext,
) {
  const requirement = context.requirements.get(card.requirementId);
  const baseline = context.baseline.get(card.id);

  if (!requirement || !baselinePlacementIsMaterialized(baseline)) {
    return null;
  }

  const days = context.snapshot.hardConstraintContract.days;
  const periods = context.snapshot.hardConstraintContract.periods;
  if (
    !days.includes(baseline.dayOfWeek)
    || !periods.includes(baseline.startPeriod)
    || !validTimeStart(
      baseline.startPeriod,
      card.durationPeriods,
      periods,
    )
  ) {
    return null;
  }

  if (!baselineResourceDimensionsAllowed(
    requirement,
    baseline,
    context,
  )) {
    return null;
  }

  return {
    cardId: card.id,
    requirementId: card.requirementId,
    groupId: requirement.groupId,
    durationPeriods: card.durationPeriods,
    dayOfWeek: baseline.dayOfWeek,
    startPeriod: baseline.startPeriod,
    endPeriod: baseline.startPeriod + card.durationPeriods - 1,
    teacherId: baseline.teacherId,
    roomId: baseline.roomId,
    roomConflictKey: roomConflictKey(baseline.roomId, context),
    provisionalRoom: requirement.resourceMode === 'UNKNOWN',
    baseline: true,
  } satisfies Candidate;
}

function tryBaseline(
  cards: ManagementSolverCard[],
  context: SolverContext,
) {
  const assignments: Candidate[] = [];
  const remainingByRequirement = new Map<string, number>();

  for (const card of cards) {
    remainingByRequirement.set(
      card.requirementId,
      (remainingByRequirement.get(card.requirementId) ?? 0) + 1,
    );
  }

  for (const card of cards) {
    const candidate = baselineCandidateForCard(card, context);
    if (!candidate) {
      return null;
    }

    remainingByRequirement.set(
      card.requirementId,
      Math.max(
        (remainingByRequirement.get(card.requirementId) ?? 1) - 1,
        0,
      ),
    );

    if (!canAssign(
      candidate,
      assignments,
      remainingByRequirement,
      context,
    )) {
      return null;
    }

    assignments.push(candidate);
  }

  return finalRequirementRulesHold(assignments, context)
    ? assignments
    : null;
}


function baselinePinnedCandidatesForCard(
  card: ManagementSolverCard,
  context: SolverContext,
) {
  const requirement = context.requirements.get(card.requirementId);
  const baseline = context.baseline.get(card.id);

  if (!requirement || !baselinePlacementIsMaterialized(baseline)) {
    return [];
  }

  const days = context.snapshot.hardConstraintContract.days;
  const periods = context.snapshot.hardConstraintContract.periods;
  if (
    !days.includes(baseline.dayOfWeek)
    || !periods.includes(baseline.startPeriod)
    || !validTimeStart(
      baseline.startPeriod,
      card.durationPeriods,
      periods,
    )
  ) {
    return [];
  }

  const teacherIds = baseline.teacherId != null
    ? [baseline.teacherId]
    : requirement.teacherRequirement === 'REQUIRED'
      ? teacherChoices(requirement, baseline, card.locked, context)
      : [null];

  const candidates: Candidate[] = [];

  for (const teacherId of teacherIds) {
    const effectiveBaseline = {
      ...baseline,
      teacherId,
    };

    if (!baselineResourceDimensionsAllowed(
      requirement,
      effectiveBaseline,
      context,
    )) {
      continue;
    }

    if (teacherIsUnavailable(
      teacherId,
      baseline.dayOfWeek,
      baseline.startPeriod,
      card.durationPeriods,
      context,
    )) {
      continue;
    }

    candidates.push({
      cardId: card.id,
      requirementId: card.requirementId,
      groupId: requirement.groupId,
      durationPeriods: card.durationPeriods,
      dayOfWeek: baseline.dayOfWeek,
      startPeriod: baseline.startPeriod,
      endPeriod: baseline.startPeriod + card.durationPeriods - 1,
      teacherId,
      roomId: baseline.roomId,
      roomConflictKey: roomConflictKey(baseline.roomId, context),
      provisionalRoom: requirement.resourceMode === 'UNKNOWN',
      baseline: teacherId === baseline.teacherId,
    });
  }

  return candidates;
}

function tryBaselinePinnedTeacherResolution(
  cards: ManagementSolverCard[],
  context: SolverContext,
  maxVisitedNodes: number,
) {
  const domains = new Map<string, Candidate[]>();

  for (const card of cards) {
    const candidates = baselinePinnedCandidatesForCard(card, context);
    if (candidates.length === 0) {
      return null;
    }
    domains.set(card.id, candidates);
  }

  const orderedCards = [...cards].sort((left, right) => (
    (domains.get(left.id)?.length ?? Number.MAX_SAFE_INTEGER)
    - (domains.get(right.id)?.length ?? Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id)
  ));

  const assignments: Candidate[] = [];
  const remainingByRequirement = new Map<string, number>();
  for (const card of orderedCards) {
    remainingByRequirement.set(
      card.requirementId,
      (remainingByRequirement.get(card.requirementId) ?? 0) + 1,
    );
  }

  let visitedNodeCount = 0;
  let backtrackCount = 0;
  let hitSearchLimit = false;

  const search = (index: number): boolean => {
    if (visitedNodeCount >= maxVisitedNodes) {
      hitSearchLimit = true;
      return false;
    }

    if (index >= orderedCards.length) {
      return finalRequirementRulesHold(assignments, context);
    }

    const card = orderedCards[index];
    const candidates = domains.get(card.id) ?? [];

    remainingByRequirement.set(
      card.requirementId,
      Math.max(
        (remainingByRequirement.get(card.requirementId) ?? 1) - 1,
        0,
      ),
    );

    for (const candidate of candidates) {
      visitedNodeCount += 1;

      if (!canAssign(
        candidate,
        assignments,
        remainingByRequirement,
        context,
      )) {
        continue;
      }

      assignments.push(candidate);

      if (search(index + 1)) {
        return true;
      }

      assignments.pop();
      backtrackCount += 1;

      if (hitSearchLimit) break;
    }

    remainingByRequirement.set(
      card.requirementId,
      (remainingByRequirement.get(card.requirementId) ?? 0) + 1,
    );

    return false;
  };

  if (!search(0)) {
    return null;
  }

  return {
    assignments,
    visitedNodeCount,
    backtrackCount,
    generatedCandidateCount: [...domains.values()].reduce(
      (sum, candidates) => sum + candidates.length,
      0,
    ),
  };
}

function toPublicPlacement(
  candidate: Candidate,
): ManagementFeasibilityPlacement {
  return {
    cardId: candidate.cardId,
    dayOfWeek: candidate.dayOfWeek,
    startPeriod: candidate.startPeriod,
    teacherId: candidate.teacherId,
    roomId: candidate.roomId,
    provisionalRoom: candidate.provisionalRoom,
    baseline: candidate.baseline,
  };
}

function resultMetrics(
  cardCount: number,
  assignments: Candidate[],
  generatedCandidateCount: number,
  visitedNodeCount: number,
  backtrackCount: number,
  elapsedMs: number,
): ManagementFeasibilityMetrics {
  return {
    cardCount,
    assignedCardCount: assignments.length,
    generatedCandidateCount,
    visitedNodeCount,
    backtrackCount,
    baselineReuseCount: assignments.filter(
      (assignment) => assignment.baseline,
    ).length,
    provisionalRoomCount: assignments.filter(
      (assignment) => assignment.provisionalRoom,
    ).length,
    elapsedMs,
  };
}

export function runManagementFeasibilityPrototype(
  snapshot: ManagementSolverSnapshotPreview,
  options: ManagementFeasibilityOptions = {},
): ManagementFeasibilityResult {
  const startedAt = Date.now();
  const maxVisitedNodes = options.maxVisitedNodes
    ?? DEFAULT_MAX_VISITED_NODES;
  const maxCandidatesPerCard = options.maxCandidatesPerCard
    ?? DEFAULT_MAX_CANDIDATES_PER_CARD;

  if (!snapshot.readiness.hardInputReady) {
    return {
      engineVersion: ENGINE_VERSION,
      status: 'INFEASIBLE',
      snapshotHash: snapshot.snapshotHash,
      baselineHash: snapshot.baselineHash,
      baselineWasFeasible: false,
      writesPerformed: false,
      objectiveProfileUsed: false,
      placements: [],
      reasons: [
        'HARD_INPUT_NOT_READY',
        ...snapshot.readiness.hardBlockers.map(
          (blocker) => blocker.code,
        ),
      ],
      metrics: resultMetrics(
        snapshot.cards.length,
        [],
        0,
        0,
        0,
        Date.now() - startedAt,
      ),
    };
  }

  const context = createContext(snapshot, maxCandidatesPerCard);
  const cards = [...snapshot.cards];

  const missingRequirementCards = cards.filter(
    (card) => !context.requirements.has(card.requirementId),
  );
  if (missingRequirementCards.length > 0) {
    return {
      engineVersion: ENGINE_VERSION,
      status: 'INFEASIBLE',
      snapshotHash: snapshot.snapshotHash,
      baselineHash: snapshot.baselineHash,
      baselineWasFeasible: false,
      writesPerformed: false,
      objectiveProfileUsed: false,
      placements: [],
      reasons: ['CARD_REQUIREMENT_MISSING'],
      metrics: resultMetrics(
        cards.length,
        [],
        0,
        0,
        0,
        Date.now() - startedAt,
      ),
    };
  }

  const lockedWithoutBaseline = cards.filter((card) => (
    card.locked
    && !baselinePlacementIsMaterialized(context.baseline.get(card.id))
  ));
  if (lockedWithoutBaseline.length > 0) {
    return {
      engineVersion: ENGINE_VERSION,
      status: 'INFEASIBLE',
      snapshotHash: snapshot.snapshotHash,
      baselineHash: snapshot.baselineHash,
      baselineWasFeasible: false,
      writesPerformed: false,
      objectiveProfileUsed: false,
      placements: [],
      reasons: ['LOCKED_CARD_BASELINE_MISSING'],
      metrics: resultMetrics(
        cards.length,
        [],
        0,
        0,
        0,
        Date.now() - startedAt,
      ),
    };
  }

  const baselineIssues = baselineAudit(cards, context);
  const materializedBaselineCount = cards.filter((card) => (
    baselinePlacementIsMaterialized(context.baseline.get(card.id))
  )).length;

  if (materializedBaselineCount === cards.length) {
    const baselineAssignments = tryBaseline(cards, context);
    if (baselineAssignments) {
      return {
        engineVersion: ENGINE_VERSION,
        status: 'FEASIBLE',
        snapshotHash: snapshot.snapshotHash,
        baselineHash: snapshot.baselineHash,
        baselineWasFeasible: true,
        writesPerformed: false,
        objectiveProfileUsed: false,
        placements: baselineAssignments.map(toPublicPlacement),
        reasons: [],
        baselineIssues: [],
        changedCards: [],
        metrics: resultMetrics(
          cards.length,
          baselineAssignments,
          baselineAssignments.length,
          0,
          0,
          Date.now() - startedAt,
        ),
      };
    }

    const pinnedResolution = tryBaselinePinnedTeacherResolution(
      cards,
      context,
      maxVisitedNodes,
    );

    if (pinnedResolution) {
      return {
        engineVersion: ENGINE_VERSION,
        status: 'FEASIBLE',
        snapshotHash: snapshot.snapshotHash,
        baselineHash: snapshot.baselineHash,
        baselineWasFeasible: false,
        writesPerformed: false,
        objectiveProfileUsed: false,
        placements: pinnedResolution.assignments.map(toPublicPlacement),
        reasons: [],
        baselineIssues,
        changedCards: changedCardDiagnostics(
          pinnedResolution.assignments,
          baselineIssues,
          context,
        ),
        metrics: resultMetrics(
          cards.length,
          pinnedResolution.assignments,
          pinnedResolution.generatedCandidateCount,
          pinnedResolution.visitedNodeCount,
          pinnedResolution.backtrackCount,
          Date.now() - startedAt,
        ),
      };
    }
  }

  let generatedCandidateCount = 0;
  const domains = new Map<string, Candidate[]>();

  for (const card of cards) {
    const candidates = rawCandidatesForCard(card, context);
    generatedCandidateCount += candidates.length;
    domains.set(card.id, candidates);

    if (candidates.length === 0) {
      return {
        engineVersion: ENGINE_VERSION,
        status: 'INFEASIBLE',
        snapshotHash: snapshot.snapshotHash,
        baselineHash: snapshot.baselineHash,
        baselineWasFeasible: false,
        writesPerformed: false,
        objectiveProfileUsed: false,
        placements: [],
        reasons: ['EMPTY_CARD_DOMAIN', card.id],
        metrics: resultMetrics(
          cards.length,
          [],
          generatedCandidateCount,
          0,
          0,
          Date.now() - startedAt,
        ),
      };
    }
  }

  const orderedCards = [...cards].sort((left, right) => {
    if (left.locked !== right.locked) {
      return left.locked ? -1 : 1;
    }

    const domainDelta = (
      (domains.get(left.id)?.length ?? Number.MAX_SAFE_INTEGER)
      - (domains.get(right.id)?.length ?? Number.MAX_SAFE_INTEGER)
    );
    if (domainDelta !== 0) return domainDelta;

    return left.id.localeCompare(right.id);
  });

  const assignments: Candidate[] = [];
  const remainingByRequirement = new Map<string, number>();
  for (const card of orderedCards) {
    remainingByRequirement.set(
      card.requirementId,
      (remainingByRequirement.get(card.requirementId) ?? 0) + 1,
    );
  }

  let visitedNodeCount = 0;
  let backtrackCount = 0;
  let hitSearchLimit = false;

  const search = (index: number): boolean => {
    if (visitedNodeCount >= maxVisitedNodes) {
      hitSearchLimit = true;
      return false;
    }

    if (index >= orderedCards.length) {
      return finalRequirementRulesHold(assignments, context);
    }

    const card = orderedCards[index];
    const candidates = domains.get(card.id) ?? [];

    remainingByRequirement.set(
      card.requirementId,
      Math.max(
        (remainingByRequirement.get(card.requirementId) ?? 1) - 1,
        0,
      ),
    );

    for (const candidate of candidates) {
      visitedNodeCount += 1;

      if (visitedNodeCount > maxVisitedNodes) {
        hitSearchLimit = true;
        break;
      }

      if (!canAssign(
        candidate,
        assignments,
        remainingByRequirement,
        context,
      )) {
        continue;
      }

      assignments.push(candidate);

      if (search(index + 1)) {
        return true;
      }

      assignments.pop();
      backtrackCount += 1;

      if (hitSearchLimit) break;
    }

    remainingByRequirement.set(
      card.requirementId,
      (remainingByRequirement.get(card.requirementId) ?? 0) + 1,
    );

    return false;
  };

  const feasible = search(0);
  const elapsedMs = Date.now() - startedAt;

  if (!feasible) {
    return {
      engineVersion: ENGINE_VERSION,
      status: hitSearchLimit ? 'SEARCH_LIMIT' : 'INFEASIBLE',
      snapshotHash: snapshot.snapshotHash,
      baselineHash: snapshot.baselineHash,
      baselineWasFeasible: false,
      writesPerformed: false,
      objectiveProfileUsed: false,
      placements: [],
      reasons: [
        hitSearchLimit
          ? 'SEARCH_NODE_LIMIT_REACHED'
          : 'NO_FEASIBLE_ASSIGNMENT_FOUND',
      ],
      metrics: resultMetrics(
        cards.length,
        [],
        generatedCandidateCount,
        visitedNodeCount,
        backtrackCount,
        elapsedMs,
      ),
    };
  }

  return {
    engineVersion: ENGINE_VERSION,
    status: 'FEASIBLE',
    snapshotHash: snapshot.snapshotHash,
    baselineHash: snapshot.baselineHash,
    baselineWasFeasible: false,
    writesPerformed: false,
    objectiveProfileUsed: false,
    placements: assignments.map(toPublicPlacement),
    reasons: [],
    baselineIssues,
    changedCards: changedCardDiagnostics(
      assignments,
      baselineIssues,
      context,
    ),
    metrics: resultMetrics(
      cards.length,
      assignments,
      generatedCandidateCount,
      visitedNodeCount,
      backtrackCount,
      elapsedMs,
    ),
  };
}


export interface ManagementOptimizationMetricVector {
  changeCost: number;
  preferredTeacherContinuityBreaks: number;
  teacherIdleGapPeriods: number;
  roomStabilityBreaks: number;
}

export interface ManagementOptimizationScoreComponent {
  rawValue: number;
  normalizedValue: number;
  weight: number;
  contribution: number;
}

export interface ManagementOptimizationScore {
  total: number;
  components: {
    changeCost: ManagementOptimizationScoreComponent;
    preferredTeacherContinuity: ManagementOptimizationScoreComponent;
    teacherIdleGaps: ManagementOptimizationScoreComponent;
    roomStability: ManagementOptimizationScoreComponent;
  };
}

export type ManagementOptimizationStatus =
  | 'IMPROVED'
  | 'UNCHANGED'
  | 'BLOCKED';

export interface ManagementOptimizationResult {
  engineVersion: 'M33.3-v0';
  status: ManagementOptimizationStatus;
  snapshotHash: string;
  baselineHash: string;
  writesPerformed: false;
  objectiveProfileUsed: true;
  weights: ManagementSolverObjectiveWeights;
  baselineMetrics: ManagementOptimizationMetricVector;
  proposedMetrics: ManagementOptimizationMetricVector;
  delta: ManagementOptimizationMetricVector;
  baselineScore: ManagementOptimizationScore;
  proposedScore: ManagementOptimizationScore;
  placements: ManagementFeasibilityPlacement[];
  changedCards: ManagementFeasibilityChangedCard[];
  evaluatedMoveCount: number;
  acceptedMoveCount: number;
  elapsedMs: number;
  reasons: string[];
}

export interface ManagementOptimizationOptions {
  maxIterations?: number;
  maxNeighborsPerCard?: number;
  maxCandidatesPerCard?: number;
}

const DEFAULT_OPTIMIZATION_ITERATIONS = 8;
const DEFAULT_OPTIMIZATION_NEIGHBORS_PER_CARD = 24;
const DEFAULT_OPTIMIZATION_CANDIDATES_PER_CARD = 400;
const SCORE_EPSILON = 1e-9;

function objectiveMetricVector(
  assignments: Candidate[],
  context: SolverContext,
): ManagementOptimizationMetricVector {
  let changeCost = 0;

  for (const assignment of assignments) {
    const baseline = context.baseline.get(assignment.cardId);
    if (!baselinePlacementIsMaterialized(baseline)) {
      changeCost += 4;
      continue;
    }

    if (assignment.dayOfWeek !== baseline.dayOfWeek) changeCost += 1;
    if (assignment.startPeriod !== baseline.startPeriod) changeCost += 1;
    if (assignment.teacherId !== baseline.teacherId) changeCost += 1;
    if (assignment.roomId !== baseline.roomId) changeCost += 1;
  }

  const byRequirement = new Map<string, Candidate[]>();
  const byTeacherDay = new Map<string, Candidate[]>();

  for (const assignment of assignments) {
    const requirementAssignments = byRequirement.get(
      assignment.requirementId,
    ) ?? [];
    requirementAssignments.push(assignment);
    byRequirement.set(
      assignment.requirementId,
      requirementAssignments,
    );

    if (assignment.teacherId != null) {
      const key = `${assignment.teacherId}|${assignment.dayOfWeek}`;
      const teacherAssignments = byTeacherDay.get(key) ?? [];
      teacherAssignments.push(assignment);
      byTeacherDay.set(key, teacherAssignments);
    }
  }

  let preferredTeacherContinuityBreaks = 0;
  let roomStabilityBreaks = 0;

  for (const requirement of context.requirements.values()) {
    const assigned = byRequirement.get(requirement.id) ?? [];

    if (
      requirement.teacherAssignmentScope === 'BLOCK'
      && requirement.teacherContinuity === 'PREFERRED'
    ) {
      const teachers = new Set(
        assigned
          .map((assignment) => assignment.teacherId)
          .filter((teacherId): teacherId is string => teacherId != null),
      );
      preferredTeacherContinuityBreaks += Math.max(
        teachers.size - 1,
        0,
      );
    }

    const rooms = new Set(
      assigned
        .map((assignment) => assignment.roomId)
        .filter((roomId): roomId is string => roomId != null),
    );
    roomStabilityBreaks += Math.max(rooms.size - 1, 0);
  }

  let teacherIdleGapPeriods = 0;

  for (const assigned of byTeacherDay.values()) {
    if (assigned.length === 0) continue;

    let firstPeriod = Number.POSITIVE_INFINITY;
    let lastPeriod = Number.NEGATIVE_INFINITY;
    let occupiedPeriods = 0;

    for (const assignment of assigned) {
      firstPeriod = Math.min(firstPeriod, assignment.startPeriod);
      lastPeriod = Math.max(lastPeriod, assignment.endPeriod);
      occupiedPeriods += assignment.durationPeriods;
    }

    teacherIdleGapPeriods += Math.max(
      lastPeriod - firstPeriod + 1 - occupiedPeriods,
      0,
    );
  }

  return {
    changeCost,
    preferredTeacherContinuityBreaks,
    teacherIdleGapPeriods,
    roomStabilityBreaks,
  };
}

function optimizationScoreComponent(
  rawValue: number,
  weight: number,
  cardCount: number,
): ManagementOptimizationScoreComponent {
  const normalizedValue = rawValue / Math.max(cardCount, 1);
  return {
    rawValue,
    normalizedValue,
    weight,
    contribution: normalizedValue * weight,
  };
}

function objectiveScore(
  metrics: ManagementOptimizationMetricVector,
  weights: ManagementSolverObjectiveWeights,
  cardCount: number,
): ManagementOptimizationScore {
  const changeCost = optimizationScoreComponent(
    metrics.changeCost,
    weights.changeCost,
    cardCount,
  );
  const preferredTeacherContinuity = optimizationScoreComponent(
    metrics.preferredTeacherContinuityBreaks,
    weights.preferredTeacherContinuity,
    cardCount,
  );
  const teacherIdleGaps = optimizationScoreComponent(
    metrics.teacherIdleGapPeriods,
    weights.teacherIdleGaps,
    cardCount,
  );
  const roomStability = optimizationScoreComponent(
    metrics.roomStabilityBreaks,
    weights.roomStability,
    cardCount,
  );

  return {
    total:
      changeCost.contribution
      + preferredTeacherContinuity.contribution
      + teacherIdleGaps.contribution
      + roomStability.contribution,
    components: {
      changeCost,
      preferredTeacherContinuity,
      teacherIdleGaps,
      roomStability,
    },
  };
}

function supportedPositiveWeightCount(
  weights: ManagementSolverObjectiveWeights,
) {
  return [
    weights.changeCost,
    weights.preferredTeacherContinuity,
    weights.teacherIdleGaps,
    weights.roomStability,
  ].filter((weight) => weight > 0).length;
}

function samePlacement(
  left: Candidate,
  right: Candidate,
) {
  return (
    left.dayOfWeek === right.dayOfWeek
    && left.startPeriod === right.startPeriod
    && left.teacherId === right.teacherId
    && left.roomId === right.roomId
  );
}

function candidateKey(candidate: Candidate) {
  return [
    candidate.dayOfWeek,
    candidate.startPeriod,
    candidate.teacherId ?? '',
    candidate.roomId ?? '',
  ].join('|');
}

function candidateDistance(
  candidate: Candidate,
  current: Candidate,
) {
  let distance = (
    Math.abs(candidate.dayOfWeek - current.dayOfWeek) * 12
    + Math.abs(candidate.startPeriod - current.startPeriod)
  );

  if (candidate.teacherId !== current.teacherId) distance += 2;
  if (candidate.roomId !== current.roomId) distance += 2;

  return distance;
}

function optimizationNeighborhood(
  domain: Candidate[],
  current: Candidate,
  maxNeighbors: number,
) {
  return domain
    .filter((candidate) => !samePlacement(candidate, current))
    .sort((left, right) => (
      candidateDistance(left, current)
      - candidateDistance(right, current)
      || candidateKey(left).localeCompare(candidateKey(right))
    ))
    .slice(0, maxNeighbors);
}

function preserveUnknownRoomEvidence(
  candidate: Candidate,
  context: SolverContext,
) {
  const requirement = context.requirements.get(candidate.requirementId);
  const baseline = context.baseline.get(candidate.cardId);

  if (
    requirement?.resourceMode !== 'UNKNOWN'
    || baseline?.roomId == null
  ) {
    return true;
  }

  return candidate.roomId === baseline.roomId;
}

function moveIsHardFeasible(
  candidate: Candidate,
  assignments: Candidate[],
  context: SolverContext,
) {
  const remainingByRequirement = new Map<string, number>();
  remainingByRequirement.set(candidate.requirementId, 0);

  if (!canAssign(
    candidate,
    assignments,
    remainingByRequirement,
    context,
  )) {
    return false;
  }

  return finalRequirementRulesHold(
    [...assignments, candidate],
    context,
  );
}

function metricDelta(
  baseline: ManagementOptimizationMetricVector,
  proposed: ManagementOptimizationMetricVector,
): ManagementOptimizationMetricVector {
  return {
    changeCost: proposed.changeCost - baseline.changeCost,
    preferredTeacherContinuityBreaks:
      proposed.preferredTeacherContinuityBreaks
      - baseline.preferredTeacherContinuityBreaks,
    teacherIdleGapPeriods:
      proposed.teacherIdleGapPeriods
      - baseline.teacherIdleGapPeriods,
    roomStabilityBreaks:
      proposed.roomStabilityBreaks
      - baseline.roomStabilityBreaks,
  };
}

interface LocalObjectiveSearchResult {
  assignments: Candidate[];
  metrics: ManagementOptimizationMetricVector;
  score: ManagementOptimizationScore;
  evaluatedMoveCount: number;
  acceptedMoveCount: number;
}

function runLocalObjectiveSearch(
  startAssignments: Candidate[],
  weights: ManagementSolverObjectiveWeights,
  cards: ManagementSolverCard[],
  domains: Map<string, Candidate[]>,
  context: SolverContext,
  maxIterations: number,
  maxNeighborsPerCard: number,
): LocalObjectiveSearchResult {
  let currentAssignments = [...startAssignments];
  let currentMetrics = objectiveMetricVector(
    currentAssignments,
    context,
  );
  let currentScore = objectiveScore(
    currentMetrics,
    weights,
    cards.length,
  );
  let evaluatedMoveCount = 0;
  let acceptedMoveCount = 0;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let best:
      | {
          assignments: Candidate[];
          metrics: ManagementOptimizationMetricVector;
          score: ManagementOptimizationScore;
          key: string;
        }
      | null = null;

    for (const card of cards) {
      if (card.locked) continue;

      const current = currentAssignments.find(
        (assignment) => assignment.cardId === card.id,
      );
      if (!current) continue;

      const others = currentAssignments.filter(
        (assignment) => assignment.cardId !== card.id,
      );
      const neighborhood = optimizationNeighborhood(
        domains.get(card.id) ?? [],
        current,
        maxNeighborsPerCard,
      );

      for (const candidate of neighborhood) {
        if (!preserveUnknownRoomEvidence(candidate, context)) {
          continue;
        }

        evaluatedMoveCount += 1;

        if (!moveIsHardFeasible(candidate, others, context)) {
          continue;
        }

        const proposedAssignments = [...others, candidate];
        const proposedMetrics = objectiveMetricVector(
          proposedAssignments,
          context,
        );
        const proposedScore = objectiveScore(
          proposedMetrics,
          weights,
          cards.length,
        );

        if (
          proposedScore.total
          >= currentScore.total - SCORE_EPSILON
        ) {
          continue;
        }

        const key = `${card.id}|${candidateKey(candidate)}`;

        if (
          best == null
          || proposedScore.total < best.score.total - SCORE_EPSILON
          || (
            Math.abs(proposedScore.total - best.score.total)
              <= SCORE_EPSILON
            && key.localeCompare(best.key) < 0
          )
        ) {
          best = {
            assignments: proposedAssignments,
            metrics: proposedMetrics,
            score: proposedScore,
            key,
          };
        }
      }
    }

    if (!best) break;

    currentAssignments = best.assignments;
    currentMetrics = best.metrics;
    currentScore = best.score;
    acceptedMoveCount += 1;
  }

  return {
    assignments: currentAssignments,
    metrics: currentMetrics,
    score: currentScore,
    evaluatedMoveCount,
    acceptedMoveCount,
  };
}

function singleObjectiveSeedWeights(
  weights: ManagementSolverObjectiveWeights,
) {
  const seeds: ManagementSolverObjectiveWeights[] = [];

  const add = (
    key:
      | 'preferredTeacherContinuity'
      | 'teacherIdleGaps'
      | 'roomStability',
  ) => {
    if (weights[key] <= 0) return;
    seeds.push({
      changeCost: 0,
      preferredTeacherContinuity: 0,
      teacherIdleGaps: 0,
      roomStability: 0,
      teacherLoadBalance: 0,
      subjectTimePreference: 0,
      [key]: 1000,
    });
  };

  add('preferredTeacherContinuity');
  add('teacherIdleGaps');
  add('roomStability');

  return seeds;
}

function targetScoreForAssignments(
  assignments: Candidate[],
  weights: ManagementSolverObjectiveWeights,
  cardCount: number,
  context: SolverContext,
) {
  const metrics = objectiveMetricVector(assignments, context);
  return {
    metrics,
    score: objectiveScore(metrics, weights, cardCount),
  };
}

export function runManagementObjectiveOptimization(
  snapshot: ManagementSolverSnapshotPreview,
  weights: ManagementSolverObjectiveWeights,
  options: ManagementOptimizationOptions = {},
): ManagementOptimizationResult {
  const startedAt = Date.now();
  const maxIterations = options.maxIterations
    ?? DEFAULT_OPTIMIZATION_ITERATIONS;
  const maxNeighborsPerCard = options.maxNeighborsPerCard
    ?? DEFAULT_OPTIMIZATION_NEIGHBORS_PER_CARD;
  const maxCandidatesPerCard = options.maxCandidatesPerCard
    ?? DEFAULT_OPTIMIZATION_CANDIDATES_PER_CARD;

  const context = createContext(snapshot, maxCandidatesPerCard);
  const cards = [...snapshot.cards].sort(
    (left, right) => left.id.localeCompare(right.id),
  );

  const emptyMetrics: ManagementOptimizationMetricVector = {
    changeCost: 0,
    preferredTeacherContinuityBreaks: 0,
    teacherIdleGapPeriods: 0,
    roomStabilityBreaks: 0,
  };
  const emptyScore = objectiveScore(
    emptyMetrics,
    weights,
    Math.max(cards.length, 1),
  );

  const blocked = (
    reason: string,
  ): ManagementOptimizationResult => ({
    engineVersion: 'M33.3-v0',
    status: 'BLOCKED',
    snapshotHash: snapshot.snapshotHash,
    baselineHash: snapshot.baselineHash,
    writesPerformed: false,
    objectiveProfileUsed: true,
    weights: { ...weights },
    baselineMetrics: emptyMetrics,
    proposedMetrics: emptyMetrics,
    delta: emptyMetrics,
    baselineScore: emptyScore,
    proposedScore: emptyScore,
    placements: [],
    changedCards: [],
    evaluatedMoveCount: 0,
    acceptedMoveCount: 0,
    elapsedMs: Date.now() - startedAt,
    reasons: [reason],
  });

  if (!snapshot.readiness.hardInputReady) {
    return blocked('HARD_INPUT_NOT_READY');
  }

  if (supportedPositiveWeightCount(weights) === 0) {
    return blocked('NO_ACTIVE_SUPPORTED_PRIORITIES');
  }

  const baselineAssignments = tryBaseline(cards, context);
  if (!baselineAssignments) {
    return blocked('BASELINE_NOT_FEASIBLE');
  }

  const domains = new Map<string, Candidate[]>();
  for (const card of cards) {
    domains.set(card.id, rawCandidatesForCard(card, context));
  }

  const baselineMetrics = objectiveMetricVector(
    baselineAssignments,
    context,
  );
  const baselineScore = objectiveScore(
    baselineMetrics,
    weights,
    cards.length,
  );

  const candidateSolutions: Array<{
    assignments: Candidate[];
    metrics: ManagementOptimizationMetricVector;
    score: ManagementOptimizationScore;
    sourceKey: string;
    evaluatedMoveCount: number;
    acceptedMoveCount: number;
  }> = [{
    assignments: [...baselineAssignments],
    metrics: baselineMetrics,
    score: baselineScore,
    sourceKey: 'baseline',
    evaluatedMoveCount: 0,
    acceptedMoveCount: 0,
  }];

  const combined = runLocalObjectiveSearch(
    baselineAssignments,
    weights,
    cards,
    domains,
    context,
    maxIterations,
    maxNeighborsPerCard,
  );

  candidateSolutions.push({
    ...combined,
    sourceKey: 'combined',
  });

  const seedWeights = singleObjectiveSeedWeights(weights);
  for (let index = 0; index < seedWeights.length; index += 1) {
    const seed = runLocalObjectiveSearch(
      baselineAssignments,
      seedWeights[index],
      cards,
      domains,
      context,
      maxIterations,
      maxNeighborsPerCard,
    );
    const target = targetScoreForAssignments(
      seed.assignments,
      weights,
      cards.length,
      context,
    );

    candidateSolutions.push({
      assignments: seed.assignments,
      metrics: target.metrics,
      score: target.score,
      sourceKey: `seed-${index}`,
      evaluatedMoveCount: seed.evaluatedMoveCount,
      acceptedMoveCount: seed.acceptedMoveCount,
    });
  }

  candidateSolutions.sort((left, right) => (
    left.score.total - right.score.total
    || left.metrics.changeCost - right.metrics.changeCost
    || left.metrics.preferredTeacherContinuityBreaks
      - right.metrics.preferredTeacherContinuityBreaks
    || left.metrics.teacherIdleGapPeriods
      - right.metrics.teacherIdleGapPeriods
    || left.metrics.roomStabilityBreaks
      - right.metrics.roomStabilityBreaks
    || left.sourceKey.localeCompare(right.sourceKey)
  ));

  const selected = candidateSolutions[0];
  const evaluatedMoveCount = candidateSolutions.reduce(
    (sum, candidate) => sum + candidate.evaluatedMoveCount,
    0,
  );
  const acceptedMoveCount = selected.acceptedMoveCount;

  const selectedAssignments = [...selected.assignments].sort(
    (left, right) => left.cardId.localeCompare(right.cardId),
  );

  const improved = (
    selected.score.total < baselineScore.total - SCORE_EPSILON
  );

  return {
    engineVersion: 'M33.3-v0',
    status: improved ? 'IMPROVED' : 'UNCHANGED',
    snapshotHash: snapshot.snapshotHash,
    baselineHash: snapshot.baselineHash,
    writesPerformed: false,
    objectiveProfileUsed: true,
    weights: { ...weights },
    baselineMetrics,
    proposedMetrics: selected.metrics,
    delta: metricDelta(baselineMetrics, selected.metrics),
    baselineScore,
    proposedScore: selected.score,
    placements: selectedAssignments.map(toPublicPlacement),
    changedCards: changedCardDiagnostics(
      selectedAssignments,
      [],
      context,
    ),
    evaluatedMoveCount,
    acceptedMoveCount,
    elapsedMs: Date.now() - startedAt,
    reasons: improved ? [] : ['NO_LOCAL_IMPROVEMENT_FOUND'],
  };
}
