import { describe, expect, it } from 'vitest';

import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  prepareManagementWorkspaceResourceEditV1,
} from '@/lib/managementWorkspaceResources';
import {
  createManagementWorkspaceWorkingCopyV1,
  diffManagementWorkspaceV1,
  setManagementWorkspacePlacementV1,
} from '@/lib/managementWorkspaceWorkingCopy';
import { executeManagementWorkspaceCommandsV1 } from '@/lib/managementWorkspaceCommands';
import {
  createManagementWorkspaceHistoryV1,
  undoManagementWorkspaceOperationV1,
  redoManagementWorkspaceOperationV1,
} from '@/lib/managementWorkspaceHistory';
import { prepareManagementWorkspaceCommitV1 } from '@/lib/managementWorkspaceCommit';
import { translateManagementPlacementResourceBlockReason } from '@/lib/managementCommands';

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
    requirements: [
      {
        id: 'requirement-main',
        subjectId: 'subject-main',
        subjectName: 'K. Bale',
        groupId: 'group-main',
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
        teacherAssignmentScope: 'REQUIREMENT',
        teacherContinuity: 'REQUIRED',
        resourceMode: 'ELIGIBLE_POOL',
        requiredCapability: null,
      },
      {
        id: 'requirement-other',
        subjectId: 'subject-other',
        subjectName: 'Matematik',
        groupId: 'group-other',
        groupName: '7A',
        groupType: 'SECTION',
        weeklyLoad: 1,
        preferredPartition: null,
        allowedPartitions: null,
        minDistinctDays: null,
        maxBlocksPerDay: null,
        maxConsecutivePeriods: null,
        courseCharacter: null,
        deliveryMode: null,
        teacherRequirement: 'REQUIRED',
        teacherMode: 'FIXED',
        teacherAssignmentScope: 'REQUIREMENT',
        teacherContinuity: 'REQUIRED',
        resourceMode: 'ELIGIBLE_POOL',
        requiredCapability: null,
      },
    ],
    cards: [
      {
        id: 'card-main-1',
        requirementId: 'requirement-main',
        blockIndex: 1,
        durationPeriods: 1,
        locked: false,
      },
      {
        id: 'card-main-2',
        requirementId: 'requirement-main',
        blockIndex: 2,
        durationPeriods: 1,
        locked: false,
      },
      {
        id: 'card-other',
        requirementId: 'requirement-other',
        blockIndex: 1,
        durationPeriods: 1,
        locked: false,
      },
    ],
    instructionalGroups: [
      {
        id: 'group-main',
        classGroupId: null,
        name: '6A BALLET',
        groupType: 'BALLET',
        termStatus: 'ACTIVE',
        knowledgeStatus: 'CONFIRMED',
      },
      {
        id: 'group-other',
        classGroupId: null,
        name: '7A',
        groupType: 'SECTION',
        termStatus: 'ACTIVE',
        knowledgeStatus: 'CONFIRMED',
      },
    ],
    instructionalGroupRelations: [],
    teacherPools: [
      { requirementId: 'requirement-main', teacherId: 'teacher-1' },
      { requirementId: 'requirement-main', teacherId: 'teacher-2' },
      { requirementId: 'requirement-other', teacherId: 'teacher-2' },
    ],
    roomPools: [
      { requirementId: 'requirement-main', roomId: 'room-1' },
      { requirementId: 'requirement-main', roomId: 'room-2' },
      { requirementId: 'requirement-other', roomId: 'room-2' },
    ],
    teachers: [
      { id: 'teacher-1', name: 'Öğretmen 1', operationalStatus: 'ACTIVE' },
      { id: 'teacher-2', name: 'Öğretmen 2', operationalStatus: 'ACTIVE' },
    ],
    teacherUnavailablePeriods: [],
    rooms: [
      {
        id: 'room-1',
        name: 'Salon 1',
        canonicalRoomId: null,
        capabilities: [],
        knowledgeStatus: 'CONFIRMED',
        operationalStatus: 'ACTIVE',
      },
      {
        id: 'room-2',
        name: 'Salon 2',
        canonicalRoomId: null,
        capabilities: [],
        knowledgeStatus: 'CONFIRMED',
        operationalStatus: 'ACTIVE',
      },
    ],
    baselinePlacements: [
      {
        cardId: 'card-main-1',
        dayOfWeek: 1,
        startPeriod: 2,
        teacherId: 'teacher-1',
        roomId: 'room-1',
      },
      {
        cardId: 'card-main-2',
        dayOfWeek: 3,
        startPeriod: 2,
        teacherId: 'teacher-1',
        roomId: 'room-1',
      },
      {
        cardId: 'card-other',
        dayOfWeek: 2,
        startPeriod: 5,
        teacherId: 'teacher-2',
        roomId: 'room-2',
      },
    ],
    baselineMetrics: {
      cardCount: 3,
      placedCardCount: 3,
      unplacedCardCount: 0,
      lockedCardCount: 0,
      changeCost: 0,
      preferredTeacherContinuityBreaks: 0,
      teacherIdleGapPeriods: 0,
      roomStabilityBreaks: 0,
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

describe('management workspace placement resource edits', () => {
  it.each(['TEACHER', 'ROOM'] as const)('rejects an entire %s selection if a requested card is missing', (type) => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    const before = structuredClone({ copy, history });
    const id = type === 'TEACHER' ? 'teacher-2' : 'room-2';
    const plan = prepareManagementWorkspaceResourceEditV1(
      source, copy, ['card-main-1', 'removed-card'], type, id,
    );
    expect(plan.preview.requestedCardIds).toEqual(['card-main-1', 'removed-card']);
    expect(plan.preview.canApply).toBe(false);
    expect(plan.preview.blockReasons).toContain('CARD_NOT_FOUND');
    expect(plan.commands).toEqual([]);
    // Even an accidental execution of the blocked plan cannot apply a subset.
    executeManagementWorkspaceCommandsV1(source, copy, history, plan.commands);
    expect({ copy, history }).toEqual(before);
    const valid = prepareManagementWorkspaceResourceEditV1(source, copy, ['card-main-1'], type, id);
    expect(valid.preview.stateToken).not.toBe(plan.preview.stateToken);
    expect(translateManagementPlacementResourceBlockReason('CARD_NOT_FOUND')).toContain('yeniden');
  });

  it.each(['missing', 'unplaced', 'partial'] as const)('rejects a whole selection with a %s placement', (state) => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    if (state === 'missing') delete copy.placementsByCardId['card-main-2'];
    else copy.placementsByCardId['card-main-2'] = {
      ...copy.placementsByCardId['card-main-2'], dayOfWeek: null,
      startPeriod: state === 'partial' ? 2 : null,
    };
    const before = structuredClone(copy);
    const plan = prepareManagementWorkspaceResourceEditV1(
      source, copy, ['card-main-1', 'card-main-2'], 'ROOM', 'room-2',
    );
    expect(plan.preview.canApply).toBe(false);
    expect(plan.preview.blockReasons).toContain('CARD_NOT_PLACED');
    expect(plan.commands).toEqual([]);
    expect(copy).toEqual(before);
    expect(translateManagementPlacementResourceBlockReason('CARD_NOT_PLACED')).toContain('yerleşmiş');
  });

  it('deduplicates a complete selection and permits an already-correct member in the batch', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    copy.placementsByCardId['card-main-2'].roomId = 'room-2';
    const plan = prepareManagementWorkspaceResourceEditV1(
      source, copy, ['card-main-1', 'card-main-2', 'card-main-1'], 'ROOM', 'room-2',
    );
    expect(plan.preview.canApply).toBe(true);
    expect(plan.preview.requestedCardIds).toEqual(['card-main-1', 'card-main-2']);
    expect(plan.commands).toHaveLength(1);
    expect(plan.preview.affectedCardCount).toBe(1);
    const empty = prepareManagementWorkspaceResourceEditV1(source, copy, [], 'ROOM', 'room-2');
    expect(empty.preview.canApply).toBe(false);
    expect(empty.commands).toEqual([]);
  });

  it.each([
    ['teacherPinned', 'TEACHER', 'teacher-2', 'TEACHER_PINNED_CHANGED', 'Öğretmen sabitlemesini kaldırın'],
    ['roomPinned', 'ROOM', 'room-2', 'ROOM_PINNED_CHANGED', 'Salon sabitlemesini kaldırın'],
    ['locked', 'TEACHER', 'teacher-2', 'LOCKED_CARD_MOVED', 'kilidi kaldırın'],
  ] as const)('explains a %s resource blocker in Turkish', (pin, type, id, reason, instruction) => {
    const baseline = snapshot();
    const source: ManagementWorkspaceSnapshotV1 = {
      ...baseline,
      cards: baseline.cards.map((card, index) => index === 0 ? { ...card, [pin]: true } : card),
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const plan = prepareManagementWorkspaceResourceEditV1(source, copy, ['card-main-1'], type, id);
    expect(plan.preview.canApply).toBe(false);
    expect(plan.preview.blockReasons).toContain(reason);
    expect(translateManagementPlacementResourceBlockReason(reason)).toContain(instruction);
  });

  it('uses an unsaved flexible policy without changing a teacher-pinned sibling', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, [
      { type: 'SET_REQUIREMENT_RESOURCES', resource: {
        ...copy.requirementResourcesById['requirement-main'],
        teacherAssignmentScope: 'BLOCK', teacherContinuity: 'NONE',
      } },
      { type: 'SET_CARD_PINS', pins: {
        cardId: 'card-main-2', timePinned: false, teacherPinned: true, roomPinned: false,
      } },
    ]).applied).toBe(true);

    const plan = prepareManagementWorkspaceResourceEditV1(
      source, copy, ['card-main-1'], 'TEACHER', 'teacher-2',
    );
    expect(plan.preview.canApply).toBe(true);
    expect(plan.preview.cardIds).toEqual(['card-main-1']);
    expect(plan.preview.requirementWideExpansionCount).toBe(0);
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, plan.commands).applied).toBe(true);
    expect(copy.placementsByCardId['card-main-1'].teacherId).toBe('teacher-2');
    expect(copy.placementsByCardId['card-main-2'].teacherId).toBe('teacher-1');
  });

  it('expands an unsaved required policy and blocks the whole edit on a pinned sibling', () => {
    const baseline = snapshot();
    const source: ManagementWorkspaceSnapshotV1 = {
      ...baseline,
      requirements: baseline.requirements.map((requirement, index) => index === 0
        ? { ...requirement, teacherAssignmentScope: 'BLOCK', teacherContinuity: 'NONE' }
        : requirement),
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, [
      { type: 'SET_REQUIREMENT_RESOURCES', resource: {
        ...copy.requirementResourcesById['requirement-main'],
        teacherAssignmentScope: 'REQUIREMENT', teacherContinuity: 'REQUIRED',
      } },
      { type: 'SET_CARD_PINS', pins: {
        cardId: 'card-main-2', timePinned: false, teacherPinned: true, roomPinned: false,
      } },
    ]).applied).toBe(true);
    const before = structuredClone({ copy, history });
    const plan = prepareManagementWorkspaceResourceEditV1(
      source, copy, ['card-main-1'], 'TEACHER', 'teacher-2',
    );
    expect(plan.preview.cardIds).toEqual(['card-main-1', 'card-main-2']);
    expect(plan.preview.canApply).toBe(false);
    expect(plan.preview.blockReasons).toContain('TEACHER_PINNED_CHANGED');
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, plan.commands).applied).toBe(false);
    expect({ copy, history }).toEqual(before);
  });

  it('invalidates a resource preview after a pin or local policy change without a move', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const token = () => prepareManagementWorkspaceResourceEditV1(
      source, copy, ['card-main-1'], 'ROOM', 'room-2',
    ).preview.stateToken;
    const before = token();
    copy.cardsById['card-main-1'].roomPinned = true;
    expect(token()).not.toBe(before);
    copy.cardsById['card-main-1'].roomPinned = false;
    expect(token()).toBe(before);
    copy.requirementResourcesById['requirement-main'].teacherAssignmentScope = 'BLOCK';
    copy.requirementResourcesById['requirement-main'].teacherContinuity = 'NONE';
    expect(token()).not.toBe(before);
  });

  it('enforces an unsaved required policy for direct commands in EDIT and COMMIT', () => {
    const baseline = snapshot();
    const source: ManagementWorkspaceSnapshotV1 = {
      ...baseline,
      requirements: baseline.requirements.map((requirement, index) => index === 0
        ? { ...requirement, teacherAssignmentScope: 'BLOCK', teacherContinuity: 'NONE' }
        : requirement),
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, [{
      type: 'SET_REQUIREMENT_RESOURCES', resource: {
        ...copy.requirementResourcesById['requirement-main'],
        teacherAssignmentScope: 'REQUIREMENT', teacherContinuity: 'REQUIRED',
      },
    }]).applied).toBe(true);
    const before = structuredClone({ copy, history });
    const placement = { ...copy.placementsByCardId['card-main-1'], teacherId: 'teacher-2' };
    const result = executeManagementWorkspaceCommandsV1(source, copy, history, [{
      type: 'SET_PLACEMENT', placement,
    }]);
    expect(result.applied).toBe(false);
    expect(result.issues.map(issue => issue.code)).toContain('TEACHER_CONTINUITY');
    expect({ copy, history }).toEqual(before);
    // Commit is an independent last-line guard even for a malformed working copy.
    setManagementWorkspacePlacementV1(copy, placement);
    const commit = prepareManagementWorkspaceCommitV1(source, copy);
    expect(commit.ready).toBe(false);
    expect(commit.issues.map(issue => issue.code)).toContain('TEACHER_CONTINUITY');
  });

  it('keeps a pinned room edit atomic across a selected card group', () => {
    const baseline = snapshot();
    const source: ManagementWorkspaceSnapshotV1 = {
      ...baseline,
      cards: baseline.cards.map((card, index) => index === 1 ? { ...card, roomPinned: true } : card),
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    const before = structuredClone({ copy, history });
    const plan = prepareManagementWorkspaceResourceEditV1(
      source, copy, ['card-main-1', 'card-main-2'], 'ROOM', 'room-2',
    );
    expect(plan.preview.canApply).toBe(false);
    expect(plan.preview.blockReasons).toContain('ROOM_PINNED_CHANGED');
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, plan.commands).applied).toBe(false);
    expect({ copy, history }).toEqual(before);
  });

  it('allows time moves with teacher/room pins while preserving both resources', () => {
    const initial = snapshot();
    const source: ManagementWorkspaceSnapshotV1 = {
      ...initial,
      cards: initial.cards.map((card, index) => index === 0
        ? { ...card, teacherPinned: true, roomPinned: true } : card),
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    const baseline = { ...copy.placementsByCardId['card-main-1'] };
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, [{
      type: 'SET_PLACEMENT', placement: { ...baseline, dayOfWeek: 4, startPeriod: 7 },
    }]).applied).toBe(true);
    expect(copy.placementsByCardId['card-main-1']).toEqual({ ...baseline, dayOfWeek: 4, startPeriod: 7 });
    expect(prepareManagementWorkspaceCommitV1(source, copy).ready).toBe(true);
    undoManagementWorkspaceOperationV1(copy, history);
    expect(diffManagementWorkspaceV1(source, copy).hasChanges).toBe(false);
  });

  it('unpins, changes a required teacher atomically, undoes/redoes, and rebases the saved state', () => {
    const baseline = snapshot();
    const source: ManagementWorkspaceSnapshotV1 = {
      ...baseline,
      cards: baseline.cards.map((card, index) => index === 1 ? { ...card, teacherPinned: true } : card),
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    expect(prepareManagementWorkspaceResourceEditV1(
      source, copy, ['card-main-1'], 'TEACHER', 'teacher-2',
    ).preview.canApply).toBe(false);

    expect(executeManagementWorkspaceCommandsV1(source, copy, history, [{
      type: 'SET_CARD_PINS', pins: {
        cardId: 'card-main-2', timePinned: false, teacherPinned: false, roomPinned: false,
      },
    }]).applied).toBe(true);
    const plan = prepareManagementWorkspaceResourceEditV1(
      source, copy, ['card-main-1'], 'TEACHER', 'teacher-2',
    );
    expect(plan.preview.canApply).toBe(true);
    const result = executeManagementWorkspaceCommandsV1(source, copy, history, plan.commands);
    expect(result.applied).toBe(true);
    expect(result.operations).toHaveLength(2);
    expect(new Set(result.operations.map(operation => operation.batchId)).size).toBe(1);
    const edited = structuredClone(copy);
    undoManagementWorkspaceOperationV1(copy, history);
    expect(copy.placementsByCardId).toEqual(createManagementWorkspaceWorkingCopyV1(source).placementsByCardId);
    undoManagementWorkspaceOperationV1(copy, history);
    expect(copy.cardsById['card-main-2'].teacherPinned).toBe(true);
    expect(diffManagementWorkspaceV1(source, copy).hasChanges).toBe(false);
    expect(prepareManagementWorkspaceCommitV1(source, copy).payload).toBeNull();
    redoManagementWorkspaceOperationV1(copy, history);
    redoManagementWorkspaceOperationV1(copy, history);
    expect(copy).toEqual(edited);
    const commit = prepareManagementWorkspaceCommitV1(source, copy);
    expect(commit.ready).toBe(true);
    expect(commit.payload?.changes).toHaveLength(2);
    expect(commit.payload?.pinChanges).toEqual([{
      card_id: 'card-main-2',
      before: { time_pinned: false, teacher_pinned: true, room_pinned: false },
      after: { time_pinned: false, teacher_pinned: false, room_pinned: false },
    }]);
    expect(commit.payload?.snapshotHash).toBe(source.identity.snapshotHash);
    expect(source.baselinePlacements.every(placement => (
      placement.cardId === 'card-other' || placement.teacherId === 'teacher-1'
    ))).toBe(true);
    // Simulate the post-Save snapshot; this is not a DB/browser persistence claim.
    const saved = {
      ...source,
      identity: { ...source.identity, snapshotHash: 'saved-hash', baselineHash: 'saved-baseline' },
      cards: source.cards.map(card => ({ ...card, teacherPinned: false })),
      baselinePlacements: Object.values(copy.placementsByCardId).map(placement => ({
        ...placement, dayOfWeek: placement.dayOfWeek!, startPeriod: placement.startPeriod!,
      })),
    };
    const rebased = createManagementWorkspaceWorkingCopyV1(saved);
    expect(diffManagementWorkspaceV1(saved, rebased).hasChanges).toBe(false);
    expect(rebased.placementsByCardId['card-main-2'].teacherId).toBe('teacher-2');
  });

  it('includes unsaved structural cards in requirement-wide resource edits', () => {
    const baseline = snapshot();
    const source: ManagementWorkspaceSnapshotV1 = {
      ...baseline,
      baselinePlacements: baseline.baselinePlacements.filter(placement => placement.cardId === 'card-other'),
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    const cards = [1, 2].map(index => ({
      id: `local-card-${index}`, requirementId: 'requirement-main', blockIndex: index,
      durationPeriods: 1, locked: false, baselineExists: false,
    }));
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, [{
      type: 'SET_REQUIREMENT_STRUCTURE', requirementId: 'requirement-main', bundle: {
        structure: { ...copy.requirementStructureById['requirement-main'] },
        cards,
        placements: cards.map(card => ({
          cardId: card.id, dayOfWeek: null, startPeriod: null, teacherId: null, roomId: null,
        })),
      },
    }]).applied).toBe(true);
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, cards.map((card, index) => ({
      type: 'SET_PLACEMENT', placement: {
        cardId: card.id, dayOfWeek: index + 1, startPeriod: 2, teacherId: 'teacher-1', roomId: 'room-1',
      },
    }))).applied).toBe(true);
    const plan = prepareManagementWorkspaceResourceEditV1(
      source, copy, ['local-card-1'], 'TEACHER', 'teacher-2',
    );
    expect(plan.preview.canApply).toBe(true);
    expect(plan.preview.cardIds).toEqual(['local-card-1', 'local-card-2']);
    expect(plan.preview.affectedRequirementCount).toBe(1);
    expect(plan.commands).toHaveLength(2);
    expect(executeManagementWorkspaceCommandsV1(source, copy, history, plan.commands).applied).toBe(true);
    expect(copy.placementsByCardId['local-card-2'].teacherId).toBe('teacher-2');
  });

  it('expands a required-continuity teacher change to all placed blocks', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const plan = prepareManagementWorkspaceResourceEditV1(
      source,
      copy,
      ['card-main-1'],
      'TEACHER',
      'teacher-2',
    );

    expect(plan.preview.canApply).toBe(true);
    expect(plan.preview.requestedCardIds).toEqual(['card-main-1']);
    expect(plan.preview.cardIds.sort()).toEqual([
      'card-main-1',
      'card-main-2',
    ]);
    expect(plan.preview.requirementWideExpansionCount).toBe(1);
    expect(plan.commands).toHaveLength(2);
    expect(plan.commands.every((command) => (
      command.type === 'SET_PLACEMENT'
      && command.placement.teacherId === 'teacher-2'
    ))).toBe(true);
  });

  it('rejects a local teacher change that introduces a timetable conflict', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-other',
      dayOfWeek: 1,
      startPeriod: 2,
      teacherId: 'teacher-2',
      roomId: 'room-2',
    });

    const plan = prepareManagementWorkspaceResourceEditV1(
      source,
      copy,
      ['card-main-1'],
      'TEACHER',
      'teacher-2',
    );

    expect(plan.preview.canApply).toBe(false);
    expect(plan.preview.blockReasons).toContain('TEACHER_CONFLICT');
  });

  it('changes only the selected room while preserving teacher/time', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const plan = prepareManagementWorkspaceResourceEditV1(
      source,
      copy,
      ['card-main-1'],
      'ROOM',
      'room-2',
    );

    expect(plan.preview.canApply).toBe(true);
    expect(plan.commands).toHaveLength(1);

    const command = plan.commands[0];
    expect(command.type).toBe('SET_PLACEMENT');
    if (command.type !== 'SET_PLACEMENT') return;

    expect(command.placement).toEqual({
      cardId: 'card-main-1',
      dayOfWeek: 1,
      startPeriod: 2,
      teacherId: 'teacher-1',
      roomId: 'room-2',
    });
  });

  it('invalidates a local resource preview token when placement state changes', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const before = prepareManagementWorkspaceResourceEditV1(
      source,
      copy,
      ['card-main-1'],
      'ROOM',
      'room-2',
    ).preview.stateToken;

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-main-1',
      dayOfWeek: 1,
      startPeriod: 3,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });

    const after = prepareManagementWorkspaceResourceEditV1(
      source,
      copy,
      ['card-main-1'],
      'ROOM',
      'room-2',
    ).preview.stateToken;

    expect(after).not.toBe(before);
  });
});
