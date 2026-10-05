import {
  cloneManagementWorkspaceInventoryV1,
  cloneManagementWorkspacePlacementV1,
  cloneManagementWorkspaceRequirementResourceV1,
  cloneManagementWorkspaceTeacherAvailabilityV1,
  cloneManagementWorkspaceTeacherPlanningV1,
  removeManagementWorkspacePlacementV1,
  setManagementWorkspacePlacementV1,
  type ManagementWorkspaceInventoryStateV1,
  type ManagementWorkspaceRoomInventoryStateV1,
  type ManagementWorkspaceTeacherInventoryStateV1,
  type ManagementWorkspaceTeacherAvailabilityStateV1,
  type ManagementWorkspaceTeacherPlanningStateV1,
  type ManagementWorkspacePlacementStateV1,
  type ManagementWorkspaceRequirementResourceStateV1,
  type ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

export type ManagementWorkspaceOperationKindV1 =
  | 'SET_PLACEMENT'
  | 'REMOVE_PLACEMENT'
  | 'SET_REQUIREMENT_RESOURCES'
  | 'SET_INVENTORY_RESOURCE'
  | 'SET_TEACHER_PLANNING'
  | 'SET_TEACHER_AVAILABILITY';

export interface ManagementWorkspacePlacementOperationV1 {
  sequence: number;
  batchId: number | null;
  kind: 'SET_PLACEMENT' | 'REMOVE_PLACEMENT';
  cardId: string;
  requirementId: null;
  resourceId: null;
  before: ManagementWorkspacePlacementStateV1;
  after: ManagementWorkspacePlacementStateV1;
}

export interface ManagementWorkspaceRequirementResourceOperationV1 {
  sequence: number;
  batchId: number | null;
  kind: 'SET_REQUIREMENT_RESOURCES';
  cardId: null;
  requirementId: string;
  resourceId: null;
  before: ManagementWorkspaceRequirementResourceStateV1;
  after: ManagementWorkspaceRequirementResourceStateV1;
}

export interface ManagementWorkspaceInventoryOperationV1 {
  sequence: number;
  batchId: number | null;
  kind: 'SET_INVENTORY_RESOURCE';
  cardId: null;
  requirementId: null;
  resourceId: string;
  before: ManagementWorkspaceInventoryStateV1;
  after: ManagementWorkspaceInventoryStateV1;
}

export interface ManagementWorkspaceTeacherPlanningOperationV1 {
  sequence: number;
  batchId: number | null;
  kind: 'SET_TEACHER_PLANNING';
  cardId: null;
  requirementId: null;
  resourceId: string;
  before: ManagementWorkspaceTeacherPlanningStateV1;
  after: ManagementWorkspaceTeacherPlanningStateV1;
}

export interface ManagementWorkspaceTeacherAvailabilityOperationV1 {
  sequence: number;
  batchId: number | null;
  kind: 'SET_TEACHER_AVAILABILITY';
  cardId: null;
  requirementId: null;
  resourceId: string;
  before: ManagementWorkspaceTeacherAvailabilityStateV1;
  after: ManagementWorkspaceTeacherAvailabilityStateV1;
}

export type ManagementWorkspaceOperationV1 =
  | ManagementWorkspacePlacementOperationV1
  | ManagementWorkspaceRequirementResourceOperationV1
  | ManagementWorkspaceInventoryOperationV1
  | ManagementWorkspaceTeacherPlanningOperationV1
  | ManagementWorkspaceTeacherAvailabilityOperationV1;

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

function currentInventory(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  resource: ManagementWorkspaceInventoryStateV1,
) {
  const current = resource.resourceType === 'TEACHER'
    ? workingCopy.teacherInventoryById[resource.resourceId]
    : workingCopy.roomInventoryById[resource.resourceId];

  if (!current) {
    throw new Error(
      `Workspace geçmiş işlemi için kaynak bulunamadı (${resource.resourceId}).`,
    );
  }

  return cloneManagementWorkspaceInventoryV1(current);
}

function currentTeacherAvailability(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  teacherId: string,
) {
  const value = workingCopy.teacherAvailabilityById[teacherId];
  if (!value) {
    throw new Error(
      `Workspace geçmiş işlemi için öğretmen uygunluk girdisi bulunamadı (${teacherId}).`,
    );
  }
  return cloneManagementWorkspaceTeacherAvailabilityV1(value);
}

function currentTeacherPlanning(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  teacherId: string,
) {
  const value = workingCopy.teacherPlanningById[teacherId];
  if (!value) {
    throw new Error(
      `Workspace geçmiş işlemi için öğretmen planlama girdisi bulunamadı (${teacherId}).`,
    );
  }
  return cloneManagementWorkspaceTeacherPlanningV1(value);
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
  if (!workingCopy.requirementResourcesById[resource.requirementId]) {
    throw new Error(
      `Workspace geçmiş işlemi için requirement bulunamadı (${resource.requirementId}).`,
    );
  }

  workingCopy.requirementResourcesById[resource.requirementId] =
    cloneManagementWorkspaceRequirementResourceV1(resource);
}

function applyTeacherAvailabilityState(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  availability: ManagementWorkspaceTeacherAvailabilityStateV1,
) {
  if (!workingCopy.teacherAvailabilityById[availability.teacherId]) {
    throw new Error(
      `Workspace geçmiş işlemi için öğretmen uygunluk girdisi bulunamadı (${availability.teacherId}).`,
    );
  }
  workingCopy.teacherAvailabilityById[availability.teacherId] =
    cloneManagementWorkspaceTeacherAvailabilityV1(availability);
}

function applyTeacherPlanningState(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  planning: ManagementWorkspaceTeacherPlanningStateV1,
) {
  if (!workingCopy.teacherPlanningById[planning.teacherId]) {
    throw new Error(
      `Workspace geçmiş işlemi için öğretmen planlama girdisi bulunamadı (${planning.teacherId}).`,
    );
  }
  workingCopy.teacherPlanningById[planning.teacherId] =
    cloneManagementWorkspaceTeacherPlanningV1(planning);
}

function applyInventoryState(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  resource: ManagementWorkspaceInventoryStateV1,
) {
  if (resource.resourceType === 'TEACHER') {
    if (!workingCopy.teacherInventoryById[resource.resourceId]) {
      throw new Error(
        `Workspace geçmiş işlemi için öğretmen bulunamadı (${resource.resourceId}).`,
      );
    }
    workingCopy.teacherInventoryById[resource.resourceId] =
      cloneManagementWorkspaceInventoryV1(
        resource,
      ) as ManagementWorkspaceTeacherInventoryStateV1;
    return;
  }

  if (!workingCopy.roomInventoryById[resource.resourceId]) {
    throw new Error(
      `Workspace geçmiş işlemi için salon bulunamadı (${resource.resourceId}).`,
    );
  }
  workingCopy.roomInventoryById[resource.resourceId] =
    cloneManagementWorkspaceInventoryV1(
      resource,
    ) as ManagementWorkspaceRoomInventoryStateV1;
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

  if (operation.kind === 'SET_INVENTORY_RESOURCE') {
    return {
      ...operation,
      before: cloneManagementWorkspaceInventoryV1(operation.before),
      after: cloneManagementWorkspaceInventoryV1(operation.after),
    };
  }

  if (operation.kind === 'SET_TEACHER_PLANNING') {
    return {
      ...operation,
      before: cloneManagementWorkspaceTeacherPlanningV1(operation.before),
      after: cloneManagementWorkspaceTeacherPlanningV1(operation.after),
    };
  }

  if (operation.kind === 'SET_TEACHER_AVAILABILITY') {
    return {
      ...operation,
      before: cloneManagementWorkspaceTeacherAvailabilityV1(operation.before),
      after: cloneManagementWorkspaceTeacherAvailabilityV1(operation.after),
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
      >
    | Omit<ManagementWorkspaceInventoryOperationV1, 'sequence' | 'batchId'>
    | Omit<
        ManagementWorkspaceTeacherPlanningOperationV1,
        'sequence' | 'batchId'
      >
    | Omit<
        ManagementWorkspaceTeacherAvailabilityOperationV1,
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
    resourceId: null,
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
    resourceId: null,
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
    resourceId: null,
    before,
    after,
  });
}

export function applyManagementWorkspaceInventoryOperationV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  history: ManagementWorkspaceHistoryV1,
  resource: ManagementWorkspaceInventoryStateV1,
) {
  const before = currentInventory(workingCopy, resource);
  const after = cloneManagementWorkspaceInventoryV1(resource);

  applyInventoryState(workingCopy, after);

  return recordOperation(history, {
    kind: 'SET_INVENTORY_RESOURCE',
    cardId: null,
    requirementId: null,
    resourceId: resource.resourceId,
    before,
    after,
  });
}

