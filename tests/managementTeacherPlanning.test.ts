import { describe, expect, it } from 'vitest';
import {
  validateManagementTeacherLoadTargets,
} from '@/lib/managementResources';

describe('management teacher planning inputs', () => {
  it('accepts empty and partial load targets', () => {
    expect(validateManagementTeacherLoadTargets({
      minimumLoad: null,
      targetLoad: null,
      maximumLoad: null,
    })).toBeNull();

    expect(validateManagementTeacherLoadTargets({
      minimumLoad: null,
      targetLoad: 18,
      maximumLoad: 24,
    })).toBeNull();
  });

  it('rejects invalid load ordering', () => {
    expect(validateManagementTeacherLoadTargets({
      minimumLoad: 20,
      targetLoad: 18,
      maximumLoad: 24,
    })).toBe('Minimum yük hedef yükten büyük olamaz.');

    expect(validateManagementTeacherLoadTargets({
      minimumLoad: 12,
      targetLoad: 26,
      maximumLoad: 24,
    })).toBe('Hedef yük maksimum yükten büyük olamaz.');

    expect(validateManagementTeacherLoadTargets({
      minimumLoad: 25,
      targetLoad: null,
      maximumLoad: 20,
    })).toBe('Minimum yük maksimum yükten büyük olamaz.');
  });

  it('requires integer load values between 0 and 60', () => {
    expect(validateManagementTeacherLoadTargets({
      minimumLoad: -1,
      targetLoad: null,
      maximumLoad: null,
    })).toBe('Minimum yük 0 ile 60 arasında tam sayı olmalı.');

    expect(validateManagementTeacherLoadTargets({
      minimumLoad: null,
      targetLoad: 61,
      maximumLoad: null,
    })).toBe('Hedef yük 0 ile 60 arasında tam sayı olmalı.');

    expect(validateManagementTeacherLoadTargets({
      minimumLoad: null,
      targetLoad: 12.5,
      maximumLoad: null,
    })).toBe('Hedef yük 0 ile 60 arasında tam sayı olmalı.');
  });
});
