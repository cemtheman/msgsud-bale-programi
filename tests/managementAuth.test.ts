import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getFreshManagementAccessToken,
  storeManagementSession,
} from '@/lib/managementAuth';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

describe('management auth token refresh', () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';

    const localStorage = new MemoryStorage();
    vi.stubGlobal('window', { localStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    if (previousUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    }

    if (previousKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
    }
  });

  it('keeps a stored access token when it is comfortably valid', async () => {
    storeManagementSession({
      accessToken: 'still-valid',
      refreshToken: 'refresh-valid',
      expiresAt: Date.now() + 10 * 60_000,
      userId: 'user-1',
      email: 'admin@example.com',
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getFreshManagementAccessToken('stale-prop-token'),
    ).resolves.toBe('still-valid');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent refreshes when the stored token is expiring', async () => {
    storeManagementSession({
      accessToken: 'expiring-token',
      refreshToken: 'refresh-old',
      expiresAt: Date.now() + 10_000,
      userId: 'user-1',
      email: 'admin@example.com',
    });

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      access_token: 'refreshed-token',
      refresh_token: 'refresh-new',
      expires_in: 3600,
      user: {
        id: 'user-1',
        email: 'admin@example.com',
      },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const tokens = await Promise.all([
      getFreshManagementAccessToken('old-a'),
      getFreshManagementAccessToken('old-b'),
      getFreshManagementAccessToken('old-c'),
    ]);

    expect(tokens).toEqual([
      'refreshed-token',
      'refreshed-token',
      'refreshed-token',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
