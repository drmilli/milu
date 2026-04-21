'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { adminGet } from '../../../lib/api';

type Call = {
  id: string;
  business: string;
  caller: string;
  durationSeconds: number;
  resolution: 'AI' | 'HUMAN' | 'ABANDONED';
  intent: string | null;
  startedAt: string;
};

const statusColors: Record<string, string> = {
  AI: 'bg-success/10 text-success',
  HUMAN: 'bg-warning/10 text-warning',
  ABANDONED: 'bg-danger/10 text-danger',
};

const statusLabel: Record<string, string> = {
  AI: 'Resolved',
  HUMAN: 'Escalated',
  ABANDONED: 'Missed',
};

function fmtDuration(sec: number) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function Skeleton() {
  return (
    <tr>
      {[1,2,3,4,5,6].map(i => <td key={i} className="px-4 py-3.5"><div className="h-4 bg-cream rounded animate-pulse w-20" /></td>)}
    </tr>
  );
}

export default function CallsPage() {
  const { token, ready } = useAdminAuth();

  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [bizFilter, setBizFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const load = useCallback(() => {
    if (!token) return;
    const params = new URLSearchParams({ limit: String(pageSize), page: String(page) });
    if (statusFilter !== 'all') params.set('resolution', statusFilter);
    adminGet<{ calls: Call[] } | Call[]>(`/admin/calls?${params}`, token)
      .then(data => setCalls(Array.isArray(data) ? data : data.calls))
      .catch(() => null).finally(() => setLoading(false));
  }, [token, page, statusFilter]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const businesses = Array.from(new Set(calls.map(c => c.business))).sort();

  const filtered = calls.filter(c => {
    const matchesSearch = c.business.toLowerCase().includes(search.toLowerCase()) ||
      c.caller.includes(search) ||
      (c.intent ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesBiz = bizFilter === 'all' || c.business === bizFilter;
    return matchesSearch && matchesBiz;
  });

  const resolved = filtered.filter(c => c.resolution === 'AI').length;
  const escalated = filtered.filter(c => c.resolution === 'HUMAN').length;
  const missed = filtered.filter(c => c.resolution === 'ABANDONED').length;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary-dark">Calls</h1>
        <p className="text-sm text-primary-warm mt-0.5">All calls across all businesses</p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Resolved', value: resolved, color: 'text-success' },
          { label: 'Escalated', value: escalated, color: 'text-warning' },
          { label: 'Missed', value: missed, color: 'text-danger' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-cream-dark p-4 text-center">
            {loading ? (
              <div className="h-7 bg-cream rounded animate-pulse mx-auto w-8 mb-1" />
            ) : (
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            )}
            <p className="text-xs text-primary-warm mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50"
            placeholder="Search business, caller, intent…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select value={bizFilter} onChange={e => setBizFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark focus:outline-none cursor-pointer">
          <option value="all">All businesses</option>
          {businesses.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark focus:outline-none cursor-pointer"
        >
          <option value="all">All statuses</option>
          <option value="AI">Resolved</option>
          <option value="HUMAN">Escalated</option>
          <option value="ABANDONED">Missed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-dark bg-cream-light/60">
              <th className="text-left px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Business</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Caller</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Intent</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Duration</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-dark">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} />)
            ) : filtered.map(c => (
              <tr key={c.id} className="hover:bg-cream-light/40 transition-colors">
                <td className="px-5 py-3.5 font-medium text-primary-dark">{c.business}</td>
                <td className="px-4 py-3.5 text-primary-warm font-mono text-xs">{c.caller}</td>
                <td className="px-4 py-3.5 text-primary-warm">{c.intent ?? '—'}</td>
                <td className="px-4 py-3.5 text-primary-warm">{fmtDuration(c.durationSeconds)}</td>
                <td className="px-4 py-3.5">
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${statusColors[c.resolution]}`}>
                    {statusLabel[c.resolution]}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-primary-warm">{fmtTime(c.startedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <div className="py-16 text-center text-primary-warm text-sm">No calls match your filters.</div>
        )}
      </div>

      {/* Pagination */}
      {!loading && calls.length === pageSize && (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm text-primary border border-primary/30 px-4 py-2 rounded-xl hover:bg-primary/5 transition-colors disabled:opacity-40"
          >
            Previous
          </button>
          <button
            onClick={() => setPage(p => p + 1)}
            className="text-sm text-primary border border-primary/30 px-4 py-2 rounded-xl hover:bg-primary/5 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
