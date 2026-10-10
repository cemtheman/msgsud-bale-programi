import type {
  ManagementTeacherAssignmentScope,
  ManagementTeacherContinuity,
  ManagementTeacherPolicyPreview,
} from '@/lib/managementCoursePlan';
import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import type {
  ManagementWorkspaceRequirementResourceStateV1,
  ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

export interface ManagementWorkspaceTeacherPolicyPlanV1 {
  preview: ManagementTeacherPolicyPreview;
  resource: ManagementWorkspaceRequirementResourceStateV1;
}

function validPolicy(
  scope: ManagementTeacherAssignmentScope,
  continuity: ManagementTeacherContinuity,
) {
  return (
    (scope === 'REQUIREMENT' && continuity === 'REQUIRED')
    || (scope === 'BLOCK' && (continuity === 'PREFERRED' || continuity === 'NONE'))
    || (scope === 'UNSPECIFIED' && continuity === 'NONE')
  );
}

function stateToken(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requirementId: string,
  scope: ManagementTeacherAssignmentScope,
  continuity: ManagementTeacherContinuity,
) {
  const resource = workingCopy.requirementResourcesById[requirementId];
  const cardStates = Object.values(workingCopy.cardsById)
    .filter((card) => card.requirementId === requirementId)
    .sort((left, right) =>
      left.blockIndex - right.blockIndex || left.id.localeCompare(right.id),
    )
    .map((card) => {
      const placement = workingCopy.placementsByCardId[card.id];
      return [
        card.id,
        card.blockIndex,
        card.durationPeriods,
        card.locked,
        card.timePinned === true,
        card.teacherPinned === true,
        card.roomPinned === true,
        placement?.dayOfWeek ?? '',
        placement?.startPeriod ?? '',
        placement?.teacherId ?? '',
        placement?.roomId ?? '',
      ];
    });

  return [
    'LOCAL_TEACHER_POLICY_V2',
    snapshot.identity.revisionId,
    snapshot.identity.snapshotHash,
    requirementId,
    resource?.teacherAssignmentScope ?? '',
    resource?.teacherContinuity ?? '',
    workingCopy.requirementStructureById[requirementId]?.termStatus ?? '',
    scope,
    continuity,
    JSON.stringify(cardStates),
  ].join('|');
}

export function prepareManagementWorkspaceTeacherPolicyV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requirementId: string,
  scope: ManagementTeacherAssignmentScope,
  continuity: ManagementTeacherContinuity,
): ManagementWorkspaceTeacherPolicyPlanV1 {
  const requirement = workingCopy.requirementCatalogById[requirementId];
  const resource = workingCopy.requirementResourcesById[requirementId];

  if (!requirement || !resource) {
    throw new Error('Ders Planı öğretmen kuralı bulunamadı.');
  }

  if (!validPolicy(scope, continuity)) {
    throw new Error('Geçersiz öğretmen kuralı birleşimi.');
  }

  const teacherById = new Map(
    Object.values(workingCopy.teacherInventoryById)
      .map((teacher) => [teacher.resourceId, teacher.displayName]),
  );
  const placedBlocks = Object.values(workingCopy.cardsById)
    .filter((card) => card.requirementId === requirementId)
    .sort((left, right) =>
      left.blockIndex - right.blockIndex || left.id.localeCompare(right.id),
    )
    .flatMap((card) => {
      const placement = workingCopy.placementsByCardId[card.id];
      if (
        !placement
        || placement.dayOfWeek === null
        || placement.startPeriod === null
      ) {
        return [];
      }

      return [{
        cardId: card.id,
        blockIndex: card.blockIndex,
        durationPeriods: card.durationPeriods,
        dayOfWeek: placement.dayOfWeek,
        startPeriod: placement.startPeriod,
        teacherId: placement.teacherId,
        teacherName: placement.teacherId
          ? teacherById.get(placement.teacherId) ?? null
          : null,
        roomId: placement.roomId,
      }];
    });

  const distinctResolvedTeacherCount = new Set(
    placedBlocks
      .map((block) => block.teacherId)
      .filter((value): value is string => Boolean(value)),
  ).size;

  const canApply = !(
    scope === 'REQUIREMENT'
    && continuity === 'REQUIRED'
    && distinctResolvedTeacherCount > 1
  );

  const nextResource: ManagementWorkspaceRequirementResourceStateV1 = {
    ...resource,
    teacherAssignmentScope: scope,
    teacherContinuity: continuity,
  };

  return {
    resource: nextResource,
    preview: {
      requirementId,
      revisionId: snapshot.identity.revisionId,
      subjectName: requirement.subjectName,
      groupName: requirement.groupName,
      currentScope: resource.teacherAssignmentScope,
      currentContinuity: resource.teacherContinuity,
      proposedScope: scope,
      proposedContinuity: continuity,
      placedBlockCount: placedBlocks.length,
      distinctResolvedTeacherCount,
      placedBlocks,
      canApply,
      blockReasons: canApply
        ? []
        : ['Mevcut yerleşmiş bloklarda birden fazla öğretmen kullanılıyor.'],
      stateToken: stateToken(
        snapshot,
        workingCopy,
        requirementId,
        scope,
        continuity,
      ),
      candidateEnforcementActive: false,
      previewOnly: true,
    },
  };
}
