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
    const source = snapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
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

});
