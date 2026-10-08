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

export interface ManagementWorkspaceCardStateV1 {
  id: string;
  requirementId: string;
  blockIndex: number;
  durationPeriods: number;
  locked: boolean;
  baselineExists: boolean;
}

export interface ManagementWorkspaceRequirementCatalogStateV1 {
  requirementId: string;
  subjectId: string;
  subjectName: string;
  groupId: string;
  groupName: string;
  groupType: string;
  classCodes: string[];
  minDistinctDays: number | null;
  maxBlocksPerDay: number | null;
  maxConsecutivePeriods: number | null;
  courseCharacter: string | null;
  deliveryMode: string | null;
  teacherRequirement: string;
  baselineWeeklyLoad: number;
  baselinePreferredPartition: number[];
  baselineAllowedPartitions: number[][];
  baselineTermStatus: 'ACTIVE' | 'INACTIVE';
  baselineTeacherIds: string[];
  baselineTeacherMode: string;
  baselineTeacherAssignmentScope: 'REQUIREMENT' | 'BLOCK' | 'UNSPECIFIED';
  baselineTeacherContinuity: 'REQUIRED' | 'PREFERRED' | 'NONE';
  baselineResourceMode: string;
  baselineRoomIds: string[];
  baselineRequiredCapability: string | null;
}

export interface ManagementWorkspaceRequirementStructureStateV1 {
  requirementId: string;
  weeklyLoad: number;
  preferredPartition: number[];
  allowedPartitions: number[][];
  termStatus: 'ACTIVE' | 'INACTIVE';
}

export interface ManagementWorkspaceRequirementStructureBundleV1 {
  structure: ManagementWorkspaceRequirementStructureStateV1;
  cards: ManagementWorkspaceCardStateV1[];
  placements: ManagementWorkspacePlacementStateV1[];
}

export interface ManagementWorkspaceTeacherInventoryStateV1 {
  resourceType: 'TEACHER';
  resourceId: string;
  baselineDisplayName: string;
  displayName: string;
  operationalStatus: 'ACTIVE' | 'INACTIVE';
}

export interface ManagementWorkspaceTeacherPlanningStateV1 {
  teacherId: string;
  minimumLoad: number | null;
  targetLoad: number | null;
  maximumLoad: number | null;
}

export interface ManagementWorkspaceTeacherAvailabilityStateV1 {
  teacherId: string;
  unavailablePeriods: Array<{
    dayOfWeek: number;
    period: number;
  }>;
}

export interface ManagementWorkspaceRoomInventoryStateV1 {
  resourceType: 'ROOM';
  resourceId: string;
  baselineDisplayName: string;
  displayName: string;
  operationalStatus: 'ACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE';
}

export interface ManagementWorkspaceRoomProfileStateV1 {
  roomId: string;
  capabilities: string[];
  knowledgeStatus: 'CONFIRMED' | 'OBSERVED' | 'UNKNOWN';
}

export interface ManagementWorkspaceResourceLifecycleStateV1 {
  resourceType: 'TEACHER' | 'ROOM';
  resourceId: string;
  baselineExists: boolean;
  exists: boolean;
}

export interface ManagementWorkspaceResourceBundleV1 {
  lifecycle: ManagementWorkspaceResourceLifecycleStateV1;
  inventory: ManagementWorkspaceInventoryStateV1;
  teacherPlanning?: ManagementWorkspaceTeacherPlanningStateV1;
  teacherAvailability?: ManagementWorkspaceTeacherAvailabilityStateV1;
  roomProfile?: ManagementWorkspaceRoomProfileStateV1;
}

function normalizeWorkspaceRoomKnowledgeStatus(
  value: string | null | undefined,
): ManagementWorkspaceRoomProfileStateV1['knowledgeStatus'] {
  if (value === 'CONFIRMED' || value === 'OBSERVED') return value;
  return 'UNKNOWN';
}

export type ManagementWorkspaceInventoryStateV1 =
  | ManagementWorkspaceTeacherInventoryStateV1
  | ManagementWorkspaceRoomInventoryStateV1;

export interface ManagementWorkspaceRequirementTimePreferenceStateV1 {
  requirementId: string;
  preferredDays: number[];
  preferredStartPeriods: number[];
}

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
  cardsById: Record<string, ManagementWorkspaceCardStateV1>;
  requirementStructureById:
    Record<string, ManagementWorkspaceRequirementStructureStateV1>;
  requirementCatalogById:
    Record<string, ManagementWorkspaceRequirementCatalogStateV1>;
  requirementResourcesById:
    Record<string, ManagementWorkspaceRequirementResourceStateV1>;
  requirementTimePreferencesById:
    Record<string, ManagementWorkspaceRequirementTimePreferenceStateV1>;
  teacherInventoryById:
    Record<string, ManagementWorkspaceTeacherInventoryStateV1>;
  roomInventoryById:
    Record<string, ManagementWorkspaceRoomInventoryStateV1>;
  teacherPlanningById:
    Record<string, ManagementWorkspaceTeacherPlanningStateV1>;
  teacherAvailabilityById:
    Record<string, ManagementWorkspaceTeacherAvailabilityStateV1>;
  roomProfileById:
    Record<string, ManagementWorkspaceRoomProfileStateV1>;
  resourceLifecycleById:
    Record<string, ManagementWorkspaceResourceLifecycleStateV1>;
}

export interface ManagementWorkspacePlacementChangeV1 {
  cardId: string;
  before: ManagementWorkspacePlacementStateV1;
  after: ManagementWorkspacePlacementStateV1;
}

