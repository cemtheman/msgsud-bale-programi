import type {
  ManagementWorkspaceSnapshotV1,
} from '@/lib/managementWorkspace';
import {
  createManagementWorkspaceWorkingCopyV1,
  type ManagementWorkspaceInventoryStateV1,
  type ManagementWorkspacePlacementStateV1,
  type ManagementWorkspaceRequirementResourceStateV1,
  type ManagementWorkspaceRequirementStructureBundleV1,
  type ManagementWorkspaceResourceBundleV1,
  type ManagementWorkspaceRoomProfileStateV1,
  type ManagementWorkspaceTeacherAvailabilityStateV1,
  type ManagementWorkspaceTeacherPlanningStateV1,
  type ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';
import {
  applyManagementWorkspaceInventoryOperationV1,
  applyManagementWorkspacePlacementOperationV1,
  applyManagementWorkspaceRemoveOperationV1,
  applyManagementWorkspaceRequirementResourceOperationV1,
  applyManagementWorkspaceRequirementStructureOperationV1,
  applyManagementWorkspaceResourceBundleOperationV1,
  applyManagementWorkspaceRoomProfileOperationV1,
  applyManagementWorkspaceTeacherAvailabilityOperationV1,
  applyManagementWorkspaceTeacherPlanningOperationV1,
  cloneManagementWorkspaceOperationV1,
  createManagementWorkspaceHistoryV1,
  type ManagementWorkspaceHistoryV1,
  type ManagementWorkspaceOperationV1,
} from '@/lib/managementWorkspaceHistory';
import {
  validateManagementWorkspaceV1,
  type ManagementWorkspaceValidationIssueV1,
} from '@/lib/managementWorkspaceValidation';

export type ManagementWorkspaceCommandV1 =
  | {
      type: 'SET_PLACEMENT';
      placement: ManagementWorkspacePlacementStateV1;
    }
  | {
      type: 'REMOVE_PLACEMENT';
      cardId: string;
    }
  | {
      type: 'SET_REQUIREMENT_STRUCTURE';
      requirementId: string;
      bundle: ManagementWorkspaceRequirementStructureBundleV1;
    }
  | {
      type: 'SET_REQUIREMENT_RESOURCES';
      resource: ManagementWorkspaceRequirementResourceStateV1;
    }
  | {
      type: 'SET_INVENTORY_RESOURCE';
      resource: ManagementWorkspaceInventoryStateV1;
    }
  | {
      type: 'SET_TEACHER_PLANNING';
      planning: ManagementWorkspaceTeacherPlanningStateV1;
    }
  | {
      type: 'SET_TEACHER_AVAILABILITY';
      availability: ManagementWorkspaceTeacherAvailabilityStateV1;
    }
  | {
      type: 'SET_ROOM_PROFILE';
      profile: ManagementWorkspaceRoomProfileStateV1;
    }
  | {
      type: 'SET_RESOURCE_BUNDLE';
      resourceType: 'TEACHER' | 'ROOM';
      resourceId: string;
      bundle: ManagementWorkspaceResourceBundleV1 | null;
    };

export interface ManagementWorkspaceCommandResultV1 {
  applied: boolean;
  operation: ManagementWorkspaceOperationV1 | null;
  issues: ManagementWorkspaceValidationIssueV1[];
}

function cloneWorkingCopy(
  source: ManagementWorkspaceWorkingCopyV1,
): ManagementWorkspaceWorkingCopyV1 {
  return {
    schemaVersion: source.schemaVersion,
    baseline: {
      revisionId: source.baseline.revisionId,
      requirementSetId: source.baseline.requirementSetId,
      revisionVersion: source.baseline.revisionVersion,
      academicYear: source.baseline.academicYear,
      term: source.baseline.term,
      snapshotHash: source.baseline.snapshotHash,
      baselineHash: source.baseline.baselineHash,
    },
    placementsByCardId: Object.fromEntries(
      Object.entries(source.placementsByCardId).map(([cardId, placement]) => [
        cardId,
        {
          cardId: placement.cardId,
          dayOfWeek: placement.dayOfWeek,
          startPeriod: placement.startPeriod,
          teacherId: placement.teacherId,
          roomId: placement.roomId,
        },
      ]),
    ),
    cardsById: Object.fromEntries(
      Object.entries(source.cardsById).map(([cardId, card]) => [
        cardId,
        { ...card },
      ]),
    ),
    requirementStructureById: Object.fromEntries(
      Object.entries(source.requirementStructureById).map(
        ([requirementId, structure]) => [
          requirementId,
          {
            ...structure,
            preferredPartition: [...structure.preferredPartition],
            allowedPartitions: structure.allowedPartitions.map(
              (partition) => [...partition],
            ),
          },
        ],
      ),
    ),
    requirementResourcesById: Object.fromEntries(
      Object.entries(source.requirementResourcesById).map(
        ([requirementId, resource]) => [
          requirementId,
          {
            requirementId: resource.requirementId,
            teacherIds: [...resource.teacherIds],
            teacherMode: resource.teacherMode,
            teacherAssignmentScope: resource.teacherAssignmentScope,
            teacherContinuity: resource.teacherContinuity,
            resourceMode: resource.resourceMode,
            roomIds: [...resource.roomIds],
            requiredCapability: resource.requiredCapability,
          },
        ],
      ),
    ),
    teacherInventoryById: Object.fromEntries(
      Object.entries(source.teacherInventoryById).map(([id, resource]) => [
        id,
        { ...resource },
      ]),
    ),
    roomInventoryById: Object.fromEntries(
      Object.entries(source.roomInventoryById).map(([id, resource]) => [
        id,
        { ...resource },
      ]),
    ),
    teacherPlanningById: Object.fromEntries(
      Object.entries(source.teacherPlanningById).map(([id, planning]) => [
        id,
        { ...planning },
      ]),
    ),
    teacherAvailabilityById: Object.fromEntries(
      Object.entries(source.teacherAvailabilityById).map(([id, availability]) => [
        id,
        {
          teacherId: availability.teacherId,
          unavailablePeriods: availability.unavailablePeriods.map((slot) => ({ ...slot })),
        },
      ]),
    ),
    roomProfileById: Object.fromEntries(
      Object.entries(source.roomProfileById).map(([id, profile]) => [
        id,
        {
          roomId: profile.roomId,
          capabilities: [...profile.capabilities],
          knowledgeStatus: profile.knowledgeStatus,
        },
      ]),
    ),
    resourceLifecycleById: Object.fromEntries(
      Object.entries(source.resourceLifecycleById).map(([id, lifecycle]) => [
        id,
        { ...lifecycle },
      ]),
    ),
  };
}

function cloneHistory(
  source: ManagementWorkspaceHistoryV1,
): ManagementWorkspaceHistoryV1 {
  return {
    nextSequence: source.nextSequence,
    nextBatchId: source.nextBatchId,
    undoStack: source.undoStack.map(
      (entry) => cloneManagementWorkspaceOperationV1(entry),
    ),
    redoStack: source.redoStack.map(
      (entry) => cloneManagementWorkspaceOperationV1(entry),
    ),
  };
}

function applyCommand(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  history: ManagementWorkspaceHistoryV1,
  command: ManagementWorkspaceCommandV1,
) {
  if (command.type === 'SET_PLACEMENT') {
    return applyManagementWorkspacePlacementOperationV1(
      workingCopy,
      history,
      command.placement,
    );
  }

  if (command.type === 'SET_REQUIREMENT_STRUCTURE') {
    return applyManagementWorkspaceRequirementStructureOperationV1(
      workingCopy,
      history,
      command.requirementId,
      command.bundle,
    );
  }

  if (command.type === 'SET_REQUIREMENT_RESOURCES') {
    return applyManagementWorkspaceRequirementResourceOperationV1(
      workingCopy,
      history,
      command.resource,
    );
  }

  if (command.type === 'SET_INVENTORY_RESOURCE') {
    return applyManagementWorkspaceInventoryOperationV1(
      workingCopy,
      history,
      command.resource,
    );
  }

  if (command.type === 'SET_TEACHER_PLANNING') {
    return applyManagementWorkspaceTeacherPlanningOperationV1(
      workingCopy,
      history,
      command.planning,
    );
  }

  if (command.type === 'SET_TEACHER_AVAILABILITY') {
    return applyManagementWorkspaceTeacherAvailabilityOperationV1(
      workingCopy,
      history,
      command.availability,
    );
  }

  if (command.type === 'SET_ROOM_PROFILE') {
    return applyManagementWorkspaceRoomProfileOperationV1(
      workingCopy,
      history,
      command.profile,
    );
  }

  if (command.type === 'SET_RESOURCE_BUNDLE') {
    return applyManagementWorkspaceResourceBundleOperationV1(
      workingCopy,
      history,
      command.resourceType,
      command.resourceId,
      command.bundle,
    );
  }

  return applyManagementWorkspaceRemoveOperationV1(
    workingCopy,
    history,
    command.cardId,
  );
}

export function executeManagementWorkspaceCommandV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  history: ManagementWorkspaceHistoryV1,
  command: ManagementWorkspaceCommandV1,
): ManagementWorkspaceCommandResultV1 {
  const trialCopy = cloneWorkingCopy(workingCopy);
  const trialHistory = cloneHistory(history);

  let trialOperation: ManagementWorkspaceOperationV1;

  try {
    trialOperation = applyCommand(
      trialCopy,
      trialHistory,
      command,
    );
  } catch (reason) {
    throw reason;
  }

  const currentValidation = validateManagementWorkspaceV1(
    snapshot,
    workingCopy,
    'EDIT',
  );
  const validation = validateManagementWorkspaceV1(
    snapshot,
    trialCopy,
    'EDIT',
  );

  const issueKey = (issue: ManagementWorkspaceValidationIssueV1) => [
    issue.code,
    issue.requirementId ?? '',
    [...issue.cardIds].sort((left, right) => left.localeCompare(right)).join(','),
  ].join('|');

  const currentIssueKeys = new Set(
    currentValidation.issues.map(issueKey),
  );
  const introducedIssues = validation.issues.filter(
    (issue) => !currentIssueKeys.has(issueKey(issue)),
  );

  if (introducedIssues.length > 0) {
    return {
      applied: false,
      operation: null,
      issues: introducedIssues,
    };
  }

  const operation = applyCommand(
    workingCopy,
    history,
    command,
  );

  return {
    applied: true,
    operation,
    issues: [],
  };
}


