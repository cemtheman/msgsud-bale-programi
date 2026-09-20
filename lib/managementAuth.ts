'use client';

export type ManagementRole = 'VIEWER' | 'EDITOR' | 'ADMIN';

export interface ManagementAccessContext {
  userId: string | null;
  role: ManagementRole | null;
  canView: boolean;
  canEdit: boolean;
  canAdmin: boolean;
}

export interface ManagementSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  email: string;
}

interface AuthResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: {
    id?: string;
    email?: string;
  };
  message?: string;
  msg?: string;
  error_description?: string;
}

const SESSION_KEY = 'msgsu-management-session:v1';
const EXPIRY_SAFETY_MS = 60_000;

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error('Yönetim bağlantı ayarları eksik.');
  }

  return { url, key };
}

function translateAuthMessage(message: string, fallback: string) {
  const normalized = message.trim().toLowerCase();

  if (
    normalized.includes('invalid login credentials')
    || normalized.includes('invalid credentials')
  ) {
    return 'E-posta veya parola hatalı.';
  }

  if (normalized.includes('email not confirmed')) {
    return 'E-posta adresi henüz doğrulanmamış.';
  }

  if (normalized.includes('user not found')) {
    return 'Bu e-posta adresiyle kayıtlı bir kullanıcı bulunamadı.';
  }

  if (normalized.includes('refresh token')) {
    return 'Oturum süresi doldu. Lütfen yeniden giriş yapın.';
  }

  if (
    normalized.includes('rate limit')
    || normalized.includes('too many requests')
  ) {
    return 'Çok fazla deneme yapıldı. Lütfen kısa bir süre sonra yeniden deneyin.';
  }

  return message || fallback;
}

async function readError(response: Response, fallback: string) {
  try {
    const body = await response.json() as AuthResponse;
    const message = body.error_description ?? body.message ?? body.msg ?? fallback;
    return translateAuthMessage(message, fallback);
  } catch {
    return fallback;
  }
}

function normalizeSession(body: AuthResponse, fallbackEmail = ''): ManagementSession {
  if (!body.access_token || !body.refresh_token || !body.user?.id) {
    throw new Error('Yönetim oturumu oluşturulamadı.');
  }

  const expiresAt = body.expires_at
    ? body.expires_at * 1000
    : Date.now() + (body.expires_in ?? 3600) * 1000;

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt,
    userId: body.user.id,
    email: body.user.email ?? fallbackEmail,
  };
}

export function readStoredManagementSession(): ManagementSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const value = window.localStorage.getItem(SESSION_KEY);
    if (!value) return null;

    const session = JSON.parse(value) as ManagementSession;
    if (
      !session.accessToken
      || !session.refreshToken
      || !session.expiresAt
      || !session.userId
    ) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function storeManagementSession(session: ManagementSession) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearManagementSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SESSION_KEY);
}

export async function signInManagement(
  email: string,
  password: string,
): Promise<ManagementSession> {
  const { url, key } = getSupabaseConfig();

  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email.trim(),
      password,
    }),
  });

  if (!response.ok) {
    throw new Error(await readError(response, 'Giriş başarısız.'));
  }

  const session = normalizeSession(
    await response.json() as AuthResponse,
    email.trim(),
  );
  storeManagementSession(session);
  return session;
}

export async function refreshManagementSession(
  session: ManagementSession,
): Promise<ManagementSession> {
  const { url, key } = getSupabaseConfig();

  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      refresh_token: session.refreshToken,
    }),
  });

  if (!response.ok) {
    clearManagementSession();
    throw new Error(await readError(response, 'Oturum yenilenemedi.'));
  }

  const refreshed = normalizeSession(
    await response.json() as AuthResponse,
    session.email,
  );
  storeManagementSession(refreshed);
  return refreshed;
}

export async function getValidManagementSession() {
  const session = readStoredManagementSession();
  if (!session) return null;

  if (session.expiresAt - Date.now() > EXPIRY_SAFETY_MS) {
    return session;
  }

  try {
    return await refreshManagementSession(session);
  } catch {
    return null;
  }
}

export async function fetchManagementAccessContext(
  accessToken: string,
): Promise<ManagementAccessContext> {
  const { url, key } = getSupabaseConfig();

  const response = await fetch(`${url}/rest/v1/rpc/management_access_context`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!response.ok) {
    throw new Error(await readError(response, 'Yönetim yetkisi doğrulanamadı.'));
  }

  const body = await response.json() as {
    user_id?: string | null;
    role?: ManagementRole | null;
    can_view?: boolean;
    can_edit?: boolean;
    can_admin?: boolean;
  };

  return {
    userId: body.user_id ?? null,
    role: body.role ?? null,
    canView: body.can_view === true,
    canEdit: body.can_edit === true,
    canAdmin: body.can_admin === true,
  };
}

export async function signOutManagement(session: ManagementSession | null) {
  const { url, key } = getSupabaseConfig();

  if (session?.accessToken) {
    try {
      await fetch(`${url}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${session.accessToken}`,
        },
      });
    } catch {
      // Local session is cleared even if the network sign-out cannot complete.
    }
  }

  clearManagementSession();
}
