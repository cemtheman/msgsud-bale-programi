'use client';

import { getFreshManagementAccessToken } from '@/lib/managementAuth';

export interface ManagementDraftRevisionRef {
  id: string;
  requirement_set_id: string;
  version_number: number;
}

const DRAFT_REVISION_DEDUPE_MS = 5_000;

let inFlightDraftRevision:
  | Promise<ManagementDraftRevisionRef | null>
  | null = null;
let inFlightAccessToken: string | null = null;
let cachedDraftRevision: ManagementDraftRevisionRef | null = null;
let cachedAccessToken: string | null = null;
let cachedAt = 0;

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error('Yönetim bağlantı ayarları eksik.');
  }

  return { url, key };
}

async function loadLatestManagementDraftRevision(
  accessToken: string,
): Promise<ManagementDraftRevisionRef | null> {
  const { url, key } = getSupabaseConfig();
  const token = await getFreshManagementAccessToken(accessToken);

  const response = await fetch(
    `${url}/rest/v1/schedule_revisions?select=id,requirement_set_id,version_number&status=eq.DRAFT&order=version_number.desc&limit=1`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    let message = 'Aktif taslak program bilgisi alınamadı.';

    try {
      const body = await response.json() as {
        message?: string;
        details?: string;
        hint?: string;
      };
      message = body.message ?? body.details ?? body.hint ?? message;
    } catch {
      // Keep the stable Turkish fallback for non-JSON edge responses.
    }

    throw new Error(message);
  }

  const rows = await response.json() as ManagementDraftRevisionRef[];
  return rows[0] ?? null;
}

export async function fetchLatestManagementDraftRevision(
  accessToken: string,
): Promise<ManagementDraftRevisionRef | null> {
  const now = Date.now();

  if (
    cachedAccessToken === accessToken
    && now - cachedAt < DRAFT_REVISION_DEDUPE_MS
  ) {
    return cachedDraftRevision;
  }

  if (
    inFlightDraftRevision
    && inFlightAccessToken === accessToken
  ) {
    return inFlightDraftRevision;
  }

  const request = loadLatestManagementDraftRevision(accessToken);
  inFlightDraftRevision = request;
  inFlightAccessToken = accessToken;

  try {
    const revision = await request;

    if (inFlightDraftRevision === request) {
      cachedDraftRevision = revision;
      cachedAccessToken = accessToken;
      cachedAt = Date.now();
    }

    return revision;
  } catch (reason: unknown) {
    if (inFlightDraftRevision === request) {
      cachedDraftRevision = null;
      cachedAccessToken = null;
      cachedAt = 0;
    }
    throw reason;
  } finally {
    if (inFlightDraftRevision === request) {
      inFlightDraftRevision = null;
      inFlightAccessToken = null;
    }
  }
}

export function invalidateManagementDraftRevisionCache() {
  cachedDraftRevision = null;
  cachedAccessToken = null;
  cachedAt = 0;
}
