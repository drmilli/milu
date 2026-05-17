'use client';

import { useState, useEffect } from 'react';
import { apiGet } from '../lib/api';
import { getActiveBusinessId } from '../lib/auth';

interface PlanFeatures {
  broadcasts: boolean;
  crm: boolean;
  multiBusiness: boolean;
}

interface PlanInfo {
  planId: string;
  planName: string;
  status: string;
  features: PlanFeatures;
}

const FALLBACK: PlanFeatures = { broadcasts: false, crm: false, multiBusiness: false };

export function usePlan(token: string | null) {
  const [features, setFeatures] = useState<PlanFeatures>(FALLBACK);
  const [planName, setPlanName] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) return;
    const bid = getActiveBusinessId();
    if (!bid) { setReady(true); return; }

    apiGet<PlanInfo>(`/billing/subscription/${bid}`, token)
      .then(data => {
        setFeatures(data.features ?? FALLBACK);
        setPlanName(data.planName ?? '');
      })
      .catch(() => {
        // On error, default to most permissive (don't block users due to billing API failure)
        setFeatures({ broadcasts: true, crm: true, multiBusiness: true });
      })
      .finally(() => setReady(true));
  }, [token]);

  return { features, planName, ready };
}
