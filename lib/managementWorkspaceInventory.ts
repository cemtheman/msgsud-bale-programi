import type {
  ManagementResourceInventoryData,
} from '@/lib/managementResources';
import type {
  ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';
import type {
  ManagementWorkspaceSnapshotV1,
} from '@/lib/managementWorkspace';

export function projectManagementResourcesFromWorkspaceV1(
  resources: ManagementResourceInventoryData,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  snapshot?: ManagementWorkspaceSnapshotV1 | null,
): ManagementResourceInventoryData {
  const cardDurationById = new Map(
    snapshot?.cards.map((card) => [card.id, card.durationPeriods]) ?? [],
  );
  const teacherRequirementCount = (teacherId: string) =>
    Object.values(workingCopy.requirementResourcesById)
      .filter((resource) => resource.teacherIds.includes(teacherId)).length;
  const roomRequirementCount = (roomId: string) =>
    Object.values(workingCopy.requirementResourcesById)
      .filter((resource) => resource.roomIds.includes(roomId)).length;
  const teacherPlacements = (teacherId: string) =>
    Object.values(workingCopy.placementsByCardId)
      .filter((placement) => placement.teacherId === teacherId);
  const roomPlacements = (roomId: string) =>
    Object.values(workingCopy.placementsByCardId)
      .filter((placement) => placement.roomId === roomId);

  const existingTeachers = resources.teachers
    .filter((teacher) =>
      workingCopy.resourceLifecycleById[teacher.id]?.exists !== false
    )
    .map((teacher) => {
      const local = workingCopy.teacherInventoryById[teacher.id];
      const planning = workingCopy.teacherPlanningById?.[teacher.id];
      const availability = workingCopy.teacherAvailabilityById?.[teacher.id];
      if (!local && !planning && !availability) return teacher;

      const unavailableKeys = new Set(
        availability?.unavailablePeriods.map(
          (slot) => `${slot.dayOfWeek}:${slot.period}`,
        ) ?? [],
      );
      const unavailablePlacedBlockCount = snapshot && availability
        ? snapshot.cards.filter((card) => {
            const placement = workingCopy.placementsByCardId[card.id];
            if (
              !placement
              || placement.teacherId !== teacher.id
              || placement.dayOfWeek === null
              || placement.startPeriod === null
            ) return false;

            return Array.from(
              { length: card.durationPeriods },
              (_, offset) => placement.startPeriod! + offset,
            ).some((period) =>
              unavailableKeys.has(`${placement.dayOfWeek}:${period}`),
            );
          }).length
        : teacher.unavailablePlacedBlockCount;

      const localPlanningConfigured = Boolean(
        planning
        && (
          planning.minimumLoad !== null
          || planning.targetLoad !== null
          || planning.maximumLoad !== null
        ),
      );
      const baselineWasExplicit =
        teacher.loadTargetSource === 'EXPLICIT';

      const projectedMinimumLoad = planning
        ? (
            localPlanningConfigured
              ? planning.minimumLoad
              : baselineWasExplicit
                ? null
                : teacher.minimumLoad
          )
        : teacher.minimumLoad;
      const projectedTargetLoad = planning
        ? (
            localPlanningConfigured
              ? planning.targetLoad
              : baselineWasExplicit
                ? null
                : teacher.targetLoad
          )
        : teacher.targetLoad;
      const projectedMaximumLoad = planning
        ? (
            localPlanningConfigured
              ? planning.maximumLoad
              : baselineWasExplicit
                ? null
                : teacher.maximumLoad
          )
        : teacher.maximumLoad;
      const projectedLoadTargetSource = planning
        ? (
            localPlanningConfigured
              ? 'EXPLICIT' as const
              : baselineWasExplicit
                ? null
                : teacher.loadTargetSource
          )
        : teacher.loadTargetSource;

      return {
        ...teacher,
        name: local && local.displayName !== local.baselineDisplayName
          ? local.displayName
          : teacher.name,
        nameOverridden: (
          local && local.displayName !== local.baselineDisplayName
            ? local.displayName
            : teacher.name
        ) !== teacher.baseName,
        operationalStatus:
          local?.operationalStatus ?? teacher.operationalStatus,
        minimumLoad: projectedMinimumLoad,
        targetLoad: projectedTargetLoad,
        maximumLoad: projectedMaximumLoad,
        loadTargetSource: projectedLoadTargetSource,
        loadConfigured: projectedLoadTargetSource === 'EXPLICIT',
        unavailablePeriods: availability
          ? availability.unavailablePeriods.map((slot) => ({ ...slot }))
          : teacher.unavailablePeriods,
        unavailablePeriodCount: availability
          ? availability.unavailablePeriods.length
          : teacher.unavailablePeriodCount,
        availabilityConfigured: availability
          ? availability.unavailablePeriods.length > 0
          : teacher.availabilityConfigured,
        unavailablePlacedBlockCount,
      };
    });

  const createdTeachers = Object.values(workingCopy.teacherInventoryById)
    .filter((teacher) => {
      const lifecycle = workingCopy.resourceLifecycleById[teacher.resourceId];
      return Boolean(
        lifecycle
        && !lifecycle.baselineExists
        && lifecycle.exists,
      );
    })
    .map((teacher) => {
      const planning = workingCopy.teacherPlanningById[teacher.resourceId];
      const availability =
        workingCopy.teacherAvailabilityById[teacher.resourceId];
      const placements = teacherPlacements(teacher.resourceId);
      const unavailableKeys = new Set(
        availability?.unavailablePeriods.map(
          (slot) => `${slot.dayOfWeek}:${slot.period}`,
        ) ?? [],
      );
      const unavailablePlacedBlockCount = snapshot
        ? snapshot.cards.filter((card) => {
            const placement = workingCopy.placementsByCardId[card.id];
            if (
              !placement
              || placement.teacherId !== teacher.resourceId
              || placement.dayOfWeek === null
              || placement.startPeriod === null
            ) return false;
            return Array.from(
              { length: card.durationPeriods },
              (_, offset) => placement.startPeriod! + offset,
            ).some((period) =>
              unavailableKeys.has(`${placement.dayOfWeek}:${period}`),
            );
          }).length
        : 0;

      return {
        id: teacher.resourceId,
        name: teacher.displayName,
        baseName: teacher.displayName,
        nameOverridden: false,
        operationalStatus: teacher.operationalStatus,
        activeRequirementCount: teacherRequirementCount(teacher.resourceId),
        placedBlockCount: placements.length,
        actualLoadPeriods: placements.reduce(
          (sum, placement) =>
            sum + (cardDurationById.get(placement.cardId) ?? 0),
          0,
        ),
        minimumLoad: planning?.minimumLoad ?? null,
        targetLoad: planning?.targetLoad ?? null,
        maximumLoad: planning?.maximumLoad ?? null,
        loadTargetSource: (
          planning
          && (
            planning.minimumLoad !== null
            || planning.targetLoad !== null
            || planning.maximumLoad !== null
          )
        ) ? 'EXPLICIT' as const : null,
        loadConfigured: Boolean(
          planning
          && (
            planning.minimumLoad !== null
            || planning.targetLoad !== null
            || planning.maximumLoad !== null
          )
        ),
        unavailablePeriods:
          availability?.unavailablePeriods.map((slot) => ({ ...slot })) ?? [],
        unavailablePeriodCount:
          availability?.unavailablePeriods.length ?? 0,
        availabilityConfigured:
          (availability?.unavailablePeriods.length ?? 0) > 0,
        unavailablePlacedBlockCount,
      };
    });

  const existingRooms = resources.rooms
    .filter((room) =>
      workingCopy.resourceLifecycleById[room.id]?.exists !== false
    )
    .map((room) => {
      const local = workingCopy.roomInventoryById[room.id];
      const profile = workingCopy.roomProfileById?.[room.id];
      if (!local && !profile) return room;

      return {
        ...room,
        name: local && local.displayName !== local.baselineDisplayName
          ? local.displayName
          : room.name,
        nameOverridden: (
          local && local.displayName !== local.baselineDisplayName
            ? local.displayName
            : room.name
        ) !== room.baseName,
        operationalStatus:
          local?.operationalStatus ?? room.operationalStatus,
        capabilities: profile?.capabilities ?? room.capabilities,
        knowledgeStatus:
          profile?.knowledgeStatus ?? room.knowledgeStatus,
      };
    });

  const createdRooms = Object.values(workingCopy.roomInventoryById)
    .filter((room) => {
      const lifecycle = workingCopy.resourceLifecycleById[room.resourceId];
      return Boolean(
        lifecycle
        && !lifecycle.baselineExists
        && lifecycle.exists,
      );
    })
    .map((room) => {
      const profile = workingCopy.roomProfileById[room.resourceId];
      return {
        id: room.resourceId,
        name: room.displayName,
        baseName: room.displayName,
        nameOverridden: false,
        canonicalRoomId: null,
        canonicalRoomName: null,
        aliasCount: 0,
        knowledgeStatus: profile?.knowledgeStatus ?? 'UNKNOWN' as const,
        operationalStatus: room.operationalStatus,
        capabilities: profile?.capabilities ?? [],
        activeRequirementCount: roomRequirementCount(room.resourceId),
        placedBlockCount: roomPlacements(room.resourceId).length,
      };
    });

  return {
    ...resources,
    teachers: [...existingTeachers, ...createdTeachers]
      .sort((left, right) => left.name.localeCompare(right.name, 'tr')),
    rooms: [...existingRooms, ...createdRooms]
      .sort((left, right) => left.name.localeCompare(right.name, 'tr')),
  };
}
