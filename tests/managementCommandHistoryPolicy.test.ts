import { describe, expect, it } from 'vitest';

import {
  canUseServerManagementHistoryDescriptor,
  type ManagementCommandDescriptor,
} from '@/lib/managementCommands';

function descriptor(
  action: ManagementCommandDescriptor['action'],
): ManagementCommandDescriptor {
  return {
    transactionId: 'transaction-1',
    action,
    cardId: null,
    cardIds: [],
    autoCount: 0,
    bundleId: null,
    bundleSize: 1,
  };
}

describe('management server history policy', () => {
  it('blocks all server undo while workspace owns history', () => {
    expect(
      canUseServerManagementHistoryDescriptor(
        descriptor('STRUCTURE'),
        true,
      ),
    ).toBe(false);
    expect(
      canUseServerManagementHistoryDescriptor(
        descriptor('MOVE'),
        true,
      ),
    ).toBe(false);
    expect(
      canUseServerManagementHistoryDescriptor(
        descriptor('RESOURCE'),
        true,
      ),
    ).toBe(false);
  });

  it('allows server history only before workspace history is available', () => {
    expect(
      canUseServerManagementHistoryDescriptor(
        descriptor('STRUCTURE'),
        false,
      ),
    ).toBe(true);
    expect(
      canUseServerManagementHistoryDescriptor(
        descriptor('MOVE'),
        false,
      ),
    ).toBe(true);
  });

  it('rejects an empty descriptor', () => {
    expect(
      canUseServerManagementHistoryDescriptor(null, true),
    ).toBe(false);
  });
});
