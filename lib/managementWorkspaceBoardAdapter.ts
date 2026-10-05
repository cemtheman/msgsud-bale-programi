import type {
  ManagementBoardCard,
  ManagementBoardData,
} from '@/lib/managementBoard';
import type {
  ManagementWorkspaceSnapshotV1,
} from '@/lib/managementWorkspace';
import type {
  ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

export function projectManagementBoardFromWorkspaceV1(
  board: ManagementBoardData,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  snapshot?: ManagementWorkspaceSnapshotV1 | null,
): ManagementBoardData {
  const teacherNamesById = {
    ...Object.fromEntries(
      Object.entries(board.teacherNamesById)
        .filter(([id]) =>
          workingCopy.resourceLifecycleById[id]?.exists !== false
        ),
    ),
    ...Object.fromEntries(
      Object.values(workingCopy.teacherInventoryById)
        .filter((resource) =>
          workingCopy.resourceLifecycleById[resource.resourceId]?.exists
          !== false
        )
        .map((resource) => [
          resource.resourceId,
          resource.displayName,
        ]),
    ),
  };
  const roomNamesById = {
    ...Object.fromEntries(
      Object.entries(board.roomNamesById)
        .filter(([id]) =>
          workingCopy.resourceLifecycleById[id]?.exists !== false
        ),
    ),
    ...Object.fromEntries(
      Object.values(workingCopy.roomInventoryById)
        .filter((resource) =>
          workingCopy.resourceLifecycleById[resource.resourceId]?.exists
          !== false
        )
        .map((resource) => [
          resource.resourceId,
          resource.displayName,
        ]),
    ),
  };

  const serverById = new Map(board.cards.map((card) => [card.id, card]));
  const templateByRequirement = new Map<string, ManagementBoardCard>();
  board.cards.forEach((card) => {
    if (!templateByRequirement.has(card.requirementId)) {
      templateByRequirement.set(card.requirementId, card);
    }
  });
  const requirementById = new Map(
    Object.values(workingCopy.requirementCatalogById).map((requirement) => [
      requirement.requirementId,
      requirement,
    ]),
  );

  const resolvedTeachersByRequirement = new Map<string, Set<string>>();
  Object.values(workingCopy.cardsById).forEach((card) => {
    const placement = workingCopy.placementsByCardId[card.id];
    if (!placement?.teacherId) return;
    const set = resolvedTeachersByRequirement.get(card.requirementId)
      ?? new Set<string>();
    set.add(placement.teacherId);
    resolvedTeachersByRequirement.set(card.requirementId, set);
  });

  const cards = Object.values(workingCopy.cardsById)
    .sort((left, right) =>
      left.requirementId.localeCompare(right.requirementId)
      || left.blockIndex - right.blockIndex
      || left.id.localeCompare(right.id),
    )
    .map((localCard): ManagementBoardCard | null => {
      const source = serverById.get(localCard.id)
        ?? templateByRequirement.get(localCard.requirementId)
        ?? null;
      const requirement = requirementById.get(localCard.requirementId)
        ?? null;
      const resource =
        workingCopy.requirementResourcesById[localCard.requirementId] ?? null;
      const structure =
        workingCopy.requirementStructureById[localCard.requirementId] ?? null;
      const placement = workingCopy.placementsByCardId[localCard.id];
      if (!placement) return null;

      if (!source && !requirement) return null;

      const placedTeachers =
        resolvedTeachersByRequirement.get(localCard.requirementId)
        ?? new Set<string>();
      const resolvedRequirementTeacherId = placedTeachers.size === 1
        ? [...placedTeachers][0]
        : null;
      const teacherContinuityConflict = placedTeachers.size > 1;

      const base: ManagementBoardCard = source
        ? {
            ...source,
            id: localCard.id,
            requirementId: localCard.requirementId,
            blockIndex: localCard.blockIndex,
            durationPeriods: localCard.durationPeriods,
            locked: localCard.locked,
          }
        : {
            id: localCard.id,
            requirementId: localCard.requirementId,
            blockIndex: localCard.blockIndex,
            durationPeriods: localCard.durationPeriods,
            locked: localCard.locked,
            subjectId: requirement!.subjectId,
            subjectName: requirement!.subjectName,
            groupId: requirement!.groupId,
            groupName: requirement!.groupName,
            groupType: requirement!.groupType,
            classCodes: [],
            audienceTargets: [],
            weeklyLoad:
              structure?.weeklyLoad ?? requirement!.baselineWeeklyLoad,
            teacherMode:
              resource?.teacherMode ?? requirement!.baselineTeacherMode,
            teacherRequirement:
              requirement!.teacherRequirement as ManagementBoardCard['teacherRequirement'],
            teacherAssignmentScope:
              (resource?.teacherAssignmentScope
                ?? requirement!.baselineTeacherAssignmentScope)
              as ManagementBoardCard['teacherAssignmentScope'],
            teacherContinuity:
              (resource?.teacherContinuity
                ?? requirement!.baselineTeacherContinuity)
              as ManagementBoardCard['teacherContinuity'],
            resolvedRequirementTeacherId: null,
            teacherContinuityConflict: false,
            teacherIds: [],
            teacherNames: [],
            resourceMode:
              resource?.resourceMode ?? requirement!.baselineResourceMode,
            roomIds: [],
            roomNames: [],
            courseCharacter: requirement!.courseCharacter ?? '',
            deliveryMode: requirement!.deliveryMode ?? '',
            knowledgeStatus: 'UNKNOWN',
            domainStatus: 'UNRESOLVED',
            validCount: 0,
            invalidCount: 0,
            unresolvedCount: 0,
            isForced: false,
            isContradiction: false,
            placement: null,
          };

      const projectedCard = {
        ...base,
        blockIndex: localCard.blockIndex,
        durationPeriods: localCard.durationPeriods,
        locked: localCard.locked,
        weeklyLoad: structure?.weeklyLoad ?? base.weeklyLoad,
        teacherMode: resource?.teacherMode ?? base.teacherMode,
        teacherAssignmentScope:
          resource?.teacherAssignmentScope ?? base.teacherAssignmentScope,
        teacherContinuity:
          resource?.teacherContinuity ?? base.teacherContinuity,
        resolvedRequirementTeacherId,
        teacherContinuityConflict,
        teacherIds: resource ? [...resource.teacherIds] : [...base.teacherIds],
        teacherNames: resource
          ? resource.teacherIds.map(
              (id) => teacherNamesById[id] ?? 'Bilinmeyen öğretmen',
            )
          : [...base.teacherNames],
        resourceMode: resource?.resourceMode ?? base.resourceMode,
        roomIds: resource ? [...resource.roomIds] : [...base.roomIds],
        roomNames: resource
          ? resource.roomIds.map(
              (id) => roomNamesById[id] ?? 'Bilinmeyen salon',
            )
          : [...base.roomNames],
        domainStatus: localCard.baselineExists
          ? base.domainStatus
          : 'UNRESOLVED' as const,
        validCount: localCard.baselineExists ? base.validCount : 0,
        invalidCount: localCard.baselineExists ? base.invalidCount : 0,
        unresolvedCount: localCard.baselineExists ? base.unresolvedCount : 0,
        isForced: localCard.baselineExists ? base.isForced : false,
        isContradiction:
          localCard.baselineExists ? base.isContradiction : false,
      };

      if (placement.dayOfWeek === null || placement.startPeriod === null) {
        return {
          ...projectedCard,
          placement: null,
        };
      }

      return {
        ...projectedCard,
        placement: {
          dayOfWeek: placement.dayOfWeek,
          startPeriod: placement.startPeriod,
          teacherId: placement.teacherId,
          teacherName: placement.teacherId
            ? teacherNamesById[placement.teacherId] ?? null
            : null,
          roomId: placement.roomId,
          roomName: placement.roomId
            ? roomNamesById[placement.roomId] ?? null
            : null,
          moveTransactionId:
            source?.placement?.moveTransactionId ?? null,
        },
      };
    })
    .filter((card): card is ManagementBoardCard => card !== null);

  return {
    ...board,
    teacherNamesById,
    roomNamesById,
    cards,
  };
}
