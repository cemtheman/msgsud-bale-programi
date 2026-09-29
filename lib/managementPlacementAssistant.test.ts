import { describe, expect, it } from 'vitest';
import type {
  ManagementBoardCard,
  ManagementCandidateDetail,
} from '@/lib/managementBoard';
import {
  buildManagementPlacementAssistantGroups,
  buildManagementPlacementAssistantPlan,
  buildSafeManagementPlacementSuggestion,
  sortManagementPlacementAssistantPlans,
} from '@/lib/managementPlacementAssistant';

function card(
  id: string,
  classCode: string,
  overrides: Partial<ManagementBoardCard> = {},
): ManagementBoardCard {
  return {
    id,
    requirementId: 'req-' + id,
    blockIndex: 1,
    durationPeriods: 1,
    locked: false,
    subjectId: 'subject',
    subjectName: 'Türkçe',
    groupId: 'group-' + id,
    groupName: classCode + ' 📚',
    groupType: 'SECTION',
    classCodes: [classCode],
    audienceTargets: ['SECTION'],
    weeklyLoad: 1,
    teacherMode: 'FIXED',
    teacherRequirement: 'REQUIRED',
    teacherAssignmentScope: 'REQUIREMENT',
    teacherContinuity: 'REQUIRED',
    resolvedRequirementTeacherId: null,
    teacherContinuityConflict: false,
    teacherIds: ['teacher'],
    teacherNames: ['Türkçe Öğretmeni'],
    resourceMode: 'SPECIFIC',
    roomIds: ['room'],
    roomNames: ['B1 105A'],
    courseCharacter: 'ACADEMIC',
    deliveryMode: 'STANDARD',
    knowledgeStatus: 'CONFIRMED',
    domainStatus: 'VALID',
    validCount: 1,
    invalidCount: 0,
    unresolvedCount: 0,
    isForced: true,
    isContradiction: false,
    placement: null,
    ...overrides,
  };
}

function detail(
  candidates: Array<{
    dayOfWeek: number;
    startPeriod: number;
    teacherId?: string | null;
    roomId?: string | null;
  }>,
): ManagementCandidateDetail {
  return {
    assessments: candidates.map((candidate) => ({
      dayOfWeek: candidate.dayOfWeek,
      startPeriod: candidate.startPeriod,
      teacherId: candidate.teacherId ?? 'teacher',
      roomId: candidate.roomId ?? 'room',
      status: 'VALID',
      isComplete: true,
      reasonCodes: [],
    })),
    reasonCounts: [],
    validCandidates: [],
    policyFilteredCount: 0,
    policyResolvedTeacherId: null,
    policyConflict: false,
  };
}

