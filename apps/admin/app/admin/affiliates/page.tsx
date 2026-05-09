'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { adminGet, adminPatch } from '../../../lib/api';

type AffiliateAgent = {
  id: string;
  name: string;
  email: string;
  referralCode: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  commissionPercent?: number | null;
  commissionMonths?: number | null;
  referrals: number;
  earnedUsd: number;
  createdAt: string;
};

export default function AffiliatesPage() {
  const { token, ready } = useAdminAuth();
  const [items, setItems] = useState<AffiliateAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    adminGet<AffiliateAgent[]>('/admin/affiliates', token)
      .then(setItems)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      a.referralCode.toLowerCase().includes(q),
    );
  }, [items, search]);

  async function setStatus(id: string, status: AffiliateAgent['status']) {
    if (!token) return;
    setItems(prev => prev.map(a => (a.id === id ? { ...a, status } : a)));
    try {
      await adminPatch(`/admin/affiliates/${id}`, { status }, token);
    } catch {
      load();
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Affiliates</h1>
          <p className="text-sm text-primary-warm mt-0.5">Manage affiliate agents and referral performance.</p>
        </div>
        <Link href="/admin/affiliate-withdrawals" className="text-sm px-4 py-2.5 rounded-xl bg-primary text-cream-light hover:bg-primary-dark">
          Withdrawals
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-cream-dark p-4 flex items-center gap-3">
        <input
          className="flex-1 px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
          placeholder="Search name, email, referral code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={load} className="px-4 py-2.5 rounded-xl bg-cream border border-cream-dark text-sm hover:bg-cream-light">
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-dark bg-cream-light/60">
              <th className="text-left px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Agent</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Referral code</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Referrals</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Earned</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Status</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-primary-warm">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-primary-warm">No affiliates found.</td></tr>
            ) : (
              filtered.map(a => (
                <tr key={a.id} className="border-b border-cream-dark last:border-0">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-primary-dark">{a.name}</p>
                    <p className="text-xs text-primary-warm">{a.email}</p>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs text-primary-dark">{a.referralCode}</td>
                  <td className="px-4 py-3.5 text-primary-dark">{a.referrals}</td>
                  <td className="px-4 py-3.5 text-primary-dark">${a.earnedUsd}</td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs px-2 py-1 rounded-full bg-cream border border-cream-dark text-primary-dark">{a.status}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setStatus(a.id, 'ACTIVE')}
                        className="text-xs px-3 py-1.5 rounded-full bg-success/10 text-success hover:bg-success/15"
                      >
                        Activate
                      </button>
                      <button
                        onClick={() => setStatus(a.id, 'SUSPENDED')}
                        className="text-xs px-3 py-1.5 rounded-full bg-warning/10 text-warning hover:bg-warning/15"
                      >
                        Suspend
                      </button>
                      <button
                        onClick={() => setStatus(a.id, 'BANNED')}
                        className="text-xs px-3 py-1.5 rounded-full bg-danger/10 text-danger hover:bg-danger/15"
                      >
                        Ban
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

