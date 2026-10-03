import {
  removeManagementWorkspacePlacementV1,
  setManagementWorkspacePlacementV1,
  type ManagementWorkspacePlacementStateV1,
  type ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

export type ManagementWorkspaceOperationKindV1 =
  | 'SET_PLACEMENT'
  | 'REMOVE_PLACEMENT';

export interface ManagementWorkspaceOperationV1 {
  sequence: number;
  kind: ManagementWorkspaceOperationKindV1;
  cardId: string;
  before: ManagementWorkspacePlacementStateV1;
  after: ManagementWorkspacePlacementStateV1;
}

export interface ManagementWorkspaceHistoryV1 {
  nextSequence: number;
  undoStack: ManagementWorkspaceOperationV1[];
  redoStack: ManagementWorkspaceOperationV1[];
}

function clonePlacement(
  value: ManagementWorkspacePlacementStateV1,
): ManagementWorkspacePlacementStateV1 {
  return {
    cardId: value.cardId,
    dayOfWeek: value.dayOfWeek,
    startPeriod: value.startPeriod,
    teacherId: value.teacherId,
    roomId: value.roomId,
  };
}

function currentPlacement(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  cardId: string,
) {
  const value = workingCopy.placementsByCardId[cardId];
  if (!value) {
    throw new Error(
      `Workspace geçmiş işlemi için kart bulunamadı (${cardId}).`,
    );
  }
  return clonePlacement(value);
}

function applyPlacementState(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  placement: ManagementWorkspacePlacementStateV1,
) {
  const isRemoved = (
    placement.dayOfWeek === null
    && placement.startPeriod === null
    && placement.teacherId === null
    && placement.roomId === null
  );

  if (isRemoved) {
    removeManagementWorkspacePlacementV1(
      workingCopy,
      placement.cardId,
    );
    return;
  }

  setManagementWorkspacePlacementV1(
    workingCopy,
    placement,
  );
}

function recordOperation(
  history: ManagementWorkspaceHistoryV1,
  operation: Omit<ManagementWorkspaceOperationV1, 'sequence'>,
) {
  const entry: ManagementWorkspaceOperationV1 = {
    sequence: history.nextSequence,
    kind: operation.kind,
    cardId: operation.cardId,
    before: clonePlacement(operation.before),
    after: clonePlacement(operation.after),
  };

  history.nextSequence += 1;
  history.undoStack.push(entry);
  history.redoStack = [];

  return entry;
}

export function createManagementWorkspaceHistoryV1():
  ManagementWorkspaceHistoryV1 {
  return {
    nextSequence: 1,
    undoStack: [],
    redoStack: [],
  };
}

export function applyManagementWorkspacePlacementOperationV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  history: ManagementWorkspaceHistoryV1,
  placement: ManagementWorkspacePlacementStateV1,
) {
  const before = currentPlacement(
    workingCopy,
    placement.cardId,
  );
  const after = clonePlacement(placement);

  applyPlacementState(workingCopy, after);

  return recordOperation(history, {
    kind: 'SET_PLACEMENT',
    cardId: placement.cardId,
    before,
    after,
  });
}

export function applyManagementWorkspaceRemoveOperationV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  history: ManagementWorkspaceHistoryV1,
  cardId: string,
) {
  const before = currentPlacement(
    workingCopy,
    cardId,
  );
  const after: ManagementWorkspacePlacementStateV1 = {
    cardId,
    dayOfWeek: null,
    startPeriod: null,
    teacherId: null,
    roomId: null,
  };

  applyPlacementState(workingCopy, after);

  return recordOperation(history, {
    kind: 'REMOVE_PLACEMENT',
    cardId,
    before,
    after,
  });
}

export function undoManagementWorkspaceOperationV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  history: ManagementWorkspaceHistoryV1,
): ManagementWorkspaceOperationV1 | null {
  const operation = history.undoStack.pop() ?? null;
  if (!operation) return null;

  applyPlacementState(
    workingCopy,
    operation.before,
  );
  history.redoStack.push(operation);

  return operation;
}

export function redoManagementWorkspaceOperationV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  history: ManagementWorkspaceHistoryV1,
): ManagementWorkspaceOperationV1 | null {
  const operation = history.redoStack.pop() ?? null;
  if (!operation) return null;

  applyPlacementState(
    workingCopy,
    operation.after,
  );
  history.undoStack.push(operation);

  return operation;
}

export function canUndoManagementWorkspaceV1(
  history: ManagementWorkspaceHistoryV1,
) {
  return history.undoStack.length > 0;
}

export function canRedoManagementWorkspaceV1(
  history: ManagementWorkspaceHistoryV1,
) {
  return history.redoStack.length > 0;
}
