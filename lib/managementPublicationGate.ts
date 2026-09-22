'use client';

export type ManagementPublicationBlockReason =
  | 'PUBLICATION_CONTROL_MISSING'
  | 'RUNTIME_ADJUSTMENTS_PENDING'
  | 'PUBLIC_BASELINE_DRIFT'
  | 'UNPLACED_CARDS'
  | 'DOMAIN_SUMMARY_MISSING'
  | 'CONTRADICTIONS'
  | 'UNRESOLVED_TOUCHED'
  | 'INVALID_PERIOD_RANGE'
  | 'PUBLIC_MEMBER_MAPPING_MISSING'
  | 'INACTIVE_ROOM_PLACEMENT';

export type ManagementPublicationWarningReason =
  | 'UNRESOLVED_INHERITED';

export interface ManagementPublicationBaseline {
  healthy: boolean;
  source: string;
  academicYear: string;
  expectedSessionCount?: number;
  currentSessionCount?: number;
  expectedGroupCount?: number;
  currentGroupCount?: number;
}

export interface ManagementPublicationGateData {
  revisionId: string;
  revisionVersion: number;
  academicYear: string;
  term: number;
  canPublish: boolean;
  canCurrentUserPublish: boolean;
  blockReasons: ManagementPublicationBlockReason[];
  warningReasons: ManagementPublicationWarningReason[];
  totalCards: number;
  placedCards: number;
  unplacedCards: number;
  contradictionCount: number;
  unresolvedTouchedCount: number;
  unresolvedInheritedCount: number;
  missingDomainSummaryCount: number;
  invalidPeriodCount: number;
  memberlessRequirementCount: number;
  inactiveRoomPlacementCount: number;
  projectedSessionCount: number;
  projectedGroupCount: number;
  baseline: ManagementPublicationBaseline;
  runtimeAdjustmentsReconciled: boolean;
  stateToken: string;
}

interface RevisionRow {
  id: string;
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error('Yönetim bağlantı ayarları eksik.');
  }

  return { url, key };
}

async function readRpcError(
  response: Response,
  fallback: string,
) {
  try {
    const body = await response.json() as {
      message?: string;
      details?: string;
      hint?: string;
    };

    return body.message ?? body.details ?? body.hint ?? fallback;
  } catch {
    return fallback;
  }
}

async function authedGet<T>(
  path: string,
  accessToken: string,
): Promise<T> {
  const { url, key } = getSupabaseConfig();

  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(
      await readRpcError(
        response,
        'Yayın güvenliği için güncel taslak bulunamadı.',
      ),
    );
  }

  return response.json() as Promise<T>;
}

export async function fetchManagementPublicationGate(
  accessToken: string,
): Promise<ManagementPublicationGateData | null> {
  const revisions = await authedGet<RevisionRow[]>(
    'schedule_revisions?select=id&status=eq.DRAFT&order=version_number.desc&limit=1',
    accessToken,
  );

  const revision = revisions[0];
  if (!revision) return null;

  const { url, key } = getSupabaseConfig();

  const response = await fetch(
    `${url}/rest/v1/rpc/management_preview_publication`,
    {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_schedule_revision_id: revision.id,
      }),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error(
      await readRpcError(
        response,
        'Sunucu yayın güvenliği kontrolü tamamlanamadı.',
      ),
    );
  }

  return response.json() as Promise<ManagementPublicationGateData>;
}