export interface ManagementWorkspaceRequirementStructureChangeV1 {
  requirementId: string;
  before: ManagementWorkspaceRequirementStructureStateV1;
  after: ManagementWorkspaceRequirementStructureStateV1;
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

export interface ManagementWorkspaceTeacherPlanningChangeV1 {
  teacherId: string;
  before: ManagementWorkspaceTeacherPlanningStateV1;
  after: ManagementWorkspaceTeacherPlanningStateV1;
}

export interface ManagementWorkspaceTeacherAvailabilityChangeV1 {
  teacherId: string;
  before: ManagementWorkspaceTeacherAvailabilityStateV1;
  after: ManagementWorkspaceTeacherAvailabilityStateV1;
}

export interface ManagementWorkspaceRoomProfileChangeV1 {
  roomId: string;
  before: ManagementWorkspaceRoomProfileStateV1;
  after: ManagementWorkspaceRoomProfileStateV1;
}

export interface ManagementWorkspaceResourceCreateV1 {
  resourceType: 'TEACHER' | 'ROOM';
  resourceId: string;
}

export interface ManagementWorkspaceResourceDeleteV1 {
  resourceType: 'TEACHER' | 'ROOM';
  resourceId: string;
}

export interface ManagementWorkspaceDiffV1 {
  baseline: ManagementWorkspaceSnapshotIdentityV1;
  hasChanges: boolean;
  dirtyCardIds: string[];
  dirtyRequirementIds: string[];
  dirtyResourceIds: string[];
  placementChanges: ManagementWorkspacePlacementChangeV1[];
  requirementStructureChanges:
    ManagementWorkspaceRequirementStructureChangeV1[];
  requirementResourceChanges:
    ManagementWorkspaceRequirementResourceChangeV1[];
  inventoryChanges: ManagementWorkspaceInventoryChangeV1[];
  teacherPlanningChanges: ManagementWorkspaceTeacherPlanningChangeV1[];
  teacherAvailabilityChanges: ManagementWorkspaceTeacherAvailabilityChangeV1[];
  roomProfileChanges: ManagementWorkspaceRoomProfileChangeV1[];
  resourceCreates: ManagementWorkspaceResourceCreateV1[];
  resourceDeletes: ManagementWorkspaceResourceDeleteV1[];
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

export function cloneManagementWorkspaceCardV1(
  card: ManagementWorkspaceCardStateV1,
): ManagementWorkspaceCardStateV1 {
  return { ...card };
}

export function cloneManagementWorkspaceRequirementStructureV1(
  value: ManagementWorkspaceRequirementStructureStateV1,
): ManagementWorkspaceRequirementStructureStateV1 {
  return {
    requirementId: value.requirementId,
    weeklyLoad: value.weeklyLoad,
    preferredPartition: [...value.preferredPartition],
    allowedPartitions: value.allowedPartitions.map((partition) => [...partition]),
    termStatus: value.termStatus,
  };
}

export function cloneManagementWorkspaceRequirementStructureBundleV1(
  value: ManagementWorkspaceRequirementStructureBundleV1,
): ManagementWorkspaceRequirementStructureBundleV1 {
  return {
    structure: cloneManagementWorkspaceRequirementStructureV1(value.structure),
    cards: value.cards
      .map(cloneManagementWorkspaceCardV1)
      .sort((a, b) => a.blockIndex - b.blockIndex || a.id.localeCompare(b.id)),
    placements: value.placements
      .map(cloneManagementWorkspacePlacementV1)
      .sort((a, b) => a.cardId.localeCompare(b.cardId)),
  };
}

function equalNumberArrays(left: number[], right: number[]) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function equalNumberMatrix(left: number[][], right: number[][]) {
  return left.length === right.length
    && left.every((partition, index) =>
      equalNumberArrays(partition, right[index] ?? []),
    );
}

function equalRequirementStructure(
  left: ManagementWorkspaceRequirementStructureStateV1,
  right: ManagementWorkspaceRequirementStructureStateV1,
) {
  return left.requirementId === right.requirementId
    && left.weeklyLoad === right.weeklyLoad
    && equalNumberArrays(left.preferredPartition, right.preferredPartition)
    && equalNumberMatrix(left.allowedPartitions, right.allowedPartitions)
    && left.termStatus === right.termStatus;
}

export function cloneManagementWorkspaceInventoryV1(
  value: ManagementWorkspaceInventoryStateV1,
): ManagementWorkspaceInventoryStateV1 {
  return { ...value };
}

export function cloneManagementWorkspaceResourceBundleV1(
  value: ManagementWorkspaceResourceBundleV1,
): ManagementWorkspaceResourceBundleV1 {
  return {
    lifecycle: { ...value.lifecycle },
    inventory: cloneManagementWorkspaceInventoryV1(value.inventory),
    teacherPlanning: value.teacherPlanning
      ? { ...value.teacherPlanning }
      : undefined,
    teacherAvailability: value.teacherAvailability
      ? cloneManagementWorkspaceTeacherAvailabilityV1(
          value.teacherAvailability,
        )
      : undefined,
    roomProfile: value.roomProfile
      ? cloneManagementWorkspaceRoomProfileV1(value.roomProfile)
      : undefined,
  };
}

export function cloneManagementWorkspaceTeacherPlanningV1(
  value: ManagementWorkspaceTeacherPlanningStateV1,
): ManagementWorkspaceTeacherPlanningStateV1 {
  return { ...value };
}

export function cloneManagementWorkspaceTeacherAvailabilityV1(
  value: ManagementWorkspaceTeacherAvailabilityStateV1,
): ManagementWorkspaceTeacherAvailabilityStateV1 {
  return {
    teacherId: value.teacherId,
    unavailablePeriods: value.unavailablePeriods
      .map((slot) => ({ ...slot }))
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period),
  };
}

function equalTeacherAvailability(
  left: ManagementWorkspaceTeacherAvailabilityStateV1,
  right: ManagementWorkspaceTeacherAvailabilityStateV1,
) {
  const a = cloneManagementWorkspaceTeacherAvailabilityV1(left);
  const b = cloneManagementWorkspaceTeacherAvailabilityV1(right);
  return JSON.stringify(a) === JSON.stringify(b);
}

export function cloneManagementWorkspaceRoomProfileV1(
  value: ManagementWorkspaceRoomProfileStateV1,
): ManagementWorkspaceRoomProfileStateV1 {
  return {
    roomId: value.roomId,
    capabilities: [...value.capabilities].sort((a, b) => a.localeCompare(b)),
    knowledgeStatus: value.knowledgeStatus,
  };
}

function equalRoomProfile(
  left: ManagementWorkspaceRoomProfileStateV1,
  right: ManagementWorkspaceRoomProfileStateV1,
) {
  return JSON.stringify(cloneManagementWorkspaceRoomProfileV1(left))
    === JSON.stringify(cloneManagementWorkspaceRoomProfileV1(right));
}

function equalTeacherPlanning(
  left: ManagementWorkspaceTeacherPlanningStateV1,
  right: ManagementWorkspaceTeacherPlanningStateV1,
) {
  return (
    left.teacherId === right.teacherId
    && left.minimumLoad === right.minimumLoad
    && left.targetLoad === right.targetLoad
    && left.maximumLoad === right.maximumLoad
  );
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

export function cloneManagementWorkspaceRequirementTimePreferenceV1(
  value: ManagementWorkspaceRequirementTimePreferenceStateV1,
): ManagementWorkspaceRequirementTimePreferenceStateV1 {
  return {
    requirementId: value.requirementId,
    preferredDays: [...value.preferredDays].sort((a, b) => a - b),
    preferredStartPeriods: [...value.preferredStartPeriods]
      .sort((a, b) => a - b),
  };
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

export function baselineCardsById(
  snapshot: ManagementWorkspaceSnapshotV1,
): Record<string, ManagementWorkspaceCardStateV1> {
  return Object.fromEntries(
    snapshot.cards.map((card) => [
      card.id,
      {
        id: card.id,
        requirementId: card.requirementId,
        blockIndex: card.blockIndex,
        durationPeriods: card.durationPeriods,
        locked: card.locked,
        baselineExists: true,
      },
    ]),
  );
}

export function baselineRequirementCatalogById(
  snapshot: ManagementWorkspaceSnapshotV1,
): Record<string, ManagementWorkspaceRequirementCatalogStateV1> {
  return Object.fromEntries(
    snapshot.requirements.map((requirement) => [
      requirement.id,
      {
        requirementId: requirement.id,
        subjectId: requirement.subjectId,
        subjectName: requirement.subjectName,
        groupId: requirement.groupId,
        groupName: requirement.groupName,
        groupType: requirement.groupType,
        classCodes: [],
        minDistinctDays: requirement.minDistinctDays,
        maxBlocksPerDay: requirement.maxBlocksPerDay,
        maxConsecutivePeriods: requirement.maxConsecutivePeriods,
        courseCharacter: requirement.courseCharacter,
        deliveryMode: requirement.deliveryMode,
        teacherRequirement: requirement.teacherRequirement,
        baselineWeeklyLoad: requirement.weeklyLoad,
        baselinePreferredPartition: [...(requirement.preferredPartition ?? [])],
        baselineAllowedPartitions: (requirement.allowedPartitions ?? [])
          .map((partition) => [...partition]),
        baselineTermStatus: 'ACTIVE' as const,
        baselineTeacherIds: snapshot.teacherPools
          .filter((entry) => entry.requirementId === requirement.id)
          .map((entry) => entry.teacherId)
          .sort((a, b) => a.localeCompare(b)),
        baselineTeacherMode: requirement.teacherMode,
        baselineTeacherAssignmentScope: normalizeTeacherAssignmentScope(
          requirement.teacherAssignmentScope,
        ),
        baselineTeacherContinuity: normalizeTeacherContinuity(
          requirement.teacherContinuity,
        ),
        baselineResourceMode: requirement.resourceMode,
        baselineRoomIds: snapshot.roomPools
          .filter((entry) => entry.requirementId === requirement.id)
          .map((entry) => entry.roomId)
          .sort((a, b) => a.localeCompare(b)),
        baselineRequiredCapability: requirement.requiredCapability,
      },
    ]),
  );
}

export function baselineRequirementStructureById(
  snapshot: ManagementWorkspaceSnapshotV1,
): Record<string, ManagementWorkspaceRequirementStructureStateV1> {
  return Object.fromEntries(
    snapshot.requirements.map((requirement) => [
      requirement.id,
      {
        requirementId: requirement.id,
        weeklyLoad: requirement.weeklyLoad,
        preferredPartition: [...(requirement.preferredPartition ?? [])],
        allowedPartitions: (requirement.allowedPartitions ?? [])
          .map((partition) => [...partition]),
        termStatus: 'ACTIVE' as const,
      },
    ]),
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
        baselineDisplayName: teacher.name,
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
        baselineDisplayName: room.name,
        displayName: room.name,
        operationalStatus: normalizeRoomOperationalStatus(
          room.operationalStatus,
        ),
      },
    ]),
  );
}

