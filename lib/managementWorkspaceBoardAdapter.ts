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
  return {
    ...board,
    cards: board.cards.map((card) => {
      const local = workingCopy.placementsByCardId[card.id];
      const resource =
        workingCopy.requirementResourcesById[card.requirementId] ?? null;
      if (!local) return card;

      const projectedCard = resource
        ? {
            ...card,
            teacherMode: resource.teacherMode,
            teacherIds: [...resource.teacherIds],
            teacherNames: resource.teacherIds.map(
              (id) => board.teacherNamesById[id] ?? 'Bilinmeyen öğretmen',
            ),
            resourceMode: resource.resourceMode,
            roomIds: [...resource.roomIds],
            roomNames: resource.roomIds.map(
              (id) => board.roomNamesById[id] ?? 'Bilinmeyen salon',
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
            ? board.teacherNamesById[local.teacherId] ?? null
            : null,
          roomId: local.roomId,
          roomName: local.roomId
            ? board.roomNamesById[local.roomId] ?? null
            : null,
          moveTransactionId: card.placement?.moveTransactionId ?? null,
        },
      };
    }),
  };
}
