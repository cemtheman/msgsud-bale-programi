import type { ManagementCandidateDetail } from '@/lib/managementBoard';
import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import type { ManagementWorkspaceWorkingCopyV1 } from '@/lib/managementWorkspaceWorkingCopy';

export function buildManagementWorkspaceMoveCandidateDetailV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  cardId: string,
): ManagementCandidateDetail | null {
  const card = snapshot.cards.find((item) => item.id === cardId);
  if (!card) return null;

  const requirement = snapshot.requirements.find(
    (item) => item.id === card.requirementId,
  );
  const placement = workingCopy.placementsByCardId[cardId];

  if (
    !requirement
    || !placement
    || placement.dayOfWeek === null
    || placement.startPeriod === null
  ) {
    return null;
  }

  const teacherMissing = (
    requirement.teacherRequirement === 'REQUIRED'
    && placement.teacherId === null
  );
  const roomMissing = (
    requirement.resourceMode !== 'UNKNOWN'
    && placement.roomId === null
  );

  const reasonCodes = [
    ...(teacherMissing ? ['TEACHER_ASSIGNMENT_MISSING'] : []),
    ...(roomMissing ? ['ROOM_ASSIGNMENT_MISSING'] : []),
  ];

  const status = reasonCodes.length > 0 ? 'UNRESOLVED' as const : 'VALID' as const;
  const assessments = snapshot.hardConstraintContract.days.flatMap((dayOfWeek) =>
    snapshot.hardConstraintContract.periods.map((startPeriod) => ({
      dayOfWeek,
      startPeriod,
      teacherId: placement.teacherId,
      roomId: placement.roomId,
      status,
      isComplete: reasonCodes.length === 0,
      reasonCodes: [...reasonCodes],
    })),
  );

  const reasonCounts = reasonCodes.map((code) => ({
    code,
    count: assessments.length,
  }));

  return {
    assessments,
    reasonCounts,
    validCandidates: assessments.filter(
      (assessment) => assessment.status === 'VALID',
    ),
    policyFilteredCount: 0,
    policyResolvedTeacherId: null,
    policyConflict: false,
  };
}


function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function teacherOptionsForRequirement(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requirementId: string,
  teacherRequirement: string,
) {
  if (teacherRequirement === 'NONE') return [null];

  const activeTeacherIds = new Set(
    snapshot.teachers
      .filter((teacher) => (
        workingCopy.teacherInventoryById[teacher.id]?.operationalStatus
        ?? teacher.operationalStatus
      ) === 'ACTIVE')
      .map((teacher) => teacher.id),
  );
  const pooled = uniqueStrings(
    (
      workingCopy.requirementResourcesById[requirementId]?.teacherIds
      ?? snapshot.teacherPools
        .filter((entry) => entry.requirementId === requirementId)
        .map((entry) => entry.teacherId)
    ).filter((teacherId) => activeTeacherIds.has(teacherId)),
  );

  if (teacherRequirement === 'REQUIRED') {
    return pooled.length > 0 ? pooled : [null];
  }

  return [null, ...pooled];
}

function roomOptionsForRequirement(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requirement: ManagementWorkspaceSnapshotV1['requirements'][number],
) {
  const localResource =
    workingCopy.requirementResourcesById[requirement.id] ?? null;
  const resourceMode =
    localResource?.resourceMode ?? requirement.resourceMode;
  const requiredCapability =
    localResource?.requiredCapability ?? requirement.requiredCapability;

  if (resourceMode === 'UNKNOWN') return [null];

  const activeRooms = snapshot.rooms
    .map((room) => {
      const profile = workingCopy.roomProfileById?.[room.id];
      return {
        ...room,
        capabilities: profile?.capabilities ?? room.capabilities,
        knowledgeStatus: profile?.knowledgeStatus ?? room.knowledgeStatus,
      };
    })
    .filter(
      (room) => (
        workingCopy.roomInventoryById[room.id]?.operationalStatus
        ?? room.operationalStatus
      ) === 'ACTIVE',
    );

  if (resourceMode === 'CAPABILITY') {
    const eligible = activeRooms
      .filter((room) => (
        Boolean(requiredCapability)
        && room.knowledgeStatus === 'CONFIRMED'
        && room.capabilities.includes(requiredCapability as string)
      ))
      .map((room) => room.id);

    return eligible.length > 0 ? uniqueStrings(eligible) : [null];
  }

  const activeRoomIds = new Set(activeRooms.map((room) => room.id));
  const pooled = uniqueStrings(
    (
      localResource?.roomIds
      ?? snapshot.roomPools
        .filter((entry) => entry.requirementId === requirement.id)
        .map((entry) => entry.roomId)
    ).filter((roomId) => activeRoomIds.has(roomId)),
  );

  return pooled.length > 0 ? pooled : [null];
}

export function buildManagementWorkspacePlacementCandidateDetailV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  cardId: string,
): ManagementCandidateDetail | null {
  const card = snapshot.cards.find((item) => item.id === cardId);
  if (!card) return null;

  const requirement = snapshot.requirements.find(
    (item) => item.id === card.requirementId,
  );
  if (!requirement) return null;

  const teacherOptions = teacherOptionsForRequirement(
    snapshot,
    workingCopy,
    requirement.id,
    requirement.teacherRequirement,
  );
  const roomOptions = roomOptionsForRequirement(
    snapshot,
    workingCopy,
    requirement,
  );

  const resourceCombinations = teacherOptions.flatMap((teacherId) =>
    roomOptions.map((roomId) => ({
      teacherId,
      roomId,
    })),
  );

  const assessments = snapshot.hardConstraintContract.days.flatMap((dayOfWeek) =>
    snapshot.hardConstraintContract.periods.flatMap((startPeriod) =>
      resourceCombinations.map(({ teacherId, roomId }) => {
        const reasonCodes: string[] = [];

        if (
          requirement.teacherRequirement === 'REQUIRED'
          && teacherId === null
        ) {
          reasonCodes.push('TEACHER_ASSIGNMENT_MISSING');
        }

        if (
          (
            workingCopy.requirementResourcesById[requirement.id]?.resourceMode
            ?? requirement.resourceMode
          ) !== 'UNKNOWN'
          && roomId === null
        ) {
          reasonCodes.push('ROOM_ASSIGNMENT_MISSING');
        }

        const complete = reasonCodes.length === 0;

        return {
          dayOfWeek,
          startPeriod,
          teacherId,
          roomId,
          status: complete ? 'VALID' as const : 'UNRESOLVED' as const,
          isComplete: complete,
          reasonCodes,
        };
      }),
    ),
  );

  const reasonMap = new Map<string, number>();
  assessments.forEach((assessment) => {
    assessment.reasonCodes.forEach((code) => {
      reasonMap.set(code, (reasonMap.get(code) ?? 0) + 1);
    });
  });

  return {
    assessments,
    reasonCounts: Array.from(reasonMap.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((left, right) => (
        right.count - left.count
        || left.code.localeCompare(right.code)
      )),
    validCandidates: assessments.filter(
      (assessment) => assessment.status === 'VALID',
    ),
    policyFilteredCount: 0,
    policyResolvedTeacherId: null,
    policyConflict: false,
  };
}
