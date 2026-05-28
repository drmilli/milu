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

interface PaymentRow {
  id: string;
  businessId: string | null;
  businessName: string | null;
  campaignId: string | null;
  type: 'SUBSCRIPTION' | 'CAMPAIGN';
  plan: string | null;
  description: string;
  amountUsd: number;
  whopRef: string | null;
  paidAt: string;
}

interface PaymentsResponse {
  payments: PaymentRow[];
  total: number;
  totalRevenue: number;
  page: number;
  limit: number;
}

const planColors: Record<string, string> = {
  Trial: 'bg-primary/10 text-primary',
  Starter: 'bg-primary/10 text-primary',
  Growth: 'bg-success/10 text-success',
  'One-time': 'bg-sky-500/10 text-sky-600',
  Enterprise: 'bg-warning/10 text-warning',
};

const statusColors: Record<string, string> = {
  active: 'bg-success/10 text-success',
  trial: 'bg-primary/10 text-primary',
  past_due: 'bg-danger/10 text-danger',
  cancelled: 'bg-cream-dark text-primary-warm',
};

function fmtUsd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-cream rounded-xl ${className}`} />;
}

type Tab = 'overview' | 'subscriptions' | 'payments';

export default function BillingPage() {
  const { token, ready } = useAdminAuth();
  const [tab, setTab] = useState<Tab>('overview');

  // Overview + subscriptions state
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [subscriptions, setSubscriptions] = useState<Sub[]>([]);
  const [loadingMain, setLoadingMain] = useState(true);
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Payments state
  const [paymentsData, setPaymentsData] = useState<PaymentsResponse | null>(null);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [paymentsPage, setPaymentsPage] = useState(1);

  const loadMain = useCallback(() => {
    if (!token) return;
    Promise.all([
      adminGet<BillingOverview>('/admin/billing/overview', token),
      adminGet<Sub[]>('/admin/billing/subscriptions', token),
    ]).then(([ov, subs]) => {
      setOverview(ov);
      setSubscriptions(subs);
    }).catch(() => null).finally(() => setLoadingMain(false));
  }, [token]);

  const loadPayments = useCallback((page = 1, type = 'all') => {
    if (!token) return;
    setLoadingPayments(true);
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (type !== 'all') params.set('type', type);
    adminGet<PaymentsResponse>(`/admin/payments?${params}`, token)
      .then(data => setPaymentsData(data))
      .catch(() => null)
      .finally(() => setLoadingPayments(false));
  }, [token]);

  useEffect(() => { if (ready) loadMain(); }, [ready, loadMain]);

  useEffect(() => {
    if (ready && tab === 'payments') loadPayments(paymentsPage, typeFilter);
  }, [ready, tab, paymentsPage, typeFilter, loadPayments]);

  const filteredSubs = subscriptions.filter(s => {
    const matchesPlan = planFilter === 'all' || s.plan === planFilter;
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesPlan && matchesStatus;
  });

  const stats = overview ? [
    { label: 'MRR', value: fmtUsd(overview.mrr) },
    { label: 'ARR', value: fmtUsd(overview.arr), sub: 'Annualised' },
    { label: 'Active Subscriptions', value: overview.activeSubscriptions.toLocaleString(), sub: `${overview.trialsCount} on trial` },
    { label: 'Trial Conversions', value: `${overview.trialConversionRate.toFixed(0)}%`, sub: 'Last 30 days' },
  ] : null;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'subscriptions', label: 'Subscriptions' },
    { key: 'payments', label: 'Payment History' },
  ];

  const totalPages = paymentsData ? Math.ceil(paymentsData.total / paymentsData.limit) : 1;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-cream rounded-xl p-1 w-fit border border-cream-dark">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white text-primary-dark shadow-sm border border-cream-dark'
                : 'text-primary-warm hover:text-primary-dark'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {loadingMain
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
              : stats?.map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-cream-dark p-5">
                  <p className="text-xs text-primary-warm mb-1">{s.label}</p>
                  <p className="text-2xl font-bold text-primary-dark font-heading">{s.value}</p>
                  {s.sub && <p className="text-xs text-primary-warm mt-1">{s.sub}</p>}
                </div>
              ))}
          </div>

          <div className="bg-white rounded-2xl border border-cream-dark p-6">
            <h2 className="text-sm font-semibold text-primary-dark mb-4">Plan distribution</h2>
            {loadingMain ? <Skeleton className="h-48" /> : (
              <div className="flex items-center gap-8">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie
                      data={overview?.planDistribution ?? []}
                      cx="50%" cy="50%"
                      innerRadius={50} outerRadius={80}
                      dataKey="value" strokeWidth={0}
                    >
                      {(overview?.planDistribution ?? []).map(entry => (
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
        </>
      )}

      {/* ── Subscriptions tab ── */}
      {tab === 'subscriptions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-primary-dark">Subscriptions</h2>
            <div className="flex gap-2">
              <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-cream-dark bg-white text-xs text-primary-dark focus:outline-none cursor-pointer">
                <option value="all">All plans</option>
                <option value="Trial">Trial</option>
                <option value="One-time">One-time</option>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-dark">
                {loadingMain
                  ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {[1,2,3,4,5].map(j => <td key={j} className="px-4 py-3.5"><div className="h-4 bg-cream rounded animate-pulse w-20" /></td>)}
                    </tr>
                  ))
                  : filteredSubs.map(s => (
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
                        {s.mrr > 0 ? fmtUsd(s.mrr) : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-primary-warm">
                        {new Date(s.nextBillingAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!loadingMain && filteredSubs.length === 0 && (
              <div className="py-16 text-center text-primary-warm text-sm">No subscriptions match your filters.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Payment History tab ── */}
      {tab === 'payments' && (
        <div className="space-y-4">
          {/* Summary strip */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-cream-dark p-5">
              <p className="text-xs text-primary-warm mb-1">Total revenue logged</p>
              <p className="text-2xl font-bold text-primary-dark font-heading">
                {paymentsData ? fmtUsd(paymentsData.totalRevenue) : '—'}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-cream-dark p-5">
              <p className="text-xs text-primary-warm mb-1">Total transactions</p>
              <p className="text-2xl font-bold text-primary-dark font-heading">
                {paymentsData?.total ?? '—'}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-primary-dark">All transactions</h2>
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setPaymentsPage(1); }}
              className="px-3 py-2 rounded-xl border border-cream-dark bg-white text-xs text-primary-dark focus:outline-none cursor-pointer"
            >
              <option value="all">All types</option>
              <option value="SUBSCRIPTION">Subscriptions</option>
              <option value="CAMPAIGN">Campaigns</option>
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-dark bg-cream-light/60">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Business</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Type</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-dark">
                {loadingPayments
                  ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {[1,2,3,4,5].map(j => <td key={j} className="px-4 py-3.5"><div className="h-4 bg-cream rounded animate-pulse w-24" /></td>)}
                    </tr>
                  ))
                  : (paymentsData?.payments ?? []).map(p => (
                    <tr key={p.id} className="hover:bg-cream-light/40 transition-colors">
                      <td className="px-5 py-3.5 text-primary-warm whitespace-nowrap">
                        {new Date(p.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        <span className="block text-xs text-primary-warm/60">
                          {new Date(p.paidAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-primary-dark">
                        {p.businessName ?? <span className="text-primary-warm/50 italic">Unknown</span>}
                      </td>
                      <td className="px-4 py-3.5 text-primary-warm max-w-xs truncate">{p.description}</td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                          p.type === 'SUBSCRIPTION' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'
                        }`}>
                          {p.type === 'SUBSCRIPTION' ? 'Subscription' : 'Campaign'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-primary-dark">
                        {fmtUsd(p.amountUsd)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!loadingPayments && (paymentsData?.payments ?? []).length === 0 && (
              <div className="py-16 text-center text-primary-warm text-sm">No payments recorded yet.</div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-primary-warm">
                Page {paymentsPage} of {totalPages} · {paymentsData?.total} transactions
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPaymentsPage(p => Math.max(1, p - 1))}
                  disabled={paymentsPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-cream-dark text-xs font-medium text-primary-dark disabled:opacity-40 hover:bg-cream transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPaymentsPage(p => Math.min(totalPages, p + 1))}
                  disabled={paymentsPage === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-cream-dark text-xs font-medium text-primary-dark disabled:opacity-40 hover:bg-cream transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
