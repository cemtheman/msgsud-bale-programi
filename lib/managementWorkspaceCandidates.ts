import type { ManagementCandidateDetail } from '@/lib/managementBoard';
import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import type { ManagementWorkspaceWorkingCopyV1 } from '@/lib/managementWorkspaceWorkingCopy';
import { previewManagementWorkspaceCommandsV1 } from '@/lib/managementWorkspaceCommands';

function workspaceRequirementForCandidates(
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  requirementId: string,
) {
  const catalog = workingCopy.requirementCatalogById[requirementId];
  const structure = workingCopy.requirementStructureById[requirementId];
  const resource = workingCopy.requirementResourcesById[requirementId];
  if (!catalog || !structure || structure.termStatus !== 'ACTIVE') return null;

  return {
    id: requirementId,
    teacherRequirement: catalog.teacherRequirement,
    resourceMode: resource?.resourceMode ?? catalog.baselineResourceMode,
    requiredCapability:
      resource?.requiredCapability ?? catalog.baselineRequiredCapability,
  };
}

export function buildManagementWorkspaceMoveCandidateDetailV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  cardId: string,
): ManagementCandidateDetail | null {
  const card = workingCopy.cardsById[cardId];
  if (!card) return null;

  const requirement = workspaceRequirementForCandidates(
    workingCopy,
    card.requirementId,
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


export function buildManagementWorkspacePrevalidatedMoveCandidateDetailsV1(
  snapshot: ManagementWorkspaceSnapshotV1,
  workingCopy: ManagementWorkspaceWorkingCopyV1,
  cardIds: string[],
  startOffsetsByCardId: Record<string, number>,
): Record<string, ManagementCandidateDetail> | null {
  const uniqueCardIds = Array.from(new Set(cardIds));
  const details = Object.fromEntries(
    uniqueCardIds.map((cardId) => [
      cardId,
      buildManagementWorkspaceMoveCandidateDetailV1(
        snapshot,
        workingCopy,
        cardId,
      ),
    ]),
  );

  if (
    uniqueCardIds.length === 0
    || uniqueCardIds.some((cardId) => details[cardId] === null)
  ) {
    return null;
  }

  const nextDetails = Object.fromEntries(
    uniqueCardIds.map((cardId) => {
      const detail = details[cardId] as ManagementCandidateDetail;
      return [
        cardId,
        {
          ...detail,
          assessments: detail.assessments.map((assessment) => ({
            ...assessment,
            reasonCodes: [...assessment.reasonCodes],
          })),
        } satisfies ManagementCandidateDetail,
      ];
    }),
  ) as Record<string, ManagementCandidateDetail>;

  for (const dayOfWeek of snapshot.hardConstraintContract.days) {
    for (const anchorStartPeriod of snapshot.hardConstraintContract.periods) {
      const slotAssessments = uniqueCardIds.map((cardId) => {
        const startPeriod =
          anchorStartPeriod + (startOffsetsByCardId[cardId] ?? 0);
        const detail = nextDetails[cardId];
        const assessment = detail.assessments.find((candidate) => (
          candidate.dayOfWeek === dayOfWeek
          && candidate.startPeriod === startPeriod
        )) ?? null;

        return {
          cardId,
          startPeriod,
          assessment,
        };
      });

      const outsideDay = slotAssessments.some(({ startPeriod, assessment }) => (
        startPeriod < 1
        || startPeriod > 12
        || assessment === null
      ));

      if (outsideDay) {
        slotAssessments.forEach(({ assessment }) => {
          if (!assessment) return;
          assessment.status = 'INVALID';
          assessment.isComplete = false;
          assessment.reasonCodes = Array.from(new Set([
            ...assessment.reasonCodes,
            'TIME_OUTSIDE_DAY',
          ]));
        });
        continue;
      }

      if (slotAssessments.some(({ assessment }) => (
        !assessment
        || assessment.status !== 'VALID'
        || !assessment.isComplete
      ))) {
        continue;
      }

      const preview = previewManagementWorkspaceCommandsV1(
        snapshot,
        workingCopy,
        slotAssessments.map(({ cardId, assessment }) => ({
          type: 'SET_PLACEMENT' as const,
          placement: {
            cardId,
            dayOfWeek,
            startPeriod: assessment!.startPeriod,
            teacherId: assessment!.teacherId,
            roomId: assessment!.roomId,
          },
        })),
      );

      if (preview.applied) continue;

      const introducedCodes = Array.from(new Set(
        preview.issues.map((issue) => issue.code),
      ));

      slotAssessments.forEach(({ assessment }) => {
        if (!assessment) return;
        assessment.status = 'INVALID';
        assessment.isComplete = false;
        assessment.reasonCodes = Array.from(new Set([
          ...assessment.reasonCodes,
          ...introducedCodes,
        ]));
      });
    }
  }

  Object.values(nextDetails).forEach((detail) => {
    const reasonMap = new Map<string, number>();
    detail.assessments.forEach((assessment) => {
      assessment.reasonCodes.forEach((code) => {
        reasonMap.set(code, (reasonMap.get(code) ?? 0) + 1);
      });
    });

    detail.validCandidates = detail.assessments.filter(
      (assessment) => assessment.status === 'VALID' && assessment.isComplete,
    );
    detail.reasonCounts = Array.from(reasonMap.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((left, right) => (
        right.count - left.count
        || left.code.localeCompare(right.code)
      ));
  });

  return nextDetails;
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
    Object.values(workingCopy.teacherInventoryById)
      .filter((teacher) => (
        workingCopy.resourceLifecycleById[teacher.resourceId]?.exists === true
        && teacher.operationalStatus === 'ACTIVE'
      ))
      .map((teacher) => teacher.resourceId),
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
  requirement: {
    id: string;
    resourceMode: string;
    requiredCapability: string | null;
  },
) {
  const localResource =
    workingCopy.requirementResourcesById[requirement.id] ?? null;
  const resourceMode =
    localResource?.resourceMode ?? requirement.resourceMode;
  const requiredCapability =
    localResource?.requiredCapability ?? requirement.requiredCapability;

  if (resourceMode === 'UNKNOWN') return [null];

  const snapshotRoomById = new Map(
    snapshot.rooms.map((room) => [room.id, room]),
  );
  const activeRooms = Object.values(workingCopy.roomInventoryById)
    .filter((room) => (
      workingCopy.resourceLifecycleById[room.resourceId]?.exists === true
      && room.operationalStatus === 'ACTIVE'
    ))
    .map((room) => {
      const source = snapshotRoomById.get(room.resourceId);
      const profile = workingCopy.roomProfileById?.[room.resourceId];
      return {
        id: room.resourceId,
        name: room.displayName,
        canonicalRoomId: source?.canonicalRoomId ?? null,
        capabilities: profile?.capabilities ?? source?.capabilities ?? [],
        knowledgeStatus:
          profile?.knowledgeStatus ?? source?.knowledgeStatus ?? 'UNKNOWN',
        operationalStatus: room.operationalStatus,
      };
    });

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
  const card = workingCopy.cardsById[cardId];
  if (!card) return null;

  const requirement = workspaceRequirementForCandidates(
    workingCopy,
    card.requirementId,
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
