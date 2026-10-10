import { describe, expect, it } from 'vitest';
import { validateManagementWorkspaceV1 as reference } from './fixtures/m43/referenceValidation';
import { baseSnapshot, schoolSnapshot } from './fixtures/m43/snapshots';
import { validateManagementWorkspaceV1 as optimized } from '@/lib/managementWorkspaceValidation';
import { createManagementWorkspaceWorkingCopyV1 } from '@/lib/managementWorkspaceWorkingCopy';
import type { ManagementWorkspaceSnapshotV1 } from '@/lib/managementWorkspace';
import type { ManagementWorkspaceWorkingCopyV1 } from '@/lib/managementWorkspaceWorkingCopy';

function compare(source: ManagementWorkspaceSnapshotV1, copy: ManagementWorkspaceWorkingCopyV1, coordinated: string[] = []) {
  for (const mode of ['EDIT', 'COMMIT'] as const) {
    // Strict equality includes valid, all issue fields, array ordering and invalidCardIds.
    const run = (validate: typeof reference) => {
      try { return { result: validate(source, copy, mode, coordinated) }; }
      catch (error) { return { error: (error as Error).message, name: (error as Error).name }; }
    };
    expect(run(optimized)).toStrictEqual(run(reference));
  }
}

function scenario(edit: (source: ReturnType<typeof baseSnapshot>, copy: ManagementWorkspaceWorkingCopyV1) => void, coordinated: string[] = []) {
  const source = baseSnapshot();
  const copy = createManagementWorkspaceWorkingCopyV1(source);
  edit(source, copy);
  compare(source, copy, coordinated);
  return optimized(source, copy);
}

