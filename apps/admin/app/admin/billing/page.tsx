'use client';

import { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { adminGet } from '../../../lib/api';

interface BillingOverview {
  mrr: number;
  arr: number;
  activeSubscriptions: number;
  trialsCount: number;
  trialConversionRate: number;
  planDistribution: { name: string; value: number; color: string }[];
}

interface Sub {
  id: string;
  business: string;
  plan: string;
  status: 'active' | 'trial' | 'past_due' | 'cancelled';
  mrr: number;
  nextBillingAt: string;
}

const planColors: Record<string, string> = {
  Starter: 'bg-primary/10 text-primary',
  Growth: 'bg-success/10 text-success',
  Enterprise: 'bg-warning/10 text-warning',
};

const statusColors: Record<string, string> = {
  active: 'bg-success/10 text-success',
  trial: 'bg-primary/10 text-primary',
  past_due: 'bg-danger/10 text-danger',
  cancelled: 'bg-cream-dark text-primary-warm',
};

function fmtMrr(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}k`;
  return `₦${n.toLocaleString()}`;
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-cream rounded-xl ${className}`} />;
}

export default function BillingPage() {
  const { token, ready } = useAdminAuth();

  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [subscriptions, setSubscriptions] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(() => {
    if (!token) return;
    Promise.all([
      adminGet<BillingOverview>('/admin/billing/overview', token),
      adminGet<Sub[]>('/admin/billing/subscriptions', token),
    ]).then(([ov, subs]) => {
      setOverview(ov);
      setSubscriptions(subs);
    }).catch(() => null).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const filtered = subscriptions.filter(s => {
    const matchesPlan = planFilter === 'all' || s.plan === planFilter;
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesPlan && matchesStatus;
  });

  const stats = overview ? [
    { label: 'MRR', value: fmtMrr(overview.mrr), change: '' },
    { label: 'ARR', value: fmtMrr(overview.arr), change: 'Annualised' },
    { label: 'Active Subscriptions', value: overview.activeSubscriptions.toLocaleString(), change: `${overview.trialsCount} on trial` },
    { label: 'Trial Conversions', value: `${overview.trialConversionRate.toFixed(0)}%`, change: 'Last 30 days' },
  ] : null;

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : stats?.map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-cream-dark p-5">
            <p className="text-xs text-primary-warm mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-primary-dark font-heading">{s.value}</p>
            {s.change && <p className="text-xs text-primary-warm mt-1">{s.change}</p>}
          </div>
        ))}
      </div>

      {/* Plan distribution */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6">
        <h2 className="text-sm font-semibold text-primary-dark mb-4">Plan distribution</h2>
        {loading ? <Skeleton className="h-48" /> : (
          <div className="flex items-center gap-8">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie
                  data={overview?.planDistribution ?? []}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={80}
                  dataKey="value" strokeWidth={0}
                >
                  {(overview?.planDistribution ?? []).map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #EAD9BA', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3 flex-1">
              {(overview?.planDistribution ?? []).map(p => (
                <div key={p.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="text-sm text-primary-dark">{p.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-primary-dark">{p.value} businesses</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Subscriptions table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary-dark">Subscriptions</h2>
          <div className="flex gap-2">
            <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-cream-dark bg-white text-xs text-primary-dark focus:outline-none cursor-pointer">
              <option value="all">All plans</option>
              <option value="Starter">Starter</option>
              <option value="Growth">Growth</option>
              <option value="Enterprise">Enterprise</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-cream-dark bg-white text-xs text-primary-dark focus:outline-none cursor-pointer">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="past_due">Past due</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-dark bg-cream-light/60">
                <th className="text-left px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Business</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">MRR</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Next billing</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-dark">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[1,2,3,4,5,6].map(j => <td key={j} className="px-4 py-3.5"><div className="h-4 bg-cream rounded animate-pulse w-20" /></td>)}
                  </tr>
                ))
              ) : filtered.map(s => (
                <tr key={s.id} className="hover:bg-cream-light/40 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-primary-dark">{s.business}</td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${planColors[s.plan] ?? 'bg-cream-dark text-primary-warm'}`}>{s.plan}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize ${statusColors[s.status] ?? 'bg-cream-dark text-primary-warm'}`}>
                      {s.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium text-primary-dark">
                    {s.mrr > 0 ? fmtMrr(s.mrr) : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-primary-warm">
                    {new Date(s.nextBillingAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-2 justify-end">
                      <button className="text-xs text-primary hover:underline font-medium">Manage</button>
                      <button className="text-xs text-danger hover:underline font-medium">Cancel</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <div className="py-16 text-center text-primary-warm text-sm">No subscriptions match your filters.</div>
          )}
        </div>
      </div>
    </div>
  );
}
