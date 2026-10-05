import { describe, expect, it } from 'vitest';

import type {
  ManagementResourceInventoryData,
} from '@/lib/managementResources';
import { projectManagementResourcesFromWorkspaceV1 } from '@/lib/managementWorkspaceInventory';
import type {
  ManagementWorkspaceWorkingCopyV1,
} from '@/lib/managementWorkspaceWorkingCopy';

function resources(): ManagementResourceInventoryData {
  return {
    revisionId: 'revision-1',
    teachers: [{
      id: 'teacher-1',
      name: 'Taslak Öğretmen Override',
      baseName: 'Öğretmen Base',
      nameOverridden: true,
      operationalStatus: 'ACTIVE',
      activeRequirementCount: 1,
      placedBlockCount: 0,
      actualLoadPeriods: 0,
      minimumLoad: null,
      targetLoad: null,
      maximumLoad: null,
      loadConfigured: false,
      unavailablePeriods: [],
      unavailablePeriodCount: 0,
      availabilityConfigured: false,
      unavailablePlacedBlockCount: 0,
    }],
    rooms: [{
      id: 'room-1',
      name: 'Taslak Salon Override',
      baseName: 'Salon Base',
      nameOverridden: true,
      canonicalRoomId: null,
      canonicalRoomName: null,
      aliasCount: 0,
      knowledgeStatus: 'CONFIRMED',
      operationalStatus: 'ACTIVE',
      capabilities: [],
      activeRequirementCount: 1,
      placedBlockCount: 0,
    }],
    availableCapabilities: [],
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
    requirementResourcesById: {},
    teacherInventoryById: {
      'teacher-1': {
        resourceType: 'TEACHER',
        resourceId: 'teacher-1',
        baselineDisplayName: 'Taslak Öğretmen Override',
        displayName: 'Taslak Öğretmen Override',
        operationalStatus: 'ACTIVE',
      },
    },
    roomInventoryById: {
      'room-1': {
        resourceType: 'ROOM',
        resourceId: 'room-1',
        baselineDisplayName: 'Taslak Salon Override',
        displayName: 'Taslak Salon Override',
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
    },
    teacherAvailabilityById: {
      'teacher-1': {
        teacherId: 'teacher-1',
        unavailablePeriods: [],
      }
    },
    roomProfileById: {
      'room-1': {
        roomId: 'room-1',
        capabilities: [],
        knowledgeStatus: 'CONFIRMED',
      }
    },
    resourceLifecycleById: {
      'teacher-1': {
        resourceType: 'TEACHER',
        resourceId: 'teacher-1',
        baselineExists: true,
        exists: true,
      },
      'room-1': {
        resourceType: 'ROOM',
        resourceId: 'room-1',
        baselineExists: true,
        exists: true,
      }
    }
  };
}

describe('management workspace Resources projection', () => {
  it('preserves effective server draft names when there is no local rename', () => {
    const projected = projectManagementResourcesFromWorkspaceV1(
      resources(),
      workingCopy(),
    );

    expect(projected.teachers[0].name).toBe('Taslak Öğretmen Override');
    expect(projected.teachers[0].nameOverridden).toBe(true);
    expect(projected.rooms[0].name).toBe('Taslak Salon Override');
    expect(projected.rooms[0].nameOverridden).toBe(true);
  });

  it('projects local rename and operational status immediately', () => {
    const copy = workingCopy();
    copy.teacherInventoryById['teacher-1'].displayName = 'Yerel Öğretmen';
    copy.teacherInventoryById['teacher-1'].operationalStatus = 'INACTIVE';
    copy.roomInventoryById['room-1'].displayName = 'Yerel Salon';
    copy.roomInventoryById['room-1'].operationalStatus = 'MAINTENANCE';

    const projected = projectManagementResourcesFromWorkspaceV1(
      resources(),
      copy,
    );

    expect(projected.teachers[0]).toMatchObject({
      name: 'Yerel Öğretmen',
      operationalStatus: 'INACTIVE',
      nameOverridden: true,
    });
    expect(projected.rooms[0]).toMatchObject({
      name: 'Yerel Salon',
      operationalStatus: 'MAINTENANCE',
      nameOverridden: true,
    });
  });

  it('projects local teacher load targets into Resources immediately', () => {
    const copy = workingCopy();
    copy.teacherPlanningById['teacher-1'] = {
      teacherId: 'teacher-1',
      minimumLoad: 3,
      targetLoad: 5,
      maximumLoad: 7,
    };

    const projected = projectManagementResourcesFromWorkspaceV1(
      resources(),
      copy,
    );

    expect(projected.teachers[0]).toMatchObject({
      minimumLoad: 3,
      targetLoad: 5,
      maximumLoad: 7,
      loadConfigured: true,
    });
  });


  it('projects local teacher availability into Resources immediately', () => {
    const copy = workingCopy();
    copy.teacherAvailabilityById['teacher-1'] = {
      teacherId: 'teacher-1',
      unavailablePeriods: [
        { dayOfWeek: 2, period: 3 },
        { dayOfWeek: 2, period: 4 },
      ],
    };

    const projected = projectManagementResourcesFromWorkspaceV1(
      resources(),
      copy,
    );

    expect(projected.teachers[0]).toMatchObject({
      unavailablePeriods: [
        { dayOfWeek: 2, period: 3 },
        { dayOfWeek: 2, period: 4 },
      ],
      unavailablePeriodCount: 2,
      availabilityConfigured: true,
    });
  });


  it('projects local room profile changes into Resources immediately', () => {
    const copy = workingCopy();
    copy.roomProfileById['room-1'] = {
      roomId: 'room-1',
      capabilities: ['STUDIO_SMALL_GROUP'],
      knowledgeStatus: 'OBSERVED',
    };

    const projected = projectManagementResourcesFromWorkspaceV1(
      resources(),
      copy,
    );

    expect(projected.rooms[0]).toMatchObject({
      capabilities: ['STUDIO_SMALL_GROUP'],
      knowledgeStatus: 'OBSERVED',
    });
  });


  it('shows staged creates and hides staged deletes immediately', () => {
    const copy = workingCopy();
    copy.resourceLifecycleById['teacher-1'].exists = false;

    copy.resourceLifecycleById['22222222-2222-4222-8222-222222222222'] = {
      resourceType: 'ROOM',
      resourceId: '22222222-2222-4222-8222-222222222222',
      baselineExists: false,
      exists: true,
    };
    copy.roomInventoryById['22222222-2222-4222-8222-222222222222'] = {
      resourceType: 'ROOM',
      resourceId: '22222222-2222-4222-8222-222222222222',
      baselineDisplayName: 'Yeni Salon',
      displayName: 'Yeni Salon',
      operationalStatus: 'ACTIVE',
    };
    copy.roomProfileById['22222222-2222-4222-8222-222222222222'] = {
      roomId: '22222222-2222-4222-8222-222222222222',
      capabilities: [],
      knowledgeStatus: 'UNKNOWN',
    };

    const projected = projectManagementResourcesFromWorkspaceV1(
      resources(),
      copy,
    );

    expect(projected.teachers).toHaveLength(0);
    expect(projected.rooms.some(
      (room) => room.id === '22222222-2222-4222-8222-222222222222',
    )).toBe(true);
  });

});
