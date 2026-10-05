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
  const cardStates = snapshot.cards
    .filter((card) => card.requirementId === requirementId)
    .sort((left, right) => left.blockIndex - right.blockIndex)
    .map((card) => {
      const placement = workingCopy.placementsByCardId[card.id];
      return [
        card.id,
        placement?.dayOfWeek ?? '',
        placement?.startPeriod ?? '',
        placement?.teacherId ?? '',
        placement?.roomId ?? '',
      ].join(':');
    })
    .join(',');

  return [
    'LOCAL_TEACHER_POLICY_V1',
    snapshot.identity.revisionId,
    snapshot.identity.snapshotHash,
    requirementId,
    resource?.teacherAssignmentScope ?? '',
    resource?.teacherContinuity ?? '',
    scope,
    continuity,
    cardStates,
  ].join('|');
}

export function prepareManagementWorkspaceTeacherPolicyV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requirementId: string,
  scope: ManagementTeacherAssignmentScope,
  continuity: ManagementTeacherContinuity,
): ManagementWorkspaceTeacherPolicyPlanV1 {
  const requirement = snapshot.requirements.find(
    (item) => item.id === requirementId,
  );
  const resource = workingCopy.requirementResourcesById[requirementId];

  if (!requirement || !resource) {
    throw new Error('Ders Planı öğretmen kuralı bulunamadı.');
  }

  if (!validPolicy(scope, continuity)) {
    throw new Error('Geçersiz öğretmen kuralı birleşimi.');
  }

  const teacherById = new Map(
    snapshot.teachers.map((teacher) => [teacher.id, teacher.name]),
  );

  const roomById = new Map(
    snapshot.rooms.map((room) => [room.id, room.name]),
  );

  const placedBlocks = snapshot.cards
    .filter((card) => card.requirementId === requirementId)
    .sort((left, right) => left.blockIndex - right.blockIndex)
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
