import type {
  ManagementWorkspaceSnapshotV1,
} from '@/lib/managementWorkspace';
import {
  diffManagementWorkspaceV1,
  type ManagementWorkspacePlacementStateV1,
  type ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

export type ManagementWorkspaceValidationCodeV1 =
  | 'TIME_OUTSIDE_DAY'
  | 'LUNCH_BREAK_CROSSING'
  | 'LOCKED_CARD_MOVED'
  | 'TEACHER_REQUIRED'
  | 'TEACHER_INACTIVE'
  | 'TEACHER_NOT_ELIGIBLE'
  | 'TEACHER_UNAVAILABLE'
  | 'ROOM_REQUIRED'
  | 'ROOM_INACTIVE'
  | 'ROOM_NOT_ELIGIBLE'
  | 'ROOM_CAPABILITY_MISMATCH'
  | 'TEACHER_CONFLICT'
  | 'ROOM_CONFLICT'
  | 'GROUP_CONFLICT'
  | 'PARALLEL_BUNDLE_BROKEN'
  | 'REQUIREMENT_RESOURCES_REQUIRE_UNPLACED'
  | 'TEACHER_CONTINUITY'
  | 'MAX_BLOCKS_PER_DAY'
  | 'MAX_CONSECUTIVE_PERIODS'
  | 'MIN_DISTINCT_DAYS';

export interface ManagementWorkspaceValidationIssueV1 {
  code: ManagementWorkspaceValidationCodeV1;
  cardIds: string[];
  requirementId: string | null;
  dayOfWeek: number | null;
}

export type ManagementWorkspaceValidationModeV1 = 'EDIT' | 'COMMIT';

export interface ManagementWorkspaceValidationResultV1 {
  valid: boolean;
  issues: ManagementWorkspaceValidationIssueV1[];
  invalidCardIds: string[];
}

const LUNCH_LEFT_PERIOD = 5;
const LUNCH_RIGHT_PERIOD = 6;

function isPlaced(
  placement: ManagementWorkspacePlacementStateV1,
): placement is ManagementWorkspacePlacementStateV1 & {
  dayOfWeek: number;
  startPeriod: number;
} {
  return placement.dayOfWeek !== null && placement.startPeriod !== null;
}

function overlaps(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
) {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function buildGroupDescendants(
  snapshot: ManagementWorkspaceSnapshotV1,
) {
  const children = new Map<string, string[]>();

  snapshot.instructionalGroupRelations.forEach((relation) => {
    if (relation.relation !== 'CONTAINS') return;
    const current = children.get(relation.leftGroupId) ?? [];
    current.push(relation.rightGroupId);
    children.set(relation.leftGroupId, current);
  });

  const memo = new Map<string, Set<string>>();

  const visit = (groupId: string, trail = new Set<string>()): Set<string> => {
    const cached = memo.get(groupId);
    if (cached) return cached;

    if (trail.has(groupId)) return new Set([groupId]);

    const nextTrail = new Set(trail);
    nextTrail.add(groupId);

    const result = new Set<string>([groupId]);
    for (const childId of children.get(groupId) ?? []) {
      visit(childId, nextTrail).forEach((value) => result.add(value));
    }

    memo.set(groupId, result);
    return result;
  };

  snapshot.instructionalGroups.forEach((group) => visit(group.id));
  return memo;
}

function groupsConflict(
  leftGroupId: string,
  rightGroupId: string,
  snapshot: ManagementWorkspaceSnapshotV1,
  descendants: Map<string, Set<string>>,
) {
  const left = descendants.get(leftGroupId) ?? new Set([leftGroupId]);
  const right = descendants.get(rightGroupId) ?? new Set([rightGroupId]);

  for (const groupId of left) {
    if (right.has(groupId)) return true;
  }

  for (const relation of snapshot.instructionalGroupRelations) {
    if (relation.relation !== 'OVERLAPS') continue;

    if (
      left.has(relation.leftGroupId)
      && right.has(relation.rightGroupId)
    ) return true;

    if (
      right.has(relation.leftGroupId)
      && left.has(relation.rightGroupId)
    ) return true;
  }

  return false;
}

function parallelFamilyKey(groupName: string) {
  const normalized = groupName.trim();
  const lower = normalized.toLocaleLowerCase('tr-TR');

  if (!lower.startsWith('parallel') && !lower.startsWith('paralel')) {
    return null;
  }

  return normalized
    .replace(/^\s*(?:PARALLEL|PARALEL)\s*[•·-]?\s*/i, '')
    .replace(/\/\s*\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ManagementWorkspaceParallelBundleV1 {
  cardIds: string[];
  offsetsByCardId: Record<string, number>;
}

function buildBaselineParallelBundles(
  snapshot: ManagementWorkspaceSnapshotV1,
) {
  const requirements = new Map(
    snapshot.requirements.map((requirement) => [requirement.id, requirement]),
  );
  const placements = new Map(
    snapshot.baselinePlacements.map((placement) => [placement.cardId, placement]),
  );

  const grouped = new Map<string, Array<{
    cardId: string;
    startPeriod: number;
    endPeriod: number;
  }>>();

  snapshot.cards.forEach((card) => {
    const requirement = requirements.get(card.requirementId);
    const placement = placements.get(card.id);
    if (
      !requirement
      || !placement
      || placement.dayOfWeek === null
      || placement.startPeriod === null
    ) return;

    const family = parallelFamilyKey(requirement.groupName);
    if (!family) return;

    const key = `${family}|${placement.dayOfWeek}`;
    const items = grouped.get(key) ?? [];
    items.push({
      cardId: card.id,
      startPeriod: placement.startPeriod,
      endPeriod: placement.startPeriod + card.durationPeriods - 1,
    });
    grouped.set(key, items);
  });

  const bundles: Array<{
    cardIds: string[];
    offsetsByCardId: Map<string, number>;
  }> = [];

  grouped.forEach((items) => {
    const remaining = new Set(items.map((item) => item.cardId));
    const byId = new Map(items.map((item) => [item.cardId, item]));

    while (remaining.size > 0) {
      const [seed] = remaining;
      const component = new Set<string>([seed]);
      remaining.delete(seed);

      let expanded = true;
      while (expanded) {
        expanded = false;

        for (const candidateId of [...remaining]) {
          const candidate = byId.get(candidateId);
          if (!candidate) continue;

          const connected = [...component].some((memberId) => {
            const member = byId.get(memberId);
            if (!member) return false;

            return (
              candidate.startPeriod <= member.endPeriod + 1
              && member.startPeriod <= candidate.endPeriod + 1
            );
          });

          if (connected) {
            component.add(candidateId);
            remaining.delete(candidateId);
            expanded = true;
          }
        }
      }

      if (component.size < 2) continue;

      const componentItems = [...component]
        .map((cardId) => byId.get(cardId))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const anchorStart = Math.min(
        ...componentItems.map((item) => item.startPeriod),
      );

      bundles.push({
        cardIds: componentItems.map((item) => item.cardId),
        offsetsByCardId: new Map(
          componentItems.map((item) => [
            item.cardId,
            item.startPeriod - anchorStart,
          ]),
        ),
      });
    }
  });

  return bundles;
}

export function findManagementWorkspaceParallelBundleV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  cardId: string,
): ManagementWorkspaceParallelBundleV1 | null {
  const bundle = buildBaselineParallelBundles(snapshot)
    .find((item) => item.cardIds.includes(cardId));

  if (!bundle) return null;

  return {
    cardIds: [...bundle.cardIds],
    offsetsByCardId: Object.fromEntries(bundle.offsetsByCardId.entries()),
  };
}

function longestConsecutiveRun(periods: Set<number>) {
  const sorted = [...periods].sort((left, right) => left - right);
  let longest = 0;
  let current = 0;
  let previous: number | null = null;

  sorted.forEach((period) => {
    if (
      previous !== null
      && period === previous + 1
      && !(previous === LUNCH_LEFT_PERIOD && period === LUNCH_RIGHT_PERIOD)
    ) {
      current += 1;
    } else {
      current = 1;
    }

    longest = Math.max(longest, current);
    previous = period;
  });

  return longest;
}

function baselinePlacementMap(
  snapshot: ManagementWorkspaceSnapshotV1,
) {
  return new Map(
    snapshot.baselinePlacements.map((placement) => [
      placement.cardId,
      placement,
    ]),
  );
}

function pushIssue(
  issues: ManagementWorkspaceValidationIssueV1[],
  issue: ManagementWorkspaceValidationIssueV1,
) {
  const cardIds = [...issue.cardIds].sort((a, b) => a.localeCompare(b));
  const key = [
    issue.code,
    issue.requirementId ?? '',
    issue.dayOfWeek ?? '',
    cardIds.join(','),
  ].join('|');

  const exists = issues.some((current) => [
    current.code,
    current.requirementId ?? '',
    current.dayOfWeek ?? '',
    [...current.cardIds].sort((a, b) => a.localeCompare(b)).join(','),
  ].join('|') === key);

  if (!exists) {
    issues.push({
      ...issue,
      cardIds,
    });
  }
}

export function validateManagementWorkspaceV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  mode: ManagementWorkspaceValidationModeV1 = 'COMMIT',
  coordinatedCardIds: readonly string[] = [],
): ManagementWorkspaceValidationResultV1 {
  const issues: ManagementWorkspaceValidationIssueV1[] = [];
  const coordinatedCards = new Set(coordinatedCardIds);
  const requirements = new Map(
    Object.values(workingCopy.requirementCatalogById)
      .filter((catalog) =>
        workingCopy.requirementStructureById[catalog.requirementId]?.termStatus
        === 'ACTIVE'
      )
      .map((catalog) => {
        const resource =
          workingCopy.requirementResourcesById[catalog.requirementId];
        const structure =
          workingCopy.requirementStructureById[catalog.requirementId];
        return [
          catalog.requirementId,
          {
            id: catalog.requirementId,
            subjectId: catalog.subjectId,
            subjectName: catalog.subjectName,
            groupId: catalog.groupId,
            groupName: catalog.groupName,
            groupType: catalog.groupType,
            weeklyLoad: structure?.weeklyLoad ?? catalog.baselineWeeklyLoad,
            preferredPartition:
              structure?.preferredPartition
              ?? catalog.baselinePreferredPartition,
            allowedPartitions:
              structure?.allowedPartitions
              ?? catalog.baselineAllowedPartitions,
            minDistinctDays: catalog.minDistinctDays,
            maxBlocksPerDay: catalog.maxBlocksPerDay,
            maxConsecutivePeriods: catalog.maxConsecutivePeriods,
            courseCharacter: catalog.courseCharacter,
            deliveryMode: catalog.deliveryMode,
            teacherRequirement: catalog.teacherRequirement,
            teacherMode: resource?.teacherMode ?? catalog.baselineTeacherMode,
            teacherAssignmentScope:
              resource?.teacherAssignmentScope
              ?? catalog.baselineTeacherAssignmentScope,
            teacherContinuity:
              resource?.teacherContinuity
              ?? catalog.baselineTeacherContinuity,
            resourceMode:
              resource?.resourceMode ?? catalog.baselineResourceMode,
            requiredCapability:
              resource?.requiredCapability
              ?? catalog.baselineRequiredCapability,
          },
        ];
      }),
  );
  const cards = new Map(
    Object.values(workingCopy.cardsById).map((card) => [card.id, card]),
  );
  const snapshotTeacherById = new Map(
    snapshot.teachers.map((teacher) => [teacher.id, teacher]),
  );
  const teachers = new Map(
    Object.values(workingCopy.teacherInventoryById)
      .filter((local) =>
        workingCopy.resourceLifecycleById[local.resourceId]?.exists === true
      )
      .map((local) => {
        const source = snapshotTeacherById.get(local.resourceId);
        return [
          local.resourceId,
          {
            ...(source ?? {}),
            id: local.resourceId,
            name: local.displayName,
            operationalStatus: local.operationalStatus,
          },
        ];
      }),
  );
  const snapshotRoomById = new Map(
    snapshot.rooms.map((room) => [room.id, room]),
  );
  const rooms = new Map(
    Object.values(workingCopy.roomInventoryById)
      .filter((local) =>
        workingCopy.resourceLifecycleById[local.resourceId]?.exists === true
      )
      .map((local) => {
        const source = snapshotRoomById.get(local.resourceId);
        const profile = workingCopy.roomProfileById?.[local.resourceId];
        return [
          local.resourceId,
          {
            id: local.resourceId,
            name: local.displayName,
            canonicalRoomId: source?.canonicalRoomId ?? null,
            capabilities: profile?.capabilities ?? source?.capabilities ?? [],
            knowledgeStatus:
              profile?.knowledgeStatus ?? source?.knowledgeStatus ?? 'UNKNOWN',
            operationalStatus: local.operationalStatus,
          },
        ];
      }),
  );
  const teacherPools = new Map<string, Set<string>>();
  const roomPools = new Map<string, Set<string>>();

  Object.values(workingCopy.requirementResourcesById).forEach((resource) => {
    teacherPools.set(
      resource.requirementId,
      new Set(resource.teacherIds),
    );
    roomPools.set(
      resource.requirementId,
      new Set(resource.roomIds),
    );
  });

  const resourceDiff = diffManagementWorkspaceV1(
    snapshot,
    workingCopy,
  );
  const baselineCardRequirement = new Map(
    snapshot.cards.map((card) => [card.id, card.requirementId]),
  );
  const baselinePlacedRequirementIds = new Set(
    snapshot.baselinePlacements
      .filter((placement) => (
        placement.dayOfWeek !== null
        && placement.startPeriod !== null
      ))
      .map((placement) => baselineCardRequirement.get(placement.cardId) ?? null)
      .filter((value): value is string => Boolean(value)),
  );

  resourceDiff.requirementResourceChanges.forEach((change) => {
    const sourceResourcesChanged = (
      change.before.teacherMode !== change.after.teacherMode
      || change.before.resourceMode !== change.after.resourceMode
      || change.before.requiredCapability !== change.after.requiredCapability
      || change.before.teacherIds.join('|') !== change.after.teacherIds.join('|')
      || change.before.roomIds.join('|') !== change.after.roomIds.join('|')
    );

    const removedTeacherIds = change.before.teacherIds.filter(
      (teacherId) => !change.after.teacherIds.includes(teacherId),
    );
    const teacherDepartureOnly = (
      removedTeacherIds.length > 0
      && change.after.teacherIds.every(
        (teacherId) => change.before.teacherIds.includes(teacherId),
      )
      && removedTeacherIds.every(
        (teacherId) =>
          workingCopy.teacherInventoryById[teacherId]?.operationalStatus
          === 'INACTIVE',
      )
      && change.before.resourceMode === change.after.resourceMode
      && change.before.requiredCapability === change.after.requiredCapability
      && change.before.roomIds.join('|') === change.after.roomIds.join('|')
    );

    const removedRoomIds = change.before.roomIds.filter(
      (roomId) => !change.after.roomIds.includes(roomId),
    );
    const roomDepartureOnly = (
      removedRoomIds.length > 0
      && change.after.roomIds.every(
        (roomId) => change.before.roomIds.includes(roomId),
      )
      && removedRoomIds.every(
        (roomId) =>
          workingCopy.roomInventoryById[roomId]?.operationalStatus
          === 'OUT_OF_SERVICE',
      )
      && change.before.teacherIds.join('|') === change.after.teacherIds.join('|')
      && change.before.teacherMode === change.after.teacherMode
      && change.before.teacherAssignmentScope
          === change.after.teacherAssignmentScope
      && change.before.teacherContinuity === change.after.teacherContinuity
    );

    if (
      sourceResourcesChanged
      && baselinePlacedRequirementIds.has(change.requirementId)
      && !teacherDepartureOnly
      && !roomDepartureOnly
    ) {
      pushIssue(issues, {
        code: 'REQUIREMENT_RESOURCES_REQUIRE_UNPLACED',
        cardIds: snapshot.cards
          .filter((card) => card.requirementId === change.requirementId)
          .map((card) => card.id),
        requirementId: change.requirementId,
        dayOfWeek: null,
      });
    }
  });

  const unavailable = new Set(
    Object.values(workingCopy.teacherAvailabilityById)
      .flatMap((availability) =>
        availability.unavailablePeriods.map((slot) =>
          `${availability.teacherId}|${slot.dayOfWeek}|${slot.period}`,
        ),
      ),
  );
  const baseline = baselinePlacementMap(snapshot);
  const baselineTeacherByCardId = new Map(
    snapshot.baselinePlacements.map((placement) => [
      placement.cardId,
      placement.teacherId,
    ]),
  );
  const baselineRoomByCardId = new Map(
    snapshot.baselinePlacements.map((placement) => [
      placement.cardId,
      placement.roomId,
    ]),
  );
  const descendants = buildGroupDescendants(snapshot);
  const placed: Array<{
    cardId: string;
    requirementId: string;
    groupId: string;
    durationPeriods: number;
    placement: ManagementWorkspacePlacementStateV1 & {
      dayOfWeek: number;
      startPeriod: number;
    };
    roomConflictKey: string | null;
  }> = [];

  Object.values(workingCopy.cardsById).forEach((card) => {
    const placement = workingCopy.placementsByCardId[card.id];
    const requirement = requirements.get(card.requirementId);
    if (!placement || !requirement) return;

    if (card.locked) {
      const original = baseline.get(card.id);
      const moved = (
        !original
        || placement.dayOfWeek !== original.dayOfWeek
        || placement.startPeriod !== original.startPeriod
        || placement.teacherId !== original.teacherId
        || placement.roomId !== original.roomId
      );

      if (moved) {
        pushIssue(issues, {
          code: 'LOCKED_CARD_MOVED',
          cardIds: [card.id],
          requirementId: requirement.id,
          dayOfWeek: placement.dayOfWeek,
        });
      }
    }

    if (!isPlaced(placement)) return;

    const endPeriod = placement.startPeriod + card.durationPeriods - 1;
    const allowedDays = snapshot.hardConstraintContract.days;
    const allowedPeriods = snapshot.hardConstraintContract.periods;
    const lastPeriod = allowedPeriods.length > 0
      ? Math.max(...allowedPeriods)
      : 12;

    if (
      !allowedDays.includes(placement.dayOfWeek)
      || !allowedPeriods.includes(placement.startPeriod)
      || endPeriod > lastPeriod
    ) {
      pushIssue(issues, {
        code: 'TIME_OUTSIDE_DAY',
        cardIds: [card.id],
        requirementId: requirement.id,
        dayOfWeek: placement.dayOfWeek,
      });
    }

    if (
      placement.startPeriod <= LUNCH_LEFT_PERIOD
      && endPeriod >= LUNCH_RIGHT_PERIOD
    ) {
      pushIssue(issues, {
        code: 'LUNCH_BREAK_CROSSING',
        cardIds: [card.id],
        requirementId: requirement.id,
        dayOfWeek: placement.dayOfWeek,
      });
    }

    if (
      requirement.teacherRequirement === 'REQUIRED'
      && placement.teacherId === null
    ) {
      const departedTeacherId = baselineTeacherByCardId.get(card.id) ?? null;
      const departureGap = Boolean(
        departedTeacherId
        && workingCopy.teacherInventoryById[departedTeacherId]
          ?.operationalStatus === 'INACTIVE'
        && !(
          workingCopy.requirementResourcesById[requirement.id]
            ?.teacherIds.includes(departedTeacherId)
          ?? false
        )
      );

      if (!departureGap) {
        pushIssue(issues, {
          code: 'TEACHER_REQUIRED',
          cardIds: [card.id],
          requirementId: requirement.id,
          dayOfWeek: placement.dayOfWeek,
        });
      }
    }

    if (placement.teacherId !== null) {
      const teacher = teachers.get(placement.teacherId);

      if (!teacher || teacher.operationalStatus !== 'ACTIVE') {
        const preservedDepartureAssignment = Boolean(
          teacher
          && teacher.operationalStatus === 'INACTIVE'
          && baselineTeacherByCardId.get(card.id) === placement.teacherId
        );

        if (!preservedDepartureAssignment) {
          pushIssue(issues, {
            code: 'TEACHER_INACTIVE',
            cardIds: [card.id],
            requirementId: requirement.id,
            dayOfWeek: placement.dayOfWeek,
          });
        }
      }

      const pool = teacherPools.get(requirement.id);
      if (
        requirement.teacherRequirement !== 'NONE'
        && pool
        && !pool.has(placement.teacherId)
      ) {
        pushIssue(issues, {
          code: 'TEACHER_NOT_ELIGIBLE',
          cardIds: [card.id],
          requirementId: requirement.id,
          dayOfWeek: placement.dayOfWeek,
        });
      }

      for (
        let period = placement.startPeriod;
        period <= endPeriod;
        period += 1
      ) {
        if (
          unavailable.has(
            `${placement.teacherId}|${placement.dayOfWeek}|${period}`,
          )
        ) {
          pushIssue(issues, {
            code: 'TEACHER_UNAVAILABLE',
            cardIds: [card.id],
            requirementId: requirement.id,
            dayOfWeek: placement.dayOfWeek,
          });
          break;
        }
      }
    }

    if (
      requirement.resourceMode !== 'UNKNOWN'
      && placement.roomId === null
    ) {
      const departedRoomId = baselineRoomByCardId.get(card.id) ?? null;
      const departureGap = Boolean(
        departedRoomId
        && workingCopy.roomInventoryById[departedRoomId]?.operationalStatus
          === 'OUT_OF_SERVICE'
        && !(
          workingCopy.requirementResourcesById[requirement.id]
            ?.roomIds.includes(departedRoomId)
          ?? false
        )
      );

      if (!departureGap) {
        pushIssue(issues, {
          code: 'ROOM_REQUIRED',
          cardIds: [card.id],
          requirementId: requirement.id,
          dayOfWeek: placement.dayOfWeek,
        });
      }
    }

    let roomConflictKey: string | null = null;

    if (placement.roomId !== null) {
      const room = rooms.get(placement.roomId);

      if (!room || room.operationalStatus !== 'ACTIVE') {
        const preservedDepartureAssignment = Boolean(
          room
          && room.operationalStatus === 'OUT_OF_SERVICE'
          && baselineRoomByCardId.get(card.id) === placement.roomId
        );

        if (!preservedDepartureAssignment) {
          pushIssue(issues, {
            code: 'ROOM_INACTIVE',
            cardIds: [card.id],
            requirementId: requirement.id,
            dayOfWeek: placement.dayOfWeek,
          });
        }
      }

      if (room) {
        roomConflictKey = room.canonicalRoomId ?? room.id;

        if (
          requirement.resourceMode === 'CAPABILITY'
          && (
            !requirement.requiredCapability
            || !room.capabilities.includes(requirement.requiredCapability)
            || room.knowledgeStatus !== 'CONFIRMED'
          )
        ) {
          pushIssue(issues, {
            code: 'ROOM_CAPABILITY_MISMATCH',
            cardIds: [card.id],
            requirementId: requirement.id,
            dayOfWeek: placement.dayOfWeek,
          });
        }

        if (
          (requirement.resourceMode === 'FIXED'
            || requirement.resourceMode === 'ELIGIBLE_POOL')
          && roomPools.has(requirement.id)
          && !roomPools.get(requirement.id)?.has(room.id)
        ) {
          pushIssue(issues, {
            code: 'ROOM_NOT_ELIGIBLE',
            cardIds: [card.id],
            requirementId: requirement.id,
            dayOfWeek: placement.dayOfWeek,
          });
        }
      }
    }

    placed.push({
      cardId: card.id,
      requirementId: requirement.id,
      groupId: requirement.groupId,
      durationPeriods: card.durationPeriods,
      placement,
      roomConflictKey,
    });
  });

  for (let index = 0; index < placed.length; index += 1) {
    const left = placed[index];
    const leftEnd =
      left.placement.startPeriod + left.durationPeriods - 1;

    for (let otherIndex = index + 1; otherIndex < placed.length; otherIndex += 1) {
      const right = placed[otherIndex];
      if (
        coordinatedCards.has(left.cardId)
        && coordinatedCards.has(right.cardId)
      ) {
        continue;
      }
      if (left.placement.dayOfWeek !== right.placement.dayOfWeek) continue;

      const rightEnd =
        right.placement.startPeriod + right.durationPeriods - 1;

      if (!overlaps(
        left.placement.startPeriod,
        leftEnd,
        right.placement.startPeriod,
        rightEnd,
      )) continue;

      if (
        left.placement.teacherId !== null
        && left.placement.teacherId === right.placement.teacherId
      ) {
        pushIssue(issues, {
          code: 'TEACHER_CONFLICT',
          cardIds: [left.cardId, right.cardId],
          requirementId: null,
          dayOfWeek: left.placement.dayOfWeek,
        });
      }

      if (
        left.roomConflictKey !== null
        && left.roomConflictKey === right.roomConflictKey
      ) {
        pushIssue(issues, {
          code: 'ROOM_CONFLICT',
          cardIds: [left.cardId, right.cardId],
          requirementId: null,
          dayOfWeek: left.placement.dayOfWeek,
        });
      }

      if (
        groupsConflict(
          left.groupId,
          right.groupId,
          snapshot,
          descendants,
        )
      ) {
        pushIssue(issues, {
          code: 'GROUP_CONFLICT',
          cardIds: [left.cardId, right.cardId],
          requirementId: null,
          dayOfWeek: left.placement.dayOfWeek,
        });
      }
    }
  }

  buildBaselineParallelBundles(snapshot).forEach((bundle) => {
    const current = bundle.cardIds.map((cardId) => ({
      cardId,
      placement: workingCopy.placementsByCardId[cardId],
    }));

    if (current.some(({ placement }) => !placement || !isPlaced(placement))) {
      pushIssue(issues, {
        code: 'PARALLEL_BUNDLE_BROKEN',
        cardIds: bundle.cardIds,
        requirementId: null,
        dayOfWeek: null,
      });
      return;
    }

    const placedCurrent = current.map(({ cardId, placement }) => ({
      cardId,
      placement: placement as ManagementWorkspacePlacementStateV1 & {
        dayOfWeek: number;
        startPeriod: number;
      },
    }));
    const days = new Set(
      placedCurrent.map(({ placement }) => placement.dayOfWeek),
    );

    if (days.size !== 1) {
      pushIssue(issues, {
        code: 'PARALLEL_BUNDLE_BROKEN',
        cardIds: bundle.cardIds,
        requirementId: null,
        dayOfWeek: null,
      });
      return;
    }

    const anchorStart = Math.min(
      ...placedCurrent.map(({ placement }) => placement.startPeriod),
    );
    const geometryChanged = placedCurrent.some(({ cardId, placement }) => (
      placement.startPeriod - anchorStart
      !== bundle.offsetsByCardId.get(cardId)
    ));

    if (geometryChanged) {
      pushIssue(issues, {
        code: 'PARALLEL_BUNDLE_BROKEN',
        cardIds: bundle.cardIds,
        requirementId: null,
        dayOfWeek: placedCurrent[0]?.placement.dayOfWeek ?? null,
      });
    }
  });

  snapshot.requirements.forEach((requirement) => {
    const requirementPlacements = placed.filter(
      (item) => item.requirementId === requirement.id,
    );

    if (
      requirement.teacherAssignmentScope === 'REQUIREMENT'
      && requirement.teacherContinuity === 'REQUIRED'
    ) {
      const teacherIds = new Set(
        requirementPlacements
          .map((item) => item.placement.teacherId)
          .filter((value): value is string => value !== null),
      );

      if (teacherIds.size > 1) {
        pushIssue(issues, {
          code: 'TEACHER_CONTINUITY',
          cardIds: requirementPlacements.map((item) => item.cardId),
          requirementId: requirement.id,
          dayOfWeek: null,
        });
      }
    }

    if (requirement.maxBlocksPerDay !== null) {
      const countByDay = new Map<number, string[]>();

      requirementPlacements.forEach((item) => {
        const current = countByDay.get(item.placement.dayOfWeek) ?? [];
        current.push(item.cardId);
        countByDay.set(item.placement.dayOfWeek, current);
      });

      countByDay.forEach((cardIds, dayOfWeek) => {
        if (cardIds.length > (requirement.maxBlocksPerDay as number)) {
          pushIssue(issues, {
            code: 'MAX_BLOCKS_PER_DAY',
            cardIds,
            requirementId: requirement.id,
            dayOfWeek,
          });
        }
      });
    }

    if (requirement.maxConsecutivePeriods !== null) {
      const placementsByDay = new Map<number, typeof requirementPlacements>();

      requirementPlacements.forEach((item) => {
        const current = placementsByDay.get(item.placement.dayOfWeek) ?? [];
        current.push(item);
        placementsByDay.set(item.placement.dayOfWeek, current);
      });

      placementsByDay.forEach((items, dayOfWeek) => {
        const occupied = new Set<number>();

        items.forEach((item) => {
          const end =
            item.placement.startPeriod + item.durationPeriods - 1;
          for (
            let period = item.placement.startPeriod;
            period <= end;
            period += 1
          ) {
            occupied.add(period);
          }
        });

        if (
          longestConsecutiveRun(occupied)
          > (requirement.maxConsecutivePeriods as number)
        ) {
          pushIssue(issues, {
            code: 'MAX_CONSECUTIVE_PERIODS',
            cardIds: items.map((item) => item.cardId),
            requirementId: requirement.id,
            dayOfWeek,
          });
        }
      });
    }

    if (mode === 'COMMIT' && requirement.minDistinctDays !== null) {
      const distinctDays = new Set(
        requirementPlacements.map((item) => item.placement.dayOfWeek),
      );

      if (distinctDays.size < requirement.minDistinctDays) {
        pushIssue(issues, {
          code: 'MIN_DISTINCT_DAYS',
          cardIds: cardsForRequirement(workingCopy, requirement.id),
          requirementId: requirement.id,
          dayOfWeek: null,
        });
      }
    }
  });

  issues.sort((left, right) => (
    left.code.localeCompare(right.code)
    || (left.requirementId ?? '').localeCompare(right.requirementId ?? '')
    || (left.dayOfWeek ?? 0) - (right.dayOfWeek ?? 0)
    || left.cardIds.join(',').localeCompare(right.cardIds.join(','))
  ));

  const invalidCardIds = [
    ...new Set(issues.flatMap((issue) => issue.cardIds)),
  ].sort((left, right) => left.localeCompare(right));

  return {
    valid: issues.length === 0,
    issues,
    invalidCardIds,
  };
}

function cardsForRequirement(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requirementId: string,
) {
  return Object.values(workingCopy.cardsById)
    .filter((card) => card.requirementId === requirementId)
    .map((card) => card.id);
}
