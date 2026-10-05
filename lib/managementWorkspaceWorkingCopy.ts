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

export interface ManagementWorkspaceTeacherInventoryStateV1 {
  resourceType: 'TEACHER';
  resourceId: string;
  displayName: string;
  operationalStatus: 'ACTIVE' | 'INACTIVE';
}

export interface ManagementWorkspaceRoomInventoryStateV1 {
  resourceType: 'ROOM';
  resourceId: string;
  displayName: string;
  operationalStatus: 'ACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
}

export type ManagementWorkspaceInventoryStateV1 =
  | ManagementWorkspaceTeacherInventoryStateV1
  | ManagementWorkspaceRoomInventoryStateV1;

export interface ManagementWorkspaceRequirementResourceStateV1 {
  requirementId: string;
  teacherIds: string[];
  teacherMode: string;
  teacherAssignmentScope: 'REQUIREMENT' | 'BLOCK' | 'UNSPECIFIED';
  teacherContinuity: 'REQUIRED' | 'PREFERRED' | 'NONE';
  resourceMode: string;
  roomIds: string[];
  requiredCapability: string | null;
}

export interface ManagementWorkspaceWorkingCopyV1 {
  schemaVersion: typeof MANAGEMENT_WORKSPACE_COPY_SCHEMA_VERSION;
  baseline: ManagementWorkspaceSnapshotIdentityV1;
  placementsByCardId: Record<string, ManagementWorkspacePlacementStateV1>;
  requirementResourcesById:
    Record<string, ManagementWorkspaceRequirementResourceStateV1>;
  teacherInventoryById:
    Record<string, ManagementWorkspaceTeacherInventoryStateV1>;
  roomInventoryById:
    Record<string, ManagementWorkspaceRoomInventoryStateV1>;
}

export interface ManagementWorkspacePlacementChangeV1 {
  cardId: string;
  before: ManagementWorkspacePlacementStateV1;
  after: ManagementWorkspacePlacementStateV1;
}

export interface ManagementWorkspaceRequirementResourceChangeV1 {
  requirementId: string;
  before: ManagementWorkspaceRequirementResourceStateV1;
  after: ManagementWorkspaceRequirementResourceStateV1;
}

export interface ManagementWorkspaceInventoryChangeV1 {
  resourceType: 'TEACHER' | 'ROOM';
  resourceId: string;
  before: ManagementWorkspaceInventoryStateV1;
  after: ManagementWorkspaceInventoryStateV1;
}

