import type {
  ManagementResourceInventoryData,
} from '@/lib/managementResources';
import type {
  ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

export function projectManagementResourcesFromWorkspaceV1(
  resources: ManagementResourceInventoryData,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
): ManagementResourceInventoryData {
  return {
    ...resources,
    teachers: resources.teachers.map((teacher) => {
      const local = workingCopy.teacherInventoryById[teacher.id];
      const planning = workingCopy.teacherPlanningById?.[teacher.id];
      const availability = workingCopy.teacherAvailabilityById?.[teacher.id];
      if (!local && !planning && !availability) return teacher;

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
        operationalStatus: local?.operationalStatus ?? teacher.operationalStatus,
        minimumLoad: planning?.minimumLoad ?? teacher.minimumLoad,
        targetLoad: planning?.targetLoad ?? teacher.targetLoad,
        maximumLoad: planning?.maximumLoad ?? teacher.maximumLoad,
        loadConfigured: planning
          ? (
              planning.minimumLoad !== null
              || planning.targetLoad !== null
              || planning.maximumLoad !== null
            )
          : teacher.loadConfigured,
        unavailablePeriods: availability
          ? availability.unavailablePeriods.map((slot) => ({ ...slot }))
          : teacher.unavailablePeriods,
        unavailablePeriodCount: availability
          ? availability.unavailablePeriods.length
          : teacher.unavailablePeriodCount,
        availabilityConfigured: availability
          ? availability.unavailablePeriods.length > 0
          : teacher.availabilityConfigured,
      };
    }),
    rooms: resources.rooms.map((room) => {
      const local = workingCopy.roomInventoryById[room.id];
      if (!local) return room;

      return {
        ...room,
        name: local.displayName !== local.baselineDisplayName
          ? local.displayName
          : room.name,
        nameOverridden: (
          local.displayName !== local.baselineDisplayName
            ? local.displayName
            : room.name
        ) !== room.baseName,
        operationalStatus: local.operationalStatus,
      };
    }),
  };
}
