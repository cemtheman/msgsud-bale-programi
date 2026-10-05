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
      if (!local) return teacher;

      return {
        ...teacher,
        name: local.displayName !== local.baselineDisplayName
          ? local.displayName
          : teacher.name,
        nameOverridden: (
          local.displayName !== local.baselineDisplayName
            ? local.displayName
            : teacher.name
        ) !== teacher.baseName,
        operationalStatus: local.operationalStatus,
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
