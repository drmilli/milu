'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { adminGet } from '../../../lib/api';

type Business = {
  id: string;
  name: string;
  owner: string;
  email: string;
  plan: string;
  status: 'active' | 'trial' | 'suspended' | 'cancelled';
  calls: number;
  mrr: number;
  joined: string;
  industry: string;
};

const planColors: Record<string, string> = {
  Starter: 'bg-primary/10 text-primary',
  Growth: 'bg-success/10 text-success',
  Enterprise: 'bg-warning/10 text-warning',
};

const statusColors: Record<string, string> = {
  active: 'bg-success/10 text-success',
  trial: 'bg-primary/10 text-primary',
  suspended: 'bg-danger/10 text-danger',
  cancelled: 'bg-cream-dark text-primary-warm',
};

function Skeleton() {
  return (
    <tr>
      <td className="px-5 py-4">
        <div className="flex items-center gap-3 animate-pulse">
          <div className="w-8 h-8 rounded-lg bg-cream flex-shrink-0" />
          <div className="space-y-1.5"><div className="h-4 bg-cream rounded w-36" /><div className="h-3 bg-cream rounded w-28" /></div>
        </div>
      </td>
      {[1,2,3,4,5,6].map(i => <td key={i} className="px-4 py-4"><div className="h-4 bg-cream rounded animate-pulse w-16" /></td>)}
    </tr>
  );
}

export default function BusinessesPage() {
  const { token, ready } = useAdminAuth();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = useCallback(() => {
    if (!token) return;
    adminGet<Business[]>('/admin/businesses', token)
      .then(setBusinesses).catch(() => null).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const filtered = businesses.filter((b) => {
    const matchesSearch = b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.owner.toLowerCase().includes(search.toLowerCase()) ||
      b.email.toLowerCase().includes(search.toLowerCase());
    const matchesPlan = planFilter === 'all' || b.plan === planFilter;
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    return matchesSearch && matchesPlan && matchesStatus;
  });

  const totalMRR = filtered.reduce((s, b) => s + b.mrr, 0);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Businesses</h1>
          <p className="text-sm text-primary-warm mt-0.5">
            {loading ? 'Loading…' : `${filtered.length} businesses · ₦${totalMRR.toLocaleString()} MRR`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50"
            placeholder="Search businesses, owners, emails…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          value={planFilter}
          onChange={e => setPlanFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark focus:outline-none focus:border-primary/50 cursor-pointer"
        >
          <option value="all">All plans</option>
          <option value="Starter">Starter</option>
          <option value="Growth">Growth</option>
          <option value="Enterprise">Enterprise</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark focus:outline-none focus:border-primary/50 cursor-pointer"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-dark bg-cream-light/60">
              <th className="text-left px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Business</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Plan</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Calls/mo</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">MRR</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-dark">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} />)
            ) : filtered.map((b) => (
              <tr key={b.id} className="hover:bg-cream-light/40 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-primary">{b.name[0]}</span>
                    </div>
                    <div>
                      <p className="font-medium text-primary-dark">{b.name}</p>
                      <p className="text-xs text-primary-warm">{b.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${planColors[b.plan] ?? 'bg-cream-dark text-primary-warm'}`}>{b.plan}</span>
                </td>
                <td className="px-4 py-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[b.status] ?? 'bg-cream-dark text-primary-warm'}`}>{b.status}</span>
                </td>
                <td className="px-4 py-4 text-right font-medium text-primary-dark">{b.calls.toLocaleString()}</td>
                <td className="px-4 py-4 text-right font-medium text-primary-dark">
                  {b.mrr > 0 ? `₦${b.mrr.toLocaleString()}` : '—'}
                </td>
                <td className="px-4 py-4 text-primary-warm">
                  {new Date(b.joined).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td className="px-4 py-4">
                  <Link
                    href={`/admin/businesses/${b.id}`}
                    className="text-xs text-primary hover:text-primary-dark font-medium hover:underline"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <div className="py-16 text-center text-primary-warm text-sm">No businesses match your filters.</div>
        )}
      </div>
    </div>
  );
}
