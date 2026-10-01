import { describe, expect, it } from 'vitest';
import {
  deriveManagementCommandState,
  type ManagementHistoryRootTransactionRow,
} from '@/lib/managementCommands';

function tx(
  input: Partial<ManagementHistoryRootTransactionRow>
    & Pick<ManagementHistoryRootTransactionRow, 'id' | 'action' | 'history_sequence'>,
): ManagementHistoryRootTransactionRow {
  return {
    id: input.id,
    action: input.action,
    payload: input.payload ?? {},
    reverted_at: input.reverted_at ?? null,
    redone_at: input.redone_at ?? null,
    history_sequence: input.history_sequence,
    root_transaction_id: input.root_transaction_id ?? null,
    parent_transaction_id: input.parent_transaction_id ?? null,
  };
}

describe('M34 unified management history state', () => {
  it('uses a newer resource mutation as the global undo head', () => {
    const state = deriveManagementCommandState([
      tx({
        id: 'resource-2',
        action: 'RESOURCE',
        history_sequence: 2,
        payload: {
          source: 'MANUAL',
          resource_operation: 'TEACHER_STATUS',
          resource_type: 'TEACHER',
          resource_id: 'teacher-1',
          resource_name: 'Türkçe Öğretmeni 1',
        },
      }),
      tx({
        id: 'place-1',
        action: 'PLACE',
        history_sequence: 1,
        payload: {
          source: 'MANUAL',
          card_id: 'card-1',
        },
      }),
    ]);

    expect(state.undo).toMatchObject({
      transactionId: 'resource-2',
      action: 'RESOURCE',
      resourceOperation: 'TEACHER_STATUS',
      resourceType: 'TEACHER',
      resourceId: 'teacher-1',
      resourceName: 'Türkçe Öğretmeni 1',
    });
  });

  it('keeps resource redo and the previous schedule undo visible after resource undo', () => {
    const state = deriveManagementCommandState([
      tx({
        id: 'undo-resource-3',
        action: 'RESOURCE',
        history_sequence: 3,
        payload: {
          source: 'ROOT_UNDO',
          reverts_root_transaction_id: 'resource-2',
          reverted_root_action: 'RESOURCE',
        },
      }),
      tx({
        id: 'resource-2',
        action: 'RESOURCE',
        history_sequence: 2,
        reverted_at: '2026-09-30T20:00:00.000Z',
        payload: {
          source: 'MANUAL',
          resource_operation: 'ROOM_PROFILE',
          resource_type: 'ROOM',
          resource_id: 'room-1',
          resource_name: 'Büyük Salon',
        },
      }),
      tx({
        id: 'place-1',
        action: 'PLACE',
        history_sequence: 1,
        payload: {
          source: 'MANUAL',
          card_id: 'card-1',
        },
      }),
    ]);

    expect(state.undo).toMatchObject({
      transactionId: 'place-1',
      action: 'PLACE',
      cardId: 'card-1',
    });
    expect(state.redo).toMatchObject({
      transactionId: 'undo-resource-3',
      action: 'RESOURCE',
      resourceOperation: 'ROOM_PROFILE',
      resourceType: 'ROOM',
      resourceId: 'room-1',
    });
  });

  it('exposes teacher departure as a first-class resource history action', () => {
    const state = deriveManagementCommandState([
      tx({
        id: 'departure-5',
        action: 'RESOURCE',
        history_sequence: 5,
        payload: {
          source: 'MANUAL',
          resource_operation: 'TEACHER_DEPARTURE',
          resource_type: 'TEACHER',
          resource_id: 'teacher-5',
          resource_name: 'Geçici Öğretmen',
        },
      }),
    ]);

    expect(state.undo).toMatchObject({
      transactionId: 'departure-5',
      action: 'RESOURCE',
      resourceOperation: 'TEACHER_DEPARTURE',
      resourceType: 'TEACHER',
      resourceId: 'teacher-5',
      resourceName: 'Geçici Öğretmen',
    });
  });

  it('invalidates a pending resource redo after a newer manual decision', () => {
    const state = deriveManagementCommandState([
      tx({
        id: 'move-4',
        action: 'MOVE',
        history_sequence: 4,
        payload: {
          source: 'MANUAL',
          card_id: 'card-2',
        },
      }),
      tx({
        id: 'undo-resource-3',
        action: 'RESOURCE',
        history_sequence: 3,
        payload: {
          source: 'ROOT_UNDO',
          reverts_root_transaction_id: 'resource-2',
          reverted_root_action: 'RESOURCE',
        },
      }),
      tx({
        id: 'resource-2',
        action: 'RESOURCE',
        history_sequence: 2,
        reverted_at: '2026-09-30T20:00:00.000Z',
        payload: {
          source: 'MANUAL',
          resource_operation: 'ROOM_STATUS',
          resource_type: 'ROOM',
          resource_id: 'room-1',
          resource_name: 'Büyük Salon',
        },
      }),
    ]);

    expect(state.undo).toMatchObject({
      transactionId: 'move-4',
      action: 'MOVE',
    });
    expect(state.redo).toBeNull();
  });
});
