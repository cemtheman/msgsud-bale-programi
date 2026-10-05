'use client';

import { fetchLatestManagementDraftRevision } from '@/lib/managementRevision';
import {
  previewManagementSolverSnapshot,
  type ManagementSolverBaselineMetrics,
  type ManagementSolverBaselinePlacement,
  type ManagementSolverCard,
  type ManagementSolverHardConstraintContract,
  type ManagementSolverInstructionalGroup,
  type ManagementSolverInstructionalGroupRelation,
  type ManagementSolverProvisionalInput,
  type ManagementSolverReadinessBlocker,
  type ManagementSolverRequirement,
  type ManagementSolverRoom,
  type ManagementSolverRoomPoolEntry,
  type ManagementSolverSnapshotPreview,
  type ManagementSolverTeacher,
  type ManagementSolverTeacherLoadTarget,
  type ManagementSolverTeacherPoolEntry,
  type ManagementSolverTeacherUnavailablePeriod,
} from '@/lib/managementSolver';

export const MANAGEMENT_WORKSPACE_SNAPSHOT_SCHEMA_VERSION =
  'management-workspace-v1' as const;

export interface ManagementWorkspaceSnapshotIdentityV1 {
  readonly revisionId: string;
  readonly requirementSetId: string;
  readonly revisionVersion: number;
  readonly academicYear: string;
  readonly term: number;
  readonly snapshotHash: string;
  readonly baselineHash: string;
}

export interface ManagementWorkspaceSnapshotReadinessV1 {
  readonly hardInputReady: boolean;
  readonly hardBlockers: readonly ManagementSolverReadinessBlocker[];
  readonly provisionalInputs: readonly ManagementSolverProvisionalInput[];
  readonly resourceUnknownSemantics: string | null;
  readonly missingOptionalModelInputs: readonly string[];
}

export interface ManagementWorkspaceSnapshotV1 {
  readonly schemaVersion: typeof MANAGEMENT_WORKSPACE_SNAPSHOT_SCHEMA_VERSION;
  readonly sourceSnapshotVersion: string;
  readonly identity: ManagementWorkspaceSnapshotIdentityV1;
  readonly hardConstraintContract: ManagementSolverHardConstraintContract;
  readonly requirements: readonly ManagementSolverRequirement[];
  readonly cards: readonly ManagementSolverCard[];
  readonly instructionalGroups: readonly ManagementSolverInstructionalGroup[];
  readonly instructionalGroupRelations:
    readonly ManagementSolverInstructionalGroupRelation[];
  readonly teacherPools: readonly ManagementSolverTeacherPoolEntry[];
  readonly roomPools: readonly ManagementSolverRoomPoolEntry[];
  readonly teachers: readonly ManagementSolverTeacher[];
  readonly teacherUnavailablePeriods:
    readonly ManagementSolverTeacherUnavailablePeriod[];
  readonly teacherLoadTargets?:
    readonly ManagementSolverTeacherLoadTarget[];
  readonly rooms: readonly ManagementSolverRoom[];
  readonly baselinePlacements: readonly ManagementSolverBaselinePlacement[];
  readonly baselineMetrics: ManagementSolverBaselineMetrics;
  readonly readiness: ManagementWorkspaceSnapshotReadinessV1;
  readonly candidateDomain: {
    readonly included: boolean;
    readonly omissionReason: string;
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);

  Object.values(value as Record<string, unknown>).forEach((child) => {
    deepFreeze(child);
  });

  return value;
}

function assertUniqueIds(
  label: string,
  values: readonly { id: string }[],
) {
  const seen = new Set<string>();

  values.forEach((value) => {
    if (seen.has(value.id)) {
      throw new Error(
        `Workspace snapshot geçersiz: mükerrer ${label} kimliği (${value.id}).`,
      );
    }
    seen.add(value.id);
  });
}

