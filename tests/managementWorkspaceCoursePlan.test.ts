import { describe, expect, it } from 'vitest';

import type { ManagementCoursePlanData } from '@/lib/managementCoursePlan';
import { projectManagementCoursePlanFromWorkspaceV1 } from '@/lib/managementWorkspaceCoursePlan';
import type { ManagementWorkspaceWorkingCopyV1 } from '@/lib/managementWorkspaceWorkingCopy';

function coursePlan(): ManagementCoursePlanData {
  return {
    requirementSetId: 'requirement-set-1',
    revisionId: 'revision-1',
    rows: [{
      requirementId: 'requirement-1',
      subjectName: 'Türkçe',
      groupName: '5A',
      groupType: 'SECTION',
      classCodes: ['5A'],
      weeklyLoad: 2,
      preferredPartition: [],
      allowedPartitions: [],
      minDistinctDays: null,
      maxBlocksPerDay: null,
      maxConsecutivePeriods: null,
      courseCharacter: 'ACADEMIC',
      deliveryMode: 'STANDARD',
      termStatus: 'ACTIVE',
      knowledgeStatus: 'CONFIRMED',
      teacherMode: 'FIXED',
      teacherRequirement: 'REQUIRED',
      teacherAssignmentScope: 'REQUIREMENT',
      teacherContinuity: 'REQUIRED',
      teacherIds: ['teacher-1'],
      teacherNames: ['Öğretmen 1'],
      resourceMode: 'FIXED',
      roomIds: ['room-1'],
      roomNames: ['Salon 1'],
      placedBlockCount: 0,
      requiredCapability: null,
    }],
    teacherOptions: [
      { id: 'teacher-1', name: 'Öğretmen 1' },
      { id: 'teacher-2', name: 'Öğretmen 2' },
    ],
    roomOptions: [
      { id: 'room-1', name: 'Salon 1' },
      { id: 'room-2', name: 'Salon 2' },
    ],
    roomCapabilityOptions: ['STUDIO_SMALL_GROUP'],
    teacherContinuityViolations: [{
      requirementId: 'requirement-1',
      subjectName: 'Türkçe',
      groupName: '5A',
      distinctResolvedTeachers: 2,
      placedBlocks: 2,
    }],
  };
}

function workingCopy(): ManagementWorkspaceWorkingCopyV1 {
  return {
    schemaVersion: 'management-workspace-copy-v1',
    baseline: {
      revisionId: 'revision-1',
      requirementSetId: 'requirement-set-1',
      revisionVersion: 1,
      academicYear: '2026-2027',
      term: 1,
      snapshotHash: 'snapshot-hash',
      baselineHash: 'baseline-hash',
    },
    placementsByCardId: {},
    requirementResourcesById: {
      'requirement-1': {
        requirementId: 'requirement-1',
        teacherIds: ['teacher-1', 'teacher-2'],
        teacherMode: 'ELIGIBLE_POOL',
        teacherAssignmentScope: 'BLOCK',
        teacherContinuity: 'PREFERRED',
        resourceMode: 'CAPABILITY',
        roomIds: [],
        requiredCapability: 'STUDIO_SMALL_GROUP',
      },
    },
    teacherInventoryById: {
      'teacher-1': {
        resourceType: 'TEACHER',
        resourceId: 'teacher-1',
        baselineDisplayName: 'Öğretmen 1',
        displayName: 'Öğretmen 1',
        operationalStatus: 'ACTIVE',
      },
      'teacher-2': {
        resourceType: 'TEACHER',
        resourceId: 'teacher-2',
        baselineDisplayName: 'Öğretmen 2',
        displayName: 'Öğretmen 2',
        operationalStatus: 'ACTIVE',
      },
    },
    roomInventoryById: {
      'room-1': {
        resourceType: 'ROOM',
        resourceId: 'room-1',
        baselineDisplayName: 'Salon 1',
        displayName: 'Salon 1',
        operationalStatus: 'ACTIVE',
      },
      'room-2': {
        resourceType: 'ROOM',
        resourceId: 'room-2',
        baselineDisplayName: 'Salon 2',
        displayName: 'Salon 2',
        operationalStatus: 'ACTIVE',
      },
    },
    teacherPlanningById: {
      'teacher-1': {
        teacherId: 'teacher-1',
        minimumLoad: null,
        targetLoad: null,
        maximumLoad: null,
      },
      'teacher-2': {
        teacherId: 'teacher-2',
        minimumLoad: null,
        targetLoad: null,
        maximumLoad: null,
      },
    },
    teacherAvailabilityById: {
      'teacher-1': {
        teacherId: 'teacher-1',
        unavailablePeriods: [],
      },
      'teacher-2': {
        teacherId: 'teacher-2',
        unavailablePeriods: [],
      }
    },
    roomProfileById: {
      'room-1': {
        roomId: 'room-1',
        capabilities: [],
        knowledgeStatus: 'CONFIRMED',
      },
      'room-2': {
        roomId: 'room-2',
        capabilities: [],
        knowledgeStatus: 'CONFIRMED',
      }
    },,
    resourceLifecycleById: {
      'teacher-1': {
        resourceType: 'TEACHER',
        resourceId: 'teacher-1',
        baselineExists: true,
        exists: true,
      },
      'teacher-2': {
        resourceType: 'TEACHER',
        resourceId: 'teacher-2',
        baselineExists: true,
        exists: true,
      },
      'room-1': {
        resourceType: 'ROOM',
        resourceId: 'room-1',
        baselineExists: true,
        exists: true,
      },
      'room-2': {
        resourceType: 'ROOM',
        resourceId: 'room-2',
        baselineExists: true,
        exists: true,
      }
    }
  };
}

describe('management workspace Course Plan adapter', () => {
  it('projects dirty local inventory names into Course Plan options and rows', () => {
    const source = coursePlan();
    const copy = workingCopy();

    copy.teacherInventoryById['teacher-1'].displayName =
      'Yerel Öğretmen 1';
    copy.roomInventoryById['room-1'].displayName =
      'Yerel Salon 1';

    const projected = projectManagementCoursePlanFromWorkspaceV1(
      source,
      copy,
    );

    expect(projected.teacherOptions.find((item) => item.id === 'teacher-1')?.name)
      .toBe('Yerel Öğretmen 1');
    expect(projected.roomOptions.find((item) => item.id === 'room-1')?.name)
      .toBe('Yerel Salon 1');
  });

  it('projects local teacher and room definitions without mutating server data', () => {
    const source = coursePlan();
    const projected = projectManagementCoursePlanFromWorkspaceV1(
      source,
      workingCopy(),
    );

    expect(projected.rows[0]).toMatchObject({
      teacherMode: 'ELIGIBLE_POOL',
      teacherAssignmentScope: 'BLOCK',
      teacherContinuity: 'PREFERRED',
      teacherIds: ['teacher-1', 'teacher-2'],
      teacherNames: ['Öğretmen 1', 'Öğretmen 2'],
      resourceMode: 'CAPABILITY',
      roomIds: [],
      roomNames: [],
      requiredCapability: 'STUDIO_SMALL_GROUP',
    });
    expect(projected.teacherContinuityViolations).toEqual([]);
    expect(source.rows[0].teacherMode).toBe('FIXED');
    expect(source.rows[0].resourceMode).toBe('FIXED');
    expect(source.teacherContinuityViolations).toHaveLength(1);
  });
});
