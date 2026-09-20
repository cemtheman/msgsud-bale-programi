'use client';

export interface ManagementCommandState {
  undoTransactionId: string | null;
  undoLabel: string | null;
  redoTransactionId: string | null;
  redoLabel: string | null;
}

interface RootTransactionRow {
  id: string;
  action: 'PLACE' | 'MOVE' | 'REMOVE';
  payload: {
    source?: string;
    reverted_root_action?: string;
    [key: string]: unknown;
  } | null;
  reverted_at: string | null;
  redone_at: string | null;
  history_sequence: number;
  root_transaction_id: string | null;
  parent_transaction_id: string | null;
}

interface RpcErrorBody {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error('Yönetim bağlantı ayarları eksik.');
  }

  return { url, key };
}

function actionLabel(action: string | null | undefined) {
  if (action === 'PLACE') return 'Yerleştir';
  if (action === 'MOVE') return 'Taşı';
  if (action === 'REMOVE') return 'Kaldır';
  return 'İşlem';
}

function translateCommandError(message: string, fallback: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes('editor role required')) {
    return 'Bu işlem için düzenleme yetkisi gerekiyor.';
  }

  if (
    normalized.includes('candidate is invalid')
    || normalized.includes('target is invalid')
    || normalized.includes('candidate not found')
    || normalized.includes('target candidate no longer exists')
  ) {
    return 'Seçtiğiniz yer artık uygun değil. Veriyi yenileyip yeniden deneyin.';
  }

  if (
    normalized.includes('candidate is unresolved')
    || normalized.includes('target is unresolved')
  ) {
    return 'Bu aday henüz belirsiz olduğu için işlem yapılamıyor.';
  }

  if (normalized.includes('already placed')) {
    return 'Bu kart zaten programa yerleştirilmiş.';
  }

  if (normalized.includes('no-op')) {
    return 'Kart zaten bu yerde.';
  }

  if (normalized.includes('locked card')) {
    return 'Bu kart kilitli olduğu için değiştirilemiyor.';
  }

  if (normalized.includes('lifo')) {
    return 'Önce en son yapılan işlemi geri almalısınız.';
  }

  if (
    normalized.includes('redo branch was invalidated')
    || normalized.includes('latest redoable undo')
  ) {
    return 'Bu yineleme artık geçerli değil; arada yeni bir program kararı verilmiş.';
  }

  if (normalized.includes('draft')) {
    return 'Bu işlem yalnız taslak program üzerinde yapılabilir.';
  }

  return message || fallback;
}

async function readRpcError(response: Response, fallback: string) {
  try {
    const body = await response.json() as RpcErrorBody;
    return translateCommandError(body.message ?? body.details ?? fallback, fallback);
  } catch {
    return fallback;
  }
}

async function callRpc(
  name: string,
  accessToken: string,
  payload: Record<string, unknown>,
) {
  const { url, key } = getSupabaseConfig();

  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await readRpcError(response, 'Yönetim işlemi tamamlanamadı.'),
    );
  }

  return response.json() as Promise<string>;
}

export function placeManagementCard(
  accessToken: string,
  input: {
    cardId: string;
    dayOfWeek: number;
    startPeriod: number;
    teacherId: string;
    roomId: string;
  },
) {
  return callRpc('management_place_card', accessToken, {
    p_card_id: input.cardId,
    p_day_of_week: input.dayOfWeek,
    p_start_period: input.startPeriod,
    p_teacher_id: input.teacherId,
    p_room_id: input.roomId,
  });
}

export function moveManagementCard(
  accessToken: string,
  input: {
    cardId: string;
    dayOfWeek: number;
    startPeriod: number;
    teacherId: string;
    roomId: string;
  },
) {
  return callRpc('management_move_card', accessToken, {
    p_card_id: input.cardId,
    p_day_of_week: input.dayOfWeek,
    p_start_period: input.startPeriod,
    p_teacher_id: input.teacherId,
    p_room_id: input.roomId,
  });
}

export function removeManagementCard(
  accessToken: string,
  cardId: string,
) {
  return callRpc('management_remove_card', accessToken, {
    p_card_id: cardId,
  });
}

export function undoManagement(
  accessToken: string,
  rootTransactionId: string,
) {
  return callRpc('management_undo', accessToken, {
    p_root_transaction_id: rootTransactionId,
  });
}

export function redoManagement(
  accessToken: string,
  undoTransactionId: string,
) {
  return callRpc('management_redo', accessToken, {
    p_undo_transaction_id: undoTransactionId,
  });
}

export async function fetchManagementCommandState(
  accessToken: string,
  revisionId: string,
): Promise<ManagementCommandState> {
  const { url, key } = getSupabaseConfig();

  const path = [
    'move_transactions',
    '?select=id,action,payload,reverted_at,redone_at,history_sequence,root_transaction_id,parent_transaction_id',
    `&schedule_revision_id=eq.${revisionId}`,
    '&actor_type=eq.USER',
    '&root_transaction_id=is.null',
    '&parent_transaction_id=is.null',
    '&order=history_sequence.desc',
  ].join('');

  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(
      await readRpcError(response, 'İşlem geçmişi alınamadı.'),
    );
  }

  const rows = await response.json() as RootTransactionRow[];

  const undoRow = rows.find((row) => {
    const source = row.payload?.source;
    return row.reverted_at === null
      && (source === 'MANUAL' || source === 'ROOT_REDO')
      && ['PLACE', 'MOVE', 'REMOVE'].includes(row.action);
  });

  const manualSequences = rows
    .filter((row) => row.payload?.source === 'MANUAL')
    .map((row) => row.history_sequence);

  const redoRow = rows.find((row) => {
    if (row.payload?.source !== 'ROOT_UNDO' || row.redone_at !== null) {
      return false;
    }

    return !manualSequences.some(
      (sequence) => sequence > row.history_sequence,
    );
  });

  return {
    undoTransactionId: undoRow?.id ?? null,
    undoLabel: undoRow ? actionLabel(undoRow.action) : null,
    redoTransactionId: redoRow?.id ?? null,
    redoLabel: redoRow
      ? actionLabel(redoRow.payload?.reverted_root_action)
      : null,
  };
}
