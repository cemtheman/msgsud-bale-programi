import {
  cloneManagementWorkspacePlacementV1,
  cloneManagementWorkspaceRequirementResourceV1,
  removeManagementWorkspacePlacementV1,
  setManagementWorkspacePlacementV1,
  setManagementWorkspaceRequirementRoomsV1,
  setManagementWorkspaceRequirementTeachersV1,
  type ManagementWorkspacePlacementStateV1,
  type ManagementWorkspaceRequirementResourceStateV1,
  type ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

export type ManagementWorkspaceOperationKindV1 =
  | 'SET_PLACEMENT'
  | 'REMOVE_PLACEMENT'
  | 'SET_REQUIREMENT_RESOURCES';

export interface ManagementWorkspacePlacementOperationV1 {
  sequence: number;
  batchId: number | null;
  kind: 'SET_PLACEMENT' | 'REMOVE_PLACEMENT';
  cardId: string;
  requirementId: null;
  before: ManagementWorkspacePlacementStateV1;
  after: ManagementWorkspacePlacementStateV1;
}

export interface ManagementWorkspaceRequirementResourceOperationV1 {
  sequence: number;
  batchId: number | null;
  kind: 'SET_REQUIREMENT_RESOURCES';
  cardId: null;
  requirementId: string;
  before: ManagementWorkspaceRequirementResourceStateV1;
  after: ManagementWorkspaceRequirementResourceStateV1;
}

export type ManagementWorkspaceOperationV1 =
  | ManagementWorkspacePlacementOperationV1
  | ManagementWorkspaceRequirementResourceOperationV1;

export interface ManagementWorkspaceHistoryV1 {
  nextSequence: number;
  nextBatchId: number;
  undoStack: ManagementWorkspaceOperationV1[];
  redoStack: ManagementWorkspaceOperationV1[];
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
  return cloneManagementWorkspacePlacementV1(value);
}

function currentRequirementResource(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requirementId: string,
) {
  const value = workingCopy.requirementResourcesById[requirementId];
  if (!value) {
    throw new Error(
      `Workspace geçmiş işlemi için requirement bulunamadı (${requirementId}).`,
    );
  }
  return cloneManagementWorkspaceRequirementResourceV1(value);
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

function applyRequirementResourceState(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  resource: ManagementWorkspaceRequirementResourceStateV1,
) {
  setManagementWorkspaceRequirementTeachersV1(
    workingCopy,
    resource.requirementId,
    resource.teacherIds,
  );
  setManagementWorkspaceRequirementRoomsV1(
    workingCopy,
    resource.requirementId,
    {
      resourceMode: resource.resourceMode,
      roomIds: resource.roomIds,
      requiredCapability: resource.requiredCapability,
    },
  );

  // Teacher-mode derivation normally follows teacherIds. Preserve the exact
  // historical state for undo/redo in case an imported legacy snapshot used a
  // non-derived mode.
  workingCopy.requirementResourcesById[resource.requirementId] = {
    ...cloneManagementWorkspaceRequirementResourceV1(
      workingCopy.requirementResourcesById[resource.requirementId],
    ),
    teacherMode: resource.teacherMode,
  };
}

export function cloneManagementWorkspaceOperationV1(
  operation: ManagementWorkspaceOperationV1,
): ManagementWorkspaceOperationV1 {
  if (operation.kind === 'SET_REQUIREMENT_RESOURCES') {
    return {
      ...operation,
      before: cloneManagementWorkspaceRequirementResourceV1(operation.before),
      after: cloneManagementWorkspaceRequirementResourceV1(operation.after),
    };
  }

  return {
    ...operation,
    before: cloneManagementWorkspacePlacementV1(operation.before),
    after: cloneManagementWorkspacePlacementV1(operation.after),
  };
}

function recordOperation(
  history: ManagementWorkspaceHistoryV1,
  operation:
    | Omit<ManagementWorkspacePlacementOperationV1, 'sequence' | 'batchId'>
    | Omit<
        ManagementWorkspaceRequirementResourceOperationV1,
        'sequence' | 'batchId'
      >,
) {
  const entry = {
    ...operation,
    sequence: history.nextSequence,
    batchId: null,
  } as ManagementWorkspaceOperationV1;

  history.nextSequence += 1;
  history.undoStack.push(cloneManagementWorkspaceOperationV1(entry));
  history.redoStack = [];

  return cloneManagementWorkspaceOperationV1(entry);
}

export function createManagementWorkspaceHistoryV1():
  ManagementWorkspaceHistoryV1 {
  return {
    nextSequence: 1,
    nextBatchId: 1,
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
  const after = cloneManagementWorkspacePlacementV1(placement);

  applyPlacementState(workingCopy, after);

  return recordOperation(history, {
    kind: 'SET_PLACEMENT',
    cardId: placement.cardId,
    requirementId: null,
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
    requirementId: null,
    before,
    after,
  });
}

export function applyManagementWorkspaceRequirementResourceOperationV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  history: ManagementWorkspaceHistoryV1,
  resource: ManagementWorkspaceRequirementResourceStateV1,
) {
  const before = currentRequirementResource(
    workingCopy,
    resource.requirementId,
  );
  const after = cloneManagementWorkspaceRequirementResourceV1(resource);

  applyRequirementResourceState(workingCopy, after);

  return recordOperation(history, {
    kind: 'SET_REQUIREMENT_RESOURCES',
    cardId: null,
    requirementId: resource.requirementId,
    before,
    after,
  });
}

function applyOperationState(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  operation: ManagementWorkspaceOperationV1,
  direction: 'BEFORE' | 'AFTER',
) {
  const value = direction === 'BEFORE'
    ? operation.before
    : operation.after;

  if (operation.kind === 'SET_REQUIREMENT_RESOURCES') {
    applyRequirementResourceState(
      workingCopy,
      value as ManagementWorkspaceRequirementResourceStateV1,
    );
    return;
  }

  applyPlacementState(
    workingCopy,
    value as ManagementWorkspacePlacementStateV1,
  );
}

export function undoManagementWorkspaceOperationV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  history: ManagementWorkspaceHistoryV1,
): ManagementWorkspaceOperationV1 | null {
  const operation = history.undoStack.pop() ?? null;
  if (!operation) return null;

  const batch = [operation];
  if (operation.batchId !== null) {
    while (
      history.undoStack.length > 0
      && history.undoStack[history.undoStack.length - 1].batchId === operation.batchId
    ) {
      batch.push(history.undoStack.pop()!);
    }
  }

  batch.forEach((entry) => {
    applyOperationState(
      workingCopy,
      entry,
      'BEFORE',
    );
    history.redoStack.push(cloneManagementWorkspaceOperationV1(entry));
  });

  return cloneManagementWorkspaceOperationV1(operation);
}

export function redoManagementWorkspaceOperationV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  history: ManagementWorkspaceHistoryV1,
): ManagementWorkspaceOperationV1 | null {
  const operation = history.redoStack.pop() ?? null;
  if (!operation) return null;

  const batch = [operation];
  if (operation.batchId !== null) {
    while (
      history.redoStack.length > 0
      && history.redoStack[history.redoStack.length - 1].batchId === operation.batchId
    ) {
      batch.push(history.redoStack.pop()!);
    }
  }

  batch.forEach((entry) => {
    applyOperationState(
      workingCopy,
      entry,
      'AFTER',
    );
    history.undoStack.push(cloneManagementWorkspaceOperationV1(entry));
  });

  return cloneManagementWorkspaceOperationV1(operation);
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