export function baselineTeacherPlanningById(
  snapshot: ManagementWorkspaceSnapshotV1,
): Record<string, ManagementWorkspaceTeacherPlanningStateV1> {
  const byTeacher = new Map(
    (snapshot.teacherLoadTargets ?? []).map((target) => [target.teacherId, target]),
  );

  return Object.fromEntries(
    snapshot.teachers.map((teacher) => {
      const target = byTeacher.get(teacher.id);
      return [
        teacher.id,
        {
          teacherId: teacher.id,
          minimumLoad: target?.minimumLoad ?? null,
          targetLoad: target?.targetLoad ?? null,
          maximumLoad: target?.maximumLoad ?? null,
        },
      ];
    }),
  );
}

export function baselineRoomProfileById(
  snapshot: ManagementWorkspaceSnapshotV1,
): Record<string, ManagementWorkspaceRoomProfileStateV1> {
  return Object.fromEntries(
    snapshot.rooms.map((room) => [
      room.id,
      cloneManagementWorkspaceRoomProfileV1({
        roomId: room.id,
        capabilities: room.capabilities,
        knowledgeStatus: normalizeWorkspaceRoomKnowledgeStatus(
          room.knowledgeStatus,
        ),
      }),
    ]),
  );
}

export function baselineTeacherAvailabilityById(
  snapshot: ManagementWorkspaceSnapshotV1,
): Record<string, ManagementWorkspaceTeacherAvailabilityStateV1> {
  const grouped = new Map<string, Array<{ dayOfWeek: number; period: number }>>();
  snapshot.teacherUnavailablePeriods.forEach((slot) => {
    const values = grouped.get(slot.teacherId) ?? [];
    values.push({ dayOfWeek: slot.dayOfWeek, period: slot.period });
    grouped.set(slot.teacherId, values);
  });

  return Object.fromEntries(
    snapshot.teachers.map((teacher) => [
      teacher.id,
      cloneManagementWorkspaceTeacherAvailabilityV1({
        teacherId: teacher.id,
        unavailablePeriods: grouped.get(teacher.id) ?? [],
      }),
    ]),
  );
}

