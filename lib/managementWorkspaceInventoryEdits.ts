import type {
  ManagementRoomOperationalStatus,
  ManagementRoomStatusPreview,
  ManagementTeacherOperationalStatus,
  ManagementTeacherDeparturePreview,
} from '@/lib/managementResources';
import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  previewManagementWorkspaceCommandsV1,
  type ManagementWorkspaceCommandV1,
} from '@/lib/managementWorkspaceCommands';
import type {
  ManagementWorkspaceInventoryStateV1,
  ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

export interface ManagementWorkspaceInventoryEditPlanV1 {
  command: ManagementWorkspaceCommandV1;
  resource: ManagementWorkspaceInventoryStateV1;
}

export function prepareManagementWorkspaceTeacherNameEditV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  teacherId: string,
  displayName: string,
): ManagementWorkspaceInventoryEditPlanV1 {
  const current = workingCopy.teacherInventoryById[teacherId];
  if (!current) throw new Error('Öğretmen kaynak kaydı bulunamadı.');

  const normalized = displayName.trim();
  if (normalized.length === 0 || normalized.length > 120) {
    throw new Error('Öğretmen görünen adı 1–120 karakter olmalı.');
  }

  const resource = {
    ...current,
    displayName: normalized,
  };

  return {
    resource,
    command: {
      type: 'SET_INVENTORY_RESOURCE',
      resource,
    },
  };
}

export function prepareManagementWorkspaceRoomNameEditV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  roomId: string,
  displayName: string,
): ManagementWorkspaceInventoryEditPlanV1 {
  const room = snapshot.rooms.find((item) => item.id === roomId);
  const current = workingCopy.roomInventoryById[roomId];

  if (!room || !current) throw new Error('Salon kaynak kaydı bulunamadı.');
  if (room.canonicalRoomId !== null) {
    throw new Error('Salon alias adları Kaynaklar ekranından değiştirilemez.');
  }

  const normalized = displayName.trim();
  if (normalized.length === 0 || normalized.length > 120) {
    throw new Error('Salon görünen adı 1–120 karakter olmalı.');
  }

  const resource = {
    ...current,
    displayName: normalized,
  };

  return {
    resource,
    command: {
      type: 'SET_INVENTORY_RESOURCE',
      resource,
    },
  };
}

export function prepareManagementWorkspaceTeacherStatusEditV1(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  teacherId: string,
  operationalStatus: ManagementTeacherOperationalStatus,
): ManagementWorkspaceInventoryEditPlanV1 {
  const current = workingCopy.teacherInventoryById[teacherId];
  if (!current) throw new Error('Öğretmen kaynak kaydı bulunamadı.');

  const resource = {
    ...current,
    operationalStatus,
  };

  return {
    resource,
    command: {
      type: 'SET_INVENTORY_RESOURCE',
      resource,
    },
  };
}

function roomFamilyIds(
  snapshot: ManagementWorkspaceSnapshotV1,
  roomId: string,
) {
  const room = snapshot.rooms.find((item) => item.id === roomId);
  if (!room) return [];

  const canonicalId = room.canonicalRoomId ?? room.id;
  return snapshot.rooms
    .filter((item) => (
      item.id === canonicalId
      || item.canonicalRoomId === canonicalId
    ))
    .map((item) => item.id);
}