describe('management placement assistant', () => {
  it('never includes a card that is already placed', () => {
    const groups = buildManagementPlacementAssistantGroups([
      card('placed', '5A', {
        placement: {
          dayOfWeek: 1,
          startPeriod: 3,
          teacherId: 'teacher',
          roomId: 'room',
          teacherName: 'Öğretmen',
          roomName: 'Salon',
          moveTransactionId: null,
        },
      }),
      card('open', '5B'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].cardIds).toEqual(['open']);
  });

  it('classifies a forced unplaced card as a single-option group', () => {
    const groups = buildManagementPlacementAssistantGroups([
      card('a', '5A'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].status).toBe('SINGLE_OPTION');
  });

  it('builds one safe grouped suggestion when every source card has the same exact slot', () => {
    const cards = [
      card('a', '5A'),
      card('b', '5B'),
    ];
    const [group] = buildManagementPlacementAssistantGroups(cards);

    const suggestion = buildSafeManagementPlacementSuggestion(
      group,
      {
        a: detail([{ dayOfWeek: 2, startPeriod: 3, roomId: 'room-a' }]),
        b: detail([{ dayOfWeek: 2, startPeriod: 3, roomId: 'room-b' }]),
      },
      { teacher: 'Türkçe Öğretmeni' },
      {
        'room-a': 'B1 105A',
        'room-b': 'B1 105B',
      },
    );

    expect(suggestion?.dayOfWeek).toBe(2);
    expect(suggestion?.startPeriod).toBe(3);
    expect(suggestion?.moves).toHaveLength(2);
  });

  it('orders multi-choice lessons from fewer common slots to more', () => {
    const [tightGroup] = buildManagementPlacementAssistantGroups([
      card('tight', '5A', { isForced: false, validCount: 2 }),
    ]);
    const [wideGroup] = buildManagementPlacementAssistantGroups([
      card('wide', '6A', { isForced: false, validCount: 4 }),
    ]);

    const tightPlan = buildManagementPlacementAssistantPlan(
      tightGroup,
      {
        tight: detail([
          { dayOfWeek: 1, startPeriod: 1 },
          { dayOfWeek: 2, startPeriod: 1 },
        ]),
      },
      { teacher: 'Öğretmen' },
      { room: 'Salon' },
    );

    const widePlan = buildManagementPlacementAssistantPlan(
      wideGroup,
      {
        wide: detail([
          { dayOfWeek: 1, startPeriod: 1 },
          { dayOfWeek: 2, startPeriod: 1 },
          { dayOfWeek: 3, startPeriod: 1 },
          { dayOfWeek: 4, startPeriod: 1 },
        ]),
      },
      { teacher: 'Öğretmen' },
      { room: 'Salon' },
    );

    const sorted = sortManagementPlacementAssistantPlans([
      widePlan,
      tightPlan,
    ]);

    expect(sorted[0].group.id).toBe(tightGroup.id);
    expect(sorted[0].commonSlotCount).toBe(2);
    expect(sorted[1].commonSlotCount).toBe(4);
  });

  it('keeps resource-ambiguous slots for human review instead of auto-applying them', () => {
    const [group] = buildManagementPlacementAssistantGroups([
      card('a', '5A', { isForced: false, validCount: 2 }),
    ]);

    const plan = buildManagementPlacementAssistantPlan(
      group,
      {
        a: detail([
          { dayOfWeek: 3, startPeriod: 4, roomId: 'room-a' },
          { dayOfWeek: 3, startPeriod: 4, roomId: 'room-b' },
        ]),
      },
      { teacher: 'Türkçe Öğretmeni' },
      {
        'room-a': 'B1 105A',
        'room-b': 'A 101',
      },
    );

    expect(plan.commonSlotCount).toBe(1);
    expect(plan.exactOptions).toHaveLength(0);
    expect(plan.resourceChoiceSlotCount).toBe(1);
  });

  it('keeps ambiguous earlier slots before a later exact slot', () => {
    const [group] = buildManagementPlacementAssistantGroups([
      card('a', '5A', { isForced: false, validCount: 3 }),
    ]);

    const plan = buildManagementPlacementAssistantPlan(
      group,
      {
        a: detail([
          { dayOfWeek: 1, startPeriod: 2, roomId: 'room-a' },
          { dayOfWeek: 1, startPeriod: 2, roomId: 'room-b' },
          { dayOfWeek: 5, startPeriod: 3, roomId: 'room-a' },
        ]),
      },
      { teacher: 'Türkçe Öğretmeni' },
      {
        'room-a': 'B1 105A',
        'room-b': 'A 101',
      },
    );

    expect(plan.slots.map((slot) => [
      slot.dayOfWeek,
      slot.startPeriod,
      Boolean(slot.exactOption),
    ])).toEqual([
      [1, 2, false],
      [5, 3, true],
    ]);
    expect(plan.resourceChoiceSlotCount).toBe(1);
    expect(plan.exactOptions).toHaveLength(1);
  });

  it('surfaces teacher-policy filtering in the assistant plan', () => {
    const [group] = buildManagementPlacementAssistantGroups([
      card('a', '10A', { isForced: false, validCount: 2 }),
    ]);

    const policyDetail = detail([
      { dayOfWeek: 1, startPeriod: 1, teacherId: 'teacher' },
    ]);
    policyDetail.policyFilteredCount = 7;
    policyDetail.policyResolvedTeacherId = 'teacher';

    const plan = buildManagementPlacementAssistantPlan(
      group,
      { a: policyDetail },
      { teacher: 'Matematik Öğretmeni 2' },
      { room: 'Salon' },
    );

    expect(plan.policyFilteredCandidateCount).toBe(7);
    expect(plan.policyTeacherLabels).toEqual(['Matematik Öğretmeni 2']);
    expect(plan.policyConflictCount).toBe(0);
  });

  it('refuses automatic suggestion when the exact slot still has a resource choice', () => {
    const [group] = buildManagementPlacementAssistantGroups([
      card('a', '5A', { validCount: 2 }),
    ]);

    // The summary is deliberately marked single-option to exercise the
    // second safety check against fresh candidate detail.
    group.status = 'SINGLE_OPTION';

    const suggestion = buildSafeManagementPlacementSuggestion(
      group,
      {
        a: detail([
          { dayOfWeek: 3, startPeriod: 4, roomId: 'room-a' },
          { dayOfWeek: 3, startPeriod: 4, roomId: 'room-b' },
        ]),
      },
      { teacher: 'Türkçe Öğretmeni' },
      {
        'room-a': 'B1 105A',
        'room-b': 'A 101',
      },
    );

    expect(suggestion).toBeNull();
  });
});
