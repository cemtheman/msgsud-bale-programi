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
      if (!local) return card;

      if (local.dayOfWeek === null || local.startPeriod === null) {
        return {
          ...card,
          placement: null,
        };
      }

      return {
        ...card,
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
