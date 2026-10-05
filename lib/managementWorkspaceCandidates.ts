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
  requirementId: string,
  teacherRequirement: string,
) {
  if (teacherRequirement === 'NONE') return [null];

  const activeTeacherIds = new Set(
    snapshot.teachers
      .filter((teacher) => teacher.operationalStatus === 'ACTIVE')
      .map((teacher) => teacher.id),
  );
  const pooled = uniqueStrings(
    snapshot.teacherPools
      .filter((entry) => entry.requirementId === requirementId)
      .map((entry) => entry.teacherId)
      .filter((teacherId) => activeTeacherIds.has(teacherId)),
  );

  if (teacherRequirement === 'REQUIRED') {
    return pooled.length > 0 ? pooled : [null];
  }

  return [null, ...pooled];
}

function roomOptionsForRequirement(
  snapshot: ManagementWorkspaceSnapshotV1,
  requirement: ManagementWorkspaceSnapshotV1['requirements'][number],
) {
  if (requirement.resourceMode === 'UNKNOWN') return [null];

  const activeRooms = snapshot.rooms.filter(
    (room) => room.operationalStatus === 'ACTIVE',
  );

  if (requirement.resourceMode === 'CAPABILITY') {
    const eligible = activeRooms
      .filter((room) => (
        Boolean(requirement.requiredCapability)
        && room.knowledgeStatus === 'CONFIRMED'
        && room.capabilities.includes(requirement.requiredCapability as string)
      ))
      .map((room) => room.id);

    return eligible.length > 0 ? uniqueStrings(eligible) : [null];
  }

  const activeRoomIds = new Set(activeRooms.map((room) => room.id));
  const pooled = uniqueStrings(
    snapshot.roomPools
      .filter((entry) => entry.requirementId === requirement.id)
      .map((entry) => entry.roomId)
      .filter((roomId) => activeRoomIds.has(roomId)),
  );

  return pooled.length > 0 ? pooled : [null];
}

export function buildManagementWorkspacePlacementCandidateDetailV1(
  snapshot: ManagementWorkspaceSnapshotV1,
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
    requirement.id,
    requirement.teacherRequirement,
  );
  const roomOptions = roomOptionsForRequirement(snapshot, requirement);

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
          requirement.resourceMode !== 'UNKNOWN'
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
