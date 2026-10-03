import type {
  ManagementWorkspaceSnapshotIdentityV1,
  ManagementWorkspaceSnapshotV1,
} from '@/lib/managementWorkspace';

export const MANAGEMENT_WORKSPACE_COPY_SCHEMA_VERSION =
  'management-workspace-copy-v1' as const;

export interface ManagementWorkspacePlacementStateV1 {
  cardId: string;
  dayOfWeek: number | null;
  startPeriod: number | null;
  teacherId: string | null;
  roomId: string | null;
}

export interface ManagementWorkspaceWorkingCopyV1 {
  schemaVersion: typeof MANAGEMENT_WORKSPACE_COPY_SCHEMA_VERSION;
  baseline: ManagementWorkspaceSnapshotIdentityV1;
  placementsByCardId: Record<string, ManagementWorkspacePlacementStateV1>;
}

export interface ManagementWorkspacePlacementChangeV1 {
  cardId: string;
  before: ManagementWorkspacePlacementStateV1;
  after: ManagementWorkspacePlacementStateV1;
}

export interface ManagementWorkspaceDiffV1 {
  baseline: ManagementWorkspaceSnapshotIdentityV1;
  hasChanges: boolean;
  dirtyCardIds: string[];
  placementChanges: ManagementWorkspacePlacementChangeV1[];
}

function cloneIdentity(
  identity: ManagementWorkspaceSnapshotIdentityV1,
): ManagementWorkspaceSnapshotIdentityV1 {
  return {
    revisionId: identity.revisionId,
    requirementSetId: identity.requirementSetId,
    revisionVersion: identity.revisionVersion,
    academicYear: identity.academicYear,
    term: identity.term,
    snapshotHash: identity.snapshotHash,
    baselineHash: identity.baselineHash,
  };
}

function emptyPlacement(cardId: string): ManagementWorkspacePlacementStateV1 {
  return {
    cardId,
    dayOfWeek: null,
    startPeriod: null,
    teacherId: null,
    roomId: null,
  };
}

function clonePlacement(
  placement: ManagementWorkspacePlacementStateV1,
): ManagementWorkspacePlacementStateV1 {
  return {
    cardId: placement.cardId,
    dayOfWeek: placement.dayOfWeek,
    startPeriod: placement.startPeriod,
    teacherId: placement.teacherId,
    roomId: placement.roomId,
  };
}

function equalPlacement(
  left: ManagementWorkspacePlacementStateV1,
  right: ManagementWorkspacePlacementStateV1,
) {
  return (
    left.cardId === right.cardId
    && left.dayOfWeek === right.dayOfWeek
    && left.startPeriod === right.startPeriod
    && left.teacherId === right.teacherId
    && left.roomId === right.roomId
  );
}

function baselinePlacementsByCardId(
  snapshot: ManagementWorkspaceSnapshotV1,
) {
  const result: Record<string, ManagementWorkspacePlacementStateV1> = {};

  snapshot.cards.forEach((card) => {
    result[card.id] = emptyPlacement(card.id);
  });

  snapshot.baselinePlacements.forEach((placement) => {
    if (result[placement.cardId] === undefined) {
      throw new Error(
        `Workspace working copy geçersiz: bilinmeyen kart yerleşimi (${placement.cardId}).`,
      );
    }

    result[placement.cardId] = {
      cardId: placement.cardId,
      dayOfWeek: placement.dayOfWeek,
      startPeriod: placement.startPeriod,
      teacherId: placement.teacherId,
      roomId: placement.roomId,
    };
  });

  return result;
}

function assertWorkingCopyMatchesSnapshot(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
) {
  const baseline = workingCopy.baseline;
  const identity = snapshot.identity;

  if (
    baseline.revisionId !== identity.revisionId
    || baseline.requirementSetId !== identity.requirementSetId
    || baseline.revisionVersion !== identity.revisionVersion
    || baseline.snapshotHash !== identity.snapshotHash
    || baseline.baselineHash !== identity.baselineHash
  ) {
    throw new Error(
      'Workspace working copy farklı bir baseline snapshot üzerinden oluşturulmuş.',
    );
  }
}

export function createManagementWorkspaceWorkingCopyV1(
  snapshot: ManagementWorkspaceSnapshotV1,
): ManagementWorkspaceWorkingCopyV1 {
  return {
    schemaVersion: MANAGEMENT_WORKSPACE_COPY_SCHEMA_VERSION,
    baseline: cloneIdentity(snapshot.identity),
    placementsByCardId: baselinePlacementsByCardId(snapshot),
  };
}

export function setManagementWorkspacePlacementV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  placement: ManagementWorkspacePlacementStateV1,
) {
  if (!workingCopy.placementsByCardId[placement.cardId]) {
    throw new Error(
      `Workspace working copy kartı bulunamadı (${placement.cardId}).`,
    );
  }

  workingCopy.placementsByCardId[placement.cardId] = clonePlacement(placement);
}

export function removeManagementWorkspacePlacementV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  cardId: string,
) {
  if (!workingCopy.placementsByCardId[cardId]) {
    throw new Error(
      `Workspace working copy kartı bulunamadı (${cardId}).`,
    );
  }

  workingCopy.placementsByCardId[cardId] = emptyPlacement(cardId);
}

export function diffManagementWorkspaceV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
): ManagementWorkspaceDiffV1 {
  assertWorkingCopyMatchesSnapshot(snapshot, workingCopy);

  const baselineByCardId = baselinePlacementsByCardId(snapshot);
  const snapshotCardIds = new Set(snapshot.cards.map((card) => card.id));
  const workingCardIds = Object.keys(workingCopy.placementsByCardId);

  workingCardIds.forEach((cardId) => {
    if (!snapshotCardIds.has(cardId)) {
      throw new Error(
        `Workspace working copy bilinmeyen kart içeriyor (${cardId}).`,
      );
    }
  });

  const placementChanges = snapshot.cards
    .map((card) => {
      const before = baselineByCardId[card.id];
      const after = workingCopy.placementsByCardId[card.id];

      if (!after) {
        throw new Error(
          `Workspace working copy kart durumu eksik (${card.id}).`,
        );
      }

      if (equalPlacement(before, after)) return null;

      return {
        cardId: card.id,
        before: clonePlacement(before),
        after: clonePlacement(after),
      };
    })
    .filter(
      (change): change is ManagementWorkspacePlacementChangeV1 =>
        change !== null,
    );

  const dirtyCardIds = placementChanges
    .map((change) => change.cardId)
    .sort((left, right) => left.localeCompare(right));

  return {
    baseline: cloneIdentity(snapshot.identity),
    hasChanges: placementChanges.length > 0,
    dirtyCardIds,
    placementChanges,
  };
}
