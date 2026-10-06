import { describe, expect, it } from 'vitest';

import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  createManagementWorkspaceWorkingCopyV1,
  diffManagementWorkspaceV1,
  hydrateManagementWorkspaceRequirementCatalogV1,
  removeManagementWorkspacePlacementV1,
} from '@/lib/managementWorkspaceWorkingCopy';
import {
  executeManagementWorkspaceCommandV1,
} from '@/lib/managementWorkspaceCommands';
import {
  createManagementWorkspaceHistoryV1,
  redoManagementWorkspaceOperationV1,
  undoManagementWorkspaceOperationV1,
} from '@/lib/managementWorkspaceHistory';
import {
  prepareManagementWorkspaceRequirementStructureV1,
  previewManagementWorkspaceRequirementStructureV1,
} from '@/lib/managementWorkspaceStructure';
import {
  buildManagementWorkspacePlacementCandidateDetailV1,
} from '@/lib/managementWorkspaceCandidates';

function snapshot(
  placed = true,
): ManagementWorkspaceSnapshotV1 {
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
      subjectName: 'Türkçe',
      groupId: 'group-1',
      groupName: '5A',
      groupType: 'SECTION',
      weeklyLoad: 2,
      preferredPartition: [1, 1],
      allowedPartitions: [[1, 1]],
      minDistinctDays: null,
      maxBlocksPerDay: null,
      maxConsecutivePeriods: null,
      courseCharacter: 'CULTURE',
      deliveryMode: 'STANDARD',
      teacherRequirement: 'REQUIRED',
      teacherMode: 'FIXED',
      teacherAssignmentScope: 'REQUIREMENT',
      teacherContinuity: 'REQUIRED',
      resourceMode: 'FIXED',
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
      classGroupId: 'class-1',
      name: '5A',
      groupType: 'SECTION',
      termStatus: 'ACTIVE',
      knowledgeStatus: 'CONFIRMED',
    }],
    instructionalGroupRelations: [],
    teacherPools: [{
      requirementId: 'requirement-1',
      teacherId: 'teacher-1',
    }],
    roomPools: [{
      requirementId: 'requirement-1',
      roomId: 'room-1',
    }],
    teachers: [{
      id: 'teacher-1',
      name: 'Öğretmen 1',
      operationalStatus: 'ACTIVE',
    }],
    teacherUnavailablePeriods: [],
    rooms: [{
      id: 'room-1',
      name: 'Salon 1',
      canonicalRoomId: null,
      capabilities: [],
      knowledgeStatus: 'CONFIRMED',
      operationalStatus: 'ACTIVE',
    }],
    baselinePlacements: placed
      ? [{
          cardId: 'card-1',
          dayOfWeek: 1,
          startPeriod: 1,
          teacherId: 'teacher-1',
          roomId: 'room-1',
        }]
      : [],
    baselineMetrics: {
      cardCount: 2,
      placedCardCount: placed ? 1 : 0,
      unplacedCardCount: placed ? 1 : 2,
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
      omissionReason: 'excluded',
    },
  };
}

