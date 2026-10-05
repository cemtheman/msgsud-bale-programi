'use client';

import { getFreshManagementAccessToken } from '@/lib/managementAuth';
import type {
  ManagementWorkspaceSnapshotV1,
} from '@/lib/managementWorkspace';
import {
  createManagementWorkspaceWorkingCopyV1,
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
  resourceChanges: Array<{
    resource_type: 'TEACHER' | 'ROOM';
    resource_id: string;
    before: {
      display_name: string;
      operational_status: string;
    };
    after: {
      display_name: string;
      operational_status: string;
    };
  }>;
  requirementChanges: Array<{
    requirement_id: string;
    before: {
      teacher_ids: string[];
      teacher_mode: string;
      teacher_assignment_scope: 'REQUIREMENT' | 'BLOCK' | 'UNSPECIFIED';
      teacher_continuity: 'REQUIRED' | 'PREFERRED' | 'NONE';
      resource_mode: string;
      room_ids: string[];
      required_capability: string | null;
    };
    after: {
      teacher_ids: string[];
      teacher_mode: string;
      teacher_assignment_scope: 'REQUIREMENT' | 'BLOCK' | 'UNSPECIFIED';
      teacher_continuity: 'REQUIRED' | 'PREFERRED' | 'NONE';
      resource_mode: string;
      room_ids: string[];
      required_capability: string | null;
    };
  }>;
}

export interface ManagementWorkspaceCommitResultV1 {
  committed: boolean;
  revisionId: string;
  changedCardCount: number;
  changedRequirementCount: number;
  changedResourceCount: number;
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
  const baselineCopy = createManagementWorkspaceWorkingCopyV1(snapshot);
  const baselineValidation = validateManagementWorkspaceV1(
    snapshot,
    baselineCopy,
    'COMMIT',
  );
  const validation = validateManagementWorkspaceV1(
    snapshot,
    workingCopy,
    'COMMIT',
  );

  const issueKey = (issue: ManagementWorkspaceValidationIssueV1) => [
    issue.code,
    issue.requirementId ?? '',
    [...issue.cardIds].sort((left, right) => left.localeCompare(right)).join(','),
  ].join('|');

  const baselineIssueKeys = new Set(
    baselineValidation.issues.map(issueKey),
  );
  const introducedIssues = validation.issues.filter(
    (issue) => !baselineIssueKeys.has(issueKey(issue)),
  );

