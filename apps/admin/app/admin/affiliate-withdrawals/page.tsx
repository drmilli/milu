'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { adminGet, adminPatch } from '../../../lib/api';

type Withdrawal = {
  id: string;
  affiliateAgentId: string;
  agent: string;
  amountUsd: number;
  status: 'NEW' | 'APPROVED' | 'PAID' | 'REJECTED';
  adminNote?: string | null;
  payoutReference?: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function AffiliateWithdrawalsPage() {
  const { token, ready } = useAdminAuth();
  const [items, setItems] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | Withdrawal['status']>('all');

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    adminGet<Withdrawal[]>('/admin/affiliate/withdrawals', token)
      .then(setItems)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return items;
    return items.filter(i => i.status === statusFilter);
  }, [items, statusFilter]);

  async function update(id: string, patch: Partial<Pick<Withdrawal, 'status' | 'adminNote' | 'payoutReference'>>) {
    if (!token) return;
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } as Withdrawal : i)));
    try {
      await adminPatch(`/admin/affiliate/withdrawals/${id}`, patch, token);
    } catch {
      load();
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Affiliate withdrawals</h1>
          <p className="text-sm text-primary-warm mt-0.5">Review and process bank transfer requests.</p>
        </div>
        <Link href="/admin/affiliates" className="text-sm px-4 py-2.5 rounded-xl bg-cream border border-cream-dark hover:bg-cream-light">
          Back to affiliates
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          className="px-4 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | Withdrawal['status'])}
        >
          <option value="all">All</option>
          <option value="NEW">NEW</option>
          <option value="APPROVED">APPROVED</option>
          <option value="PAID">PAID</option>
          <option value="REJECTED">REJECTED</option>
        </select>
        <button onClick={load} className="px-4 py-2.5 rounded-xl bg-cream border border-cream-dark text-sm hover:bg-cream-light">
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-dark bg-cream-light/60">
              <th className="text-left px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Agent</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Amount</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Requested</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-primary-warm">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-primary-warm">No withdrawal requests.</td></tr>
            ) : (
              filtered.map(w => (
                <tr key={w.id} className="border-b border-cream-dark last:border-0">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-primary-dark">{w.agent}</p>
                    <p className="text-xs text-primary-warm">{w.affiliateAgentId}</p>
                  </td>
                  <td className="px-4 py-3.5 text-primary-dark font-medium">${w.amountUsd}</td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs px-2 py-1 rounded-full bg-cream border border-cream-dark text-primary-dark">{w.status}</span>
                  </td>
                  <td className="px-4 py-3.5 text-primary-warm">{new Date(w.createdAt).toLocaleString()}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => update(w.id, { status: 'APPROVED' })}
                        className="text-xs px-3 py-1.5 rounded-full bg-warning/10 text-warning hover:bg-warning/15"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => update(w.id, { status: 'PAID' })}
                        className="text-xs px-3 py-1.5 rounded-full bg-success/10 text-success hover:bg-success/15"
                      >
                        Mark paid
                      </button>
                      <button
                        onClick={() => update(w.id, { status: 'REJECTED' })}
                        className="text-xs px-3 py-1.5 rounded-full bg-danger/10 text-danger hover:bg-danger/15"
                      >
                        Reject
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

