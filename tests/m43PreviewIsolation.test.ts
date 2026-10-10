import { expect, it } from 'vitest';
import { baseSnapshot, schoolSnapshot } from './fixtures/m43/snapshots';
import { previewManagementWorkspaceCommandsV1 as reference } from './fixtures/m43/referenceCommands';
import { buildManagementWorkspacePrevalidatedMoveCandidateDetailsV1 as referenceCandidates } from './fixtures/m43/referenceCandidates';
import { previewManagementWorkspaceCommandsV1 as optimized, type ManagementWorkspaceCommandV1 } from '@/lib/managementWorkspaceCommands';
import { buildManagementWorkspacePrevalidatedMoveCandidateDetailsV1 as optimizedCandidates } from '@/lib/managementWorkspaceCandidates';
import { createManagementWorkspaceWorkingCopyV1 } from '@/lib/managementWorkspaceWorkingCopy';

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

it('placement/remove/mixed previews match reference and cannot mutate deeply frozen source', () => {
  const source = freeze(baseSnapshot());
  const copy = freeze(createManagementWorkspaceWorkingCopyV1(source));
  const commands: ManagementWorkspaceCommandV1[][] = [
    [{ type: 'SET_PLACEMENT', placement: { ...copy.placementsByCardId['card-1'], dayOfWeek: 3 } }],
    [{ type: 'REMOVE_PLACEMENT', cardId: 'card-1' }],
    [{ type: 'SET_PLACEMENT', placement: { ...copy.placementsByCardId['card-1'], startPeriod: 2 } }, { type: 'REMOVE_PLACEMENT', cardId: 'card-3' }],
    [{ type: 'SET_CARD_PINS', pins: { cardId: 'card-1', timePinned: true, teacherPinned: false, roomPinned: false } }],
    [{ type: 'SET_REQUIREMENT_RESOURCES', resource: { ...copy.requirementResourcesById['requirement-1'], teacherIds: ['teacher-2'] } }],
    [{ type: 'SET_INVENTORY_RESOURCE', resource: { ...copy.teacherInventoryById['teacher-1'], operationalStatus: 'INACTIVE' } }],
    [{ type: 'SET_PLACEMENT', placement: { ...copy.placementsByCardId['card-1'], dayOfWeek: 4 } }, { type: 'SET_CARD_PINS', pins: { cardId: 'card-1', timePinned: true, teacherPinned: false, roomPinned: false } }],
  ];
  for (const batch of commands) expect(optimized(source, copy, batch)).toStrictEqual(reference(source, copy, batch));
  expect(() => optimized(source, copy, [{ type: 'REMOVE_PLACEMENT', cardId: 'unknown' }])).toThrow();
});

it('actual active-day drag candidate pipeline matches reference for single/multi/parallel moves', () => {
  for (const count of [24, 517]) {
    for (const kind of ['single', 'multi', 'parallel']) {
      const source = schoolSnapshot(count);
      if (kind === 'multi') source.cards[0].durationPeriods = 2;
      if (kind === 'parallel') {
        source.requirements[0].groupName = 'PARALLEL • Class / 1';
        source.requirements[1].groupName = 'PARALLEL • Class / 2';
      }
      const copy = freeze(createManagementWorkspaceWorkingCopyV1(freeze(source)));
      const ids = kind === 'parallel' ? ['c0', 'c1'] : ['c0'];
      expect(optimizedCandidates(source, copy, ids, {}, 5)).toStrictEqual(referenceCandidates(source, copy, ids, {}, 5));
    }
  }
});