export function baselineResourceLifecycleById(
  snapshot: ManagementWorkspaceSnapshotV1,
): Record<string, ManagementWorkspaceResourceLifecycleStateV1> {
  return Object.fromEntries([
    ...snapshot.teachers.map((teacher) => [
      teacher.id,
      {
        resourceType: 'TEACHER' as const,
        resourceId: teacher.id,
        baselineExists: true,
        exists: true,
      },
    ]),
    ...snapshot.rooms.map((room) => [
      room.id,
      {
        resourceType: 'ROOM' as const,
        resourceId: room.id,
        baselineExists: true,
        exists: true,
      },
    ]),
  ]);
}

export function hydrateManagementWorkspaceRequirementCatalogV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  rows: ReadonlyArray<{
    requirementId: string;
    subjectId: string;
    subjectName: string;
    groupId: string;
    groupName: string;
    groupType: string;
    classCodes: string[];
    weeklyLoad: number;
    preferredPartition: number[];
    allowedPartitions: number[][];
    minDistinctDays: number | null;
    maxBlocksPerDay: number | null;
    maxConsecutivePeriods: number | null;
    courseCharacter: string;
    deliveryMode: string;
    termStatus: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';
    teacherRequirement: string;
    teacherMode: string;
    teacherAssignmentScope: 'REQUIREMENT' | 'BLOCK' | 'UNSPECIFIED';
    teacherContinuity: 'REQUIRED' | 'PREFERRED' | 'NONE';
    teacherIds: string[];
    resourceMode: string;
    roomIds: string[];
    requiredCapability: string | null;
    preferredDays: number[];
    preferredStartPeriods: number[];
  }>,
) {
  rows.forEach((row) => {
    if (row.termStatus === 'UNKNOWN') return;

    workingCopy.requirementCatalogById[row.requirementId] = {
      requirementId: row.requirementId,
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      groupId: row.groupId,
      groupName: row.groupName,
      groupType: row.groupType,
      classCodes: [...row.classCodes],
      minDistinctDays: row.minDistinctDays,
      maxBlocksPerDay: row.maxBlocksPerDay,
      maxConsecutivePeriods: row.maxConsecutivePeriods,
      courseCharacter: row.courseCharacter,
      deliveryMode: row.deliveryMode,
      teacherRequirement: row.teacherRequirement,
      baselineWeeklyLoad: row.weeklyLoad,
      baselinePreferredPartition: [...row.preferredPartition],
      baselineAllowedPartitions: row.allowedPartitions.map(
        (partition) => [...partition],
      ),
      baselineTermStatus: row.termStatus,
      baselineTeacherIds: [...row.teacherIds].sort(
        (a, b) => a.localeCompare(b),
      ),
      baselineTeacherMode: row.teacherMode,
      baselineTeacherAssignmentScope: row.teacherAssignmentScope,
      baselineTeacherContinuity: row.teacherContinuity,
      baselineResourceMode: row.resourceMode,
      baselineRoomIds: [...row.roomIds].sort(
        (a, b) => a.localeCompare(b),
      ),
      baselineRequiredCapability: row.requiredCapability,
    };

    if (!workingCopy.requirementStructureById[row.requirementId]) {
      workingCopy.requirementStructureById[row.requirementId] = {
        requirementId: row.requirementId,
        weeklyLoad: row.weeklyLoad,
        preferredPartition: [...row.preferredPartition],
        allowedPartitions: row.allowedPartitions.map(
          (partition) => [...partition],
        ),
        termStatus: row.termStatus,
      };
    }

    workingCopy.requirementTimePreferencesById[row.requirementId] = {
      requirementId: row.requirementId,
      preferredDays: [...row.preferredDays].sort((a, b) => a - b),
      preferredStartPeriods: [...row.preferredStartPeriods]
        .sort((a, b) => a - b),
    };

    if (!workingCopy.requirementResourcesById[row.requirementId]) {
      workingCopy.requirementResourcesById[row.requirementId] = {
        requirementId: row.requirementId,
        teacherIds: [...row.teacherIds].sort((a, b) => a.localeCompare(b)),
        teacherMode: row.teacherMode,
        teacherAssignmentScope: row.teacherAssignmentScope,
        teacherContinuity: row.teacherContinuity,
        resourceMode: row.resourceMode,
        roomIds: [...row.roomIds].sort((a, b) => a.localeCompare(b)),
        requiredCapability: row.requiredCapability,
      };
    }
  });
}

export function hydrateManagementWorkspaceInventoryDisplayNamesV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  input: {
    teachers: readonly { id: string; name: string }[];
    rooms: readonly { id: string; name: string }[];
  },
) {
  input.teachers.forEach((teacher) => {
    const current = workingCopy.teacherInventoryById[teacher.id];
    if (!current) return;

    if (current.displayName === current.baselineDisplayName) {
      current.baselineDisplayName = teacher.name;
      current.displayName = teacher.name;
    }
  });

  input.rooms.forEach((room) => {
    const current = workingCopy.roomInventoryById[room.id];
    if (!current) return;

    if (current.displayName === current.baselineDisplayName) {
      current.baselineDisplayName = room.name;
      current.displayName = room.name;
    }
  });
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
    cardsById: baselineCardsById(snapshot),
    requirementStructureById: baselineRequirementStructureById(snapshot),
    requirementCatalogById: baselineRequirementCatalogById(snapshot),
    requirementResourcesById: baselineRequirementResourcesById(snapshot),
    requirementTimePreferencesById: {},
    teacherInventoryById: baselineTeacherInventoryById(snapshot),
    roomInventoryById: baselineRoomInventoryById(snapshot),
    teacherPlanningById: baselineTeacherPlanningById(snapshot),
    teacherAvailabilityById: baselineTeacherAvailabilityById(snapshot),
    roomProfileById: baselineRoomProfileById(snapshot),
    resourceLifecycleById: baselineResourceLifecycleById(snapshot),
  };
}

