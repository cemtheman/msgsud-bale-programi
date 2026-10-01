import { describe, expect, it } from 'vitest';
import {
  MANAGEMENT_TEACHER_LOAD_DEFAULTS,
  validateManagementTeacherLoadTargets,
  validateManagementTeacherUnavailablePeriods,
} from '@/lib/managementResources';

describe('management teacher planning inputs', () => {
  it('uses the approved 1 / 10 / 20 teacher load defaults', () => {
    expect(MANAGEMENT_TEACHER_LOAD_DEFAULTS).toEqual({
      minimumLoad: 1,
      targetLoad: 10,
      maximumLoad: 20,
    });
  });

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

  it('accepts explicit unique hard-unavailability slots', () => {
    expect(validateManagementTeacherUnavailablePeriods([])).toBeNull();
    expect(validateManagementTeacherUnavailablePeriods([
      { dayOfWeek: 1, period: 1 },
      { dayOfWeek: 5, period: 12 },
    ])).toBeNull();
  });

  it('rejects invalid or duplicate hard-unavailability slots', () => {
    expect(validateManagementTeacherUnavailablePeriods([
      { dayOfWeek: 0, period: 1 },
    ])).toBe(
      'Uygun olmayan saatler hafta içi 1–5. gün ve 1–12. ders aralığında olmalı.',
    );

    expect(validateManagementTeacherUnavailablePeriods([
      { dayOfWeek: 1, period: 13 },
    ])).toBe(
      'Uygun olmayan saatler hafta içi 1–5. gün ve 1–12. ders aralığında olmalı.',
    );

    expect(validateManagementTeacherUnavailablePeriods([
      { dayOfWeek: 2, period: 4 },
      { dayOfWeek: 2, period: 4 },
    ])).toBe(
      'Aynı uygun olmayan ders saati birden fazla kez seçilemez.',
    );
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
