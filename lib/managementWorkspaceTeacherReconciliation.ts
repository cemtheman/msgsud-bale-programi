import type {
  ManagementCoordinatedTeacherAssignmentInput,
  ManagementCoordinatedTeacherConflict,
  ManagementCoordinatedTeacherPreview,
  ManagementTeacherReconciliationConflict,
  ManagementTeacherReconciliationPlacement,
  ManagementTeacherReconciliationPreview,
} from '@/lib/managementCoursePlan';
import type {
  ManagementWorkspaceSnapshotV1,
} from '@/lib/managementWorkspace';
import {
  previewManagementWorkspaceCommandsV1,
  type ManagementWorkspaceCommandV1,
} from '@/lib/managementWorkspaceCommands';
import type {
  ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

function teacherName(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  teacherId: string,
) {
  return workingCopy.teacherInventoryById[teacherId]?.displayName
    ?? teacherId;
}

function requirementCards(
  snapshot: ManagementWorkspaceSnapshotV1,
  requirementId: string,
) {
  return snapshot.cards
    .filter((card) => card.requirementId === requirementId)
    .sort((left, right) =>
      left.blockIndex - right.blockIndex
      || left.id.localeCompare(right.id),
    );
}

function reconciliationToken(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  assignments: ManagementCoordinatedTeacherAssignmentInput[],
) {
  const assignmentPart = [...assignments]
    .sort((left, right) =>
      left.requirementId.localeCompare(right.requirementId)
      || left.teacherId.localeCompare(right.teacherId),
    )
    .map((assignment) => {
      const placements = requirementCards(
        snapshot,
        assignment.requirementId,
      ).map((card) => {
        const placement = workingCopy.placementsByCardId[card.id];
        return [
          card.id,
          placement?.dayOfWeek ?? '',
          placement?.startPeriod ?? '',
          placement?.teacherId ?? '',
          placement?.roomId ?? '',
        ].join(':');
      }).join(',');
      return [
        assignment.requirementId,
        assignment.teacherId,
        placements,
      ].join('|');
    })
    .join('||');

  return [
    'LOCAL_TEACHER_RECONCILIATION_V1',
    snapshot.identity.revisionId,
    snapshot.identity.snapshotHash,
    assignmentPart,
  ].join('|');
}

function commandsForAssignments(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  assignments: ManagementCoordinatedTeacherAssignmentInput[],
) {
  const commands: ManagementWorkspaceCommandV1[] = [];

  assignments.forEach((assignment) => {
    requirementCards(snapshot, assignment.requirementId).forEach((card) => {
      const placement = workingCopy.placementsByCardId[card.id];
      if (
        !placement
        || placement.dayOfWeek === null
        || placement.startPeriod === null
        || placement.teacherId === assignment.teacherId
      ) return;

      commands.push({
        type: 'SET_PLACEMENT',
        placement: {
          ...placement,
          teacherId: assignment.teacherId,
        },
      });
    });
  });

  return commands;
}

function assignmentIsEligible(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requirementId: string,
  teacherId: string,
) {
  const requirement = workingCopy.requirementResourcesById[requirementId];
  const lifecycle = workingCopy.resourceLifecycleById[teacherId];
  const inventory = workingCopy.teacherInventoryById[teacherId];

  return Boolean(
    requirement
    && requirement.teacherIds.includes(teacherId)
    && lifecycle?.exists === true
    && inventory?.operationalStatus === 'ACTIVE',
  );
}

function conflictMetadata(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  leftCardId: string,
  rightCardId: string,
) {
  const leftCard = snapshot.cards.find((card) => card.id === leftCardId);
  const rightCard = snapshot.cards.find((card) => card.id === rightCardId);
  const leftRequirement = snapshot.requirements.find(
    (requirement) => requirement.id === leftCard?.requirementId,
  );
  const rightRequirement = snapshot.requirements.find(
    (requirement) => requirement.id === rightCard?.requirementId,
  );
  const leftPlacement = workingCopy.placementsByCardId[leftCardId];
  const rightPlacement = workingCopy.placementsByCardId[rightCardId];

  if (
    !leftCard
    || !rightCard
    || !leftRequirement
    || !rightRequirement
    || !leftPlacement
    || !rightPlacement
    || leftPlacement.dayOfWeek === null
    || leftPlacement.startPeriod === null
    || rightPlacement.dayOfWeek === null
    || rightPlacement.startPeriod === null
  ) return null;

  return {
    leftCard,
    rightCard,
    leftRequirement,
    rightRequirement,
    leftPlacement,
    rightPlacement,
  };
}

export function prepareManagementWorkspaceTeacherReconciliationV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requirementId: string,
  teacherId: string,
): {
  commands: ManagementWorkspaceCommandV1[];
  preview: ManagementTeacherReconciliationPreview;
} {
  const requirement = snapshot.requirements.find(
    (item) => item.id === requirementId,
  );
  if (!requirement) throw new Error('Ders gereksinimi bulunamadı.');

  const assignment = { requirementId, teacherId };
  const cards = requirementCards(snapshot, requirementId);
  const commands = commandsForAssignments(
    snapshot,
    workingCopy,
    [assignment],
  );
  const validation = previewManagementWorkspaceCommandsV1(
    snapshot,
    workingCopy,
    commands,
  );

  const eligible = assignmentIsEligible(
    workingCopy,
    requirementId,
    teacherId,
  );
  const blockReasons = [
    ...new Set([
      ...(eligible ? [] : ['TEACHER_NOT_ELIGIBLE']),
      ...validation.issues.map((issue) => issue.code),
    ]),
  ];

  const placements: ManagementTeacherReconciliationPlacement[] = cards
    .map((card) => {
      const placement = workingCopy.placementsByCardId[card.id];
      if (
        !placement
        || placement.dayOfWeek === null
        || placement.startPeriod === null
      ) return null;

      return {
        cardId: card.id,
        blockIndex: card.blockIndex,
        durationPeriods: card.durationPeriods,
        dayOfWeek: placement.dayOfWeek,
        startPeriod: placement.startPeriod,
        teacherId: placement.teacherId,
        teacherName: placement.teacherId
          ? teacherName(workingCopy, placement.teacherId)
          : null,
        roomId: placement.roomId,
        roomName: placement.roomId
          ? workingCopy.roomInventoryById[placement.roomId]?.displayName
            ?? placement.roomId
          : null,
        willChange: placement.teacherId !== teacherId,
      };
    })
    .filter(
      (placement): placement is ManagementTeacherReconciliationPlacement =>
        placement !== null,
    );

  const conflicts: ManagementTeacherReconciliationConflict[] =
    validation.issues
      .filter((issue) =>
        issue.code === 'TEACHER_CONFLICT'
        && issue.cardIds.length >= 2
        && issue.cardIds.some((cardId) =>
          cards.some((card) => card.id === cardId),
        ),
      )
      .map((issue) => {
        const targetCardId = issue.cardIds.find((cardId) =>
          cards.some((card) => card.id === cardId),
        ) ?? issue.cardIds[0];
        const blockingCardId =
          issue.cardIds.find((cardId) => cardId !== targetCardId)
          ?? issue.cardIds[1];
        const targetCard = snapshot.cards.find(
          (card) => card.id === targetCardId,
        );
        const targetPlacement =
          workingCopy.placementsByCardId[targetCardId];
        const blockingCard = snapshot.cards.find(
          (card) => card.id === blockingCardId,
        );
        const blockingRequirement = snapshot.requirements.find(
          (item) => item.id === blockingCard?.requirementId,
        );

        return {
          cardId: targetCardId,
          blockingCardId,
          subjectName: blockingRequirement?.subjectName ?? '',
          groupName: blockingRequirement?.groupName ?? '',
          dayOfWeek: targetPlacement?.dayOfWeek ?? issue.dayOfWeek ?? 0,
          startPeriod: targetPlacement?.startPeriod ?? 0,
          conflictType: 'TEACHER_CONFLICT',
        };
      });

  const distinctTeachers = new Set(
    placements.map((placement) => placement.teacherId).filter(Boolean),
  );

  return {
    commands,
    preview: {
      requirementId,
      revisionId: snapshot.identity.revisionId,
      subjectName: requirement.subjectName,
      groupName: requirement.groupName,
      teacherId,
      teacherName: teacherName(workingCopy, teacherId),
      placedBlockCount: placements.length,
      unplacedBlockCount: cards.length - placements.length,
      changedBlockCount: placements.filter(
        (placement) => placement.willChange,
      ).length,
      currentDistinctTeacherCount: distinctTeachers.size,
      placements,
      canApply: commands.length > 0
        && eligible
        && validation.applied,
      blockReasons: commands.length > 0
        ? blockReasons
        : ['NO_CHANGES'],
      conflicts,
      stateToken: reconciliationToken(
        snapshot,
        workingCopy,
        [assignment],
      ),
      preservesTime: true,
      preservesRoom: true,
      changesTeacherPool: false,
      previewOnly: true,
    },
  };
}

