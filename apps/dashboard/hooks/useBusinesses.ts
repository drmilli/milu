'use client';
import { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../lib/api';
import { getActiveBusinessId, setActiveBusinessId } from '../lib/auth';

interface Business {
  id: string;
  name: string;
  industry?: string;
  subscriptionTier: string;
  isActive: boolean;
  createdAt: string;
}

export function useBusinesses(token: string) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setActiveId(getActiveBusinessId());
    apiGet<{ businesses: Business[] }>('/businesses/mine', token)
      .then(r => setBusinesses(r.businesses))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [token]);

  function switchBusiness(id: string) {
    setActiveBusinessId(id);
    setActiveId(id);
    window.location.reload();
  }

  async function createBusiness(name: string, industry?: string) {
    const biz = await apiPost<Business>('/businesses/create-additional', { name, industry }, token);
    setBusinesses(prev => [...prev, biz]);
    return biz;
  }

  return { businesses, activeId, loading, switchBusiness, createBusiness };
}
