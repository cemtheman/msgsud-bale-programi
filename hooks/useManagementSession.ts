'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchManagementAccessContext,
  getValidManagementSession,
  signInManagement,
  signOutManagement,
  type ManagementAccessContext,
  type ManagementSession,
} from '@/lib/managementAuth';

type ManagementSessionStatus = 'loading' | 'anonymous' | 'ready' | 'forbidden';

export function useManagementSession() {
  const [status, setStatus] = useState<ManagementSessionStatus>('loading');
  const [session, setSession] = useState<ManagementSession | null>(null);
  const [access, setAccess] = useState<ManagementAccessContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applySession = useCallback(async (nextSession: ManagementSession) => {
    const nextAccess = await fetchManagementAccessContext(nextSession.accessToken);

    setSession(nextSession);
    setAccess(nextAccess);
    setError(null);
    setStatus(nextAccess.canView ? 'ready' : 'forbidden');

    return nextAccess;
  }, []);

  useEffect(() => {
    let active = true;

    Promise.resolve().then(async () => {
      try {
        const restored = await getValidManagementSession();

        if (!active) return;

        if (!restored) {
          setStatus('anonymous');
          return;
        }

        const nextAccess = await fetchManagementAccessContext(restored.accessToken);
        if (!active) return;

        setSession(restored);
        setAccess(nextAccess);
        setStatus(nextAccess.canView ? 'ready' : 'forbidden');
      } catch (reason: unknown) {
        if (!active) return;

        setError(reason instanceof Error ? reason.message : 'Yönetim oturumu açılamadı.');
        setStatus('anonymous');
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setStatus('loading');
    setError(null);

    try {
      const nextSession = await signInManagement(email, password);
      return await applySession(nextSession);
    } catch (reason: unknown) {
      setSession(null);
      setAccess(null);
      setStatus('anonymous');
      setError(reason instanceof Error ? reason.message : 'Giriş başarısız.');
      return null;
    }
  }, [applySession]);

  const logout = useCallback(async () => {
    const currentSession = session;
    setSession(null);
    setAccess(null);
    setError(null);
    setStatus('anonymous');
    await signOutManagement(currentSession);
  }, [session]);

  return {
    status,
    session,
    access,
    error,
    login,
    logout,
  };
}
