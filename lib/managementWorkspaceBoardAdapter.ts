import type {
  ManagementBoardData,
} from '@/lib/managementBoard';
import type {
  ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

export function projectManagementBoardFromWorkspaceV1(
  board: ManagementBoardData,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
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

  return {
    ...board,
    teacherNamesById,
    roomNamesById,
    cards: board.cards.map((card) => {
      const local = workingCopy.placementsByCardId[card.id];
      const resource =
        workingCopy.requirementResourcesById[card.requirementId] ?? null;
      if (!local) return card;

      const projectedCard = resource
        ? {
            ...card,
            teacherMode: resource.teacherMode,
            teacherAssignmentScope: resource.teacherAssignmentScope,
            teacherContinuity: resource.teacherContinuity,
            teacherIds: [...resource.teacherIds],
            teacherNames: resource.teacherIds.map(
              (id) => teacherNamesById[id] ?? 'Bilinmeyen öğretmen',
            ),
            resourceMode: resource.resourceMode,
            roomIds: [...resource.roomIds],
            roomNames: resource.roomIds.map(
              (id) => roomNamesById[id] ?? 'Bilinmeyen salon',
            ),
          }
        : card;

      if (local.dayOfWeek === null || local.startPeriod === null) {
        return {
          ...projectedCard,
          placement: null,
        };
      }

      return {
        ...projectedCard,
        placement: {
          dayOfWeek: local.dayOfWeek,
          startPeriod: local.startPeriod,
          teacherId: local.teacherId,
          teacherName: local.teacherId
            ? teacherNamesById[local.teacherId] ?? null
            : null,
          roomId: local.roomId,
          roomName: local.roomId
            ? roomNamesById[local.roomId] ?? null
            : null,
          moveTransactionId: card.placement?.moveTransactionId ?? null,
        },
      };
    }),
  };
}