export interface ManagementWorkspaceBatchCommandResultV1 {
  applied: boolean;
  operations: ManagementWorkspaceOperationV1[];
  issues: ManagementWorkspaceValidationIssueV1[];
}


export function previewManagementWorkspaceCommandsV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  commands: ManagementWorkspaceCommandV1[],
): ManagementWorkspaceBatchCommandResultV1 {
  if (commands.length === 0) {
    return {
      applied: true,
      operations: [],
      issues: [],
    };
  }

  const trialCopy = cloneWorkingCopy(workingCopy);
  const trialHistory = createManagementWorkspaceHistoryV1();
  const coordinatedCardIds = commands.flatMap((command) => {
    if (command.type === 'SET_PLACEMENT') {
      return [command.placement.cardId];
    }
    if (command.type === 'REMOVE_PLACEMENT') {
      return [command.cardId];
    }
    return [];
  });

  const currentValidation = validateManagementWorkspaceV1(
    snapshot,
    workingCopy,
    'EDIT',
    coordinatedCardIds,
  );

  for (const command of commands) {
    applyCommand(trialCopy, trialHistory, command);
  }

  const validation = validateManagementWorkspaceV1(
    snapshot,
    trialCopy,
    'EDIT',
    coordinatedCardIds,
  );

  const issueKey = (issue: ManagementWorkspaceValidationIssueV1) => [
    issue.code,
    issue.requirementId ?? '',
    [...issue.cardIds].sort((left, right) => left.localeCompare(right)).join(','),
  ].join('|');

  const currentIssueKeys = new Set(
    currentValidation.issues.map(issueKey),
  );
  const introducedIssues = validation.issues.filter(
    (issue) => !currentIssueKeys.has(issueKey(issue)),
  );

  return {
    applied: introducedIssues.length === 0,
    operations: [],
    issues: introducedIssues,
  };
}