export function prepareManagementWorkspaceCoordinatedTeacherReconciliationV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  assignments: ManagementCoordinatedTeacherAssignmentInput[],
): {
  commands: ManagementWorkspaceCommandV1[];
  preview: ManagementCoordinatedTeacherPreview;
} {
  const normalized = [...assignments]
    .sort((left, right) =>
      left.requirementId.localeCompare(right.requirementId),
    );

  const duplicateRequirement = normalized.some(
    (assignment, index) =>
      index > 0
      && normalized[index - 1].requirementId === assignment.requirementId,
  );
  if (duplicateRequirement) {
    throw new Error('Aynı ders için birden fazla öğretmen kararı verilemez.');
  }

  const commands = commandsForAssignments(
    snapshot,
    workingCopy,
    normalized,
  );
  const validation = previewManagementWorkspaceCommandsV1(
    snapshot,
    workingCopy,
    commands,
  );
  const eligibilityFailures = normalized.filter(
    (assignment) => !assignmentIsEligible(
      workingCopy,
      assignment.requirementId,
      assignment.teacherId,
    ),
  );

  const summaries = normalized.map((assignment) => {
    const requirement = snapshot.requirements.find(
      (item) => item.id === assignment.requirementId,
    );
    if (!requirement) {
      throw new Error('Koordineli planda ders gereksinimi bulunamadı.');
    }
    const cards = requirementCards(snapshot, assignment.requirementId);
    const placements = cards
      .map((card) => workingCopy.placementsByCardId[card.id])
      .filter((placement) =>
        placement
        && placement.dayOfWeek !== null
        && placement.startPeriod !== null,
      );
    const currentDistinctTeacherCount = new Set(
      placements.map((placement) => placement?.teacherId).filter(Boolean),
    ).size;

    return {
      requirementId: assignment.requirementId,
      subjectName: requirement.subjectName,
      groupName: requirement.groupName,
      teacherId: assignment.teacherId,
      teacherName: teacherName(workingCopy, assignment.teacherId),
      placedBlockCount: placements.length,
      unplacedBlockCount: cards.length - placements.length,
      changedBlockCount: placements.filter(
        (placement) => placement?.teacherId !== assignment.teacherId,
      ).length,
      currentDistinctTeacherCount,
    };
  });

  const conflicts: ManagementCoordinatedTeacherConflict[] =
    validation.issues
      .filter((issue) =>
        issue.code === 'TEACHER_CONFLICT'
        && issue.cardIds.length >= 2,
      )
      .map((issue) => {
        const metadata = conflictMetadata(
          snapshot,
          workingCopy,
          issue.cardIds[0],
          issue.cardIds[1],
        );
        if (!metadata) return null;

        const teacherId =
          workingCopy.placementsByCardId[issue.cardIds[0]]?.teacherId
          ?? workingCopy.placementsByCardId[issue.cardIds[1]]?.teacherId
          ?? '';

        return {
          teacherId,
          dayOfWeek: metadata.leftPlacement.dayOfWeek,
          leftCardId: metadata.leftCard.id,
          leftRequirementId: metadata.leftRequirement.id,
          leftSubjectName: metadata.leftRequirement.subjectName,
          leftGroupName: metadata.leftRequirement.groupName,
          leftStartPeriod: metadata.leftPlacement.startPeriod,
          leftDurationPeriods: metadata.leftCard.durationPeriods,
          rightCardId: metadata.rightCard.id,
          rightRequirementId: metadata.rightRequirement.id,
          rightSubjectName: metadata.rightRequirement.subjectName,
          rightGroupName: metadata.rightRequirement.groupName,
          rightStartPeriod: metadata.rightPlacement.startPeriod,
          rightDurationPeriods: metadata.rightCard.durationPeriods,
          conflictType: 'TEACHER_CONFLICT' as const,
        };
      })
      .filter(
        (conflict): conflict is ManagementCoordinatedTeacherConflict =>
          conflict !== null,
      );

  const blockReasons = [
    ...new Set([
      ...(eligibilityFailures.length > 0
        ? ['TEACHER_NOT_ELIGIBLE']
        : []),
      ...validation.issues.map((issue) => issue.code),
    ]),
  ];

  return {
    commands,
    preview: {
      revisionId: snapshot.identity.revisionId,
      assignmentCount: normalized.length,
      assignments: summaries,
      placedBlockCount: summaries.reduce(
        (sum, summary) => sum + summary.placedBlockCount,
        0,
      ),
      unplacedBlockCount: summaries.reduce(
        (sum, summary) => sum + summary.unplacedBlockCount,
        0,
      ),
      changedBlockCount: summaries.reduce(
        (sum, summary) => sum + summary.changedBlockCount,
        0,
      ),
      canApply: commands.length > 0
        && eligibilityFailures.length === 0
        && validation.applied,
      blockReasons: commands.length > 0
        ? blockReasons
        : ['NO_CHANGES'],
      conflicts,
      stateToken: reconciliationToken(
        snapshot,
        workingCopy,
        normalized,
      ),
      preservesTime: true,
      preservesRoom: true,
      changesTeacherPools: false,
      evaluationMode: 'FINAL_COORDINATED_STATE',
      previewOnly: true,
    },
  };
}