export function getManagementWorkspaceResourceBundleV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  resourceType: 'TEACHER' | 'ROOM',
  resourceId: string,
): ManagementWorkspaceResourceBundleV1 | null {
  const lifecycle = workingCopy.resourceLifecycleById[resourceId];
  if (!lifecycle || lifecycle.resourceType !== resourceType) return null;

  const inventory = resourceType === 'TEACHER'
    ? workingCopy.teacherInventoryById[resourceId]
    : workingCopy.roomInventoryById[resourceId];
  if (!inventory) return null;

  return cloneManagementWorkspaceResourceBundleV1({
    lifecycle,
    inventory,
    teacherPlanning: resourceType === 'TEACHER'
      ? workingCopy.teacherPlanningById[resourceId]
      : undefined,
    teacherAvailability: resourceType === 'TEACHER'
      ? workingCopy.teacherAvailabilityById[resourceId]
      : undefined,
    roomProfile: resourceType === 'ROOM'
      ? workingCopy.roomProfileById[resourceId]
      : undefined,
  });
}

export function applyManagementWorkspaceResourceBundleV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  resourceType: 'TEACHER' | 'ROOM',
  resourceId: string,
  bundle: ManagementWorkspaceResourceBundleV1 | null,
) {
  if (bundle === null) {
    delete workingCopy.resourceLifecycleById[resourceId];
    if (resourceType === 'TEACHER') {
      delete workingCopy.teacherInventoryById[resourceId];
      delete workingCopy.teacherPlanningById[resourceId];
      delete workingCopy.teacherAvailabilityById[resourceId];
    } else {
      delete workingCopy.roomInventoryById[resourceId];
      delete workingCopy.roomProfileById[resourceId];
    }
    return;
  }

  if (
    bundle.lifecycle.resourceType !== resourceType
    || bundle.lifecycle.resourceId !== resourceId
    || bundle.inventory.resourceType !== resourceType
    || bundle.inventory.resourceId !== resourceId
  ) {
    throw new Error('Workspace kaynak yaşam döngüsü paketi geçersiz.');
  }

  workingCopy.resourceLifecycleById[resourceId] = {
    ...bundle.lifecycle,
  };

  if (resourceType === 'TEACHER') {
    workingCopy.teacherInventoryById[resourceId] =
      cloneManagementWorkspaceInventoryV1(
        bundle.inventory,
      ) as ManagementWorkspaceTeacherInventoryStateV1;
    workingCopy.teacherPlanningById[resourceId] = bundle.teacherPlanning
      ? { ...bundle.teacherPlanning }
      : {
          teacherId: resourceId,
          minimumLoad: null,
          targetLoad: null,
          maximumLoad: null,
        };
    workingCopy.teacherAvailabilityById[resourceId] =
      bundle.teacherAvailability
        ? cloneManagementWorkspaceTeacherAvailabilityV1(
            bundle.teacherAvailability,
          )
        : {
            teacherId: resourceId,
            unavailablePeriods: [],
          };
    return;
  }

  workingCopy.roomInventoryById[resourceId] =
    cloneManagementWorkspaceInventoryV1(
      bundle.inventory,
    ) as ManagementWorkspaceRoomInventoryStateV1;
  workingCopy.roomProfileById[resourceId] = bundle.roomProfile
    ? cloneManagementWorkspaceRoomProfileV1(bundle.roomProfile)
    : {
        roomId: resourceId,
        capabilities: [],
        knowledgeStatus: 'UNKNOWN',
      };
}

export function createManagementWorkspaceResourceBundleV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  resourceType: 'TEACHER' | 'ROOM',
  resourceId: string,
  displayName: string,
): ManagementWorkspaceResourceBundleV1 {
  const name = displayName.trim();
  if (name.length === 0 || name.length > 120) {
    throw new Error('Kaynak adı 1–120 karakter olmalı.');
  }
  if (workingCopy.resourceLifecycleById[resourceId]) {
    throw new Error('Kaynak kimliği çalışma alanında zaten kullanılıyor.');
  }

  const sameNameExists = Object.values(
    resourceType === 'TEACHER'
      ? workingCopy.teacherInventoryById
      : workingCopy.roomInventoryById,
  ).some((resource) => (
    workingCopy.resourceLifecycleById[resource.resourceId]?.exists !== false
    && resource.displayName.trim().toLocaleLowerCase('tr-TR')
      === name.toLocaleLowerCase('tr-TR')
  ));
  if (sameNameExists) {
    throw new Error('Bu adla bir kaynak zaten var.');
  }

  if (resourceType === 'TEACHER') {
    return {
      lifecycle: {
        resourceType,
        resourceId,
        baselineExists: false,
        exists: true,
      },
      inventory: {
        resourceType,
        resourceId,
        baselineDisplayName: name,
        displayName: name,
        operationalStatus: 'ACTIVE',
      },
      teacherPlanning: {
        teacherId: resourceId,
        minimumLoad: null,
        targetLoad: null,
        maximumLoad: null,
      },
      teacherAvailability: {
        teacherId: resourceId,
        unavailablePeriods: [],
      },
    };
  }

  return {
    lifecycle: {
      resourceType,
      resourceId,
      baselineExists: false,
      exists: true,
    },
    inventory: {
      resourceType,
      resourceId,
      baselineDisplayName: name,
      displayName: name,
      operationalStatus: 'ACTIVE',
    },
    roomProfile: {
      roomId: resourceId,
      capabilities: [],
      knowledgeStatus: 'UNKNOWN',
    },
  };
}

