import type {
  ManagementSolverBaselineMetrics,
  ManagementSolverBaselinePlacement,
  ManagementSolverRequirement,
  ManagementSolverSubjectTimePreference,
  ManagementSolverTeacherLoadTarget,
  ManagementSolverWorkspace,
} from '@/lib/managementSolver';
import type {
  ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

function localWorkspaceSolverFingerprint(
  placements: ManagementSolverBaselinePlacement[],
  teacherLoadTargets: ManagementSolverTeacherLoadTarget[],
  subjectTimePreferences: ManagementSolverSubjectTimePreference[],
) {
  let hash = 2166136261;

  const text = [
    placements
      .map((placement) => [
        placement.cardId,
        placement.dayOfWeek ?? '',
        placement.startPeriod ?? '',
        placement.teacherId ?? '',
        placement.roomId ?? '',
      ].join('|'))
      .join(';'),
    teacherLoadTargets
      .map((target) => [
        target.teacherId,
        target.minimumLoad ?? '',
        target.targetLoad ?? '',
        target.maximumLoad ?? '',
      ].join('|'))
      .join(';'),
    subjectTimePreferences
      .map((preference) => [
        preference.requirementId,
        preference.preferredDays.join(','),
        preference.preferredStartPeriods.join(','),
      ].join('|'))
      .join(';'),
  ].join('||');

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function projectedBaselineMetrics(
  workspace: ManagementSolverWorkspace,
  placements: ManagementSolverBaselinePlacement[],
): ManagementSolverBaselineMetrics {
  const cardById = new Map(
    workspace.preview.cards.map((card) => [card.id, card]),
  );
  const requirementById = new Map(
    workspace.preview.requirements.map((requirement) => [
      requirement.id,
      requirement,
    ]),
  );
  const materialized = placements.filter(
    (placement): placement is ManagementSolverBaselinePlacement & {
      dayOfWeek: number;
      startPeriod: number;
    } => (
      placement.dayOfWeek != null
      && placement.startPeriod != null
      && cardById.has(placement.cardId)
    ),
  );

  const byRequirement = new Map<string, typeof materialized>();
  const byTeacherDay = new Map<string, typeof materialized>();

  for (const placement of materialized) {
    const card = cardById.get(placement.cardId);
    if (!card) continue;

    const requirementPlacements =
      byRequirement.get(card.requirementId) ?? [];
    requirementPlacements.push(placement);
    byRequirement.set(card.requirementId, requirementPlacements);

    if (placement.teacherId) {
      const key = `${placement.teacherId}|${placement.dayOfWeek}`;
      const teacherPlacements = byTeacherDay.get(key) ?? [];
      teacherPlacements.push(placement);
      byTeacherDay.set(key, teacherPlacements);
    }
  }

  let preferredTeacherContinuityBreaks = 0;
  let roomStabilityBreaks = 0;

  for (const requirement of requirementById.values()) {
    const assigned = byRequirement.get(requirement.id) ?? [];

    if (
      requirement.teacherAssignmentScope === 'BLOCK'
      && requirement.teacherContinuity === 'PREFERRED'
    ) {
      const teachers = new Set(
        assigned
          .map((placement) => placement.teacherId)
          .filter((teacherId): teacherId is string => teacherId != null),
      );
      preferredTeacherContinuityBreaks += Math.max(
        teachers.size - 1,
        0,
      );
    }

    const rooms = new Set(
      assigned
        .map((placement) => placement.roomId)
        .filter((roomId): roomId is string => roomId != null),
    );
    roomStabilityBreaks += Math.max(rooms.size - 1, 0);
  }

  let teacherIdleGapPeriods = 0;

  for (const assigned of byTeacherDay.values()) {
    let firstPeriod = Number.POSITIVE_INFINITY;
    let lastPeriod = Number.NEGATIVE_INFINITY;
    let occupiedPeriods = 0;

    for (const placement of assigned) {
      const card = cardById.get(placement.cardId);
      if (!card) continue;

      firstPeriod = Math.min(firstPeriod, placement.startPeriod);
      lastPeriod = Math.max(
        lastPeriod,
        placement.startPeriod + card.durationPeriods - 1,
      );
      occupiedPeriods += card.durationPeriods;
    }

    if (Number.isFinite(firstPeriod) && Number.isFinite(lastPeriod)) {
      teacherIdleGapPeriods += Math.max(
        lastPeriod - firstPeriod + 1 - occupiedPeriods,
        0,
      );
    }
  }

  return {
    cardCount: workspace.preview.cards.length,
    placedCardCount: materialized.length,
    unplacedCardCount:
      workspace.preview.cards.length - materialized.length,
    lockedCardCount: workspace.preview.cards.filter(
      (card) => card.locked,
    ).length,
    changeCost: 0,
    preferredTeacherContinuityBreaks,
    teacherIdleGapPeriods,
    roomStabilityBreaks,
  };
}

/**
 * Projects local solver-relevant workspace edits into the solver snapshot.
 *
 * Placement, teacher load targets and subject time preferences become the
 * local source of truth before the main Save. Requirement lifecycle/structure
 * and broader resource-policy projection remain outside this adapter for now.
 */
export function projectManagementSolverWorkspacePlacementsV1(
  workspace: ManagementSolverWorkspace,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  localVersion: number,
): ManagementSolverWorkspace {
  const baselinePlacements = workspace.preview.cards
    .map((card): ManagementSolverBaselinePlacement => {
      const local = workingCopy.placementsByCardId[card.id];

      return local
        ? {
            cardId: card.id,
            dayOfWeek: local.dayOfWeek,
            startPeriod: local.startPeriod,
            teacherId: local.teacherId,
            roomId: local.roomId,
          }
        : {
            cardId: card.id,
            dayOfWeek: null,
            startPeriod: null,
            teacherId: null,
            roomId: null,
          };
    })
    .sort((left, right) => left.cardId.localeCompare(right.cardId));

  const teacherLoadTargets = Object.values(
    workingCopy.teacherPlanningById,
  )
    .filter((planning) => (
      planning.minimumLoad != null
      || planning.targetLoad != null
      || planning.maximumLoad != null
    ))
    .map((planning): ManagementSolverTeacherLoadTarget => ({
      teacherId: planning.teacherId,
      minimumLoad: planning.minimumLoad,
      targetLoad: planning.targetLoad,
      maximumLoad: planning.maximumLoad,
    }))
    .sort((left, right) => left.teacherId.localeCompare(right.teacherId));

  const subjectTimePreferences = Object.values(
    workingCopy.requirementTimePreferencesById,
  )
    .filter((preference) => (
      preference.preferredDays.length > 0
      || preference.preferredStartPeriods.length > 0
    ))
    .map((preference): ManagementSolverSubjectTimePreference => ({
      requirementId: preference.requirementId,
      preferredDays: [...preference.preferredDays].sort((a, b) => a - b),
      preferredStartPeriods: [...preference.preferredStartPeriods]
        .sort((a, b) => a - b),
    }))
    .sort((left, right) =>
      left.requirementId.localeCompare(right.requirementId),
    );

  const fingerprint = localWorkspaceSolverFingerprint(
    baselinePlacements,
    teacherLoadTargets,
    subjectTimePreferences,
  );
  const localBaselineHash =
    `local-${workspace.revisionId}-${localVersion}-${fingerprint}`;

  return {
    ...workspace,
    preview: {
      ...workspace.preview,
      snapshotVersion: `${workspace.preview.snapshotVersion}-LOCAL`,
      snapshotHash:
        `${workspace.preview.snapshotHash}:${localBaselineHash}`,
      baselineHash: localBaselineHash,
      baselinePlacements,
      teacherLoadTargets,
      subjectTimePreferences,
      baselineMetrics: projectedBaselineMetrics(
        workspace,
        baselinePlacements,
      ),
    },
  };
}
