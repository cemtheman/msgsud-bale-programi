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

  it('exposes room departure as a first-class resource history action', () => {
    const state = deriveManagementCommandState([
      tx({
        id: 'room-departure-6',
        action: 'RESOURCE',
        history_sequence: 6,
        payload: {
          source: 'MANUAL',
          resource_operation: 'ROOM_DEPARTURE',
          resource_type: 'ROOM',
          resource_id: 'room-6',
          resource_name: 'Test Salon',
        },
      }),
    ]);

    expect(state.undo).toMatchObject({
      transactionId: 'room-departure-6',
      action: 'RESOURCE',
      resourceOperation: 'ROOM_DEPARTURE',
      resourceType: 'ROOM',
      resourceId: 'room-6',
      resourceName: 'Test Salon',
    });
  });

  it('recognizes a bundled teacher placement override as teacher assignment history', () => {
    const state = deriveManagementCommandState([
      tx({
        id: 'teacher-override-10',
        action: 'MOVE',
        history_sequence: 10,
        payload: {
          source: 'MANUAL',
          engine_version: 'M29.4-placement-resource-override',
          propagation_stop_reason: 'PLACEMENT_RESOURCE_OVERRIDE',
          card_id: 'card-10',
          bundle_id: 'teacher-override-10',
          bundle_size: 3,
          bundle_card_ids: ['card-10', 'card-11', 'card-12'],
          before: {
            teacher_id: null,
            room_id: 'room-1',
          },
          after: {
            teacher_id: 'teacher-9',
            room_id: 'room-1',
          },
        },
      }),
    ]);

    expect(state.undo).toMatchObject({
      transactionId: 'teacher-override-10',
      action: 'MOVE',
      bundleSize: 3,
      placementResourceType: 'TEACHER',
      placementResourceBeforeId: null,
      placementResourceId: 'teacher-9',
    });
  });

  it('preserves room placement override semantics for redo', () => {
    const state = deriveManagementCommandState([
      tx({
        id: 'undo-room-override-12',
        action: 'MOVE',
        history_sequence: 12,
        payload: {
          source: 'ROOT_UNDO',
          reverts_root_transaction_id: 'room-override-11',
          reverted_root_action: 'MOVE',
          bundle_id: 'room-override-11',
          bundle_size: 2,
          bundle_card_ids: ['card-20', 'card-21'],
        },
      }),
      tx({
        id: 'room-override-11',
        action: 'MOVE',
        history_sequence: 11,
        reverted_at: '2026-10-01T10:00:00.000Z',
        payload: {
          source: 'MANUAL',
          engine_version: 'M29.4-placement-resource-override',
          propagation_stop_reason: 'PLACEMENT_RESOURCE_OVERRIDE',
          card_id: 'card-20',
          bundle_id: 'room-override-11',
          bundle_size: 2,
          bundle_card_ids: ['card-20', 'card-21'],
          before: {
            teacher_id: 'teacher-1',
            room_id: null,
          },
          after: {
            teacher_id: 'teacher-1',
            room_id: 'room-7',
          },
        },
      }),
    ]);

    expect(state.undo).toBeNull();
    expect(state.redo).toMatchObject({
      transactionId: 'undo-room-override-12',
      action: 'MOVE',
      bundleSize: 2,
      placementResourceType: 'ROOM',
      placementResourceBeforeId: null,
      placementResourceId: 'room-7',
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
