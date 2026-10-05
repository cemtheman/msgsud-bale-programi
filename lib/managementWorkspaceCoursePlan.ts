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
  const serverTeacherIds = new Set(
    coursePlan.teacherOptions.map((option) => option.id),
  );
  const teacherOptions = [
    ...coursePlan.teacherOptions
      .filter((option) =>
        workingCopy.resourceLifecycleById[option.id]?.exists !== false
      )
      .map((option) => ({
        ...option,
        name:
          workingCopy.teacherInventoryById[option.id]?.displayName
          ?? option.name,
      })),
    ...Object.values(workingCopy.teacherInventoryById)
      .filter((resource) => {
        const lifecycle =
          workingCopy.resourceLifecycleById[resource.resourceId];
        return Boolean(
          lifecycle
          && lifecycle.exists
          && !lifecycle.baselineExists
          && !serverTeacherIds.has(resource.resourceId),
        );
      })
      .map((resource) => ({
        id: resource.resourceId,
        name: resource.displayName,
      })),
  ].sort((left, right) => left.name.localeCompare(right.name, 'tr'));

  const serverRoomIds = new Set(
    coursePlan.roomOptions.map((option) => option.id),
  );
  const roomOptions = [
    ...coursePlan.roomOptions
      .filter((option) =>
        workingCopy.resourceLifecycleById[option.id]?.exists !== false
      )
      .map((option) => ({
        ...option,
        name:
          workingCopy.roomInventoryById[option.id]?.displayName
          ?? option.name,
      })),
    ...Object.values(workingCopy.roomInventoryById)
      .filter((resource) => {
        const lifecycle =
          workingCopy.resourceLifecycleById[resource.resourceId];
        return Boolean(
          lifecycle
          && lifecycle.exists
          && !lifecycle.baselineExists
          && !serverRoomIds.has(resource.resourceId),
        );
      })
      .map((resource) => ({
        id: resource.resourceId,
        name: resource.displayName,
      })),
  ].sort((left, right) => left.name.localeCompare(right.name, 'tr'));

  const teacherNames = new Map(
    teacherOptions.map((option) => [option.id, option.name]),
  );
  const roomNames = new Map(
    roomOptions.map((option) => [option.id, option.name]),
  );

  const projectedRows = coursePlan.rows.map((row) => {
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
    });

  const policyByRequirement = new Map(
    projectedRows.map((row) => [
      row.requirementId,
      {
        scope: row.teacherAssignmentScope,
        continuity: row.teacherContinuity,
      },
    ]),
  );

  return {
    ...coursePlan,
    rows: projectedRows,
    teacherOptions,
    roomOptions,
    teacherContinuityViolations:
      coursePlan.teacherContinuityViolations.filter((violation) => {
        const policy = policyByRequirement.get(violation.requirementId);
        return (
          policy?.scope === 'REQUIREMENT'
          && policy.continuity === 'REQUIRED'
        );
      }),
  };
}