function validateWorkspaceSnapshotSource(
  preview: ManagementSolverSnapshotPreview,
) {
  if (!preview.meta.revisionId) {
    throw new Error('Workspace snapshot geçersiz: revision kimliği eksik.');
  }

  if (!preview.meta.requirementSetId) {
    throw new Error('Workspace snapshot geçersiz: requirement set kimliği eksik.');
  }

  if (!preview.snapshotHash || !preview.baselineHash) {
    throw new Error('Workspace snapshot geçersiz: baseline/snapshot hash eksik.');
  }

  assertUniqueIds('requirement', preview.requirements);
  assertUniqueIds('kart', preview.cards);
  assertUniqueIds('öğretmen', preview.teachers);
  assertUniqueIds('salon', preview.rooms);
  assertUniqueIds('öğretim grubu', preview.instructionalGroups);

  const requirementIds = new Set(preview.requirements.map((item) => item.id));
  const cardIds = new Set(preview.cards.map((item) => item.id));
  const teacherIds = new Set(preview.teachers.map((item) => item.id));
  const roomIds = new Set(preview.rooms.map((item) => item.id));
  const groupIds = new Set(preview.instructionalGroups.map((item) => item.id));

  preview.cards.forEach((card) => {
    if (!requirementIds.has(card.requirementId)) {
      throw new Error(
        `Workspace snapshot geçersiz: kartın requirement kaydı yok (${card.id}).`,
      );
    }
  });

  preview.baselinePlacements.forEach((placement) => {
    if (!cardIds.has(placement.cardId)) {
      throw new Error(
        `Workspace snapshot geçersiz: placement kartı snapshot'ta yok (${placement.cardId}).`,
      );
    }

    if (placement.teacherId && !teacherIds.has(placement.teacherId)) {
      throw new Error(
        `Workspace snapshot geçersiz: placement öğretmeni snapshot'ta yok (${placement.teacherId}).`,
      );
    }

    if (placement.roomId && !roomIds.has(placement.roomId)) {
      throw new Error(
        `Workspace snapshot geçersiz: placement salonu snapshot'ta yok (${placement.roomId}).`,
      );
    }
  });

  preview.teacherPools.forEach((entry) => {
    if (
      !requirementIds.has(entry.requirementId)
      || !teacherIds.has(entry.teacherId)
    ) {
      throw new Error(
        'Workspace snapshot geçersiz: öğretmen havuzu referansı çözümlenemedi.',
      );
    }
  });

  preview.roomPools.forEach((entry) => {
    if (
      !requirementIds.has(entry.requirementId)
      || !roomIds.has(entry.roomId)
    ) {
      throw new Error(
        'Workspace snapshot geçersiz: salon havuzu referansı çözümlenemedi.',
      );
    }
  });

  preview.teacherUnavailablePeriods?.forEach((entry) => {
    if (!teacherIds.has(entry.teacherId)) {
      throw new Error(
        `Workspace snapshot geçersiz: availability öğretmeni snapshot'ta yok (${entry.teacherId}).`,
      );
    }
  });

  preview.instructionalGroupRelations.forEach((relation) => {
    if (
      !groupIds.has(relation.leftGroupId)
      || !groupIds.has(relation.rightGroupId)
    ) {
      throw new Error(
        'Workspace snapshot geçersiz: öğretim grubu ilişkisi çözümlenemedi.',
      );
    }
  });
}

export function createManagementWorkspaceSnapshotV1(
  preview: ManagementSolverSnapshotPreview,
): ManagementWorkspaceSnapshotV1 {
  validateWorkspaceSnapshotSource(preview);

  const snapshot: ManagementWorkspaceSnapshotV1 = {
    schemaVersion: MANAGEMENT_WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    sourceSnapshotVersion: preview.snapshotVersion,
    identity: {
      revisionId: preview.meta.revisionId,
      requirementSetId: preview.meta.requirementSetId,
      revisionVersion: preview.meta.revisionVersion,
      academicYear: preview.meta.academicYear,
      term: preview.meta.term,
      snapshotHash: preview.snapshotHash,
      baselineHash: preview.baselineHash,
    },
    hardConstraintContract: preview.hardConstraintContract,
    requirements: preview.requirements,
    cards: preview.cards,
    instructionalGroups: preview.instructionalGroups,
    instructionalGroupRelations: preview.instructionalGroupRelations,
    teacherPools: preview.teacherPools,
    roomPools: preview.roomPools,
    teachers: preview.teachers,
    teacherUnavailablePeriods: preview.teacherUnavailablePeriods ?? [],
    teacherLoadTargets: preview.teacherLoadTargets ?? [],
    rooms: preview.rooms,
    baselinePlacements: preview.baselinePlacements,
    baselineMetrics: preview.baselineMetrics,
    readiness: {
      hardInputReady: preview.readiness.hardInputReady,
      hardBlockers: preview.readiness.hardBlockers,
      provisionalInputs: preview.readiness.provisionalInputs ?? [],
      resourceUnknownSemantics:
        preview.readiness.resourceUnknownSemantics ?? null,
      missingOptionalModelInputs:
        preview.readiness.missingOptionalModelInputs,
    },
    candidateDomain: {
      included: preview.candidateDomainIncluded,
      omissionReason: preview.candidateDomainOmissionReason,
    },
  };

  return deepFreeze(cloneJson(snapshot));
}

export async function fetchManagementWorkspaceSnapshotV1(
  accessToken: string,
  revisionId: string,
): Promise<ManagementWorkspaceSnapshotV1> {
  const preview = await previewManagementSolverSnapshot(
    accessToken,
    revisionId,
    null,
  );

  return createManagementWorkspaceSnapshotV1(preview);
}

export async function fetchLatestManagementWorkspaceSnapshotV1(
  accessToken: string,
): Promise<ManagementWorkspaceSnapshotV1 | null> {
  const revision = await fetchLatestManagementDraftRevision(accessToken);
  if (!revision) return null;

  const snapshot = await fetchManagementWorkspaceSnapshotV1(
    accessToken,
    revision.id,
  );

  if (
    snapshot.identity.requirementSetId !== revision.requirement_set_id
    || snapshot.identity.revisionVersion !== revision.version_number
  ) {
    throw new Error(
      'Workspace snapshot alınırken taslak revizyon değişti. Veriyi yenileyin.',
    );
  }

  return snapshot;
}