describe('management workspace active requirement structure', () => {
  it('matches server duration-rank ambiguity and blocks shrinking equal-duration placed cards', () => {
    const source = snapshot(true);
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const preview = previewManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      {
        requirementId: 'requirement-1',
        weeklyLoad: 1,
        preferredPartition: [1],
        allowedPartitions: [[1]],
        termStatus: 'ACTIVE',
      },
    );

    expect(preview.canApply).toBe(false);
    expect(preview.blockReasons).toContain('HUMAN_CARD_CHOICE_REQUIRED');
    expect(preview.ambiguities).toEqual([{
      code: 'PLACED_EQUIVALENT_CARD_CHOICE',
      durationPeriods: 1,
      currentCount: 2,
      proposedCount: 1,
      placedCount: 1,
      message:
        'Aynı süreli birden fazla bloktan hangisinin korunacağı yerleşmiş bir bloğu etkiliyor.',
    }]);
  });

  it('creates a client-id card locally and tracks one structure diff', () => {
    const source = snapshot(false);
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();

    const preview = previewManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      {
        requirementId: 'requirement-1',
        weeklyLoad: 3,
        preferredPartition: [1, 1, 1],
        allowedPartitions: [[1, 1, 1]],
        termStatus: 'ACTIVE',
      },
    );
    expect(preview.canApply).toBe(true);
    expect(preview.createdBlocks).toHaveLength(1);

    const prepared = prepareManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      {
        requirementId: 'requirement-1',
        weeklyLoad: 3,
        preferredPartition: [1, 1, 1],
        allowedPartitions: [[1, 1, 1]],
        termStatus: 'ACTIVE',
      },
      preview.structureToken,
    );

    const result = executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      prepared.command,
    );
    expect(result.applied).toBe(true);

    const created = Object.values(copy.cardsById)
      .find((card) => !card.baselineExists);
    expect(created).toBeDefined();
    expect(created?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(copy.cardsById[created!.id]).toMatchObject({
      requirementId: 'requirement-1',
      blockIndex: 3,
      durationPeriods: 1,
      locked: false,
      baselineExists: false,
    });
    expect(copy.placementsByCardId[created!.id]).toEqual({
      cardId: created!.id,
      dayOfWeek: null,
      startPeriod: null,
      teacherId: null,
      roomId: null,
    });

    const diff = diffManagementWorkspaceV1(source, copy);
    expect(diff.requirementStructureChanges).toHaveLength(1);
    expect(diff.requirementStructureChanges[0].after).toMatchObject({
      weeklyLoad: 3,
      preferredPartition: [1, 1, 1],
      allowedPartitions: [[1, 1, 1]],
      termStatus: 'ACTIVE',
    });
  });

  it('undoes and redoes the complete structural card graph as one operation', () => {
    const source = snapshot(false);
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    const preview = previewManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      {
        requirementId: 'requirement-1',
        weeklyLoad: 3,
        preferredPartition: [1, 1, 1],
        allowedPartitions: [[1, 1, 1]],
        termStatus: 'ACTIVE',
      },
    );
    const prepared = prepareManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      {
        requirementId: 'requirement-1',
        weeklyLoad: 3,
        preferredPartition: [1, 1, 1],
        allowedPartitions: [[1, 1, 1]],
        termStatus: 'ACTIVE',
      },
      preview.structureToken,
    );

    executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      prepared.command,
    );
    expect(Object.keys(copy.cardsById)).toHaveLength(3);

    expect(
      undoManagementWorkspaceOperationV1(copy, history)?.kind,
    ).toBe('SET_REQUIREMENT_STRUCTURE');
    expect(Object.keys(copy.cardsById).sort()).toEqual(['card-1', 'card-2']);
    expect(copy.requirementStructureById['requirement-1'].weeklyLoad).toBe(2);

    expect(
      redoManagementWorkspaceOperationV1(copy, history)?.kind,
    ).toBe('SET_REQUIREMENT_STRUCTURE');
    expect(Object.keys(copy.cardsById)).toHaveLength(3);
    expect(copy.requirementStructureById['requirement-1'].weeklyLoad).toBe(3);
  });

  it('deactivates an unplaced ACTIVE requirement locally and removes its cards', () => {
    const source = snapshot(false);
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    const input = {
      requirementId: 'requirement-1',
      weeklyLoad: 0,
      preferredPartition: [],
      allowedPartitions: [],
      termStatus: 'INACTIVE' as const,
    };

    const preview = previewManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      input,
    );
    expect(preview.canApply).toBe(true);
    expect(preview.removedCards).toHaveLength(2);
    expect(preview.proposed.cardCount).toBe(0);

    const prepared = prepareManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      input,
      preview.structureToken,
    );
    const result = executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      prepared.command,
    );

    expect(result.applied).toBe(true);
    expect(copy.requirementStructureById['requirement-1'].termStatus)
      .toBe('INACTIVE');
    expect(Object.values(copy.cardsById).filter(
      (card) => card.requirementId === 'requirement-1',
    )).toHaveLength(0);

    const diff = diffManagementWorkspaceV1(source, copy);
    expect(diff.requirementStructureChanges[0]).toMatchObject({
      requirementId: 'requirement-1',
      before: { termStatus: 'ACTIVE' },
      after: { termStatus: 'INACTIVE', weeklyLoad: 0 },
    });
  });

  it('blocks deactivation while a card remains placed', () => {
    const source = snapshot(true);
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const preview = previewManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      {
        requirementId: 'requirement-1',
        weeklyLoad: 0,
        preferredPartition: [],
        allowedPartitions: [],
        termStatus: 'INACTIVE',
      },
    );

    expect(preview.canApply).toBe(false);
    expect(preview.blockReasons).toContain('PLACED_CARD_REMOVAL_REQUIRED');
  });

  it('hydrates an INACTIVE requirement and activates it with client UUID cards', () => {
    const source = snapshot(false);
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();

    hydrateManagementWorkspaceRequirementCatalogV1(copy, [{
      requirementId: 'requirement-inactive',
      subjectId: 'subject-2',
      subjectName: 'B. Uygulama',
      groupId: 'group-1',
      groupName: '5A',
      groupType: 'SECTION',
      classCodes: ['5A'],
      weeklyLoad: 0,
      preferredPartition: [],
      allowedPartitions: [],
      minDistinctDays: null,
      maxBlocksPerDay: null,
      maxConsecutivePeriods: null,
      courseCharacter: 'ART',
      deliveryMode: 'STANDARD',
      termStatus: 'INACTIVE',
      teacherRequirement: 'OPTIONAL',
      teacherMode: 'UNKNOWN',
      teacherAssignmentScope: 'UNSPECIFIED',
      teacherContinuity: 'NONE',
      teacherIds: [],
      resourceMode: 'UNKNOWN',
      roomIds: [],
      requiredCapability: null,
    }]);

    const input = {
      requirementId: 'requirement-inactive',
      weeklyLoad: 2,
      preferredPartition: [1, 1],
      allowedPartitions: [[1, 1]],
      termStatus: 'ACTIVE' as const,
    };
    const preview = previewManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      input,
    );

    expect(preview.current.termStatus).toBe('INACTIVE');
    expect(preview.current.cardCount).toBe(0);
    expect(preview.createdBlocks).toHaveLength(2);
    expect(preview.canApply).toBe(true);

    const prepared = prepareManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      input,
      preview.structureToken,
    );
    const result = executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      prepared.command,
    );

    expect(result.applied).toBe(true);
    expect(copy.requirementStructureById['requirement-inactive'].termStatus)
      .toBe('ACTIVE');

    const cards = Object.values(copy.cardsById)
      .filter((card) => card.requirementId === 'requirement-inactive');
    expect(cards).toHaveLength(2);
    expect(cards.every((card) => !card.baselineExists)).toBe(true);
    expect(cards.every((card) => /^[0-9a-f-]{36}$/i.test(card.id))).toBe(true);

    const diff = diffManagementWorkspaceV1(source, copy);
    const lifecycle = diff.requirementStructureChanges.find(
      (change) => change.requirementId === 'requirement-inactive',
    );
    expect(lifecycle).toMatchObject({
      before: {
        weeklyLoad: 0,
        preferredPartition: [],
        allowedPartitions: [],
        termStatus: 'INACTIVE',
      },
      after: {
        weeklyLoad: 2,
        preferredPartition: [1, 1],
        allowedPartitions: [[1, 1]],
        termStatus: 'ACTIVE',
      },
    });
  });

  it('feeds a newly created structural card into local candidate generation', () => {
    const source = snapshot(false);
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    const input = {
      requirementId: 'requirement-1',
      weeklyLoad: 3,
      preferredPartition: [1, 1, 1],
      allowedPartitions: [[1, 1, 1]],
      termStatus: 'ACTIVE' as const,
    };
    const preview = previewManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      input,
    );
    const prepared = prepareManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      input,
      preview.structureToken,
    );
    executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      prepared.command,
    );

    const created = Object.values(copy.cardsById)
      .find((card) => !card.baselineExists);
    expect(created).toBeDefined();

    const candidates = buildManagementWorkspacePlacementCandidateDetailV1(
      source,
      copy,
      created!.id,
    );
    expect(candidates).not.toBeNull();
    expect(candidates!.validCandidates.length).toBeGreaterThan(0);
  });


  it('requires undo or save before a second unsaved structure decision for the same requirement', () => {
    const source = snapshot(false);
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();
    const firstInput = {
      requirementId: 'requirement-1',
      weeklyLoad: 3,
      preferredPartition: [1, 1, 1],
      allowedPartitions: [[1, 1, 1]],
      termStatus: 'ACTIVE' as const,
    };
    const firstPreview = previewManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      firstInput,
    );
    const first = prepareManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      firstInput,
      firstPreview.structureToken,
    );
    executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      first.command,
    );

    expect(() => previewManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      {
        requirementId: 'requirement-1',
        weeklyLoad: 4,
        preferredPartition: [2, 1, 1],
        allowedPartitions: [[2, 1, 1]],
        termStatus: 'ACTIVE',
      },
    )).toThrow(/önce Geri Al veya ana Kaydet/i);
  });


  it('retains the staged placement removal when deactivation deletes that card from the local graph', () => {
    const source = snapshot(true);
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();

    removeManagementWorkspacePlacementV1(copy, 'card-1');

    const input = {
      requirementId: 'requirement-1',
      weeklyLoad: 0,
      preferredPartition: [],
      allowedPartitions: [],
      termStatus: 'INACTIVE' as const,
    };
    const preview = previewManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      input,
    );
    expect(preview.canApply).toBe(true);

    const prepared = prepareManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      input,
      preview.structureToken,
    );
    expect(executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      prepared.command,
    ).applied).toBe(true);

    const diff = diffManagementWorkspaceV1(source, copy);
    expect(diff.placementChanges).toContainEqual({
      cardId: 'card-1',
      before: {
        cardId: 'card-1',
        dayOfWeek: 1,
        startPeriod: 1,
        teacherId: 'teacher-1',
        roomId: 'room-1',
      },
      after: {
        cardId: 'card-1',
        dayOfWeek: null,
        startPeriod: null,
        teacherId: null,
        roomId: null,
      },
    });
    expect(diff.requirementStructureChanges[0]).toMatchObject({
      before: { termStatus: 'ACTIVE' },
      after: { termStatus: 'INACTIVE' },
    });
  });

});