export function applyManagementWorkspaceTeacherPlanningOperationV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  history: ManagementWorkspaceHistoryV1,
  planning: ManagementWorkspaceTeacherPlanningStateV1,
) {
  const before = currentTeacherPlanning(workingCopy, planning.teacherId);
  const after = cloneManagementWorkspaceTeacherPlanningV1(planning);

  applyTeacherPlanningState(workingCopy, after);

  return recordOperation(history, {
    kind: 'SET_TEACHER_PLANNING',
    cardId: null,
    requirementId: null,
    resourceId: planning.teacherId,
    before,
    after,
  });
}

export function applyManagementWorkspaceTeacherAvailabilityOperationV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  history: ManagementWorkspaceHistoryV1,
  availability: ManagementWorkspaceTeacherAvailabilityStateV1,
) {
  const before = currentTeacherAvailability(
    workingCopy,
    availability.teacherId,
  );
  const after = cloneManagementWorkspaceTeacherAvailabilityV1(availability);

  applyTeacherAvailabilityState(workingCopy, after);

  return recordOperation(history, {
    kind: 'SET_TEACHER_AVAILABILITY',
    cardId: null,
    requirementId: null,
    resourceId: availability.teacherId,
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

  if (operation.kind === 'SET_INVENTORY_RESOURCE') {
    applyInventoryState(
      workingCopy,
      value as ManagementWorkspaceInventoryStateV1,
    );
    return;
  }

  if (operation.kind === 'SET_TEACHER_PLANNING') {
    applyTeacherPlanningState(
      workingCopy,
      value as ManagementWorkspaceTeacherPlanningStateV1,
    );
    return;
  }

  if (operation.kind === 'SET_TEACHER_AVAILABILITY') {
    applyTeacherAvailabilityState(
      workingCopy,
      value as ManagementWorkspaceTeacherAvailabilityStateV1,
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
