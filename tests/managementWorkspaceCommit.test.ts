import { describe, expect, it } from 'vitest';

import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  applyManagementWorkspaceResourceBundleV1,
  createManagementWorkspaceResourceBundleV1,
  createManagementWorkspaceWorkingCopyV1,
  getManagementWorkspaceResourceBundleV1,
  hydrateManagementWorkspaceRequirementCatalogV1,
  setManagementWorkspacePlacementV1,
  setManagementWorkspaceRequirementRoomsV1,
  setManagementWorkspaceRequirementTeacherPolicyV1,
  setManagementWorkspaceRequirementTeachersV1,
  setManagementWorkspaceTeacherInventoryV1,
  setManagementWorkspaceTeacherAvailabilityV1,
  setManagementWorkspaceTeacherPlanningV1,
} from '@/lib/managementWorkspaceWorkingCopy';
import { prepareManagementWorkspaceCommitV1 } from '@/lib/managementWorkspaceCommit';
import {
  prepareManagementWorkspaceRequirementStructureV1,
  previewManagementWorkspaceRequirementStructureV1,
} from '@/lib/managementWorkspaceStructure';
import {
  executeManagementWorkspaceCommandV1,
} from '@/lib/managementWorkspaceCommands';
import {
  applyManagementWorkspacePlacementOperationV1,
  createManagementWorkspaceHistoryV1,
  redoManagementWorkspaceOperationV1,
  undoManagementWorkspaceOperationV1,
} from '@/lib/managementWorkspaceHistory';

function snapshot(): ManagementWorkspaceSnapshotV1 {
  return {
    schemaVersion: 'management-workspace-v1',
    sourceSnapshotVersion: 'M33.0.1-v1',
    identity: {
      revisionId: 'revision-1',
      requirementSetId: 'requirement-set-1',
      revisionVersion: 7,
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
        id: 'requirement-1',
        subjectId: 'subject-1',
        subjectName: 'Türkçe',
        groupId: 'group-1',
        groupName: '5A',
        groupType: 'SECTION',
        weeklyLoad: 2,
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
        id: 'card-b',
        requirementId: 'requirement-1',
        blockIndex: 2,
        durationPeriods: 1,
        locked: false,
      },
      {
        id: 'card-a',
        requirementId: 'requirement-1',
        blockIndex: 1,
        durationPeriods: 1,
        locked: false,
      },
    ],
    instructionalGroups: [
      {
        id: 'group-1',
        classGroupId: 'class-1',
        name: '5A',
        groupType: 'SECTION',
        termStatus: 'ACTIVE',
        knowledgeStatus: 'CONFIRMED',
      },
    ],
    instructionalGroupRelations: [],
    teacherPools: [
      {
        requirementId: 'requirement-1',
        teacherId: 'teacher-1',
      },
    ],
    roomPools: [
      {
        requirementId: 'requirement-1',
        roomId: 'room-1',
      },
    ],
    teachers: [
      {
        id: 'teacher-1',
        name: 'Öğretmen 1',
        operationalStatus: 'ACTIVE',
      },
    ],
    teacherUnavailablePeriods: [],
    rooms: [
      {
        id: 'room-1',
        name: '105A',
        canonicalRoomId: null,
        capabilities: [],
        knowledgeStatus: 'CONFIRMED',
        operationalStatus: 'ACTIVE',
      },
    ],
    baselinePlacements: [
      {
        cardId: 'card-a',
        dayOfWeek: 1,
        startPeriod: 1,
        teacherId: 'teacher-1',
        roomId: 'room-1',
      },
      {
        cardId: 'card-b',
        dayOfWeek: 1,
        startPeriod: 2,
        teacherId: 'teacher-1',
        roomId: 'room-1',
      },
    ],
    baselineMetrics: {
      cardCount: 2,
      placedCardCount: 2,
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
      omissionReason: 'excluded',
    },
  };
}

