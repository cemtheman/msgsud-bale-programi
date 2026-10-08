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
  structureChanges: Array<{
    requirement_id: string;
    before: {
      weekly_load: number;
      preferred_partition: number[];
      allowed_partitions: number[][];
      term_status: 'ACTIVE' | 'INACTIVE';
    };
    after: {
      weekly_load: number;
      preferred_partition: number[];
      allowed_partitions: number[][];
      term_status: 'ACTIVE' | 'INACTIVE';
    };
    final_cards: Array<{
      card_id: string;
      block_index: number;
      duration_periods: number;
      baseline_exists: boolean;
      locked: boolean;
    }>;
  }>;
  resourceCreates: Array<{
    resource_type: 'TEACHER' | 'ROOM';
    resource_id: string;
    display_name: string;
    operational_status: string;
    teacher_planning: {
      minimum_load: number | null;
      target_load: number | null;
      maximum_load: number | null;
    } | null;
    teacher_availability: Array<{
      day_of_week: number;
      period: number;
    }> | null;
    room_profile: {
      capabilities: string[];
      knowledge_status: 'CONFIRMED' | 'OBSERVED' | 'UNKNOWN';
    } | null;
  }>;
  resourceDeletes: Array<{
    resource_type: 'TEACHER' | 'ROOM';
    resource_id: string;
  }>;
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
  roomProfileChanges: Array<{
    room_id: string;
    before: {
      capabilities: string[];
      knowledge_status: 'CONFIRMED' | 'OBSERVED' | 'UNKNOWN';
    };
    after: {
      capabilities: string[];
      knowledge_status: 'CONFIRMED' | 'OBSERVED' | 'UNKNOWN';
    };
  }>;
  teacherAvailabilityChanges: Array<{
    teacher_id: string;
    before: Array<{
      day_of_week: number;
      period: number;
    }>;
    after: Array<{
      day_of_week: number;
      period: number;
    }>;
  }>;
  teacherPlanningChanges: Array<{
    teacher_id: string;
    before: {
      minimum_load: number | null;
      target_load: number | null;
      maximum_load: number | null;
    };
    after: {
      minimum_load: number | null;
      target_load: number | null;
      maximum_load: number | null;
    };
  }>;
  timePreferenceChanges: Array<{
    requirement_id: string;
    before: {
      preferred_days: number[];
      preferred_start_periods: number[];
    };
    after: {
      preferred_days: number[];
      preferred_start_periods: number[];
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
  changedStructureCount?: number;
  changedStructuralCardCount?: number;
  changedTimePreferenceCount?: number;
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
      structureChanges: diff.requirementStructureChanges.map((change) => ({
        requirement_id: change.requirementId,
        before: {
          weekly_load: change.before.weeklyLoad,
          preferred_partition: [...change.before.preferredPartition],
          allowed_partitions: change.before.allowedPartitions.map(
            (partition) => [...partition],
          ),
          term_status: change.before.termStatus,
        },
        after: {
          weekly_load: change.after.weeklyLoad,
          preferred_partition: [...change.after.preferredPartition],
          allowed_partitions: change.after.allowedPartitions.map(
            (partition) => [...partition],
          ),
          term_status: change.after.termStatus,
        },
        final_cards: Object.values(workingCopy.cardsById)
          .filter((card) => card.requirementId === change.requirementId)
          .sort((left, right) =>
            left.blockIndex - right.blockIndex
            || left.id.localeCompare(right.id),
          )
          .map((card) => ({
            card_id: card.id,
            block_index: card.blockIndex,
            duration_periods: card.durationPeriods,
            baseline_exists: card.baselineExists,
            locked: card.locked,
          })),
      })),
      resourceCreates: diff.resourceCreates.map((change) => {
        const lifecycle = workingCopy.resourceLifecycleById[change.resourceId];
        const inventory = change.resourceType === 'TEACHER'
          ? workingCopy.teacherInventoryById[change.resourceId]
          : workingCopy.roomInventoryById[change.resourceId];
        if (!lifecycle || !inventory || !lifecycle.exists) {
          throw new Error(
            `Workspace oluşturulan kaynak paketi eksik (${change.resourceId}).`,
          );
        }

        if (change.resourceType === 'TEACHER') {
          const planning = workingCopy.teacherPlanningById[change.resourceId];
          const availability =
            workingCopy.teacherAvailabilityById[change.resourceId];
          return {
            resource_type: change.resourceType,
            resource_id: change.resourceId,
            display_name: inventory.displayName,
            operational_status: inventory.operationalStatus,
            teacher_planning: {
              minimum_load: planning?.minimumLoad ?? null,
              target_load: planning?.targetLoad ?? null,
              maximum_load: planning?.maximumLoad ?? null,
            },
            teacher_availability:
              availability?.unavailablePeriods.map((slot) => ({
                day_of_week: slot.dayOfWeek,
                period: slot.period,
              })) ?? [],
            room_profile: null,
          };
        }

        const profile = workingCopy.roomProfileById[change.resourceId];
        return {
          resource_type: change.resourceType,
          resource_id: change.resourceId,
          display_name: inventory.displayName,
          operational_status: inventory.operationalStatus,
          teacher_planning: null,
          teacher_availability: null,
          room_profile: {
            capabilities: [...(profile?.capabilities ?? [])],
            knowledge_status: profile?.knowledgeStatus ?? 'UNKNOWN',
          },
        };
      }),
      resourceDeletes: diff.resourceDeletes.map((change) => ({
        resource_type: change.resourceType,
        resource_id: change.resourceId,
      })),
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
      roomProfileChanges: diff.roomProfileChanges.map((change) => ({
        room_id: change.roomId,
        before: {
          capabilities: [...change.before.capabilities],
          knowledge_status: change.before.knowledgeStatus,
        },
        after: {
          capabilities: [...change.after.capabilities],
          knowledge_status: change.after.knowledgeStatus,
        },
      })),
      teacherAvailabilityChanges: diff.teacherAvailabilityChanges.map((change) => ({
        teacher_id: change.teacherId,
        before: change.before.unavailablePeriods.map((slot) => ({
          day_of_week: slot.dayOfWeek,
          period: slot.period,
        })),
        after: change.after.unavailablePeriods.map((slot) => ({
          day_of_week: slot.dayOfWeek,
          period: slot.period,
        })),
      })),
      teacherPlanningChanges: diff.teacherPlanningChanges.map((change) => ({
        teacher_id: change.teacherId,
        before: {
          minimum_load: change.before.minimumLoad,
          target_load: change.before.targetLoad,
          maximum_load: change.before.maximumLoad,
        },
        after: {
          minimum_load: change.after.minimumLoad,
          target_load: change.after.targetLoad,
          maximum_load: change.after.maximumLoad,
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
      timePreferenceChanges: diff.requirementTimePreferenceChanges.map(
        (change) => ({
          requirement_id: change.requirementId,
          before: {
            preferred_days: [...change.before.preferredDays],
            preferred_start_periods: [...change.before.preferredStartPeriods],
          },
          after: {
            preferred_days: [...change.after.preferredDays],
            preferred_start_periods: [...change.after.preferredStartPeriods],
          },
        }),
      ),
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
    `${url}/rest/v1/rpc/management_commit_workspace_v12`,
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
        p_teacher_planning_changes: payload.teacherPlanningChanges,
        p_teacher_availability_changes: payload.teacherAvailabilityChanges,
        p_room_profile_changes: payload.roomProfileChanges,
        p_resource_creates: payload.resourceCreates,
        p_resource_deletes: payload.resourceDeletes,
        p_structure_changes: payload.structureChanges,
        p_time_preference_changes: payload.timePreferenceChanges,
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

  if (
    normalized.includes('WORKSPACE_V11_LIFECYCLE_BEFORE_STALE')
    || normalized.includes('WORKSPACE_V11_LIFECYCLE_CARD_GRAPH_STALE')
  ) {
    return 'Dersin dönem durumu çalışma alanı açıldıktan sonra değişmiş. Ders Planı verisini yenileyip tekrar deneyin.';
  }

  if (
    normalized.includes('WORKSPACE_V11_LIFECYCLE_BLOCKED')
    || normalized.includes('WORKSPACE_V11_LIFECYCLE_GRAPH_MISMATCH')
    || normalized.includes('WORKSPACE_V11_LIFECYCLE_INVALID')
  ) {
    return 'Dersin aktif/pasif geçişi mevcut kartlarla güvenli biçimde uygulanamıyor. Etki önizlemesini yeniden kontrol edin.';
  }

  if (
    normalized.includes('WORKSPACE_V10_STRUCTURE_BEFORE_STALE')
    || normalized.includes('WORKSPACE_V10_STRUCTURE_CARD_GRAPH_STALE')
  ) {
    return 'Ders yapısı çalışma alanı açıldıktan sonra değişmiş. Çalışma alanını yenileyip yapı değişikliğini yeniden uygulayın.';
  }

  if (
    normalized.includes('WORKSPACE_V10_STRUCTURE_BLOCKED')
    || normalized.includes('WORKSPACE_V10_STRUCTURE_GRAPH_MISMATCH')
    || normalized.includes('WORKSPACE_V10_STRUCTURE_INVALID')
  ) {
    return 'Ders yapısı mevcut program kartlarıyla güvenli biçimde uygulanamıyor. Etki önizlemesini yeniden kontrol edin.';
  }

  if (
    normalized.includes('WORKSPACE_V9_RESOURCE_CREATE_CONFLICT')
    || normalized.includes('WORKSPACE_V9_RESOURCE_NAME_CONFLICT')
  ) {
    return 'Yeni kaynak kaydedilemedi: aynı kimlik veya ad veritabanında artık kullanılıyor. Çalışma alanını yenileyip tekrar deneyin.';
  }

  if (
    normalized.includes('WORKSPACE_V9_RESOURCE_DELETE_STALE')
    || normalized.includes('WORKSPACE_V9_RESOURCE_DELETE_REFERENCED')
  ) {
    return 'Silinecek kaynak çalışma alanı açıldıktan sonra değişmiş veya hâlâ kullanılıyor. Bağları temizleyip çalışma alanını yenileyin.';
  }

  if (
    normalized.includes('WORKSPACE_V8_ROOM_PROFILE_BEFORE_STALE')
    || normalized.includes('WORKSPACE_V8_ROOM_NOT_FOUND')
  ) {
    return 'Salon özellikleri çalışma alanı açıldıktan sonra değişmiş. Çalışma alanını yenileyip işlemi yeniden uygulayın.';
  }

  if (
    normalized.includes('WORKSPACE_V8_ROOM_PROFILE_BLOCKED')
    || normalized.includes('WORKSPACE_V8_INVALID_ROOM_PROFILE')
  ) {
    return 'Salon özellikleri bu haliyle mevcut programı geçersiz kılıyor. Etkilenen yerleşimleri düzeltip işlemi yeniden uygulayın.';
  }

  if (normalized.includes('WORKSPACE_V7_MULTIPLE_ROOM_DEPARTURES_UNSUPPORTED')) {
    return 'Tek Kaydet işleminde yalnızca bir salon “kullanım dışına al” ayrılış işlemi yapılabilir. İlk değişikliği kaydedip ardından diğer salona geçin.';
  }

  if (normalized.includes('WORKSPACE_V7_ROOM_DEPARTURE_DELTA_MISMATCH')) {
    return 'Salon ayrılış değişikliği çalışma alanındaki güncel ders/atama durumu ile eşleşmiyor. Çalışma alanını yenileyip işlemi yeniden uygulayın.';
  }

  if (
    normalized.includes('WORKSPACE_V6_TEACHER_AVAILABILITY_BEFORE_STALE')
    || normalized.includes('WORKSPACE_V6_TEACHER_NOT_FOUND')
  ) {
    return 'Öğretmen uygunluk bilgisi çalışma alanı açıldıktan sonra değişmiş. Çalışma alanını yenileyip işlemi yeniden uygulayın.';
  }

  if (
    normalized.includes('WORKSPACE_V6_TEACHER_AVAILABILITY_INVALID')
    || normalized.includes('WORKSPACE_V6_INVALID_TEACHER_AVAILABILITY_SHAPE')
  ) {
    return 'Öğretmen uygunluk bilgisi geçersiz. Gün 1–5, ders 1–12 aralığında olmalı ve aynı saat tekrarlanmamalı.';
  }

  if (
    normalized.includes('WORKSPACE_V5_TEACHER_PLANNING_BEFORE_STALE')
    || normalized.includes('WORKSPACE_V5_TEACHER_NOT_FOUND')
  ) {
    return 'Öğretmen yük hedefleri çalışma alanı açıldıktan sonra değişmiş. Çalışma alanını yenileyip işlemi yeniden uygulayın.';
  }

  if (
    normalized.includes('WORKSPACE_V5_TEACHER_PLANNING_INVALID')
    || normalized.includes('WORKSPACE_V5_INVALID_TEACHER_PLANNING_VALUE')
  ) {
    return 'Öğretmen yük hedefleri geçersiz. Değerler 0–60 aralığında ve minimum ≤ hedef ≤ maksimum olmalı.';
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