export function getManagementWorkspaceRequirementStructureBundleV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requirementId: string,
): ManagementWorkspaceRequirementStructureBundleV1 | null {
  const structure = workingCopy.requirementStructureById[requirementId];
  if (!structure) return null;

  const cards = Object.values(workingCopy.cardsById)
    .filter((card) => card.requirementId === requirementId)
    .sort((a, b) => a.blockIndex - b.blockIndex || a.id.localeCompare(b.id));
  const placements = cards.map((card) => {
    const placement = workingCopy.placementsByCardId[card.id];
    if (!placement) {
      throw new Error(
        `Workspace kart yerleşimi eksik (${card.id}).`,
      );
    }
    return placement;
  });

  return cloneManagementWorkspaceRequirementStructureBundleV1({
    structure,
    cards,
    placements,
  });
}

export function applyManagementWorkspaceRequirementStructureBundleV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requirementId: string,
  bundle: ManagementWorkspaceRequirementStructureBundleV1,
) {
  if (bundle.structure.requirementId !== requirementId) {
    throw new Error('Ders yapısı paketi requirement kimliğiyle eşleşmiyor.');
  }

  const existingCardIds = Object.values(workingCopy.cardsById)
    .filter((card) => card.requirementId === requirementId)
    .map((card) => card.id);

  existingCardIds.forEach((cardId) => {
    delete workingCopy.cardsById[cardId];
    delete workingCopy.placementsByCardId[cardId];
  });

  workingCopy.requirementStructureById[requirementId] =
    cloneManagementWorkspaceRequirementStructureV1(bundle.structure);

  bundle.cards.forEach((card) => {
    if (card.requirementId !== requirementId) {
      throw new Error('Ders yapısı paketi farklı requirement kartı içeriyor.');
    }
    workingCopy.cardsById[card.id] =
      cloneManagementWorkspaceCardV1(card);
  });

  bundle.placements.forEach((placement) => {
    if (!workingCopy.cardsById[placement.cardId]) {
      throw new Error('Ders yapısı paketi bilinmeyen kart yerleşimi içeriyor.');
    }
    workingCopy.placementsByCardId[placement.cardId] =
      cloneManagementWorkspacePlacementV1(placement);
  });
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

export function setManagementWorkspaceTeacherPlanningV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  teacherId: string,
  input: {
    minimumLoad: number | null;
    targetLoad: number | null;
    maximumLoad: number | null;
  },
) {
  const current = workingCopy.teacherPlanningById[teacherId];
  if (!current) {
    throw new Error(
      `Workspace working copy öğretmen planlama girdisi bulunamadı (${teacherId}).`,
    );
  }

  const values = [input.minimumLoad, input.targetLoad, input.maximumLoad];
  values.forEach((value) => {
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > 60)) {
      throw new Error('Öğretmen yük hedefleri 0–60 arasında tam sayı olmalı.');
    }
  });
  if (
    input.minimumLoad !== null
    && input.targetLoad !== null
    && input.minimumLoad > input.targetLoad
  ) {
    throw new Error('Minimum yük hedef yükten büyük olamaz.');
  }
  if (
    input.targetLoad !== null
    && input.maximumLoad !== null
    && input.targetLoad > input.maximumLoad
  ) {
    throw new Error('Hedef yük maksimum yükten büyük olamaz.');
  }
  if (
    input.minimumLoad !== null
    && input.maximumLoad !== null
    && input.minimumLoad > input.maximumLoad
  ) {
    throw new Error('Minimum yük maksimum yükten büyük olamaz.');
  }

  workingCopy.teacherPlanningById[teacherId] = {
    teacherId,
    minimumLoad: input.minimumLoad,
    targetLoad: input.targetLoad,
    maximumLoad: input.maximumLoad,
  };
}

export function setManagementWorkspaceTeacherAvailabilityV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  teacherId: string,
  unavailablePeriods: Array<{ dayOfWeek: number; period: number }>,
) {
  if (!workingCopy.teacherAvailabilityById[teacherId]) {
    throw new Error(
      `Workspace working copy öğretmen uygunluk girdisi bulunamadı (${teacherId}).`,
    );
  }
  const seen = new Set<string>();
  unavailablePeriods.forEach((slot) => {
    if (
      !Number.isInteger(slot.dayOfWeek)
      || slot.dayOfWeek < 1
      || slot.dayOfWeek > 5
      || !Number.isInteger(slot.period)
      || slot.period < 1
      || slot.period > 12
    ) {
      throw new Error('Öğretmen uygunluk girdisi geçersiz.');
    }
    const key = `${slot.dayOfWeek}:${slot.period}`;
    if (seen.has(key)) throw new Error('Aynı uygun olmayan saat tekrarlanamaz.');
    seen.add(key);
  });
  workingCopy.teacherAvailabilityById[teacherId] =
    cloneManagementWorkspaceTeacherAvailabilityV1({
      teacherId,
      unavailablePeriods,
    });
}