export function prepareManagementWorkspaceRoomStatusEditV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  roomId: string,
  operationalStatus: ManagementRoomOperationalStatus,
): {
  plan: ManagementWorkspaceInventoryEditPlanV1;
  preview: ManagementRoomStatusPreview;
} {
  const room = snapshot.rooms.find((item) => item.id === roomId);
  const current = workingCopy.roomInventoryById[roomId];

  if (!room || !current) throw new Error('Salon kaynak kaydı bulunamadı.');
  if (room.canonicalRoomId !== null) {
    throw new Error('Salon alias kayıtlarının bağımsız çalışma durumu yoktur.');
  }

  const resource = {
    ...current,
    operationalStatus,
  };
  const command: ManagementWorkspaceCommandV1 = {
    type: 'SET_INVENTORY_RESOURCE',
    resource,
  };

  const validation = previewManagementWorkspaceCommandsV1(
    snapshot,
    workingCopy,
    [command],
  );

  const familyIds = new Set(roomFamilyIds(snapshot, roomId));
  const cardById = new Map(snapshot.cards.map((card) => [card.id, card]));
  const requirementById = new Map(
    snapshot.requirements.map((requirement) => [requirement.id, requirement]),
  );

  const placedImpacts = Object.values(workingCopy.placementsByCardId)
    .filter((placement) => (
      placement.dayOfWeek !== null
      && placement.startPeriod !== null
      && placement.roomId !== null
      && familyIds.has(placement.roomId)
    ))
    .map((placement) => {
      const card = cardById.get(placement.cardId);
      return {
        cardId: placement.cardId,
        requirementId: card?.requirementId ?? '',
        subjectName: card
          ? requirementById.get(card.requirementId)?.subjectName ?? ''
          : '',
        groupName: card
          ? requirementById.get(card.requirementId)?.groupName ?? ''
          : '',
        roomId: placement.roomId as string,
        dayOfWeek: placement.dayOfWeek as number,
        startPeriod: placement.startPeriod as number,
      };
    });

  const affectedRequirementIds = new Set<string>();
  snapshot.requirements.forEach((requirement) => {
    const localResource =
      workingCopy.requirementResourcesById[requirement.id] ?? null;
    const usesFamily = localResource?.roomIds.some((id) => familyIds.has(id))
      ?? snapshot.roomPools.some((entry) => (
        entry.requirementId === requirement.id
        && familyIds.has(entry.roomId)
      ));
    const capabilityMatch = (
      (localResource?.resourceMode ?? requirement.resourceMode) === 'CAPABILITY'
      && Boolean(localResource?.requiredCapability ?? requirement.requiredCapability)
      && room.capabilities.includes(
        (localResource?.requiredCapability ?? requirement.requiredCapability) as string,
      )
    );

    if (usesFamily || capabilityMatch) {
      affectedRequirementIds.add(requirement.id);
    }
  });

  const affectedCardIds = snapshot.cards
    .filter((card) => affectedRequirementIds.has(card.requirementId))
    .map((card) => card.id);

  const hasChanges = current.operationalStatus !== operationalStatus;
  const familyPlacementBlocked = (
    operationalStatus !== 'ACTIVE'
    && placedImpacts.length > 0
  );
  const canApply = (
    hasChanges
    && validation.applied
    && !familyPlacementBlocked
  );
  const blockReasons = hasChanges
    ? Array.from(new Set([
        ...validation.issues.map((issue) => issue.code),
        ...(familyPlacementBlocked ? ['ROOM_INACTIVE'] : []),
      ]))
    : ['NO_CHANGES'];

  const affectedRequirements = snapshot.requirements
    .filter((requirement) => affectedRequirementIds.has(requirement.id))
    .map((requirement) => ({
      requirementId: requirement.id,
      subjectName: requirement.subjectName,
      groupName: requirement.groupName,
      resourceMode:
        workingCopy.requirementResourcesById[requirement.id]?.resourceMode
        ?? requirement.resourceMode,
      requiredCapability:
        workingCopy.requirementResourcesById[requirement.id]?.requiredCapability
        ?? requirement.requiredCapability,
      explicitlyUsesRoom:
        workingCopy.requirementResourcesById[requirement.id]?.roomIds
          .some((id) => familyIds.has(id))
        ?? false,
    }));

  return {
    plan: { command, resource },
    preview: {
      roomId,
      revisionId: snapshot.identity.revisionId,
      roomName: current.displayName,
      currentStatus: current.operationalStatus,
      proposedStatus: operationalStatus,
      hasChanges,
      canApply,
      blockReasons,
      affectedRequirements,
      affectedRequirementCount: affectedRequirements.length,
      affectedCardIds,
      candidateRebuildCardCount: affectedCardIds.length,
      placedImpacts,
      placedImpactCount: placedImpacts.length,
      stateToken: [
        'LOCAL_ROOM_STATUS_V1',
        snapshot.identity.revisionId,
        snapshot.identity.snapshotHash,
        roomId,
        current.operationalStatus,
        operationalStatus,
        placedImpacts
          .map((item) => `${item.cardId}:${item.dayOfWeek}:${item.startPeriod}:${item.roomId}`)
          .sort()
          .join(','),
      ].join('|'),
    },
  };
}


