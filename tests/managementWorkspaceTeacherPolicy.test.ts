import { describe, expect, it } from 'vitest';

import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  prepareManagementWorkspaceTeacherPolicyV1,
} from '@/lib/managementWorkspaceTeacherPolicy';
import {
  createManagementWorkspaceWorkingCopyV1,
  setManagementWorkspacePlacementV1,
  hydrateManagementWorkspaceRequirementCatalogV1,
  type ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

import { executeManagementWorkspaceCommandsV1 } from '@/lib/managementWorkspaceCommands';
import {
  createManagementWorkspaceHistoryV1, undoManagementWorkspaceOperationV1,
  redoManagementWorkspaceOperationV1, type ManagementWorkspaceHistoryV1,
} from '@/lib/managementWorkspaceHistory';
import {
  prepareManagementWorkspaceRequirementStructureV1, previewManagementWorkspaceRequirementStructureV1,
} from '@/lib/managementWorkspaceStructure';
import {
  prepareManagementWorkspaceTeacherReconciliationV1,
  prepareManagementWorkspaceCoordinatedTeacherReconciliationV1,
} from '@/lib/managementWorkspaceTeacherReconciliation';
import { prepareManagementWorkspaceCommitV1 } from '@/lib/managementWorkspaceCommit';

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
  function grow(source: ManagementWorkspaceSnapshotV1, copy: ManagementWorkspaceWorkingCopyV1, history: ManagementWorkspaceHistoryV1) {
    const input = {
      requirementId: 'requirement-1', weeklyLoad: 3, preferredPartition: [1, 1, 1],
      allowedPartitions: [[1, 1, 1]], termStatus: 'ACTIVE' as const,
    };
    const preview = previewManagementWorkspaceRequirementStructureV1(source, copy, input);
    const plan = prepareManagementWorkspaceRequirementStructureV1(source, copy, input, preview.structureToken);
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, [plan.command]).applied).toBe(true);
    const created = Object.values(copy.cardsById).find(card => !card.baselineExists)!;
    expect(created).toBeDefined();
    return created;
  }

  function activate(source: ManagementWorkspaceSnapshotV1, copy: ManagementWorkspaceWorkingCopyV1, history: ManagementWorkspaceHistoryV1) {
    hydrateManagementWorkspaceRequirementCatalogV1(copy, [{
      ...source.requirements[0], requirementId: 'requirement-local',
      subjectName: 'Yeni ders', groupId: 'group-local', groupName: '6B', classCodes: ['6B'],
      courseCharacter: 'ART', deliveryMode: 'STANDARD', termStatus: 'INACTIVE',
      weeklyLoad: 0, preferredPartition: [], allowedPartitions: [],
      teacherIds: ['teacher-1', 'teacher-2'], roomIds: [],
      teacherAssignmentScope: 'BLOCK', teacherContinuity: 'NONE',
    }]);
    const input = {
      requirementId: 'requirement-local', weeklyLoad: 2, preferredPartition: [1, 1],
      allowedPartitions: [[1, 1]], termStatus: 'ACTIVE' as const,
    };
    const preview = previewManagementWorkspaceRequirementStructureV1(source, copy, input);
    const plan = prepareManagementWorkspaceRequirementStructureV1(source, copy, input, preview.structureToken);
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, [plan.command]).applied).toBe(true);
    return Object.values(copy.cardsById).filter(card => card.requirementId === 'requirement-local');
  }

  function grownPlaced() {
    const baseline = snapshot();
    const source: ManagementWorkspaceSnapshotV1 = { ...baseline, baselinePlacements: [] };
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    const created = grow(source, copy, history);
    const cards = Object.values(copy.cardsById).sort((a, b) => a.blockIndex - b.blockIndex);
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, cards.map((card, index) => ({
      type: 'SET_PLACEMENT', placement: {
        cardId: card.id, dayOfWeek: index + 1, startPeriod: 2,
        teacherId: card.id === created.id ? 'teacher-2' : 'teacher-1', roomId: null,
      },
    }))).applied).toBe(true);
    return { source, copy, history, created };
  }

  it('counts a new local block when previewing a required teacher policy', () => {
    const { source, copy, created } = grownPlaced();
    const before = structuredClone(copy);
    const plan = prepareManagementWorkspaceTeacherPolicyV1(source, copy, 'requirement-1', 'REQUIREMENT', 'REQUIRED');
    expect(plan.preview.canApply).toBe(false);
    expect(plan.preview.placedBlockCount).toBe(3);
    expect(plan.preview.distinctResolvedTeacherCount).toBe(2);
    expect(plan.preview.placedBlocks.some(block => block.cardId === created.id)).toBe(true);
    expect(copy).toEqual(before);
  });

  it('reconciles all current local blocks, preserves time/room, and supports batch Undo/Redo and Save preparation', () => {
    const { source, copy, history, created } = grownPlaced();
    const before = structuredClone(copy);
    const plan = prepareManagementWorkspaceTeacherReconciliationV1(source, copy, 'requirement-1', 'teacher-1');
    expect(plan.preview.canApply).toBe(true);
    expect(plan.preview.placedBlockCount).toBe(3);
    expect(plan.preview.changedBlockCount).toBe(1);
    expect(plan.commands).toHaveLength(1);
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, plan.commands).applied).toBe(true);
    expect(copy.placementsByCardId[created.id]).toEqual({ ...before.placementsByCardId[created.id], teacherId: 'teacher-1' });
    undoManagementWorkspaceOperationV1(copy, history);
    expect(copy).toEqual(before);
    redoManagementWorkspaceOperationV1(copy, history);
    expect(Object.values(copy.placementsByCardId).every(p => p.teacherId === 'teacher-1')).toBe(true);
    const policy = prepareManagementWorkspaceTeacherPolicyV1(source, copy, 'requirement-1', 'REQUIREMENT', 'REQUIRED');
    expect(policy.preview.canApply).toBe(true);
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, [{ type: 'SET_REQUIREMENT_RESOURCES', resource: policy.resource }]).applied).toBe(true);
    const commit = prepareManagementWorkspaceCommitV1(source, copy);
    expect(commit.ready).toBe(true);
    expect(commit.payload?.structureChanges).toHaveLength(1);
    expect(commit.payload?.changes).toHaveLength(3);
    expect(commit.payload?.requirementChanges[0].after.teacher_continuity).toBe('REQUIRED');
    expect(commit.payload?.snapshotHash).toBe(source.identity.snapshotHash);
  });

  it('includes a new local block in a coordinated reconciliation summary and command batch', () => {
    const { source, copy, created } = grownPlaced();
    const plan = prepareManagementWorkspaceCoordinatedTeacherReconciliationV1(source, copy, [{ requirementId: 'requirement-1', teacherId: 'teacher-1' }]);
    expect(plan.preview.canApply).toBe(true);
    expect(plan.preview.assignments[0].placedBlockCount).toBe(3);
    expect(plan.preview.changedBlockCount).toBe(1);
    expect(plan.commands).toContainEqual({ type: 'SET_PLACEMENT', placement: { ...copy.placementsByCardId[created.id], teacherId: 'teacher-1' } });
  });

  it.each(['policy', 'reconciliation'] as const)('invalidates the %s token after structure growth and restores it on Undo', (kind) => {
    const baseline = snapshot();
    const source: ManagementWorkspaceSnapshotV1 = { ...baseline, baselinePlacements: [] };
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    const token = () => kind === 'policy'
      ? prepareManagementWorkspaceTeacherPolicyV1(source, copy, 'requirement-1', 'REQUIREMENT', 'REQUIRED').preview.stateToken
      : prepareManagementWorkspaceTeacherReconciliationV1(source, copy, 'requirement-1', 'teacher-1').preview.stateToken;
    const before = token();
    grow(source, copy, history);
    const after = token();
    expect(after).not.toBe(before);
    undoManagementWorkspaceOperationV1(copy, history);
    expect(token()).toBe(before);
    redoManagementWorkspaceOperationV1(copy, history);
    expect(token()).toBe(after);
  });

  it('previews a teacher policy for a hydrated requirement absent from the snapshot', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    const cards = activate(source, copy, history);
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, cards.map((card, index) => ({ type: 'SET_PLACEMENT', placement: {
      cardId: card.id, dayOfWeek: index + 4, startPeriod: 2, teacherId: index ? 'teacher-2' : 'teacher-1', roomId: null,
    } }))).applied).toBe(true);
    const plan = prepareManagementWorkspaceTeacherPolicyV1(source, copy, 'requirement-local', 'REQUIREMENT', 'REQUIRED');
    expect(plan.preview.subjectName).toBe('Yeni ders');
    expect(plan.preview.groupName).toBe('6B');
    expect(plan.preview.canApply).toBe(false);
    expect(plan.preview.distinctResolvedTeacherCount).toBe(2);
  });

  it('reconciles a hydrated requirement absent from the snapshot', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    const cards = activate(source, copy, history);
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, cards.map((card, index) => ({ type: 'SET_PLACEMENT', placement: {
      cardId: card.id, dayOfWeek: index + 4, startPeriod: 2, teacherId: 'teacher-2', roomId: null,
    } }))).applied).toBe(true);
    const single = prepareManagementWorkspaceTeacherReconciliationV1(source, copy, 'requirement-local', 'teacher-1');
    const coordinated = prepareManagementWorkspaceCoordinatedTeacherReconciliationV1(source, copy, [{ requirementId: 'requirement-local', teacherId: 'teacher-1' }]);
    expect(single.preview.canApply).toBe(true);
    expect(single.commands).toHaveLength(2);
    expect(coordinated.commands).toEqual(single.commands);
    expect(coordinated.preview.assignments[0].subjectName).toBe('Yeni ders');
  });

  it('uses the current local teacher name in policy placement summaries', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    copy.teacherInventoryById['teacher-1'].displayName = 'Yerel Öğretmen';
    const plan = prepareManagementWorkspaceTeacherPolicyV1(source, copy, 'requirement-1', 'BLOCK', 'NONE');
    expect(plan.preview.placedBlocks[0].teacherName).toBe('Yerel Öğretmen');
  });

  it('invalidates reconciliation tokens when a teacher pin changes without a placement move', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    const before = prepareManagementWorkspaceTeacherReconciliationV1(source, copy, 'requirement-1', 'teacher-2');
    expect(before.preview.canApply).toBe(true);
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, [{ type: 'SET_CARD_PINS', pins: {
      cardId: 'card-1', timePinned: false, teacherPinned: true, roomPinned: false,
    } }]).applied).toBe(true);
    const after = prepareManagementWorkspaceTeacherReconciliationV1(source, copy, 'requirement-1', 'teacher-2');
    expect(after.preview.canApply).toBe(false);
    expect(after.preview.blockReasons).toContain('TEACHER_PINNED_CHANGED');
    expect(after.preview.stateToken).not.toBe(before.preview.stateToken);
  });

  it('explains local-card conflicts with local course metadata and the proposed teacher', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    const cards = activate(source, copy, history);
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, cards.map((card, index) => ({ type: 'SET_PLACEMENT', placement: {
      cardId: card.id, dayOfWeek: index ? 4 : 1, startPeriod: 2, teacherId: 'teacher-2', roomId: null,
    } }))).applied).toBe(true);
    const before = structuredClone({ copy, history });
    const single = prepareManagementWorkspaceTeacherReconciliationV1(source, copy, 'requirement-1', 'teacher-2');
    expect(single.preview.canApply).toBe(false);
    expect(single.preview.conflicts).toContainEqual(expect.objectContaining({ subjectName: 'Yeni ders', groupName: '6B' }));
    const coordinated = prepareManagementWorkspaceCoordinatedTeacherReconciliationV1(source, copy, [{ requirementId: 'requirement-1', teacherId: 'teacher-2' }]);
    expect(coordinated.preview.canApply).toBe(false);
    expect(coordinated.preview.conflicts).toHaveLength(1);
    expect(coordinated.preview.conflicts[0].teacherId).toBe('teacher-2');
    expect([coordinated.preview.conflicts[0].leftSubjectName, coordinated.preview.conflicts[0].rightSubjectName]).toContain('Yeni ders');
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, coordinated.commands).applied).toBe(false);
    expect({ copy, history }).toEqual(before);
  });

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
