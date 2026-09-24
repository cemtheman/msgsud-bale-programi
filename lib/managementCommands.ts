'use client';

export type ManagementRootAction = 'PLACE' | 'MOVE' | 'REMOVE' | 'STRUCTURE';

export interface ManagementCommandDescriptor {
  transactionId: string;
  action: ManagementRootAction;
  cardId: string | null;
  cardIds: string[];
  autoCount: number;
  bundleId: string | null;
  bundleSize: number;
}

export interface ManagementCommandState {
  undo: ManagementCommandDescriptor | null;
  redo: ManagementCommandDescriptor | null;
}

export interface ManagementBundleCandidateInput {
  cardId: string;
  dayOfWeek: number;
  startPeriod: number;
  teacherId: string;
  roomId: string;
}

export interface ManagementSlotBlocker {
  cardId: string;
  subjectName: string;
  groupName: string;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  teacherName: string | null;
  roomName: string | null;
  conflictTypes: string[];
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

  if (normalized.includes('structural history epoch')) {
    return 'Bu işlem daha eski bir ders yapısı dönemine ait olduğu için artık geri alınamaz veya yinelenemez.';
  }

  if (normalized.includes('structural revert was invalidated')) {
    return 'Ders yapısı değişikliğinden sonra yeni bir yönetim kararı verildiği için bu değişiklik artık otomatik geri alınamaz.';
  }

  if (normalized.includes('structural revert is stale')) {
    return 'Taslak program ders yapısı değişikliğinden sonra değişti. Güvenli geri alma için koşullar artık aynı değil.';
  }

  if (normalized.includes('created card is placed or locked')) {
    return 'Ders yapısıyla eklenen bloklardan biri artık programda kullanılıyor veya kilitli. Önce bu bloğu serbest bırakın.';
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

async function callJsonRpc<T>(
  name: string,
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<T> {
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
      await readRpcError(response, 'Yönetim teşhis verisi alınamadı.'),
    );
  }

  return response.json() as Promise<T>;
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

function bundleItemsPayload(items: ManagementBundleCandidateInput[]) {
  return items.map((item) => ({
    card_id: item.cardId,
    day_of_week: item.dayOfWeek,
    start_period: item.startPeriod,
    teacher_id: item.teacherId,
    room_id: item.roomId,
  }));
}

export function placeManagementCardBundle(
  accessToken: string,
  items: ManagementBundleCandidateInput[],
) {
  return callRpc('management_place_card_bundle', accessToken, {
    p_items: bundleItemsPayload(items),
  });
}

export function moveManagementCardBundle(
  accessToken: string,
  items: ManagementBundleCandidateInput[],
) {
  return callRpc('management_move_card_bundle', accessToken, {
    p_items: bundleItemsPayload(items),
  });
}

export function removeManagementCardBundle(
  accessToken: string,
  cardIds: string[],
) {
  return callRpc('management_remove_card_bundle', accessToken, {
    p_card_ids: cardIds,
  });
}

export function refreshManagementCardGroupCandidates(
  accessToken: string,
  cardIds: string[],
) {
  return callRpc('management_refresh_card_group_candidates', accessToken, {
    p_card_ids: cardIds,
  });
}

export function fetchManagementSlotBlockers(
  accessToken: string,
  cardIds: string[],
  dayOfWeek: number,
  startPeriod: number,
) {
  return callJsonRpc<ManagementSlotBlocker[]>(
    'management_diagnose_bundle_slot_blockers',
    accessToken,
    {
      p_card_ids: cardIds,
      p_day_of_week: dayOfWeek,
      p_start_period: startPeriod,
    },
  );
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

export function undoManagementBundle(
  accessToken: string,
  rootTransactionId: string,
) {
  return callRpc('management_undo_bundle', accessToken, {
    p_root_transaction_id: rootTransactionId,
  });
}

export function undoManagementCardGroup(
  accessToken: string,
  cardIds: string[],
) {
  return callRpc('management_undo_card_group', accessToken, {
    p_card_ids: cardIds,
  });
}

export function redoManagementBundle(
  accessToken: string,
  undoTransactionId: string,
) {
  return callRpc('management_redo_bundle', accessToken, {
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

  const latestStructureRow = rows.find((row) => (
    row.action === 'STRUCTURE'
    && (
      row.payload?.source === 'STRUCTURE_APPLY'
      || row.payload?.source === 'STRUCTURE_REVERT'
    )
  )) ?? null;

  const latestStructureSequence =
    latestStructureRow?.history_sequence ?? 0;

  const currentEpochRows = rows.filter(
    (row) => row.history_sequence > latestStructureSequence,
  );

  const scheduleUndoRow = currentEpochRows.find((row) => {
    const source = row.payload?.source;
    return row.reverted_at === null
      && (source === 'MANUAL' || source === 'ROOT_REDO')
      && ['PLACE', 'MOVE', 'REMOVE'].includes(row.action);
  });

  const activeStructureApply = (
    latestStructureRow?.payload?.source === 'STRUCTURE_APPLY'
    && latestStructureRow.reverted_at === null
    && latestStructureRow.payload?.revertible === true
  )
    ? latestStructureRow
    : null;

  const structureUndoRow = (
    !scheduleUndoRow
    && currentEpochRows.length === 0
    && activeStructureApply
  )
    ? activeStructureApply
    : null;

  const undoRow = scheduleUndoRow ?? structureUndoRow;

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
  const undoBundleIdValue = undoRow?.payload?.bundle_id;
  const undoBundleCardIdsValue = undoRow?.payload?.bundle_card_ids;
  const undoCardIds = Array.isArray(undoBundleCardIdsValue)
    ? undoBundleCardIdsValue.filter(
      (value): value is string => typeof value === 'string',
    )
    : typeof undoCardIdValue === 'string'
      ? [undoCardIdValue]
      : [];
  const undo = undoRow
    ? {
      transactionId: undoRow.id,
      action: undoRow.action as ManagementRootAction,
      cardId: typeof undoCardIdValue === 'string'
        ? undoCardIdValue
        : undoCardIds[0] ?? null,
      cardIds: undoCardIds,
      autoCount: Number(undoRow.payload?.propagation_auto_count ?? 0) || 0,
      bundleId: typeof undoBundleIdValue === 'string'
        ? undoBundleIdValue
        : null,
      bundleSize: Number(undoRow.payload?.bundle_size ?? (undoCardIds.length || 1)) || 1,
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
      const redoBundleIdValue = redoRow.payload?.bundle_id;
      const redoBundleCardIdsValue =
        redoRow.payload?.bundle_card_ids
        ?? originalRoot?.payload?.bundle_card_ids;
      const redoCardIds = Array.isArray(redoBundleCardIdsValue)
        ? redoBundleCardIdsValue.filter(
          (value): value is string => typeof value === 'string',
        )
        : originalCardId
          ? [originalCardId]
          : [];

      redo = {
        transactionId: redoRow.id,
        action: originalAction,
        cardId: originalCardId ?? redoCardIds[0] ?? null,
        cardIds: redoCardIds,
        autoCount: Number(originalRoot?.payload?.propagation_auto_count ?? 0) || 0,
        bundleId: typeof redoBundleIdValue === 'string'
          ? redoBundleIdValue
          : null,
        bundleSize: Number(
          redoRow.payload?.bundle_size
          ?? originalRoot?.payload?.bundle_size
          ?? (redoCardIds.length || 1),
        ) || 1,
      };
    }
  }

  return { undo, redo };
}
