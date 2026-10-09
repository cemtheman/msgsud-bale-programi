import { describe, expect, it } from 'vitest';

import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  prepareManagementWorkspaceTeacherPolicyV1,
} from '@/lib/managementWorkspaceTeacherPolicy';
import {
  createManagementWorkspaceWorkingCopyV1,
  setManagementWorkspacePlacementV1,
} from '@/lib/managementWorkspaceWorkingCopy';

function snapshot(): ManagementWorkspaceSnapshotV1 {
  return {
    schemaVersion: 'management-workspace-v1',
    sourceSnapshotVersion: 'M39.1-v1',
    identity: {
      revisionId: 'revision-1',
      requirementSetId: 'requirement-set-1',
      revisionVersion: 1,
      academicYear: '2026-2027',
      term: 1,
      snapshotHash: 'snapshot-hash',
      baselineHash: 'baseline-hash',
    },
    hardConstraintContract: {
      days: [1, 2, 3, 4, 5],
      periods: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      rules: [],
    },
    requirements: [{
      id: 'requirement-1',
      subjectId: 'subject-1',
      subjectName: 'K. Bale',
      groupId: 'group-1',
      groupName: '6A BALLET',
      groupType: 'BALLET',
      weeklyLoad: 2,
      preferredPartition: null,
      allowedPartitions: null,
      minDistinctDays: null,
      maxBlocksPerDay: null,
      maxConsecutivePeriods: null,
      courseCharacter: null,
      deliveryMode: null,
      teacherRequirement: 'REQUIRED',
      teacherMode: 'ELIGIBLE_POOL',
      teacherAssignmentScope: 'BLOCK',
      teacherContinuity: 'NONE',
      resourceMode: 'UNKNOWN',
      requiredCapability: null,
    }],
    cards: [
      {
        id: 'card-1',
        requirementId: 'requirement-1',
        blockIndex: 1,
        durationPeriods: 1,
        locked: false,
      },
      {
        id: 'card-2',
        requirementId: 'requirement-1',
        blockIndex: 2,
        durationPeriods: 1,
        locked: false,
      },
    ],
    instructionalGroups: [{
      id: 'group-1',
      classGroupId: null,
      name: '6A BALLET',
      groupType: 'BALLET',
      termStatus: 'ACTIVE',
      knowledgeStatus: 'CONFIRMED',
    }],
    instructionalGroupRelations: [],
    teacherPools: [
      { requirementId: 'requirement-1', teacherId: 'teacher-1' },
      { requirementId: 'requirement-1', teacherId: 'teacher-2' },
    ],
    roomPools: [],
    teachers: [
      { id: 'teacher-1', name: 'Öğretmen 1', operationalStatus: 'ACTIVE' },
      { id: 'teacher-2', name: 'Öğretmen 2', operationalStatus: 'ACTIVE' },
    ],
    teacherUnavailablePeriods: [],
    rooms: [],
    baselinePlacements: [
      {
        cardId: 'card-1',
        dayOfWeek: 1,
        startPeriod: 2,
        teacherId: 'teacher-1',
        roomId: null,
      },
      {
        cardId: 'card-2',
        dayOfWeek: 3,
        startPeriod: 2,
        teacherId: 'teacher-1',
        roomId: null,
      },
    ],
    baselineMetrics: {
      cardCount: 2,
      placedCardCount: 2,
      unplacedCardCount: 0,
      lockedCardCount: 0,
      changeCost: 0,
      roomStabilityBreaks: 0,
      teacherIdleGapPeriods: 0,
      preferredTeacherContinuityBreaks: 0,
    },
    readiness: {
      hardInputReady: true,
      hardBlockers: [],
      provisionalInputs: [],
      resourceUnknownSemantics: null,
      missingOptionalModelInputs: [],
    },
    candidateDomain: {
      included: false,
      omissionReason: 'occupancy-relative',
    },
  };
}

describe('management workspace teacher policy', () => {
  it('allows REQUIREMENT + REQUIRED when placed blocks resolve to one teacher', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const plan = prepareManagementWorkspaceTeacherPolicyV1(
      source,
      copy,
      'requirement-1',
      'REQUIREMENT',
      'REQUIRED',
    );

    expect(plan.preview.canApply).toBe(true);
    expect(plan.preview.placedBlockCount).toBe(2);
    expect(plan.preview.distinctResolvedTeacherCount).toBe(1);
    expect(plan.resource).toMatchObject({
      teacherAssignmentScope: 'REQUIREMENT',
      teacherContinuity: 'REQUIRED',
    });
  });

  it('blocks REQUIREMENT + REQUIRED when current placements use multiple teachers', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-2',
      dayOfWeek: 3,
      startPeriod: 2,
      teacherId: 'teacher-2',
      roomId: null,
    });

    const plan = prepareManagementWorkspaceTeacherPolicyV1(
      source,
      copy,
      'requirement-1',
      'REQUIREMENT',
      'REQUIRED',
    );

    expect(plan.preview.canApply).toBe(false);
    expect(plan.preview.distinctResolvedTeacherCount).toBe(2);
    expect(plan.preview.blockReasons).toContain(
      'Mevcut yerleşmiş bloklarda birden fazla öğretmen kullanılıyor.',
    );
  });

  it('allows BLOCK + NONE with multiple placed teachers', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-2',
      dayOfWeek: 3,
      startPeriod: 2,
      teacherId: 'teacher-2',
      roomId: null,
    });

    const plan = prepareManagementWorkspaceTeacherPolicyV1(
      source,
      copy,
      'requirement-1',
      'BLOCK',
      'NONE',
    );

    expect(plan.preview.canApply).toBe(true);
    expect(plan.preview.distinctResolvedTeacherCount).toBe(2);
  });

  it('changes the state token when placement state changes', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const before = prepareManagementWorkspaceTeacherPolicyV1(
      source,
      copy,
      'requirement-1',
      'REQUIREMENT',
      'REQUIRED',
    ).preview.stateToken;

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-2',
      dayOfWeek: 4,
      startPeriod: 5,
      teacherId: 'teacher-1',
      roomId: null,
    });

    const after = prepareManagementWorkspaceTeacherPolicyV1(
      source,
      copy,
      'requirement-1',
      'REQUIREMENT',
      'REQUIRED',
    ).preview.stateToken;

    expect(after).not.toBe(before);
  });

  it('rejects invalid scope/continuity combinations', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    expect(() => prepareManagementWorkspaceTeacherPolicyV1(
      source,
      copy,
      'requirement-1',
      'REQUIREMENT',
      'NONE',
    )).toThrow('Geçersiz öğretmen kuralı birleşimi.');
  });
});
