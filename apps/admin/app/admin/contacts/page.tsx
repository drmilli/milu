'use client';

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { adminGet } from '../../../lib/api';

type Stage = 'LEAD' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'CLOSED_WON' | 'CLOSED_LOST';

interface Contact {
  id: string;
  phone: string;
  name?: string | null;
  email?: string | null;
  location?: string | null;
  stage: Stage;
  totalCalls?: number | null;
  lastCallAt?: string | null;
  businessId: string;
  createdAt: string;
}

const stageConfig: Record<Stage, { label: string; cls: string }> = {
  LEAD:        { label: 'Lead',      cls: 'bg-blue-500/10 text-blue-400' },
  CONTACTED:   { label: 'Contacted', cls: 'bg-yellow-500/10 text-yellow-400' },
  QUALIFIED:   { label: 'Qualified', cls: 'bg-purple-500/10 text-purple-400' },
  PROPOSAL:    { label: 'Proposal',  cls: 'bg-orange-500/10 text-orange-400' },
  CLOSED_WON:  { label: 'Won',       cls: 'bg-success/10 text-success' },
  CLOSED_LOST: { label: 'Lost',      cls: 'bg-danger/10 text-danger' },
};

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminContactsPage() {
  const { token, ready } = useAdminAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const LIMIT = 25;
  const STAGES: Stage[] = ['LEAD', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'CLOSED_WON', 'CLOSED_LOST'];

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search) params.set('search', search);
      if (stageFilter) params.set('stage', stageFilter);
      const data = await adminGet<{ contacts: Contact[]; total: number }>(`/admin/contacts?${params}`, token);
      setContacts(data.contacts);
      setTotal(data.total);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token, page, search, stageFilter]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary-dark">Contacts</h1>
          <p className="text-sm text-primary-warm mt-0.5">{total.toLocaleString()} total across all businesses</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-warm/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name or phone…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark placeholder:text-primary-warm/50 focus:outline-none focus:border-primary/50"
          />
        </div>
        <select
          value={stageFilter}
          onChange={e => { setStageFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark focus:outline-none focus:border-primary/50"
        >
          <option value="">All stages</option>
          {STAGES.map(s => <option key={s} value={s}>{stageConfig[s].label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-dark bg-cream-light/50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-primary-warm/70 uppercase tracking-wide">Contact</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm/70 uppercase tracking-wide hidden sm:table-cell">Phone</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm/70 uppercase tracking-wide">Stage</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm/70 uppercase tracking-wide hidden md:table-cell">Calls</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm/70 uppercase tracking-wide hidden lg:table-cell">Last Call</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm/70 uppercase tracking-wide hidden lg:table-cell">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-dark/50">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {[1,2,3,4,5,6].map(j => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="h-4 bg-cream rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-primary-warm/50">No contacts found</td>
              </tr>
            ) : contacts.map(c => (
              <tr key={c.id} className="hover:bg-cream-light/30 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-primary">{(c.name || c.phone)[0]?.toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-medium text-primary-dark">{c.name || '—'}</p>
                      {c.email && <p className="text-xs text-primary-warm/60">{c.email}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 hidden sm:table-cell text-primary-warm font-mono text-xs">{c.phone}</td>
                <td className="px-4 py-3.5">
                  <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-medium', stageConfig[c.stage].cls)}>
                    {stageConfig[c.stage].label}
                  </span>
                </td>
                <td className="px-4 py-3.5 hidden md:table-cell text-primary-warm">{c.totalCalls ?? 0}</td>
                <td className="px-4 py-3.5 hidden lg:table-cell text-primary-warm text-xs">{formatDate(c.lastCallAt)}</td>
                <td className="px-4 py-3.5 hidden lg:table-cell text-primary-warm text-xs">{formatDate(c.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-primary-warm">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg border border-cream-dark bg-white disabled:opacity-40 hover:bg-cream-light transition-colors">
            ← Prev
          </button>
          <span className="text-xs">{page} / {totalPages} — {total} contacts</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg border border-cream-dark bg-white disabled:opacity-40 hover:bg-cream-light transition-colors">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
