'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clearAffiliateSession, getAffiliateToken, getAffiliateUser, type AffiliateUser } from '../lib/auth';

export function useAffiliateAuth(redirectIfUnauthenticated = true) {
  const router = useRouter();
  const [token, setToken] = useState<string>('');
  const [user, setUser] = useState<AffiliateUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = getAffiliateToken();
    const u = getAffiliateUser();
    if (!t && redirectIfUnauthenticated) {
      router.replace('/login');
      return;
    }
    setToken(t ?? '');
    setUser(u);
    setReady(true);
  }, [router, redirectIfUnauthenticated]);

  function logout() {
    clearAffiliateSession();
    router.replace('/login');
  }

  return { token, user, ready, logout };
}

