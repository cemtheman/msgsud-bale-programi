'use client';

import { getFreshManagementAccessToken } from '@/lib/managementAuth';
import type {
  ManagementWorkspaceSnapshotV1,
} from '@/lib/managementWorkspace';
import {
  diffManagementWorkspaceV1,
  type ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';
import {
  validateManagementWorkspaceV1,
  type ManagementWorkspaceValidationIssueV1,
} from '@/lib/managementWorkspaceValidation';

export interface ManagementWorkspaceCommitPayloadV1 {
  revisionId: string;
  requirementSetId: string;
  revisionVersion: number;
  snapshotHash: string;
  baselineHash: string;
  changes: Array<{
    card_id: string;
    before: {
      day_of_week: number | null;
      start_period: number | null;
      teacher_id: string | null;
      room_id: string | null;
    };
    after: {
      day_of_week: number | null;
      start_period: number | null;
      teacher_id: string | null;
      room_id: string | null;
    };
  }>;
}

export interface ManagementWorkspaceCommitResultV1 {
  committed: boolean;
  revisionId: string;
  changedCardCount: number;
  removeCount: number;
  moveCount: number;
  placeCount: number;
  previousSnapshotHash: string;
  previousBaselineHash: string;
  snapshotHash: string;
  baselineHash: string;
}

export interface ManagementWorkspaceCommitPreparationV1 {
  ready: boolean;
  issues: ManagementWorkspaceValidationIssueV1[];
  payload: ManagementWorkspaceCommitPayloadV1 | null;
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error('Yönetim bağlantı ayarları eksik.');
  }

  return { url, key };
}

export function prepareManagementWorkspaceCommitV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
): ManagementWorkspaceCommitPreparationV1 {
  const validation = validateManagementWorkspaceV1(
    snapshot,
    workingCopy,
    'COMMIT',
  );

  if (!validation.valid) {
    return {
      ready: false,
      issues: validation.issues,
      payload: null,
    };
  }

  const diff = diffManagementWorkspaceV1(snapshot, workingCopy);

  if (!diff.hasChanges) {
    return {
      ready: false,
      issues: [],
      payload: null,
    };
  }

  return {
    ready: true,
    issues: [],
    payload: {
      revisionId: diff.baseline.revisionId,
      requirementSetId: diff.baseline.requirementSetId,
      revisionVersion: diff.baseline.revisionVersion,
      snapshotHash: diff.baseline.snapshotHash,
      baselineHash: diff.baseline.baselineHash,
      changes: diff.placementChanges.map((change) => ({
        card_id: change.cardId,
        before: {
          day_of_week: change.before.dayOfWeek,
          start_period: change.before.startPeriod,
          teacher_id: change.before.teacherId,
          room_id: change.before.roomId,
        },
        after: {
          day_of_week: change.after.dayOfWeek,
          start_period: change.after.startPeriod,
          teacher_id: change.after.teacherId,
          room_id: change.after.roomId,
        },
      })),
    },
  };
}

export async function commitManagementWorkspaceV1(
  accessToken: string,
  payload: ManagementWorkspaceCommitPayloadV1,
): Promise<ManagementWorkspaceCommitResultV1> {
  const { url, key } = getSupabaseConfig();
  const token = await getFreshManagementAccessToken(accessToken);

  const response = await fetch(
    `${url}/rest/v1/rpc/management_commit_workspace_v1`,
    {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_schedule_revision_id: payload.revisionId,
        p_requirement_set_id: payload.requirementSetId,
        p_expected_revision_version: payload.revisionVersion,
        p_expected_snapshot_hash: payload.snapshotHash,
        p_expected_baseline_hash: payload.baselineHash,
        p_changes: payload.changes,
      }),
    },
  );

  if (!response.ok) {
    let message = 'Yerel çalışma alanı kaydedilemedi.';

    try {
      const body = await response.json() as {
        message?: string;
        details?: string;
        hint?: string;
      };
      message = body.message ?? body.details ?? body.hint ?? message;
    } catch {
      // Keep stable fallback for edge/non-JSON responses.
    }

    throw new Error(message);
  }

  return response.json() as Promise<ManagementWorkspaceCommitResultV1>;
}
