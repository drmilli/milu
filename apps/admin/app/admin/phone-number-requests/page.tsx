'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { adminGet, adminPatch } from '../../../lib/api';

type PhoneNumberRequest = {
  id: string;
  businessId: string;
  businessName: string;
  quantity: number;
  amountUsd: number;
  checkoutUrl: string;
  note?: string | null;
  status: 'NEW' | 'IN_REVIEW' | 'FULFILLED' | 'REJECTED';
  createdAt: string;
};

type ListResponse = {
  page: number;
  limit: number;
  total: number;
  items: PhoneNumberRequest[];
};

const statusColors: Record<PhoneNumberRequest['status'], string> = {
  NEW: 'bg-primary/10 text-primary',
  IN_REVIEW: 'bg-warning/10 text-warning',
  FULFILLED: 'bg-success/10 text-success',
  REJECTED: 'bg-danger/10 text-danger',
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PhoneNumberRequestsPage() {
  const { token, ready } = useAdminAuth();

  const [items, setItems] = useState<PhoneNumberRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | PhoneNumberRequest['status']>('all');
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [total, setTotal] = useState(0);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError('');

    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    if (q.trim()) params.set('q', q.trim());
    if (status !== 'all') params.set('status', status);

    adminGet<ListResponse>(`/admin/phone-number-requests?${params.toString()}`, token)
      .then((res) => {
        setItems(res.items ?? []);
        setTotal(res.total ?? 0);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load requests.'))
      .finally(() => setLoading(false));
  }, [token, page, pageSize, q, status]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  async function updateStatus(id: string, nextStatus: PhoneNumberRequest['status']) {
    if (!token) return;
    setUpdatingId(id);
    try {
      await adminPatch(`/admin/phone-number-requests/${id}`, { status: nextStatus }, token);
      setItems((prev) => prev.map((r) => (r.id === id ? { ...r, status: nextStatus } : r)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary-dark">Phone Number Requests</h1>
        <p className="text-sm text-primary-warm mt-0.5">Additional phone number requests from businesses</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-56">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50"
            placeholder="Search business, note, request id…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as ('all' | PhoneNumberRequest['status'])); setPage(1); }}
          className="px-3 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark focus:outline-none cursor-pointer"
        >
          <option value="all">All statuses</option>
          <option value="NEW">New</option>
          <option value="IN_REVIEW">In review</option>
          <option value="FULFILLED">Fulfilled</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl border border-danger/20 bg-danger/10 text-danger text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-dark bg-cream-light/60">
              <th className="text-left px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Business</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Qty</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Price</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Note</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Date</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Checkout</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-dark">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {[1,2,3,4,5,6,7].map((n) => (
                    <td key={n} className="px-4 py-3.5">
                      <div className="h-4 bg-cream rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))
            ) : items.map((r) => (
              <tr key={r.id} className="hover:bg-cream-light/40 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="space-y-0.5">
                    <Link href={`/admin/businesses/${r.businessId}`} className="font-medium text-primary-dark hover:underline">
                      {r.businessName}
                    </Link>
                    <p className="text-[11px] text-primary-warm font-mono">{r.id}</p>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right font-medium text-primary-dark">{r.quantity}</td>
                <td className="px-4 py-3.5 text-right text-primary-dark">${r.amountUsd}</td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[r.status]}`}>
                      {r.status === 'NEW' ? 'New' : r.status === 'IN_REVIEW' ? 'In review' : r.status === 'FULFILLED' ? 'Fulfilled' : 'Rejected'}
                    </span>
                    <select
                      value={r.status}
                      onChange={(e) => updateStatus(r.id, e.target.value as PhoneNumberRequest['status'])}
                      disabled={updatingId === r.id}
                      className="px-2 py-1.5 rounded-lg border border-cream-dark bg-white text-xs text-primary-dark focus:outline-none disabled:opacity-50"
                    >
                      <option value="NEW">New</option>
                      <option value="IN_REVIEW">In review</option>
                      <option value="FULFILLED">Fulfilled</option>
                      <option value="REJECTED">Rejected</option>
                    </select>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-primary-warm max-w-[360px] truncate" title={r.note ?? ''}>
                  {r.note ?? '—'}
                </td>
                <td className="px-4 py-3.5 text-primary-warm">{fmtDate(r.createdAt)}</td>
                <td className="px-5 py-3.5 text-right">
                  <a
                    href={r.checkoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-cream-dark text-primary-warm hover:text-primary hover:border-primary/30 transition-colors"
                    title="Open Whop checkout"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H19.5V12M19.5 6l-9 9-3-3-6 6" />
                    </svg>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && (
          <div className="py-16 text-center text-primary-warm text-sm">No phone number requests found.</div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-primary-warm">
          {loading ? 'Loading…' : (total > 0 ? `Page ${page} of ${totalPages} · ${total} total` : '—')}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={loading || page <= 1}
            className="px-3 py-2 rounded-xl border border-cream-dark bg-white text-xs font-medium text-primary-warm hover:text-primary disabled:opacity-50"
          >
            Prev
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={loading || page >= totalPages}
            className="px-3 py-2 rounded-xl border border-cream-dark bg-white text-xs font-medium text-primary-warm hover:text-primary disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
