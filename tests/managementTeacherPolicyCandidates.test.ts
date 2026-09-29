import { describe, expect, it } from 'vitest';
import {
  applyManagementTeacherPolicyToCandidateDetail,
  type ManagementBoardCard,
  type ManagementCandidateDetail,
} from '@/lib/managementBoard';

function card(overrides: Partial<ManagementBoardCard> = {}): ManagementBoardCard {
  return {
    id: 'card',
    requirementId: 'requirement',
    blockIndex: 2,
    durationPeriods: 1,
    locked: false,
    subjectId: 'math',
    subjectName: 'Matematik',
    groupId: '10A',
    groupName: '10A 📚',
    groupType: 'SECTION',
    classCodes: ['10A'],
    audienceTargets: ['SECTION'],
    weeklyLoad: 3,
    teacherMode: 'ELIGIBLE_POOL',
    teacherRequirement: 'REQUIRED',
    teacherAssignmentScope: 'REQUIREMENT',
    teacherContinuity: 'REQUIRED',
    resolvedRequirementTeacherId: 'teacher-2',
    teacherContinuityConflict: false,
    teacherIds: ['teacher-1', 'teacher-2'],
    teacherNames: ['Matematik Öğretmeni 1', 'Matematik Öğretmeni 2'],
    resourceMode: 'FIXED',
    roomIds: ['room'],
    roomNames: ['Derslik'],
    courseCharacter: 'ACADEMIC',
    deliveryMode: 'STANDARD',
    knowledgeStatus: 'CONFIRMED',
    domainStatus: 'VALID',
    validCount: 2,
    invalidCount: 0,
    unresolvedCount: 0,
    isForced: false,
    isContradiction: false,
    placement: null,
    ...overrides,
  };
}

function detail(): ManagementCandidateDetail {
  const assessments = [
    {
      dayOfWeek: 1,
      startPeriod: 1,
      teacherId: 'teacher-1',
      roomId: 'room',
      status: 'VALID' as const,
      isComplete: true,
      reasonCodes: [] as string[],
    },
    {
      dayOfWeek: 1,
      startPeriod: 2,
      teacherId: 'teacher-2',
      roomId: 'room',
      status: 'VALID' as const,
      isComplete: true,
      reasonCodes: [] as string[],
    },
  ];

  return {
    assessments,
    reasonCounts: [],
    validCandidates: assessments,
    policyFilteredCount: 0,
    policyResolvedTeacherId: null,
    policyConflict: false,
  };
}

describe('teacher-policy-aware candidate reads', () => {
  it('filters teachers that disagree with the resolved requirement teacher', () => {
    const result = applyManagementTeacherPolicyToCandidateDetail(
      detail(),
      card(),
    );

    expect(result.validCandidates).toHaveLength(1);
    expect(result.validCandidates[0].teacherId).toBe('teacher-2');
    expect(result.policyFilteredCount).toBe(1);
    expect(result.policyResolvedTeacherId).toBe('teacher-2');
    expect(result.reasonCounts).toContainEqual({
      code: 'REQUIREMENT_TEACHER_MISMATCH',
      count: 1,
    });
  });

  it('counts policy rows already invalidated by the persisted domain layer', () => {
    const persisted = detail();
    persisted.assessments[0] = {
      ...persisted.assessments[0],
      status: 'INVALID',
      isComplete: false,
      reasonCodes: ['REQUIREMENT_TEACHER_MISMATCH'],
    };

    const result = applyManagementTeacherPolicyToCandidateDetail(
      persisted,
      card(),
    );

    expect(result.policyFilteredCount).toBe(1);
    expect(result.validCandidates).toHaveLength(1);
    expect(result.reasonCounts).toContainEqual({
      code: 'REQUIREMENT_TEACHER_MISMATCH',
      count: 1,
    });
  });

  it('keeps BLOCK-scoped teacher candidates independent', () => {
    const result = applyManagementTeacherPolicyToCandidateDetail(
      detail(),
      card({
        teacherAssignmentScope: 'BLOCK',
        teacherContinuity: 'NONE',
        resolvedRequirementTeacherId: null,
      }),
    );

    expect(result.validCandidates).toHaveLength(2);
    expect(result.policyFilteredCount).toBe(0);
  });

  it('blocks teacher choices while a requirement itself has a continuity conflict', () => {
    const result = applyManagementTeacherPolicyToCandidateDetail(
      detail(),
      card({
        resolvedRequirementTeacherId: null,
        teacherContinuityConflict: true,
      }),
    );

    expect(result.validCandidates).toHaveLength(0);
    expect(result.policyFilteredCount).toBe(2);
    expect(result.policyConflict).toBe(true);
    expect(result.reasonCounts).toContainEqual({
      code: 'REQUIREMENT_TEACHER_CONFLICT',
      count: 2,
    });
  });
});
