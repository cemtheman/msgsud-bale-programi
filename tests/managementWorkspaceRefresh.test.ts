import { describe, expect, it } from 'vitest';
import { baseSnapshot } from '@/tests/fixtures/m43/snapshots';
import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import {
  prepareManagementWorkspaceRefreshV1,
  type ManagementWorkspaceRefreshStateV1,
} from '@/lib/managementWorkspaceRefresh';
import {
  createManagementWorkspaceWorkingCopyV1,
  diffManagementWorkspaceV1,
  hydrateManagementWorkspaceRequirementCatalogV1,
  prepareManagementWorkspaceTimePreferenceEditV1,
} from '@/lib/managementWorkspaceWorkingCopy';
import {
  createManagementWorkspaceHistoryV1,
  undoManagementWorkspaceOperationV1,
  redoManagementWorkspaceOperationV1,
} from '@/lib/managementWorkspaceHistory';
import {
  executeManagementWorkspaceCommandsV1,
  type ManagementWorkspaceCommandV1,
} from '@/lib/managementWorkspaceCommands';
import { prepareManagementWorkspaceCommitV1 } from '@/lib/managementWorkspaceCommit';

type CatalogRow = Parameters<typeof hydrateManagementWorkspaceRequirementCatalogV1>[1][number];

function row(overrides: Partial<CatalogRow> = {}): CatalogRow {
  const requirement = baseSnapshot().requirements[0];
  return {
    ...requirement,
    requirementId: requirement.id,
    preferredPartition: [], allowedPartitions: [],
    classCodes: ['5A'], termStatus: 'ACTIVE', courseCharacter: 'ACADEMIC', deliveryMode: 'STANDARD',
    teacherAssignmentScope: 'REQUIREMENT', teacherContinuity: 'REQUIRED',
    teacherIds: ['teacher-1'], roomIds: ['room-1'],
    preferredDays: [1], preferredStartPeriods: [2],
    ...overrides,
  };
}

function state(): ManagementWorkspaceRefreshStateV1 {
  const snapshot = baseSnapshot();
  const workingCopy = createManagementWorkspaceWorkingCopyV1(snapshot);
  hydrateManagementWorkspaceRequirementCatalogV1(workingCopy, [row()]);
  return { snapshot, workingCopy, history: createManagementWorkspaceHistoryV1() };
}

function incoming(source: ManagementWorkspaceSnapshotV1): ManagementWorkspaceSnapshotV1 {
  return {
    ...source,
    identity: { ...source.identity, revisionVersion: 2, snapshotHash: 'new-snapshot', baselineHash: 'new-baseline' },
  };
}

