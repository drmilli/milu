'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser, clearSession, type StoredUser } from '../lib/auth';

export function useAuth(redirectIfUnauthenticated = true) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = getToken();
    const u = getUser();
    if (!t && redirectIfUnauthenticated) {
      router.replace('/login');
      return;
    }
    setToken(t);
    setUser(u);
    setReady(true);
  }, [redirectIfUnauthenticated, router]);

  function logout() {
    clearSession();
    router.replace('/login');
  }

  return { token: token ?? '', user, ready, logout };
}
