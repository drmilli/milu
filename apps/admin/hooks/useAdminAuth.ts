'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminToken, getAdminUser, clearAdminSession, type AdminUser } from '../lib/auth';

export function useAdminAuth(redirectIfUnauthenticated = true) {
  const router = useRouter();
  const [token, setToken] = useState<string>('');
  const [user, setUser] = useState<AdminUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = getAdminToken();
    const u = getAdminUser();
    if (!t && redirectIfUnauthenticated) {
      router.replace('/login');
      return;
    }
    setToken(t ?? '');
    setUser(u);
    setReady(true);
  }, [router, redirectIfUnauthenticated]);

  function logout() {
    clearAdminSession();
    router.replace('/login');
  }

  return { token, user, ready, logout };
}
