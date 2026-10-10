import { expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { writeFileSync } from 'node:fs';
import { schoolSnapshot } from './fixtures/m43/snapshots';
import { validateManagementWorkspaceV1 as referenceValidate } from './fixtures/m43/referenceValidation';
import { previewManagementWorkspaceCommandsV1 as referencePreview } from './fixtures/m43/referenceCommands';
import { validateManagementWorkspaceV1 as validate } from '@/lib/managementWorkspaceValidation';
import { previewManagementWorkspaceCommandsV1 as preview, type ManagementWorkspaceCommandV1 } from '@/lib/managementWorkspaceCommands';
import { createManagementWorkspaceWorkingCopyV1 } from '@/lib/managementWorkspaceWorkingCopy';
import { buildManagementWorkspacePrevalidatedMoveCandidateDetailsV1 as referenceCandidates } from './fixtures/m43/referenceCandidates';
import { buildManagementWorkspacePrevalidatedMoveCandidateDetailsV1 as candidates } from '@/lib/managementWorkspaceCandidates';

it.skipIf(process.env.M43_BENCH !== '1')('M43 reproducible validation and end-to-end command preview benchmark', () => {
  const source = schoolSnapshot(517);
  const copy = createManagementWorkspaceWorkingCopyV1(source);
  const commands = (start: number, day = 5): ManagementWorkspaceCommandV1[] => [{ type: 'SET_PLACEMENT', placement: { ...copy.placementsByCardId.c0, startPeriod: start, dayOfWeek: day } }];
  const scenarios = [
    { name: 'single', commands: commands(2) },
    { name: 'multi-period', commands: commands(7) },
    { name: 'parallel-coordinated', commands: [...commands(1), { type: 'SET_PLACEMENT', placement: { ...copy.placementsByCardId.c1, dayOfWeek: 5, startPeriod: 1 } }] as ManagementWorkspaceCommandV1[] },
    { name: 'dense-slot', commands: commands(1, 1) },
    { name: 'empty-slot', commands: commands(12) },
    { name: 'consecutive-12-candidates', commands: [] },
  ];
  const stats = (samples: number[]) => {
    samples.sort((a, b) => a - b);
    return { medianMs: samples[Math.floor(samples.length / 2)], p95Ms: samples[Math.ceil(samples.length * 0.95) - 1] };
  };
  const rows = [];
  for (const scenario of scenarios) {
    const s = structuredClone(source);
    if (scenario.name === 'multi-period') s.cards[0].durationPeriods = 2;
    if (scenario.name === 'parallel-coordinated') {
      s.requirements[0].groupName = 'PARALLEL • Combined / 1';
      s.requirements[1].groupName = 'PARALLEL • Combined / 2';
    }
    if (scenario.name === 'dense-slot') {
      // Same school scale, 80 cards crowded into one period; malformed draft diagnostic case.
      s.baselinePlacements.slice(0, 80).forEach(p => { p.dayOfWeek = 1; p.startPeriod = 1; });
    }
    const c = createManagementWorkspaceWorkingCopyV1(s);
    const ids = scenario.commands.flatMap(cmd => cmd.type === 'SET_PLACEMENT' ? [cmd.placement.cardId] : []);
    const baseline = referenceValidate(s, c, 'EDIT', ids);
    expect(validate(s, c, 'EDIT', ids)).toStrictEqual(baseline);
    const cases = scenario.name === 'consecutive-12-candidates' ? Array.from({ length: 12 }, (_, i) => commands(i + 1)) : [scenario.commands];
    const run = (fn: typeof preview) => cases.map(cmd => fn(s, c, cmd, baseline));
    expect(run(preview)).toStrictEqual(run(referencePreview));
    const before: number[] = [];
    const after: number[] = [];
    const measure = (fn: typeof preview, target: number[]) => { const t = performance.now(); run(fn); target.push(performance.now() - t); };
    for (let i = 0; i < 15; i += 1) { run(referencePreview); run(preview); }
    for (let i = 0; i < 70; i += 1) {
      // Alternate order to reduce thermal/GC/order bias; no console/timers inside validator.
      if (i % 2) { measure(preview, after); measure(referencePreview, before); }
      else { measure(referencePreview, before); measure(preview, after); }
    }
    rows.push({ scenario: scenario.name, candidates: cases.length, before: stats(before), after: stats(after) });
  }
  const dragRows = [];
  for (const kind of ['single', 'multi-period', 'parallel', 'dense-slot']) {
    const s = structuredClone(source);
    if (kind === 'multi-period') s.cards[0].durationPeriods = 2;
    if (kind === 'parallel') {
      s.requirements[0].groupName = 'PARALLEL • Combined / 1';
      s.requirements[1].groupName = 'PARALLEL • Combined / 2';
    }
    if (kind === 'dense-slot') s.baselinePlacements.slice(0, 80).forEach(p => { p.dayOfWeek = 1; p.startPeriod = 1; });
    const c = createManagementWorkspaceWorkingCopyV1(s);
    const ids = kind === 'parallel' ? ['c0', 'c1'] : ['c0'];
    const run = (fn: typeof candidates) => fn(s, c, ids, {}, 5);
    expect(run(candidates)).toStrictEqual(run(referenceCandidates));
    const before: number[] = [];
    const after: number[] = [];
    const measure = (fn: typeof candidates, target: number[]) => { const t = performance.now(); run(fn); target.push(performance.now() - t); };
    for (let i = 0; i < 10; i += 1) { run(referenceCandidates); run(candidates); }
    for (let i = 0; i < 30; i += 1) {
      if (i % 2) { measure(candidates, after); measure(referenceCandidates, before); }
      else { measure(referenceCandidates, before); measure(candidates, after); }
    }
    dragRows.push({ scenario: kind, activeDay: 5, evaluatedPeriods: 12, before: stats(before), after: stats(after) });
  }
  const report = { environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0].model, logicalCpus: cpus().length, canonicalAWS: false }, cards: 517, requirements: 517, groups: 16, teachers: 16, rooms: 16, fixture: 'synthetic, not production data', warmup: 15, repetitions: 70, profiling: 'disabled; external end-to-end timing only; frozen baseline validation reused on both sides', rows, dragPipeline: { warmup: 10, repetitions: 30, rows: dragRows } };
  writeFileSync('/tmp/m43-benchmark.json', JSON.stringify(report, null, 2));
  console.info(JSON.stringify(report, null, 2));
}, 120000);
