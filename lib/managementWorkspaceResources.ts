import type {
  ManagementPlacementResourcePreview,
  ManagementPlacementResourceType,
} from '@/lib/managementCommands';
import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  previewManagementWorkspaceCommandsV1,
  type ManagementWorkspaceCommandV1,
} from '@/lib/managementWorkspaceCommands';
import type {
  ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

export interface ManagementWorkspaceResourceEditPlanV1 {
  preview: ManagementPlacementResourcePreview;
  commands: ManagementWorkspaceCommandV1[];
}

function issueCodeToBlockReason(code: string) {
  if (code === 'TEACHER_INACTIVE') return 'RESOURCE_INACTIVE';
  if (code === 'ROOM_INACTIVE') return 'RESOURCE_INACTIVE';
  if (code === 'ROOM_CAPABILITY_MISMATCH') return 'CAPABILITY_MISMATCH';
  return code;
}

function stableToken(
  snapshot: ManagementWorkspaceSnapshotV1,
  cardIds: string[],
  resourceType: ManagementPlacementResourceType,
  resourceId: string,
) {
  return [
    'LOCAL_WORKSPACE_RESOURCE_V1',
    snapshot.identity.revisionId,
    snapshot.identity.snapshotHash,
    resourceType,
    resourceId,
    [...cardIds].sort((a, b) => a.localeCompare(b)).join(','),
  ].join('|');
}

function expandedCardIds(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requestedCardIds: string[],
  resourceType: ManagementPlacementResourceType,
) {
  const result = new Set(requestedCardIds);

  if (resourceType !== 'TEACHER') return [...result];

  const cardById = new Map(snapshot.cards.map((card) => [card.id, card]));
  const requirementById = new Map(
    snapshot.requirements.map((requirement) => [requirement.id, requirement]),
  );

  const requirementIds = new Set<string>();
  requestedCardIds.forEach((cardId) => {
    const card = cardById.get(cardId);
    if (!card) return;
    const requirement = requirementById.get(card.requirementId);
    if (
      requirement?.teacherAssignmentScope === 'REQUIREMENT'
      && requirement.teacherContinuity === 'REQUIRED'
    ) {
      requirementIds.add(requirement.id);
    }
  });

  snapshot.cards.forEach((card) => {
    if (!requirementIds.has(card.requirementId)) return;
    const placement = workingCopy.placementsByCardId[card.id];
    if (
      placement
      && placement.dayOfWeek !== null
      && placement.startPeriod !== null
    ) {
      result.add(card.id);
    }
  });

  return [...result];
}

export function prepareManagementWorkspaceResourceEditV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requestedCardIds: string[],
  resourceType: ManagementPlacementResourceType,
  resourceId: string,
): ManagementWorkspaceResourceEditPlanV1 {
  const cardById = new Map(snapshot.cards.map((card) => [card.id, card]));
  const normalizedRequested = Array.from(new Set(requestedCardIds))
    .filter((cardId) => cardById.has(cardId));

  const targetCardIds = expandedCardIds(
    snapshot,
    workingCopy,
    normalizedRequested,
    resourceType,
  );

  const commands: ManagementWorkspaceCommandV1[] = targetCardIds.flatMap((cardId) => {
    const placement = workingCopy.placementsByCardId[cardId];
    if (
      !placement
      || placement.dayOfWeek === null
      || placement.startPeriod === null
    ) {
      return [];
    }

    const nextTeacherId = resourceType === 'TEACHER'
      ? resourceId
      : placement.teacherId;
    const nextRoomId = resourceType === 'ROOM'
      ? resourceId
      : placement.roomId;

    if (
      nextTeacherId === placement.teacherId
      && nextRoomId === placement.roomId
    ) {
      return [];
    }

    return [{
      type: 'SET_PLACEMENT' as const,
      placement: {
        cardId,
        dayOfWeek: placement.dayOfWeek,
        startPeriod: placement.startPeriod,
        teacherId: nextTeacherId,
        roomId: nextRoomId,
      },
    }];
  });

  const validation = commands.length > 0
    ? previewManagementWorkspaceCommandsV1(
      snapshot,
      workingCopy,
      commands,
    )
    : { applied: true, operations: [], issues: [] };

  const resourceName = resourceType === 'TEACHER'
    ? snapshot.teachers.find((teacher) => teacher.id === resourceId)?.name
    : snapshot.rooms.find((room) => room.id === resourceId)?.name;

  const affectedRequirementCount = new Set(
    commands
      .map((command) => (
        command.type === 'SET_PLACEMENT'
          ? cardById.get(command.placement.cardId)?.requirementId ?? null
          : null
      ))
      .filter((value): value is string => Boolean(value)),
  ).size;

  const blockReasons = Array.from(new Set(
    validation.issues.map((issue) => issueCodeToBlockReason(issue.code)),
  ));

  return {
    commands,
    preview: {
      cardIds: targetCardIds,
      requestedCardIds: normalizedRequested,
      resourceType,
      resourceId,
      resourceName: resourceName ?? resourceId,
      hasChanges: commands.length > 0,
      canApply: commands.length > 0 && validation.applied,
      blockReasons: commands.length === 0 ? ['NO_CHANGES'] : blockReasons,
      conflicts: [],
      affectedCardCount: commands.length,
      affectedRequirementCount,
      poolExpansionCount: 0,
      outsidePlanningPoolCount: 0,
      requirementWideExpansionCount:
        Math.max(0, targetCardIds.length - normalizedRequested.length),
      planningPoolChanged: false,
      stateToken: stableToken(
        snapshot,
        targetCardIds,
        resourceType,
        resourceId,
      ),
    },
  };
}
