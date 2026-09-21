'use client';

export type ManagementRootAction = 'PLACE' | 'MOVE' | 'REMOVE';

export interface ManagementCommandDescriptor {
  transactionId: string;
  action: ManagementRootAction;
  cardId: string | null;
  autoCount: number;
}

export interface ManagementCommandState {
  undo: ManagementCommandDescriptor | null;
  redo: ManagementCommandDescriptor | null;
}

interface RootTransactionRow {
  id: string;
  action: 'PLACE' | 'MOVE' | 'REMOVE' | 'STRUCTURE';
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

function translateCommandError(message: string, fallback: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes('editor role required')) {
    return 'Bu işlem için düzenleme yetkisi gerekiyor.';
  }

  if (
    normalized.includes('statement timeout')
    || normalized.includes('canceling statement due to statement timeout')
    || normalized.includes('query timeout')
  ) {
    return 'İşlem beklenenden uzun sürdü ve zaman aşımına uğradı. Programın güncel durumunu yenileyip yeniden deneyin.';
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

  if (normalized.includes('structural history barrier')) {
    return 'Ders yapısı değiştiği için bu eski program işlemi artık geri alınamaz veya yinelenemez.';
  }

  if (
    normalized.includes('propagation root must be one active')
    || normalized.includes('propagation parent is outside active root chain')
  ) {
    return 'Program işlem zinciri güncelliğini kaybetti. Veriyi yenileyip işlemi yeniden deneyin.';
  }

  if (
    normalized.includes('assignment change requires all requirement cards to be unplaced first')
  ) {
    return 'Bu dersin programda yerleşmiş blokları var. Öğretmen veya salonu değiştirmeden önce bu dersin yerleşimlerini programdan kaldırın.';
  }

  if (
    normalized.includes('teacher selection contains an unknown teacher')
    || normalized.includes('room selection contains an unknown room')
  ) {
    return 'Seçilen öğretmen veya salon artık kullanılamıyor. Veriyi yenileyip tekrar deneyin.';
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


export function updateManagementRequirementTeachers(
  accessToken: string,
  requirementId: string,
  teacherIds: string[],
) {
  return callRpc('management_update_requirement_teachers', accessToken, {
    p_requirement_id: requirementId,
    p_teacher_ids: teacherIds,
  });
}

export function updateManagementRequirementRooms(
  accessToken: string,
  requirementId: string,
  roomIds: string[],
) {
  return callRpc('management_update_requirement_rooms', accessToken, {
    p_requirement_id: requirementId,
    p_room_ids: roomIds,
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

  const latestStructureBarrierSequence = rows
    .filter((row) => (
      row.action === 'STRUCTURE'
      && row.payload?.source === 'STRUCTURE_APPLY'
    ))
    .reduce(
      (latest, row) => Math.max(latest, row.history_sequence),
      0,
    );

  const currentEpochRows = rows.filter(
    (row) => row.history_sequence > latestStructureBarrierSequence,
  );

  const undoRow = currentEpochRows.find((row) => {
    const source = row.payload?.source;
    return row.reverted_at === null
      && (source === 'MANUAL' || source === 'ROOT_REDO')
      && ['PLACE', 'MOVE', 'REMOVE'].includes(row.action);
  });

  const manualSequences = currentEpochRows
    .filter((row) => row.payload?.source === 'MANUAL')
    .map((row) => row.history_sequence);

  const redoRow = currentEpochRows.find((row) => {
    if (row.payload?.source !== 'ROOT_UNDO' || row.redone_at !== null) {
      return false;
    }

    return !manualSequences.some(
      (sequence) => sequence > row.history_sequence,
    );
  });

  const rowById = new Map(rows.map((row) => [row.id, row]));

  const undoCardIdValue = undoRow?.payload?.card_id;
  const undo = undoRow
    ? {
      transactionId: undoRow.id,
      action: undoRow.action,
      cardId: typeof undoCardIdValue === 'string'
        ? undoCardIdValue
        : null,
      autoCount: Number(undoRow.payload?.propagation_auto_count ?? 0) || 0,
    }
    : null;

  let redo: ManagementCommandDescriptor | null = null;

  if (redoRow) {
    const originalRootIdValue = redoRow.payload?.reverts_root_transaction_id;
    const originalRootId = typeof originalRootIdValue === 'string'
      ? originalRootIdValue
      : null;
    const originalRoot = originalRootId
      ? rowById.get(originalRootId) ?? null
      : null;
    const revertedActionValue = redoRow.payload?.reverted_root_action;
    const originalAction = (
      typeof revertedActionValue === 'string'
        ? revertedActionValue
        : originalRoot?.action
    ) as ManagementRootAction | undefined;
    const originalCardIdValue = originalRoot?.payload?.card_id;
    const originalCardId = typeof originalCardIdValue === 'string'
      ? originalCardIdValue
      : null;

    if (originalAction && ['PLACE', 'MOVE', 'REMOVE'].includes(originalAction)) {
      redo = {
        transactionId: redoRow.id,
        action: originalAction,
        cardId: originalCardId,
        autoCount: Number(originalRoot?.payload?.propagation_auto_count ?? 0) || 0,
      };
    }
  }

  return { undo, redo };
}