export interface ManagementWorkspaceDiffV1 {
  baseline: ManagementWorkspaceSnapshotIdentityV1;
  hasChanges: boolean;
  dirtyCardIds: string[];
  dirtyRequirementIds: string[];
  dirtyResourceIds: string[];
  placementChanges: ManagementWorkspacePlacementChangeV1[];
  requirementResourceChanges:
    ManagementWorkspaceRequirementResourceChangeV1[];
  inventoryChanges: ManagementWorkspaceInventoryChangeV1[];
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

export function cloneManagementWorkspacePlacementV1(
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

export function cloneManagementWorkspaceInventoryV1(
  value: ManagementWorkspaceInventoryStateV1,
): ManagementWorkspaceInventoryStateV1 {
  return { ...value };
}

function normalizeTeacherOperationalStatus(
  value: string,
): ManagementWorkspaceTeacherInventoryStateV1['operationalStatus'] {
  if (value === 'ACTIVE' || value === 'INACTIVE') return value;
  throw new Error(
    `Workspace snapshot geçersiz öğretmen durumu içeriyor (${value}).`,
  );
}

function normalizeRoomOperationalStatus(
  value: string,
): ManagementWorkspaceRoomInventoryStateV1['operationalStatus'] {
  if (
    value === 'ACTIVE'
    || value === 'MAINTENANCE'
    || value === 'OUT_OF_SERVICE'
  ) return value;
  throw new Error(
    `Workspace snapshot geçersiz salon durumu içeriyor (${value}).`,
  );
}

function equalInventory(
  left: ManagementWorkspaceInventoryStateV1,
  right: ManagementWorkspaceInventoryStateV1,
) {
  return (
    left.resourceType === right.resourceType
    && left.resourceId === right.resourceId
    && left.displayName === right.displayName
    && left.operationalStatus === right.operationalStatus
  );
}

export function cloneManagementWorkspaceRequirementResourceV1(
  value: ManagementWorkspaceRequirementResourceStateV1,
): ManagementWorkspaceRequirementResourceStateV1 {
  return {
    requirementId: value.requirementId,
    teacherIds: [...value.teacherIds].sort((a, b) => a.localeCompare(b)),
    teacherMode: value.teacherMode,
    teacherAssignmentScope: value.teacherAssignmentScope,
    teacherContinuity: value.teacherContinuity,
    resourceMode: value.resourceMode,
    roomIds: [...value.roomIds].sort((a, b) => a.localeCompare(b)),
    requiredCapability: value.requiredCapability,
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

function normalizeTeacherAssignmentScope(
  value: string,
): ManagementWorkspaceRequirementResourceStateV1['teacherAssignmentScope'] {
  if (
    value === 'REQUIREMENT'
    || value === 'BLOCK'
    || value === 'UNSPECIFIED'
  ) {
    return value;
  }

  throw new Error(
    `Workspace snapshot geçersiz öğretmen kapsamı içeriyor (${value}).`,
  );
}

function normalizeTeacherContinuity(
  value: string,
): ManagementWorkspaceRequirementResourceStateV1['teacherContinuity'] {
  if (
    value === 'REQUIRED'
    || value === 'PREFERRED'
    || value === 'NONE'
  ) {
    return value;
  }

  throw new Error(
    `Workspace snapshot geçersiz öğretmen sürekliliği içeriyor (${value}).`,
  );
}

function equalStringArrays(left: string[], right: string[]) {
  if (left.length !== right.length) return false;

  const sortedLeft = [...left].sort((a, b) => a.localeCompare(b));
  const sortedRight = [...right].sort((a, b) => a.localeCompare(b));

  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function equalRequirementResource(
  left: ManagementWorkspaceRequirementResourceStateV1,
  right: ManagementWorkspaceRequirementResourceStateV1,
) {
  return (
    left.requirementId === right.requirementId
    && equalStringArrays(left.teacherIds, right.teacherIds)
    && left.teacherMode === right.teacherMode
    && left.teacherAssignmentScope === right.teacherAssignmentScope
    && left.teacherContinuity === right.teacherContinuity
    && left.resourceMode === right.resourceMode
    && equalStringArrays(left.roomIds, right.roomIds)
    && left.requiredCapability === right.requiredCapability
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

export function baselineRequirementResourcesById(
  snapshot: ManagementWorkspaceSnapshotV1,
): Record<string, ManagementWorkspaceRequirementResourceStateV1> {
  const teacherIdsByRequirement = new Map<string, string[]>();
  const roomIdsByRequirement = new Map<string, string[]>();

  snapshot.teacherPools.forEach((entry) => {
    const values = teacherIdsByRequirement.get(entry.requirementId) ?? [];
    values.push(entry.teacherId);
    teacherIdsByRequirement.set(entry.requirementId, values);
  });

  snapshot.roomPools.forEach((entry) => {
    const values = roomIdsByRequirement.get(entry.requirementId) ?? [];
    values.push(entry.roomId);
    roomIdsByRequirement.set(entry.requirementId, values);
  });

  return Object.fromEntries(
    snapshot.requirements.map((requirement) => [
      requirement.id,
      {
        requirementId: requirement.id,
        teacherIds: [
          ...(teacherIdsByRequirement.get(requirement.id) ?? []),
        ].sort((a, b) => a.localeCompare(b)),
        teacherMode: requirement.teacherMode,
        teacherAssignmentScope: normalizeTeacherAssignmentScope(
          requirement.teacherAssignmentScope,
        ),
        teacherContinuity: normalizeTeacherContinuity(
          requirement.teacherContinuity,
        ),
        resourceMode: requirement.resourceMode,
        roomIds: [
          ...(roomIdsByRequirement.get(requirement.id) ?? []),
        ].sort((a, b) => a.localeCompare(b)),
        requiredCapability: requirement.requiredCapability,
      } satisfies ManagementWorkspaceRequirementResourceStateV1,
    ]),
  );
}

export function baselineTeacherInventoryById(
  snapshot: ManagementWorkspaceSnapshotV1,
): Record<string, ManagementWorkspaceTeacherInventoryStateV1> {
  return Object.fromEntries(
    snapshot.teachers.map((teacher) => [
      teacher.id,
      {
        resourceType: 'TEACHER' as const,
        resourceId: teacher.id,
        displayName: teacher.name,
        operationalStatus: normalizeTeacherOperationalStatus(
          teacher.operationalStatus,
        ),
      },
    ]),
  );
}

export function baselineRoomInventoryById(
  snapshot: ManagementWorkspaceSnapshotV1,
): Record<string, ManagementWorkspaceRoomInventoryStateV1> {
  return Object.fromEntries(
    snapshot.rooms.map((room) => [
      room.id,
      {
        resourceType: 'ROOM' as const,
        resourceId: room.id,
        displayName: room.name,
        operationalStatus: normalizeRoomOperationalStatus(
          room.operationalStatus,
        ),
      },
    ]),
  );
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
    requirementResourcesById: baselineRequirementResourcesById(snapshot),
    teacherInventoryById: baselineTeacherInventoryById(snapshot),
    roomInventoryById: baselineRoomInventoryById(snapshot),
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

  workingCopy.placementsByCardId[placement.cardId] =
    cloneManagementWorkspacePlacementV1(placement);
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

export function setManagementWorkspaceTeacherInventoryV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  resourceId: string,
  input: {
    displayName?: string;
    operationalStatus?: 'ACTIVE' | 'INACTIVE';
  },
) {
  const current = workingCopy.teacherInventoryById[resourceId];
  if (!current) {
    throw new Error(
      `Workspace working copy öğretmeni bulunamadı (${resourceId}).`,
    );
  }

  const displayName = input.displayName === undefined
    ? current.displayName
    : input.displayName.trim();

  if (displayName.length === 0 || displayName.length > 120) {
    throw new Error('Öğretmen görünen adı 1–120 karakter olmalı.');
  }

  workingCopy.teacherInventoryById[resourceId] = {
    ...current,
    displayName,
    operationalStatus: input.operationalStatus ?? current.operationalStatus,
  };
}

export function setManagementWorkspaceRoomInventoryV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  resourceId: string,
  input: {
    displayName?: string;
    operationalStatus?: 'ACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
  },
) {
  const current = workingCopy.roomInventoryById[resourceId];
  if (!current) {
    throw new Error(
      `Workspace working copy salonu bulunamadı (${resourceId}).`,
    );
  }

  const displayName = input.displayName === undefined
    ? current.displayName
    : input.displayName.trim();

  if (displayName.length === 0 || displayName.length > 120) {
    throw new Error('Salon görünen adı 1–120 karakter olmalı.');
  }

  workingCopy.roomInventoryById[resourceId] = {
    ...current,
    displayName,
    operationalStatus: input.operationalStatus ?? current.operationalStatus,
  };
}

export function setManagementWorkspaceRequirementTeacherPolicyV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requirementId: string,
  input: {
    teacherAssignmentScope: 'REQUIREMENT' | 'BLOCK' | 'UNSPECIFIED';
    teacherContinuity: 'REQUIRED' | 'PREFERRED' | 'NONE';
  },
) {
  const current = workingCopy.requirementResourcesById[requirementId];
  if (!current) {
    throw new Error(
      `Workspace working copy requirement bulunamadı (${requirementId}).`,
    );
  }

  workingCopy.requirementResourcesById[requirementId] = {
    ...cloneManagementWorkspaceRequirementResourceV1(current),
    teacherAssignmentScope: input.teacherAssignmentScope,
    teacherContinuity: input.teacherContinuity,
  };
}

export function setManagementWorkspaceRequirementTeachersV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requirementId: string,
  teacherIds: string[],
) {
  const current = workingCopy.requirementResourcesById[requirementId];
  if (!current) {
    throw new Error(
      `Workspace working copy requirement bulunamadı (${requirementId}).`,
    );
  }

  const uniqueTeacherIds = Array.from(new Set(teacherIds))
    .sort((a, b) => a.localeCompare(b));

  workingCopy.requirementResourcesById[requirementId] = {
    ...cloneManagementWorkspaceRequirementResourceV1(current),
    teacherIds: uniqueTeacherIds,
    teacherMode: uniqueTeacherIds.length === 0
      ? 'UNKNOWN'
      : uniqueTeacherIds.length === 1
        ? 'FIXED'
        : 'ELIGIBLE_POOL',
  };
}

export function setManagementWorkspaceRequirementRoomsV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requirementId: string,
  input: {
    resourceMode: string;
    roomIds: string[];
    requiredCapability: string | null;
  },
) {
  const current = workingCopy.requirementResourcesById[requirementId];
  if (!current) {
    throw new Error(
      `Workspace working copy requirement bulunamadı (${requirementId}).`,
    );
  }

  const uniqueRoomIds = Array.from(new Set(input.roomIds))
    .sort((a, b) => a.localeCompare(b));

  workingCopy.requirementResourcesById[requirementId] = {
    ...cloneManagementWorkspaceRequirementResourceV1(current),
    resourceMode: input.resourceMode,
    roomIds: uniqueRoomIds,
    requiredCapability: input.requiredCapability,
  };
}

export function diffManagementWorkspaceV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
): ManagementWorkspaceDiffV1 {
  assertWorkingCopyMatchesSnapshot(snapshot, workingCopy);

  const baselineByCardId = baselinePlacementsByCardId(snapshot);
  const baselineResourcesById = baselineRequirementResourcesById(snapshot);
  const baselineTeacherInventory = baselineTeacherInventoryById(snapshot);
  const baselineRoomInventory = baselineRoomInventoryById(snapshot);
  const snapshotCardIds = new Set(snapshot.cards.map((card) => card.id));
  const snapshotRequirementIds = new Set(
    snapshot.requirements.map((requirement) => requirement.id),
  );

  Object.keys(workingCopy.placementsByCardId).forEach((cardId) => {
    if (!snapshotCardIds.has(cardId)) {
      throw new Error(
        `Workspace working copy bilinmeyen kart içeriyor (${cardId}).`,
      );
    }
  });

  Object.keys(workingCopy.requirementResourcesById).forEach((requirementId) => {
    if (!snapshotRequirementIds.has(requirementId)) {
      throw new Error(
        `Workspace working copy bilinmeyen requirement içeriyor (${requirementId}).`,
      );
    }
  });

  Object.keys(workingCopy.teacherInventoryById).forEach((resourceId) => {
    if (!baselineTeacherInventory[resourceId]) {
      throw new Error(
        `Workspace working copy bilinmeyen öğretmen içeriyor (${resourceId}).`,
      );
    }
  });

  Object.keys(workingCopy.roomInventoryById).forEach((resourceId) => {
    if (!baselineRoomInventory[resourceId]) {
      throw new Error(
        `Workspace working copy bilinmeyen salon içeriyor (${resourceId}).`,
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
        before: cloneManagementWorkspacePlacementV1(before),
        after: cloneManagementWorkspacePlacementV1(after),
      };
    })
    .filter(
      (change): change is ManagementWorkspacePlacementChangeV1 =>
        change !== null,
    )
    .sort((left, right) => left.cardId.localeCompare(right.cardId));

  const requirementResourceChanges = snapshot.requirements
    .map((requirement) => {
      const before = baselineResourcesById[requirement.id];
      const after = workingCopy.requirementResourcesById[requirement.id];

      if (!before || !after) {
        throw new Error(
          `Workspace working copy requirement kaynak durumu eksik (${requirement.id}).`,
        );
      }

      if (equalRequirementResource(before, after)) return null;

      return {
        requirementId: requirement.id,
        before: cloneManagementWorkspaceRequirementResourceV1(before),
        after: cloneManagementWorkspaceRequirementResourceV1(after),
      };
    })
    .filter(
      (
        change,
      ): change is ManagementWorkspaceRequirementResourceChangeV1 =>
        change !== null,
    )
    .sort((left, right) =>
      left.requirementId.localeCompare(right.requirementId),
    );

  const inventoryChanges: ManagementWorkspaceInventoryChangeV1[] = [
    ...snapshot.teachers.flatMap((teacher) => {
      const before = baselineTeacherInventory[teacher.id];
      const after = workingCopy.teacherInventoryById[teacher.id];
      if (!before || !after || equalInventory(before, after)) return [];
      return [{
        resourceType: 'TEACHER' as const,
        resourceId: teacher.id,
        before: cloneManagementWorkspaceInventoryV1(before),
        after: cloneManagementWorkspaceInventoryV1(after),
      }];
    }),
    ...snapshot.rooms.flatMap((room) => {
      const before = baselineRoomInventory[room.id];
      const after = workingCopy.roomInventoryById[room.id];
      if (!before || !after || equalInventory(before, after)) return [];
      return [{
        resourceType: 'ROOM' as const,
        resourceId: room.id,
        before: cloneManagementWorkspaceInventoryV1(before),
        after: cloneManagementWorkspaceInventoryV1(after),
      }];
    }),
  ].sort((left, right) =>
    left.resourceType.localeCompare(right.resourceType)
    || left.resourceId.localeCompare(right.resourceId),
  );

  const dirtyCardIds = placementChanges
    .map((change) => change.cardId)
    .sort((left, right) => left.localeCompare(right));

  const dirtyRequirementIds = requirementResourceChanges
    .map((change) => change.requirementId)
    .sort((left, right) => left.localeCompare(right));

  const dirtyResourceIds = inventoryChanges
    .map((change) => change.resourceId)
    .sort((left, right) => left.localeCompare(right));

  return {
    baseline: cloneIdentity(snapshot.identity),
    hasChanges:
      placementChanges.length > 0
      || requirementResourceChanges.length > 0
      || inventoryChanges.length > 0,
    dirtyCardIds,
    dirtyRequirementIds,
    dirtyResourceIds,
    placementChanges,
    requirementResourceChanges,
    inventoryChanges,
  };
}