describe('management workspace asynchronous refresh integrity', () => {
  it.each([{ days: [3] }, { days: [] }])('waits for real preference inputs before editing $days', ({ days }) => {
    const snapshot = baseSnapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(snapshot);
    const history = createManagementWorkspaceHistoryV1();
    const before = structuredClone({ copy, history });
    expect(() => prepareManagementWorkspaceTimePreferenceEditV1(copy, 'requirement-1', days, []))
      .toThrow('Dersin zaman tercihleri henüz yüklenmedi');
    expect({ copy, history }).toEqual(before);
    hydrateManagementWorkspaceRequirementCatalogV1(copy, [row()]);
    const preference = prepareManagementWorkspaceTimePreferenceEditV1(copy, 'requirement-1', days, []);
    expect(executeManagementWorkspaceCommandsV1(snapshot, copy, history, [{ type: 'SET_REQUIREMENT_TIME_PREFERENCE', preference }]).applied).toBe(true);
    expect(prepareManagementWorkspaceCommitV1(snapshot, copy).payload?.timePreferenceChanges[0].before)
      .toEqual({ preferred_days: [1], preferred_start_periods: [2] });
  });

  it('accepts explicitly empty loaded preferences and normalizes a new edit without mutating inputs', () => {
    const current = state();
    const copy = createManagementWorkspaceWorkingCopyV1(current.snapshot);
    hydrateManagementWorkspaceRequirementCatalogV1(copy, [row({ preferredDays: [], preferredStartPeriods: [] })]);
    expect(prepareManagementWorkspaceTimePreferenceEditV1(copy, 'requirement-1', [], []).preferredDays).toEqual([]);
    const days = [3, 1, 3];
    const preference = prepareManagementWorkspaceTimePreferenceEditV1(copy, 'requirement-1', days, [4, 2, 4]);
    expect(preference).toEqual({ requirementId: 'requirement-1', preferredDays: [1, 3], preferredStartPeriods: [2, 4] });
    expect(days).toEqual([3, 1, 3]);
  });

  it.each(['placement', 'pins', 'time preference', 'inventory'] as const)(
    'preserves a %s edit made after a read starts but before its result is installed', async (kind) => {
      const current = state();
      let finish!: (value: ManagementWorkspaceSnapshotV1) => void;
      const pending = new Promise<ManagementWorkspaceSnapshotV1>(resolve => { finish = resolve; })
        .then(next => prepareManagementWorkspaceRefreshV1(current, next, next.identity.revisionId));

      const copy = current.workingCopy;
      const command: ManagementWorkspaceCommandV1 = kind === 'placement'
        ? { type: 'SET_PLACEMENT', placement: { ...copy.placementsByCardId['card-1'], dayOfWeek: 5, startPeriod: 2 } }
        : kind === 'pins'
          ? { type: 'SET_CARD_PINS', pins: { cardId: 'card-1', timePinned: true, teacherPinned: false, roomPinned: false } }
          : kind === 'time preference'
            ? { type: 'SET_REQUIREMENT_TIME_PREFERENCE', preference: { requirementId: 'requirement-1', preferredDays: [3], preferredStartPeriods: [4] } }
            : { type: 'SET_INVENTORY_RESOURCE', resource: { ...copy.teacherInventoryById['teacher-1'], displayName: 'Yeni yerel ad' } };
      expect(executeManagementWorkspaceCommandsV1(current.snapshot, copy, current.history, [command]).applied).toBe(true);
      const before = structuredClone(current);
      finish(incoming(current.snapshot));
      const result = await pending;
      expect(result.kind).toBe('PRESERVE_LOCAL');
      expect(result.state).toBe(current);
      expect(current).toEqual(before);
      const commit = prepareManagementWorkspaceCommitV1(current.snapshot, current.workingCopy);
      expect(commit.ready).toBe(true);
      expect(commit.payload?.snapshotHash).toBe('snapshot-hash');
      expect(commit.payload?.revisionVersion).toBe(1);
      // An explicitly newer server revision cannot silently rebase local edits.
      undoManagementWorkspaceOperationV1(copy, current.history);
      expect(diffManagementWorkspaceV1(current.snapshot, copy).hasChanges).toBe(false);
      redoManagementWorkspaceOperationV1(copy, current.history);
      expect(diffManagementWorkspaceV1(current.snapshot, copy).hasChanges).toBe(true);
    },
  );

  it('preserves dirty local data even when the incoming workspace is missing or mismatched', () => {
    const current = state();
    expect(executeManagementWorkspaceCommandsV1(current.snapshot, current.workingCopy, current.history, [{
      type: 'REMOVE_PLACEMENT', cardId: 'card-1',
    }]).applied).toBe(true);
    expect(prepareManagementWorkspaceRefreshV1(current, null, null)).toEqual({ kind: 'PRESERVE_LOCAL', state: current });
    expect(prepareManagementWorkspaceRefreshV1(current, incoming(current.snapshot), 'other-revision')).toEqual({ kind: 'PRESERVE_LOCAL', state: current });
  });

  it('installs a fresh matching snapshot and empty history when there are no local edits', () => {
    const current = state();
    const before = structuredClone(current);
    const next = incoming(current.snapshot);
    const result = prepareManagementWorkspaceRefreshV1(current, next, next.identity.revisionId);
    expect(result.kind).toBe('REPLACE');
    expect(result.state?.snapshot).toBe(next);
    expect(result.state?.workingCopy).not.toBe(current.workingCopy);
    expect(result.state?.workingCopy.baseline.snapshotHash).toBe('new-snapshot');
    expect(result.state?.history.undoStack).toEqual([]);
    expect(result.state?.history.redoStack).toEqual([]);
    expect(current).toEqual(before);
  });

  it.each([null, 'other-revision'])('keeps a clean unavailable/mismatched workspace unavailable (%s)', (revision) => {
    const result = prepareManagementWorkspaceRefreshV1(null, revision ? baseSnapshot() : null, revision);
    expect(result).toEqual({ kind: 'REPLACE', state: null });
  });

  it.each([{ days: [3] }, { days: [] }])('preserves an unsaved preference $days and its exact history across repeated catalogue hydration', ({ days }) => {
    const current = state();
    expect(executeManagementWorkspaceCommandsV1(current.snapshot, current.workingCopy, current.history, [{
      type: 'SET_REQUIREMENT_TIME_PREFERENCE', preference: {
        requirementId: 'requirement-1', preferredDays: days, preferredStartPeriods: days.length ? [4] : [],
      },
    }]).applied).toBe(true);
    const before = structuredClone(current);
    hydrateManagementWorkspaceRequirementCatalogV1(current.workingCopy, [row()]);
    expect(current).toEqual(before);
    const commit = prepareManagementWorkspaceCommitV1(current.snapshot, current.workingCopy);
    expect(commit.ready).toBe(true);
    expect(commit.payload?.timePreferenceChanges).toEqual([{
      requirement_id: 'requirement-1',
      before: { preferred_days: [1], preferred_start_periods: [2] },
      after: { preferred_days: days, preferred_start_periods: days.length ? [4] : [] },
    }]);
    undoManagementWorkspaceOperationV1(current.workingCopy, current.history);
    expect(diffManagementWorkspaceV1(current.snapshot, current.workingCopy).hasChanges).toBe(false);
    redoManagementWorkspaceOperationV1(current.workingCopy, current.history);
    expect(prepareManagementWorkspaceCommitV1(current.snapshot, current.workingCopy).payload?.timePreferenceChanges[0].after.preferred_days).toEqual(days);
  });

  it('never rebases a captured catalogue row in place; a fresh working copy can capture the new server inputs', () => {
    const current = state();
    const original = structuredClone(current.workingCopy);
    const nextRow = row({ preferredDays: [2], teacherAssignmentScope: 'BLOCK', teacherContinuity: 'NONE', weeklyLoad: 3 });
    hydrateManagementWorkspaceRequirementCatalogV1(current.workingCopy, [nextRow]);
    expect(current.workingCopy).toEqual(original);
    expect(diffManagementWorkspaceV1(current.snapshot, current.workingCopy).hasChanges).toBe(false);
    const nextSnapshot = incoming(current.snapshot);
    const freshSnapshot: ManagementWorkspaceSnapshotV1 = {
      ...nextSnapshot,
      requirements: nextSnapshot.requirements.map(requirement => requirement.id === 'requirement-1'
        ? { ...requirement, weeklyLoad: 3, teacherAssignmentScope: 'BLOCK', teacherContinuity: 'NONE' }
        : requirement),
      cards: [...nextSnapshot.cards, { id: 'new-baseline-card', requirementId: 'requirement-1', blockIndex: 3, durationPeriods: 1, locked: false }],
    };
    const fresh = createManagementWorkspaceWorkingCopyV1(freshSnapshot);
    hydrateManagementWorkspaceRequirementCatalogV1(fresh, [nextRow]);
    expect(diffManagementWorkspaceV1(freshSnapshot, fresh).hasChanges).toBe(false);
    expect(fresh.requirementCatalogById['requirement-1'].baselinePreferredDays).toEqual([2]);
    expect(fresh.requirementTimePreferencesById['requirement-1'].preferredDays).toEqual([2]);
  });

  it('still discovers a previously unseen inactive catalogue row without touching captured rows', () => {
    const current = state();
    const previous = structuredClone(current.workingCopy.requirementCatalogById['requirement-1']);
    hydrateManagementWorkspaceRequirementCatalogV1(current.workingCopy, [row(), row({
      requirementId: 'inactive-new', weeklyLoad: 0, termStatus: 'INACTIVE', preferredDays: [], preferredStartPeriods: [],
    })]);
    expect(current.workingCopy.requirementCatalogById['requirement-1']).toEqual(previous);
    expect(current.workingCopy.requirementStructureById['inactive-new'].termStatus).toBe('INACTIVE');
    expect(diffManagementWorkspaceV1(current.snapshot, current.workingCopy).hasChanges).toBe(false);
  });
});