  if (introducedIssues.length > 0) {
    return {
      ready: false,
      issues: introducedIssues,
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
      resourceChanges: diff.inventoryChanges.map((change) => ({
        resource_type: change.resourceType,
        resource_id: change.resourceId,
        before: {
          display_name: change.before.displayName,
          operational_status: change.before.operationalStatus,
        },
        after: {
          display_name: change.after.displayName,
          operational_status: change.after.operationalStatus,
        },
      })),
      requirementChanges: diff.requirementResourceChanges.map((change) => ({
        requirement_id: change.requirementId,
        before: {
          teacher_ids: [...change.before.teacherIds],
          teacher_mode: change.before.teacherMode,
          teacher_assignment_scope: change.before.teacherAssignmentScope,
          teacher_continuity: change.before.teacherContinuity,
          resource_mode: change.before.resourceMode,
          room_ids: [...change.before.roomIds],
          required_capability: change.before.requiredCapability,
        },
        after: {
          teacher_ids: [...change.after.teacherIds],
          teacher_mode: change.after.teacherMode,
          teacher_assignment_scope: change.after.teacherAssignmentScope,
          teacher_continuity: change.after.teacherContinuity,
          resource_mode: change.after.resourceMode,
          room_ids: [...change.after.roomIds],
          required_capability: change.after.requiredCapability,
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
    `${url}/rest/v1/rpc/management_commit_workspace_v4`,
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
        p_requirement_changes: payload.requirementChanges,
        p_resource_changes: payload.resourceChanges,
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


export function translateManagementWorkspaceCommitErrorV1(
  message: string,
) {
  const normalized = message.toUpperCase();

  if (
    normalized.includes('WORKSPACE_V1_SNAPSHOT_STALE')
    || normalized.includes('WORKSPACE_V1_BASELINE_STALE')
    || normalized.includes('WORKSPACE_V1_REVISION_VERSION_STALE')
    || normalized.includes('WORKSPACE_V1_REQUIREMENT_SET_STALE')
    || normalized.includes('WORKSPACE_V1_BEFORE_STATE_STALE')
    || normalized.includes('WORKSPACE_V2_REQUIREMENT_BEFORE_STALE')
    || normalized.includes('WORKSPACE_V2_REQUIREMENT_NOT_IN_SET')
    || normalized.includes('WORKSPACE_V3_RESOURCE_BEFORE_STALE')
    || normalized.includes('WORKSPACE_V3_RESOURCE_NOT_FOUND')
  ) {
    return 'Taslak program siz çalışırken değişmiş. Yerel değişiklikler korunuyor; güncel programı almadan kaydetme yapılmadı.';
  }

  if (
    normalized.includes('WORKSPACE_V2_REQUIREMENT_HAS_PLACEMENTS')
  ) {
    return 'Ders Planı kaynak tanımı değiştirilecek dersin önce programdan kaldırılması gerekiyor.';
  }

  if (normalized.includes('WORKSPACE_V2_TEACHER_POLICY_BLOCKED')) {
    return 'Öğretmen kuralı mevcut yerleşimlerdeki farklı öğretmen dağılımıyla çelişiyor. Önce öğretmenleri uzlaştırın.';
  }

  if (normalized.includes('WORKSPACE_V2_TEACHER_POLICY_INVALID')) {
    return 'Seçilen öğretmen kapsamı ve süreklilik kuralı birlikte kullanılamıyor.';
  }

  if (normalized.includes('WORKSPACE_V3_ROOM_STATUS_BLOCKED')) {
    return 'Salon mevcut taslak programdaki kullanımı nedeniyle bu duruma alınamıyor. İlgili yerleşimleri kaldırıp yeniden deneyin.';
  }

  if (
    normalized.includes('WORKSPACE_V3_ROOM_ALIAS_NAME_EDIT_BLOCKED')
    || normalized.includes('WORKSPACE_V3_ROOM_ALIAS_STATUS_EDIT_BLOCKED')
  ) {
    return 'Salon alias kaydı doğrudan düzenlenemez; canonical salon kaydını kullanın.';
  }

  if (normalized.includes('WORKSPACE_V3_RESOURCE_NAME_INVALID')) {
    return 'Kaynak görünen adı boş olamaz ve 120 karakteri geçemez.';
  }

  if (normalized.includes('WORKSPACE_V3_RESOURCE_STATUS_INVALID')) {
    return 'Seçilen kaynak çalışma durumu geçerli değil.';
  }

  if (normalized.includes('WORKSPACE_V1_LOCKED_CARD_CHANGED')) {
    return 'Kilitli bir ders değiştirildiği için çalışma alanı kaydedilemedi.';
  }

  if (normalized.includes('WORKSPACE_V4_MULTIPLE_TEACHER_DEPARTURES_UNSUPPORTED')) {
    return 'Tek Kaydet işleminde yalnızca bir öğretmen “derslerden çıkar ve kapat” işlemi yapılabilir. İlk değişikliği kaydedip ardından diğer öğretmene geçin.';
  }

  if (
    normalized.includes('WORKSPACE_V4_DEPARTURE_REQUIREMENT_DELTA_MISMATCH')
    || normalized.includes('WORKSPACE_V4_DEPARTURE_PLACEMENT_DELTA_MISMATCH')
  ) {
    return 'Öğretmen ayrılış değişikliği çalışma alanındaki güncel ders/atama durumu ile eşleşmiyor. Çalışma alanını yenileyip işlemi yeniden uygulayın.';
  }

  if (
    normalized.includes('WORKSPACE_V1_COMMIT_TOO_LARGE')
    || normalized.includes('WORKSPACE_V1_OPERATION_GROUP_TOO_LARGE')
  ) {
    return 'Bu çalışma alanında tek seferde kaydedilebilecekten fazla değişiklik var. Değişiklikleri daha küçük bir paket halinde kaydedin.';
  }

  if (
    normalized.includes('CANDIDATE')
    || normalized.includes('BLOCKED')
    || normalized.includes('CONFLICT')
    || normalized.includes('UNAVAILABLE')
  ) {
    return 'Program sunucuda son kez doğrulanırken bir kural veya çakışma bulundu. Hiçbir değişiklik kaydedilmedi.';
  }

  return message || 'Yerel çalışma alanı kaydedilemedi.';
}
