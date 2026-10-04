import type {
  ManagementWorkspaceSnapshotV1,
} from '@/lib/managementWorkspace';
import {
  createManagementWorkspaceWorkingCopyV1,
  type ManagementWorkspacePlacementStateV1,
  type ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';
import {
  applyManagementWorkspacePlacementOperationV1,
  applyManagementWorkspaceRemoveOperationV1,
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
  };
}

function cloneHistory(
  source: ManagementWorkspaceHistoryV1,
): ManagementWorkspaceHistoryV1 {
  return {
    nextSequence: source.nextSequence,
    nextBatchId: source.nextBatchId,
    undoStack: source.undoStack.map((entry) => ({
      ...entry,
      before: { ...entry.before },
      after: { ...entry.after },
    })),
    redoStack: source.redoStack.map((entry) => ({
      ...entry,
      before: { ...entry.before },
      after: { ...entry.after },
    })),
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
    issue.dayOfWeek ?? '',
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
  const coordinatedCardIds = commands.map((command) =>
    command.type === 'SET_PLACEMENT'
      ? command.placement.cardId
      : command.cardId,
  );

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
    issue.dayOfWeek ?? '',
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
  const coordinatedCardIds = commands.map((command) =>
    command.type === 'SET_PLACEMENT'
      ? command.placement.cardId
      : command.cardId,
  );
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
    issue.dayOfWeek ?? '',
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

  history.nextSequence = 1;
  history.nextBatchId = 1;
  history.undoStack = [];
  history.redoStack = [];
}