describe('management workspace commit v1', () => {
  it('builds a deterministic atomic commit payload from the local diff', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-b',
      dayOfWeek: 2,
      startPeriod: 3,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });
    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-a',
      dayOfWeek: 2,
      startPeriod: 1,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.issues).toEqual([]);
    expect(prepared.payload?.revisionId).toBe('revision-1');
    expect(prepared.payload?.revisionVersion).toBe(7);
    expect(prepared.payload?.snapshotHash).toBe('snapshot-hash');
    expect(prepared.payload?.baselineHash).toBe('baseline-hash');
    expect(prepared.payload?.changes.map((change) => change.card_id))
      .toEqual(['card-a', 'card-b']);
  });

  it('includes deterministic resource inventory changes in the atomic payload', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspaceTeacherInventoryV1(
      copy,
      'teacher-1',
      {
        displayName: 'Öğretmen Yeni',
      },
    );

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.payload?.changes).toEqual([]);
    expect(prepared.payload?.requirementChanges).toEqual([]);
    expect(prepared.payload?.resourceChanges).toEqual([
      {
        resource_type: 'TEACHER',
        resource_id: 'teacher-1',
        before: {
          display_name: 'Öğretmen 1',
          operational_status: 'ACTIVE',
        },
        after: {
          display_name: 'Öğretmen Yeni',
          operational_status: 'ACTIVE',
        },
      },
    ]);
  });

  it('includes deterministic requirement resource changes in the atomic payload', () => {
    const source: ManagementWorkspaceSnapshotV1 = {
      ...snapshot(),
      baselinePlacements: [],
      baselineMetrics: {
        ...snapshot().baselineMetrics,
        placedCardCount: 0,
        unplacedCardCount: 2,
      },
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspaceRequirementTeachersV1(
      copy,
      'requirement-1',
      [],
    );
    setManagementWorkspaceRequirementRoomsV1(
      copy,
      'requirement-1',
      {
        resourceMode: 'CAPABILITY',
        roomIds: [],
        requiredCapability: 'BALLET_STUDIO',
      },
    );

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.payload?.changes).toEqual([]);
    expect(prepared.payload?.requirementChanges).toEqual([
      {
        requirement_id: 'requirement-1',
        before: {
          teacher_ids: ['teacher-1'],
          teacher_mode: 'FIXED',
          teacher_assignment_scope: 'REQUIREMENT',
          teacher_continuity: 'REQUIRED',
          resource_mode: 'ELIGIBLE_POOL',
          room_ids: ['room-1'],
          required_capability: null,
        },
        after: {
          teacher_ids: [],
          teacher_mode: 'UNKNOWN',
          teacher_assignment_scope: 'REQUIREMENT',
          teacher_continuity: 'REQUIRED',
          resource_mode: 'CAPABILITY',
          room_ids: [],
          required_capability: 'BALLET_STUDIO',
        },
      },
    ]);
  });

  it('allows policy-only plan changes on a placed baseline requirement', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspaceRequirementTeacherPolicyV1(
      copy,
      'requirement-1',
      {
        teacherAssignmentScope: 'BLOCK',
        teacherContinuity: 'NONE',
      },
    );

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.issues).toEqual([]);
    expect(prepared.payload?.changes).toEqual([]);
    expect(prepared.payload?.requirementChanges).toEqual([
      {
        requirement_id: 'requirement-1',
        before: {
          teacher_ids: ['teacher-1'],
          teacher_mode: 'FIXED',
          teacher_assignment_scope: 'REQUIREMENT',
          teacher_continuity: 'REQUIRED',
          resource_mode: 'ELIGIBLE_POOL',
          room_ids: ['room-1'],
          required_capability: null,
        },
        after: {
          teacher_ids: ['teacher-1'],
          teacher_mode: 'FIXED',
          teacher_assignment_scope: 'BLOCK',
          teacher_continuity: 'NONE',
          resource_mode: 'ELIGIBLE_POOL',
          room_ids: ['room-1'],
          required_capability: null,
        },
      },
    ]);
  });

  it('blocks plan resource edits while the baseline requirement is placed', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspaceRequirementTeachersV1(
      copy,
      'requirement-1',
      [],
    );

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(false);
    expect(prepared.issues.map((issue) => issue.code))
      .toContain('REQUIREMENT_RESOURCES_REQUIRE_UNPLACED');
  });

  it('does not prepare a commit when the working copy matches baseline', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(false);
    expect(prepared.issues).toEqual([]);
    expect(prepared.payload).toBeNull();
  });

  it('blocks commit preparation when final hard validation fails', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-b',
      dayOfWeek: 1,
      startPeriod: 1,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(false);
    expect(prepared.payload).toBeNull();
    expect(prepared.issues.map((issue) => issue.code))
      .toContain('TEACHER_CONFLICT');
  });
  it('allows commit when only inherited baseline issues remain unchanged', () => {
    const source: ManagementWorkspaceSnapshotV1 = {
      ...snapshot(),
      teacherPools: [],
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-b',
      dayOfWeek: 2,
      startPeriod: 3,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.issues).toEqual([]);
    expect(prepared.payload?.changes.map((change) => change.card_id))
      .toEqual(['card-b']);
  });

  it('still blocks commit when the local edit introduces a new hard issue', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspacePlacementV1(copy, {
      cardId: 'card-b',
      dayOfWeek: 1,
      startPeriod: 1,
      teacherId: 'teacher-1',
      roomId: 'room-1',
    });

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(false);
    expect(prepared.issues.map((issue) => issue.code))
      .toContain('TEACHER_CONFLICT');
  });


  it('includes deterministic teacher planning changes in the atomic payload', () => {
    const source = {
      ...snapshot(),
      teacherLoadTargets: [{
        teacherId: 'teacher-1',
        minimumLoad: 4,
        targetLoad: 6,
        maximumLoad: 8,
      }],
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspaceTeacherPlanningV1(copy, 'teacher-1', {
      minimumLoad: 5,
      targetLoad: 7,
      maximumLoad: 9,
    });

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.payload?.teacherPlanningChanges).toEqual([{
      teacher_id: 'teacher-1',
      before: {
        minimum_load: 4,
        target_load: 6,
        maximum_load: 8,
      },
      after: {
        minimum_load: 5,
        target_load: 7,
        maximum_load: 9,
      },
    }]);
  });


  it('includes deterministic teacher availability changes in the atomic payload', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    setManagementWorkspaceTeacherAvailabilityV1(copy, 'teacher-1', [
      { dayOfWeek: 3, period: 2 },
      { dayOfWeek: 1, period: 4 },
    ]);

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.payload?.teacherAvailabilityChanges).toEqual([{
      teacher_id: 'teacher-1',
      before: [],
      after: [
        { day_of_week: 1, period: 4 },
        { day_of_week: 3, period: 2 },
      ],
    }]);
  });


  it('includes deterministic room profile changes in the atomic payload', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    copy.roomProfileById['room-1'] = {
      roomId: 'room-1',
      capabilities: ['STUDIO_SMALL_GROUP'],
      knowledgeStatus: 'OBSERVED',
    };

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.payload?.roomProfileChanges).toEqual([{
      room_id: 'room-1',
      before: {
        capabilities: [],
        knowledge_status: 'CONFIRMED',
      },
      after: {
        capabilities: ['STUDIO_SMALL_GROUP'],
        knowledge_status: 'OBSERVED',
      },
    }]);
  });


  it('includes staged resource creates and deletes in the v9 atomic payload', () => {
    const base = snapshot();
    const source = {
      ...base,
      teachers: [
        ...base.teachers,
        {
          id: '33333333-3333-4333-8333-333333333333',
          name: 'Kullanılmayan Öğretmen',
          operationalStatus: 'ACTIVE',
        },
      ],
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);

    const created = createManagementWorkspaceResourceBundleV1(
      copy,
      'ROOM',
      '22222222-2222-4222-8222-222222222222',
      'Yeni Salon',
    );
    created.inventory.operationalStatus = 'MAINTENANCE';
    if (created.roomProfile) {
      created.roomProfile.capabilities = ['STUDIO_SMALL_GROUP'];
      created.roomProfile.knowledgeStatus = 'CONFIRMED';
    }
    applyManagementWorkspaceResourceBundleV1(
      copy,
      'ROOM',
      created.lifecycle.resourceId,
      created,
    );

    const unused = getManagementWorkspaceResourceBundleV1(
      copy,
      'TEACHER',
      '33333333-3333-4333-8333-333333333333',
    )!;
    applyManagementWorkspaceResourceBundleV1(
      copy,
      'TEACHER',
      unused.lifecycle.resourceId,
      {
        ...unused,
        lifecycle: {
          ...unused.lifecycle,
          exists: false,
        },
      },
    );

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.payload?.resourceCreates).toEqual([{
      resource_type: 'ROOM',
      resource_id: '22222222-2222-4222-8222-222222222222',
      display_name: 'Yeni Salon',
      operational_status: 'MAINTENANCE',
      teacher_planning: null,
      teacher_availability: null,
      room_profile: {
        capabilities: ['STUDIO_SMALL_GROUP'],
        knowledge_status: 'CONFIRMED',
      },
    }]);
    expect(prepared.payload?.resourceDeletes).toEqual([{
      resource_type: 'TEACHER',
      resource_id: '33333333-3333-4333-8333-333333333333',
    }]);
  });


  it('includes final active structure card graph in the v10 atomic payload', () => {
    const source = snapshot();
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
    const structure = prepareManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      input,
      preview.structureToken,
    );

    const result = executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      structure.command,
    );
    expect(result.applied).toBe(true);

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);
    expect(prepared.ready).toBe(true);
    expect(prepared.payload?.structureChanges).toHaveLength(1);

    const change = prepared.payload!.structureChanges[0];
    expect(change).toMatchObject({
      requirement_id: 'requirement-1',
      before: {
        weekly_load: 2,
        preferred_partition: [],
        allowed_partitions: [],
        term_status: 'ACTIVE',
      },
      after: {
        weekly_load: 3,
        preferred_partition: [1, 1, 1],
        allowed_partitions: [[1, 1, 1]],
        term_status: 'ACTIVE',
      },
    });
    expect(change.final_cards).toHaveLength(3);
    expect(change.final_cards.filter((card) => card.baseline_exists))
      .toHaveLength(2);
    const created = change.final_cards.find((card) => !card.baseline_exists);
    expect(created).toMatchObject({
      block_index: 3,
      duration_periods: 1,
      baseline_exists: false,
      locked: false,
    });
    expect(created?.card_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });


  it('includes INACTIVE to ACTIVE lifecycle with client cards in the v11 payload', () => {
    const source: ManagementWorkspaceSnapshotV1 = {
      ...snapshot(),
      baselinePlacements: [],
      baselineMetrics: {
        ...snapshot().baselineMetrics,
        placedCardCount: 0,
        unplacedCardCount: 2,
      },
    };
    const copy = createManagementWorkspaceWorkingCopyV1(source);
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
    const history = createManagementWorkspaceHistoryV1();
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
    const structure = prepareManagementWorkspaceRequirementStructureV1(
      source,
      copy,
      input,
      preview.structureToken,
    );
    expect(executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      structure.command,
    ).applied).toBe(true);

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    const lifecycle = prepared.payload?.structureChanges.find(
      (change) => change.requirement_id === 'requirement-inactive',
    );
    expect(lifecycle).toMatchObject({
      before: {
        weekly_load: 0,
        preferred_partition: [],
        allowed_partitions: [],
        term_status: 'INACTIVE',
      },
      after: {
        weekly_load: 2,
        preferred_partition: [1, 1],
        allowed_partitions: [[1, 1]],
        term_status: 'ACTIVE',
      },
    });
    expect(lifecycle?.final_cards).toHaveLength(2);
    expect(lifecycle?.final_cards.every(
      (card) => !card.baseline_exists,
    )).toBe(true);
  });


  it('keeps mixed workspace edits local through undo redo before one atomic commit payload', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();

    applyManagementWorkspacePlacementOperationV1(
      copy,
      history,
      {
        cardId: 'card-b',
        dayOfWeek: 2,
        startPeriod: 3,
        teacherId: 'teacher-1',
        roomId: 'room-1',
      },
    );

    expect(executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      {
        type: 'SET_TEACHER_AVAILABILITY',
        availability: {
          teacherId: 'teacher-1',
          unavailablePeriods: [{ dayOfWeek: 5, period: 12 }],
        },
      },
    ).applied).toBe(true);

    expect(executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      {
        type: 'SET_ROOM_PROFILE',
        profile: {
          roomId: 'room-1',
          capabilities: ['STUDIO_SMALL_GROUP'],
          knowledgeStatus: 'OBSERVED',
        },
      },
    ).applied).toBe(true);

    expect(history.undoStack.map((operation) => operation.kind)).toEqual([
      'SET_PLACEMENT',
      'SET_TEACHER_AVAILABILITY',
      'SET_ROOM_PROFILE',
    ]);

    expect(undoManagementWorkspaceOperationV1(copy, history)?.kind)
      .toBe('SET_ROOM_PROFILE');
    expect(undoManagementWorkspaceOperationV1(copy, history)?.kind)
      .toBe('SET_TEACHER_AVAILABILITY');
    expect(undoManagementWorkspaceOperationV1(copy, history)?.kind)
      .toBe('SET_PLACEMENT');

    const reverted = prepareManagementWorkspaceCommitV1(source, copy);
    expect(reverted.ready).toBe(false);
    expect(reverted.payload).toBeNull();

    expect(redoManagementWorkspaceOperationV1(copy, history)?.kind)
      .toBe('SET_PLACEMENT');
    expect(redoManagementWorkspaceOperationV1(copy, history)?.kind)
      .toBe('SET_TEACHER_AVAILABILITY');
    expect(redoManagementWorkspaceOperationV1(copy, history)?.kind)
      .toBe('SET_ROOM_PROFILE');

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.issues).toEqual([]);
    expect(prepared.payload?.changes.map((change) => change.card_id))
      .toEqual(['card-b']);
    expect(prepared.payload?.teacherAvailabilityChanges).toEqual([{
      teacher_id: 'teacher-1',
      before: [],
      after: [{ day_of_week: 5, period: 12 }],
    }]);
    expect(prepared.payload?.roomProfileChanges).toEqual([{
      room_id: 'room-1',
      before: {
        capabilities: [],
        knowledge_status: 'CONFIRMED',
      },
      after: {
        capabilities: ['STUDIO_SMALL_GROUP'],
        knowledge_status: 'OBSERVED',
      },
    }]);
  });


  it('keeps requirement time preferences local and serializes them in the atomic save payload', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();

    copy.requirementCatalogById['requirement-1'].baselinePreferredDays = [1];
    copy.requirementCatalogById['requirement-1'].baselinePreferredStartPeriods = [2];
    copy.requirementTimePreferencesById['requirement-1'] = {
      requirementId: 'requirement-1',
      preferredDays: [1],
      preferredStartPeriods: [2],
    };

    const result = executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      {
        type: 'SET_REQUIREMENT_TIME_PREFERENCE',
        preference: {
          requirementId: 'requirement-1',
          preferredDays: [4, 2],
          preferredStartPeriods: [6, 3],
        },
      },
    );

    expect(result.applied).toBe(true);
    expect(copy.requirementTimePreferencesById['requirement-1']).toEqual({
      requirementId: 'requirement-1',
      preferredDays: [2, 4],
      preferredStartPeriods: [3, 6],
    });

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.payload?.timePreferenceChanges).toEqual([{
      requirement_id: 'requirement-1',
      before: {
        preferred_days: [1],
        preferred_start_periods: [2],
      },
      after: {
        preferred_days: [2, 4],
        preferred_start_periods: [3, 6],
      },
    }]);
  });


  it('includes fine-grained card pins in the atomic v13 payload', () => {
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    const history = createManagementWorkspaceHistoryV1();

    expect(executeManagementWorkspaceCommandV1(
      source,
      copy,
      history,
      {
        type: 'SET_CARD_PINS',
        pins: {
          cardId: 'card-a',
          timePinned: true,
          teacherPinned: false,
          roomPinned: true,
        },
      },
    ).applied).toBe(true);

    const prepared = prepareManagementWorkspaceCommitV1(source, copy);

    expect(prepared.ready).toBe(true);
    expect(prepared.payload?.pinChanges).toEqual([{
      card_id: 'card-a',
      before: {
        time_pinned: false,
        teacher_pinned: false,
        room_pinned: false,
      },
      after: {
        time_pinned: true,
        teacher_pinned: false,
        room_pinned: true,
      },
    }]);
  });

});
