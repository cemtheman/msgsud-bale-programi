import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  createManagementWorkspaceWorkingCopyV1,
  diffManagementWorkspaceV1,
  type ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';
import {
  createManagementWorkspaceHistoryV1,
  type ManagementWorkspaceHistoryV1,
} from '@/lib/managementWorkspaceHistory';

export interface ManagementWorkspaceRefreshStateV1 {
  snapshot: ManagementWorkspaceSnapshotV1;
  workingCopy: ManagementWorkspaceWorkingCopyV1;
  history: ManagementWorkspaceHistoryV1;
}

export type ManagementWorkspaceRefreshDecisionV1 =
  | { kind: 'PRESERVE_LOCAL'; state: ManagementWorkspaceRefreshStateV1 }
  | { kind: 'REPLACE'; state: ManagementWorkspaceRefreshStateV1 | null };

export function prepareManagementWorkspaceRefreshV1(
  current: ManagementWorkspaceRefreshStateV1 | null,
  incomingSnapshot: ManagementWorkspaceSnapshotV1 | null,
  incomingBoardRevisionId: string | null,
): ManagementWorkspaceRefreshDecisionV1 {
  // Check at installation time, after the asynchronous reads. The UI's dirty
  // flag at request start cannot see edits made while the response was pending.
  if (current && diffManagementWorkspaceV1(current.snapshot, current.workingCopy).hasChanges) {
    return { kind: 'PRESERVE_LOCAL', state: current };
  }
  if (!incomingSnapshot || incomingSnapshot.identity.revisionId !== incomingBoardRevisionId) {
    return { kind: 'REPLACE', state: null };
  }
  return {
    kind: 'REPLACE',
    state: {
      snapshot: incomingSnapshot,
      workingCopy: createManagementWorkspaceWorkingCopyV1(incomingSnapshot),
      history: createManagementWorkspaceHistoryV1(),
    },
  };
}