export function executeManagementWorkspaceCommandsV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  history: ManagementWorkspaceHistoryV1,
  commands: ManagementWorkspaceCommandV1[],
): ManagementWorkspaceBatchCommandResultV1 {
  if (commands.length === 0) {
    return {
      applied: true,
      operations: [],
      issues: [],
    };
  }

  const trialCopy = cloneWorkingCopy(workingCopy);
  const trialHistory = cloneHistory(history);
  const coordinatedCardIds = commands.flatMap((command) => {
    if (command.type === 'SET_PLACEMENT') {
      return [command.placement.cardId];
    }
    if (command.type === 'REMOVE_PLACEMENT') {
      return [command.cardId];
    }
    return [];
  });
  const currentValidation = validateManagementWorkspaceV1(
    snapshot,
    workingCopy,
    'EDIT',
    coordinatedCardIds,
  );

  for (const command of commands) {
    applyCommand(trialCopy, trialHistory, command);
  }

  const validation = validateManagementWorkspaceV1(
    snapshot,
    trialCopy,
    'EDIT',
    coordinatedCardIds,
  );

  const issueKey = (issue: ManagementWorkspaceValidationIssueV1) => [
    issue.code,
    issue.requirementId ?? '',
    [...issue.cardIds].sort((left, right) => left.localeCompare(right)).join(','),
  ].join('|');

  const currentIssueKeys = new Set(
    currentValidation.issues.map(issueKey),
  );
  const introducedIssues = validation.issues.filter(
    (issue) => !currentIssueKeys.has(issueKey(issue)),
  );

  if (introducedIssues.length > 0) {
    return {
      applied: false,
      operations: [],
      issues: introducedIssues,
    };
  }

  const batchId = history.nextBatchId;
  history.nextBatchId += 1;

  const operations = commands.map((command) =>
    applyCommand(workingCopy, history, command),
  );

  const batchStart = history.undoStack.length - operations.length;
  history.undoStack
    .slice(batchStart)
    .forEach((operation) => {
      operation.batchId = batchId;
    });
  operations.forEach((operation) => {
    operation.batchId = batchId;
  });

  return {
    applied: true,
    operations,
    issues: [],
  };
}

export function resetManagementWorkspaceWorkingCopyV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  target: ManagementWorkspaceWorkingCopyV1,
  history: ManagementWorkspaceHistoryV1,
) {
  const clean = createManagementWorkspaceWorkingCopyV1(snapshot);

  target.schemaVersion = clean.schemaVersion;
  target.baseline = clean.baseline;
  target.placementsByCardId = clean.placementsByCardId;
  target.cardsById = clean.cardsById;
  target.requirementStructureById = clean.requirementStructureById;
  target.requirementResourcesById = clean.requirementResourcesById;
  target.teacherInventoryById = clean.teacherInventoryById;
  target.roomInventoryById = clean.roomInventoryById;
  target.teacherPlanningById = clean.teacherPlanningById;
  target.teacherAvailabilityById = clean.teacherAvailabilityById;
  target.roomProfileById = clean.roomProfileById;
  target.resourceLifecycleById = clean.resourceLifecycleById;

  history.nextSequence = 1;
  history.nextBatchId = 1;
  history.undoStack = [];
  history.redoStack = [];
}
