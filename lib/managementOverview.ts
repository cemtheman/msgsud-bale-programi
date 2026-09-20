'use client';

export interface ManagementOverview {
  revisionId: string;
  versionNumber: number;
  cardCount: number;
  placedCount: number;
  unplacedCount: number;
  lockedCount: number;
  forcedCount: number;
  unresolvedCount: number;
  contradictionCount: number;
  activeMoveCount: number;
  touchedCardIds: string[];
  placementsByDay: Record<number, number>;
}

interface RevisionRow {
  id: string;
  version_number: number;
}

interface CardRow {
  id: string;
  duration_periods: number;
  locked: boolean;
}

interface PlacementRow {
  card_id: string;
  day_of_week: number;
}

interface DomainSummaryRow {
  card_id: string;
  unresolved_count: number;
  is_forced: boolean;
  is_contradiction: boolean;
}

interface MoveRow {
  id: string;
  actor_type: string;
  action: string;
  payload: Record<string, unknown> | null;
  reverted_at: string | null;
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error('Yönetim bağlantı ayarları eksik.');
  }

  return { url, key };
}

async function authedGet<T>(path: string, accessToken: string): Promise<T> {
  const { url, key } = getSupabaseConfig();

  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Yönetim verisi alınamadı (${response.status}).`);
  }

  return response.json() as Promise<T>;
}

export async function fetchManagementOverview(
  accessToken: string,
): Promise<ManagementOverview | null> {
  const revisions = await authedGet<RevisionRow[]>(
    'schedule_revisions?select=id,version_number&status=eq.DRAFT&order=version_number.desc&limit=1',
    accessToken,
  );

  const revision = revisions[0];
  if (!revision) return null;

  const cards = await authedGet<CardRow[]>(
    `schedule_cards?select=id,duration_periods,locked&schedule_revision_id=eq.${revision.id}`,
    accessToken,
  );

  const cardIds = new Set(cards.map((card) => card.id));

  const [placements, summaries, moves] = await Promise.all([
    authedGet<PlacementRow[]>(
      'placements?select=card_id,day_of_week',
      accessToken,
    ),
    authedGet<DomainSummaryRow[]>(
      'schedule_card_domain_summaries?select=card_id,unresolved_count,is_forced,is_contradiction',
      accessToken,
    ),
    authedGet<MoveRow[]>(
      `move_transactions?select=id,actor_type,action,payload,reverted_at&schedule_revision_id=eq.${revision.id}`,
      accessToken,
    ),
  ]);

  const revisionPlacements = placements.filter((placement) => cardIds.has(placement.card_id));
  const revisionSummaries = summaries.filter((summary) => cardIds.has(summary.card_id));

  const placementsByDay: Record<number, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  revisionPlacements.forEach((placement) => {
    placementsByDay[placement.day_of_week] = (placementsByDay[placement.day_of_week] ?? 0) + 1;
  });

  const touchedCardIds = Array.from(new Set(
    moves
      .filter((move) => (
        move.actor_type === 'USER'
        && ['PLACE', 'MOVE', 'REMOVE'].includes(move.action)
      ))
      .map((move) => (
        typeof move.payload?.card_id === 'string'
          ? move.payload.card_id
          : null
      ))
      .filter((value): value is string => Boolean(value)),
  ));

  return {
    revisionId: revision.id,
    versionNumber: revision.version_number,
    cardCount: cards.length,
    placedCount: revisionPlacements.length,
    unplacedCount: Math.max(cards.length - revisionPlacements.length, 0),
    lockedCount: cards.filter((card) => card.locked).length,
    forcedCount: revisionSummaries.filter((summary) => summary.is_forced).length,
    unresolvedCount: revisionSummaries.filter((summary) => summary.unresolved_count > 0).length,
    contradictionCount: revisionSummaries.filter((summary) => summary.is_contradiction).length,
    activeMoveCount: moves.filter((move) => !move.reverted_at).length,
    touchedCardIds,
    placementsByDay,
  };
}