describe('M43 equivalence to frozen 2c1cdb4 validator', () => {
  it('accepts the valid baseline', () => {
    expect(scenario(() => {}).valid).toBe(true);
  });
  it.each(['teacher', 'room', 'multiple'] as const)('preserves %s conflicts', (kind) => {
    const result = scenario((_source, copy) => {
      const right = copy.placementsByCardId['card-3'];
      right.startPeriod = 1;
      if (kind === 'room') right.teacherId = 'teacher-2';
      if (kind !== 'teacher') right.roomId = 'room-1';
    });
    expect(result.issues.map(issue => issue.code)).toContain(kind === 'room' ? 'ROOM_CONFLICT' : 'TEACHER_CONFLICT');
  });
  it.each(['CONTAINS', 'OVERLAPS'] as const)('preserves %s group relations', relation => {
    const result = scenario((source, copy) => {
      source.instructionalGroupRelations.push({ leftGroupId: 'group-1', rightGroupId: 'group-2', relation });
      copy.placementsByCardId['card-3'].startPeriod = 1;
    });
    expect(result.issues.map(issue => issue.code)).toContain('GROUP_CONFLICT');
  });
  it('preserves canonical room alias conflicts', () => {
    const result = scenario((source, copy) => {
      source.rooms[1].canonicalRoomId = 'room-1';
      copy.placementsByCardId['card-3'].startPeriod = 1;
    });
    expect(result.issues.map(issue => issue.code)).toContain('ROOM_CONFLICT');
  });
  it.each([1, 2, 3])('preserves multi-period/partial overlap at start %i', start => {
    scenario((_source, copy) => {
      copy.cardsById['card-1'].durationPeriods = 3;
      copy.placementsByCardId['card-3'].startPeriod = start;
    });
  });
  it('preserves coordinated exemptions with external conflicts', () => {
    scenario((_source, copy) => {
      Object.values(copy.placementsByCardId).forEach(p => { p.dayOfWeek = 1; p.startPeriod = 1; });
    }, ['card-1', 'card-3']);
  });
  it('preserves linked parallel geometry and broken bundles', () => {
    const source = baseSnapshot();
    source.requirements.forEach((r, i) => { r.groupName = `PARALLEL • Class / ${i + 1}`; });
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    compare(source, copy, ['card-1', 'card-3']);
    copy.placementsByCardId['card-3'].startPeriod = 4;
    compare(source, copy);
    expect(optimized(source, copy).issues.map(issue => issue.code)).toContain('PARALLEL_BUNDLE_BROKEN');
    copy.placementsByCardId['card-3'].dayOfWeek = null;
    compare(source, copy);
  });
  it.each(['locked', 'timePinned', 'teacherPinned', 'roomPinned'] as const)('preserves %s', pin => {
    scenario((_source, copy) => {
      copy.cardsById['card-1'][pin] = true;
      Object.assign(copy.placementsByCardId['card-1'], { dayOfWeek: 3, teacherId: 'teacher-2', roomId: 'room-2' });
    });
  });
  it.each([null, undefined, NaN, -3, 0, 1.5, 13, 300])('preserves unusual start %s', start => {
    scenario((_source, copy) => {
      // Deliberately test runtime malformed input outside static typing.
      copy.placementsByCardId['card-1'].startPeriod = start as number;
    });
  });
  it.each([null, undefined, NaN, -1, 0, 1.5, 6])('preserves unusual day %s', day => {
    scenario((_source, copy) => { copy.placementsByCardId['card-1'].dayOfWeek = day as number; });
  });
  it.each([0, -2, 0.5, 1.5, NaN, 300])('preserves unusual duration %s on either side', duration => {
    for (const cardId of ['card-1', 'card-3']) {
      scenario((_source, copy) => { copy.cardsById[cardId].durationPeriods = duration; });
    }
  });
  it('preserves non-finite intervals where the reference terminates', () => {
    for (const value of [Infinity, -Infinity, Number.MAX_SAFE_INTEGER]) {
      scenario((_source, copy) => {
        copy.placementsByCardId['card-1'].teacherId = null;
        copy.placementsByCardId['card-1'].startPeriod = value;
      });
      scenario((_source, copy) => {
        copy.placementsByCardId['card-1'].teacherId = null;
        copy.cardsById['card-1'].durationPeriods = value;
      });
    }
  });
  it('preserves transitive and cyclic group containment', () => {
    scenario((source, copy) => {
      source.instructionalGroupRelations.push(
        { leftGroupId: 'group-1', rightGroupId: 'middle', relation: 'CONTAINS' },
        { leftGroupId: 'middle', rightGroupId: 'group-2', relation: 'CONTAINS' },
        { leftGroupId: 'group-2', rightGroupId: 'group-1', relation: 'CONTAINS' },
      );
      copy.placementsByCardId['card-3'].startPeriod = 1;
    });
  });
  it('preserves missing placements and inactive requirements', () => {
    const source = baseSnapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    delete copy.placementsByCardId['card-1'];
    copy.requirementStructureById['requirement-2'].termStatus = 'INACTIVE';
    compare(source, copy);
    expect(() => optimized(source, copy)).toThrow('kart yerleşimi eksik');
  });
  it('preserves resource edits and requirement/day limits', () => {
    const source = baseSnapshot();
    Object.assign(source.requirements[0], { minDistinctDays: 3, maxBlocksPerDay: 1, maxConsecutivePeriods: 1 });
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    copy.requirementResourcesById['requirement-1'].teacherIds = ['teacher-2'];
    copy.placementsByCardId['card-2'].dayOfWeek = 1;
    copy.placementsByCardId['card-2'].startPeriod = 2;
    compare(source, copy);
  });
  it('preserves a large non-conflicting school baseline', () => {
    const source = schoolSnapshot();
    const copy = createManagementWorkspaceWorkingCopyV1(source);
    compare(source, copy);
    expect(optimized(source, copy).valid).toBe(true);
  });
  it('preserves deterministic adversarial combinations (seed 0x43_3_2)', () => {
    let state = 0x4332;
    const random = (n: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; };
    const starts = [null, -2, 0, 1, 2, 4, 5, 6, 10, 12, 13, 1.5, NaN];
    const durations = [-1, 0, 0.5, 1, 2, 3, 12, NaN];
    for (let trial = 0; trial < 160; trial += 1) {
      const source = schoolSnapshot(24);
      source.instructionalGroupRelations = [
        { leftGroupId: 'g0', rightGroupId: 'g1', relation: 'CONTAINS' },
        { leftGroupId: 'g1', rightGroupId: 'g2', relation: 'OVERLAPS' },
      ];
      const copy = createManagementWorkspaceWorkingCopyV1(source);
      for (const card of Object.values(copy.cardsById)) {
        card.durationPeriods = durations[random(durations.length)];
        card.timePinned = random(8) === 0;
        const p = copy.placementsByCardId[card.id];
        p.startPeriod = starts[random(starts.length)];
        p.dayOfWeek = random(7);
        p.teacherId = random(5) === 0 ? null : `t${random(4)}`;
        p.roomId = random(5) === 0 ? null : `r${random(4)}`;
      }
      compare(source, copy, trial % 2 ? ['c0', 'c1', 'c2'] : []);
    }
  });
});