function teacherDepartureStateToken(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  teacherId: string,
) {
  const teacher = workingCopy.teacherInventoryById[teacherId];
  if (!teacher) throw new Error('Öğretmen kaynak kaydı bulunamadı.');

  const requirementState = Object.values(workingCopy.requirementResourcesById)
    .filter((resource) => resource.teacherIds.includes(teacherId))
    .map((resource) => [
      resource.requirementId,
      resource.teacherMode,
      [...resource.teacherIds].sort().join(','),
    ].join(':'))
    .sort()
    .join('|');

  const placementState = Object.values(workingCopy.placementsByCardId)
    .filter((placement) => placement.teacherId === teacherId)
    .map((placement) => [
      placement.cardId,
      placement.dayOfWeek ?? '',
      placement.startPeriod ?? '',
      placement.roomId ?? '',
    ].join(':'))
    .sort()
    .join('|');

  return [
    'LOCAL_TEACHER_DEPARTURE_V1',
    snapshot.identity.revisionId,
    snapshot.identity.snapshotHash,
    teacherId,
    teacher.operationalStatus,
    requirementState,
    placementState,
  ].join('|');
}

export function previewManagementWorkspaceTeacherDepartureV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  teacherId: string,
): ManagementTeacherDeparturePreview {
  const teacher = workingCopy.teacherInventoryById[teacherId];
  if (!teacher) throw new Error('Öğretmen kaynak kaydı bulunamadı.');

  const affectedRequirementIds = Object.values(
    workingCopy.requirementResourcesById,
  )
    .filter((resource) => resource.teacherIds.includes(teacherId))
    .map((resource) => resource.requirementId);

  const placedBlockCount = Object.values(workingCopy.placementsByCardId)
    .filter((placement) => placement.teacherId === teacherId)
    .length;

  return {
    teacherId,
    teacherName: teacher.displayName,
    operationalStatus: teacher.operationalStatus,
    assignmentCount: affectedRequirementIds.length,
    activeRequirementCount: affectedRequirementIds.length,
    placedBlockCount,
    stateToken: teacherDepartureStateToken(snapshot, workingCopy, teacherId),
    publishedChanged: false,
  };
}

export function prepareManagementWorkspaceTeacherDepartureV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  teacherId: string,
  mode: 'INACTIVATE_KEEP' | 'INACTIVATE_CLEAR',
): {
  commands: ManagementWorkspaceCommandV1[];
  preview: ManagementTeacherDeparturePreview;
} {
  const teacher = workingCopy.teacherInventoryById[teacherId];
  if (!teacher) throw new Error('Öğretmen kaynak kaydı bulunamadı.');

  const preview = previewManagementWorkspaceTeacherDepartureV1(
    snapshot,
    workingCopy,
    teacherId,
  );

  const commands: ManagementWorkspaceCommandV1[] = [{
    type: 'SET_INVENTORY_RESOURCE',
    resource: {
      ...teacher,
      operationalStatus: 'INACTIVE',
    },
  }];

  if (mode === 'INACTIVATE_CLEAR') {
    Object.values(workingCopy.requirementResourcesById)
      .filter((resource) => resource.teacherIds.includes(teacherId))
      .sort((left, right) =>
        left.requirementId.localeCompare(right.requirementId),
      )
      .forEach((resource) => {
        const teacherIds = resource.teacherIds.filter(
          (id) => id !== teacherId,
        );
        commands.push({
          type: 'SET_REQUIREMENT_RESOURCES',
          resource: {
            ...resource,
            teacherIds,
            teacherMode: teacherIds.length === 0
              ? 'UNKNOWN'
              : teacherIds.length === 1
                ? 'FIXED'
                : 'ELIGIBLE_POOL',
          },
        });
      });

    Object.values(workingCopy.placementsByCardId)
      .filter((placement) => placement.teacherId === teacherId)
      .sort((left, right) => left.cardId.localeCompare(right.cardId))
      .forEach((placement) => {
        commands.push({
          type: 'SET_PLACEMENT',
          placement: {
            ...placement,
            teacherId: null,
          },
        });
      });
  }

  return { commands, preview };
}
