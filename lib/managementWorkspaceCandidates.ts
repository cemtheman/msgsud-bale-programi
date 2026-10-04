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