export function setManagementWorkspaceRoomProfileV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  roomId: string,
  profile: Omit<ManagementWorkspaceRoomProfileStateV1, 'roomId'>,
) {
  if (!workingCopy.roomProfileById[roomId]) {
    throw new Error(`Workspace working copy salon profili bulunamadı (${roomId}).`);
  }
  workingCopy.roomProfileById[roomId] = cloneManagementWorkspaceRoomProfileV1({
    roomId,
    capabilities: profile.capabilities,
    knowledgeStatus: profile.knowledgeStatus,
  });
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
  const baselineCards = baselineCardsById(snapshot);
  const baselineTeacherInventory = baselineTeacherInventoryById(snapshot);
  const baselineRoomInventory = baselineRoomInventoryById(snapshot);
  const baselineTeacherPlanning = baselineTeacherPlanningById(snapshot);
  const baselineTeacherAvailability = baselineTeacherAvailabilityById(snapshot);
  const baselineRoomProfiles = baselineRoomProfileById(snapshot);
  const baselineResourceLifecycle = baselineResourceLifecycleById(snapshot);
  const catalogRequirementIds = new Set(
    Object.keys(workingCopy.requirementCatalogById),
  );

  Object.values(workingCopy.cardsById).forEach((card) => {
    if (!catalogRequirementIds.has(card.requirementId)) {
      throw new Error(
        `Workspace working copy bilinmeyen requirement kartı içeriyor (${card.id}).`,
      );
    }
    if (!workingCopy.placementsByCardId[card.id]) {
      throw new Error(
        `Workspace working copy kart yerleşimi eksik (${card.id}).`,
      );
    }
  });

  Object.keys(workingCopy.placementsByCardId).forEach((cardId) => {
    if (!workingCopy.cardsById[cardId]) {
      throw new Error(
        `Workspace working copy kart grafiğinde olmayan yerleşim içeriyor (${cardId}).`,
      );
    }
  });

  Object.keys(workingCopy.requirementStructureById).forEach((requirementId) => {
    if (!catalogRequirementIds.has(requirementId)) {
      throw new Error(
        `Workspace working copy bilinmeyen requirement yapısı içeriyor (${requirementId}).`,
      );
    }
  });

  Object.keys(workingCopy.requirementResourcesById).forEach((requirementId) => {
    if (!catalogRequirementIds.has(requirementId)) {
      throw new Error(
        `Workspace working copy bilinmeyen requirement içeriyor (${requirementId}).`,
      );
    }
  });

  const placementCardIds = Array.from(new Set([
    ...Object.keys(baselineCards),
    ...Object.keys(workingCopy.cardsById),
  ]));

  const placementChanges = placementCardIds
    .map((cardId) => {
      const currentCard = workingCopy.cardsById[cardId];
      const after = currentCard
        ? workingCopy.placementsByCardId[cardId]
        : emptyPlacement(cardId);
      if (!after) {
        throw new Error(
          `Workspace working copy kart durumu eksik (${cardId}).`,
        );
      }

      const before = baselineByCardId[cardId] ?? emptyPlacement(cardId);
      if (equalPlacement(before, after)) return null;

      return {
        cardId,
        before: cloneManagementWorkspacePlacementV1(before),
        after: cloneManagementWorkspacePlacementV1(after),
      };
    })
    .filter(
      (change): change is ManagementWorkspacePlacementChangeV1 =>
        change !== null,
    )
    .sort((left, right) => left.cardId.localeCompare(right.cardId));

  const requirementStructureChanges = Object.values(
    workingCopy.requirementCatalogById,
  )
    .map((catalog) => {
      const before: ManagementWorkspaceRequirementStructureStateV1 = {
        requirementId: catalog.requirementId,
        weeklyLoad: catalog.baselineWeeklyLoad,
        preferredPartition: [...catalog.baselinePreferredPartition],
        allowedPartitions: catalog.baselineAllowedPartitions.map(
          (partition) => [...partition],
        ),
        termStatus: catalog.baselineTermStatus,
      };
      const after =
        workingCopy.requirementStructureById[catalog.requirementId];
      if (!after) {
        throw new Error(
          `Workspace working copy requirement yapı durumu eksik (${catalog.requirementId}).`,
        );
      }
      if (equalRequirementStructure(before, after)) return null;
      return {
        requirementId: catalog.requirementId,
        before: cloneManagementWorkspaceRequirementStructureV1(before),
        after: cloneManagementWorkspaceRequirementStructureV1(after),
      };
    })
    .filter(
      (change): change is ManagementWorkspaceRequirementStructureChangeV1 =>
        change !== null,
    )
    .sort((left, right) =>
      left.requirementId.localeCompare(right.requirementId),
    );

  const requirementResourceChanges = Object.values(
    workingCopy.requirementCatalogById,
  )
    .map((catalog) => {
      const before: ManagementWorkspaceRequirementResourceStateV1 = {
        requirementId: catalog.requirementId,
        teacherIds: [...catalog.baselineTeacherIds],
        teacherMode: catalog.baselineTeacherMode,
        teacherAssignmentScope: catalog.baselineTeacherAssignmentScope,
        teacherContinuity: catalog.baselineTeacherContinuity,
        resourceMode: catalog.baselineResourceMode,
        roomIds: [...catalog.baselineRoomIds],
        requiredCapability: catalog.baselineRequiredCapability,
      };
      const after =
        workingCopy.requirementResourcesById[catalog.requirementId];

      if (!after) {
        throw new Error(
          `Workspace working copy requirement kaynak durumu eksik (${catalog.requirementId}).`,
        );
      }

      if (equalRequirementResource(before, after)) return null;

      return {
        requirementId: catalog.requirementId,
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
      const sourceBefore = baselineTeacherInventory[teacher.id];
      const after = workingCopy.teacherInventoryById[teacher.id];
      const lifecycle = workingCopy.resourceLifecycleById[teacher.id];
      if (!sourceBefore || !after || lifecycle?.exists === false) return [];

      const before: ManagementWorkspaceTeacherInventoryStateV1 = {
        ...sourceBefore,
        baselineDisplayName: after.baselineDisplayName,
        displayName: after.baselineDisplayName,
      };

      if (equalInventory(before, after)) return [];

      return [{
        resourceType: 'TEACHER' as const,
        resourceId: teacher.id,
        before: cloneManagementWorkspaceInventoryV1(before),
        after: cloneManagementWorkspaceInventoryV1(after),
      }];
    }),
    ...snapshot.rooms.flatMap((room) => {
      const sourceBefore = baselineRoomInventory[room.id];
      const after = workingCopy.roomInventoryById[room.id];
      const lifecycle = workingCopy.resourceLifecycleById[room.id];
      if (!sourceBefore || !after || lifecycle?.exists === false) return [];

      const before: ManagementWorkspaceRoomInventoryStateV1 = {
        ...sourceBefore,
        baselineDisplayName: after.baselineDisplayName,
        displayName: after.baselineDisplayName,
      };

      if (equalInventory(before, after)) return [];

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

  const teacherPlanningChanges = snapshot.teachers
    .map((teacher) => {
      const before = baselineTeacherPlanning[teacher.id];
      const after = workingCopy.teacherPlanningById[teacher.id];
      if (workingCopy.resourceLifecycleById[teacher.id]?.exists === false) {
        return null;
      }
      if (!before || !after) {
        throw new Error(
          `Workspace working copy öğretmen planlama durumu eksik (${teacher.id}).`,
        );
      }
      if (equalTeacherPlanning(before, after)) return null;

      return {
        teacherId: teacher.id,
        before: cloneManagementWorkspaceTeacherPlanningV1(before),
        after: cloneManagementWorkspaceTeacherPlanningV1(after),
      };
    })
    .filter(
      (change): change is ManagementWorkspaceTeacherPlanningChangeV1 =>
        change !== null,
    )
    .sort((left, right) => left.teacherId.localeCompare(right.teacherId));

  const teacherAvailabilityChanges = snapshot.teachers
    .map((teacher) => {
      const before = baselineTeacherAvailability[teacher.id];
      const after = workingCopy.teacherAvailabilityById[teacher.id];
      if (workingCopy.resourceLifecycleById[teacher.id]?.exists === false) {
        return null;
      }
      if (!before || !after) {
        throw new Error(
          `Workspace working copy öğretmen uygunluk durumu eksik (${teacher.id}).`,
        );
      }
      if (equalTeacherAvailability(before, after)) return null;
      return {
        teacherId: teacher.id,
        before: cloneManagementWorkspaceTeacherAvailabilityV1(before),
        after: cloneManagementWorkspaceTeacherAvailabilityV1(after),
      };
    })
    .filter(
      (change): change is ManagementWorkspaceTeacherAvailabilityChangeV1 =>
        change !== null,
    )
    .sort((left, right) => left.teacherId.localeCompare(right.teacherId));

  const roomProfileChanges = snapshot.rooms
    .map((room) => {
      const before = baselineRoomProfiles[room.id];
      const after = workingCopy.roomProfileById[room.id];
      if (workingCopy.resourceLifecycleById[room.id]?.exists === false) {
        return null;
      }
      if (!before || !after) {
        throw new Error(`Workspace working copy salon profili eksik (${room.id}).`);
      }
      if (equalRoomProfile(before, after)) return null;
      return {
        roomId: room.id,
        before: cloneManagementWorkspaceRoomProfileV1(before),
        after: cloneManagementWorkspaceRoomProfileV1(after),
      };
    })
    .filter(
      (change): change is ManagementWorkspaceRoomProfileChangeV1 =>
        change !== null,
    )
    .sort((left, right) => left.roomId.localeCompare(right.roomId));

  const resourceCreates: ManagementWorkspaceResourceCreateV1[] =
    Object.values(workingCopy.resourceLifecycleById)
      .filter((lifecycle) => !lifecycle.baselineExists && lifecycle.exists)
      .map((lifecycle) => ({
        resourceType: lifecycle.resourceType,
        resourceId: lifecycle.resourceId,
      }))
      .sort((left, right) =>
        left.resourceType.localeCompare(right.resourceType)
        || left.resourceId.localeCompare(right.resourceId),
      );

  const resourceDeletes: ManagementWorkspaceResourceDeleteV1[] =
    Object.values(workingCopy.resourceLifecycleById)
      .filter((lifecycle) => lifecycle.baselineExists && !lifecycle.exists)
      .map((lifecycle) => ({
        resourceType: lifecycle.resourceType,
        resourceId: lifecycle.resourceId,
      }))
      .sort((left, right) =>
        left.resourceType.localeCompare(right.resourceType)
        || left.resourceId.localeCompare(right.resourceId),
      );

  const structurallyDirtyCardIds = requirementStructureChanges.flatMap(
    (change) => [
      ...Object.values(baselineCards)
        .filter((card) => card.requirementId === change.requirementId)
        .map((card) => card.id),
      ...Object.values(workingCopy.cardsById)
        .filter((card) => card.requirementId === change.requirementId)
        .map((card) => card.id),
    ],
  );
  const dirtyCardIds = Array.from(new Set([
    ...placementChanges.map((change) => change.cardId),
    ...structurallyDirtyCardIds,
  ])).sort((left, right) => left.localeCompare(right));

  const dirtyRequirementIds = Array.from(new Set([
    ...requirementResourceChanges.map((change) => change.requirementId),
    ...requirementStructureChanges.map((change) => change.requirementId),
  ])).sort((left, right) => left.localeCompare(right));

  const dirtyResourceIds = Array.from(new Set([
    ...inventoryChanges.map((change) => change.resourceId),
    ...teacherPlanningChanges.map((change) => change.teacherId),
    ...teacherAvailabilityChanges.map((change) => change.teacherId),
    ...roomProfileChanges.map((change) => change.roomId),
    ...resourceCreates.map((change) => change.resourceId),
    ...resourceDeletes.map((change) => change.resourceId),
  ])).sort((left, right) => left.localeCompare(right));

  return {
    baseline: cloneIdentity(snapshot.identity),
    hasChanges:
      placementChanges.length > 0
      || requirementStructureChanges.length > 0
      || requirementResourceChanges.length > 0
      || inventoryChanges.length > 0
      || teacherPlanningChanges.length > 0
      || teacherAvailabilityChanges.length > 0
      || roomProfileChanges.length > 0
      || resourceCreates.length > 0
      || resourceDeletes.length > 0,
    dirtyCardIds,
    dirtyRequirementIds,
    dirtyResourceIds,
    placementChanges,
    requirementStructureChanges,
    requirementResourceChanges,
    inventoryChanges,
    teacherPlanningChanges,
    teacherAvailabilityChanges,
    roomProfileChanges,
    resourceCreates,
    resourceDeletes,
  };
}
