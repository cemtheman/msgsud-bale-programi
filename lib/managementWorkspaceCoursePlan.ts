import type {
  ManagementCoursePlanData,
} from '@/lib/managementCoursePlan';
import type {
  ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

export function projectManagementCoursePlanFromWorkspaceV1(
  coursePlan: ManagementCoursePlanData,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
): ManagementCoursePlanData {
  const teacherNames = new Map(
    coursePlan.teacherOptions.map((option) => [option.id, option.name]),
  );
  const roomNames = new Map(
    coursePlan.roomOptions.map((option) => [option.id, option.name]),
  );

  return {
    ...coursePlan,
    rows: coursePlan.rows.map((row) => {
      const resource =
        workingCopy.requirementResourcesById[row.requirementId] ?? null;

      if (!resource) return row;

      return {
        ...row,
        teacherMode: resource.teacherMode,
        teacherAssignmentScope: resource.teacherAssignmentScope,
        teacherContinuity: resource.teacherContinuity,
        teacherIds: [...resource.teacherIds],
        teacherNames: resource.teacherIds.map(
          (id) => teacherNames.get(id) ?? 'Bilinmeyen öğretmen',
        ),
        resourceMode: resource.resourceMode,
        roomIds: [...resource.roomIds],
        roomNames: resource.roomIds.map(
          (id) => roomNames.get(id) ?? 'Bilinmeyen salon',
        ),
        requiredCapability: resource.requiredCapability,
      };
    }),
  };
}
