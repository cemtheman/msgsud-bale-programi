import { describe, expect, it } from 'vitest';

import {
  countEnabledSupportedManagementObjectives,
  sanitizeManagementSolverObjectiveWeights,
} from '@/lib/managementSolver';

describe('management solver objective weight compatibility', () => {
  it('keeps all supported objective weights including subject time preference', () => {
    expect(sanitizeManagementSolverObjectiveWeights({
      changeCost: 250,
      preferredTeacherContinuity: 250,
      teacherIdleGaps: 250,
      roomStability: 250,
      teacherLoadBalance: 1000,
      subjectTimePreference: 750,
    })).toEqual({
      changeCost: 250,
      preferredTeacherContinuity: 250,
      teacherIdleGaps: 250,
      roomStability: 250,
      teacherLoadBalance: 1000,
      subjectTimePreference: 750,
    });
  });

  it('counts only currently supported enabled objectives', () => {
    expect(countEnabledSupportedManagementObjectives({
      changeCost: 250,
      preferredTeacherContinuity: 250,
      teacherIdleGaps: 250,
      roomStability: 250,
      teacherLoadBalance: 1000,
      subjectTimePreference: 750,
    })).toBe(6);
  });
});
