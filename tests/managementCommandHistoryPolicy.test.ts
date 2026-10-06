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
  it('blocks committed structure undo once workspace owns structure history', () => {
    expect(
      canUseServerManagementHistoryDescriptor(
        descriptor('STRUCTURE'),
        true,
      ),
    ).toBe(false);
  });

  it('keeps non-structure server history available for remaining legacy flows', () => {
    expect(
      canUseServerManagementHistoryDescriptor(
        descriptor('MOVE'),
        true,
      ),
    ).toBe(true);
  });

  it('allows structure history before workspace history is available', () => {
    expect(
      canUseServerManagementHistoryDescriptor(
        descriptor('STRUCTURE'),
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
