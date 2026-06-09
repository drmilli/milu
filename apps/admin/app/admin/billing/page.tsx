'use client';

import { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { adminGet, adminPost } from '../../../lib/api';

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

interface BusinessOption {
  id: string;
  name: string;
}

// ─── Add Payment Modal ────────────────────────────────────────────────────────

function AddPaymentModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => void }) {
  const [bizList, setBizList] = useState<BusinessOption[]>([]);
  const [loadingBiz, setLoadingBiz] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    businessId: '',
    amountUsd: '',
    plan: 'GROWTH' as 'STARTER' | 'GROWTH' | 'ENTERPRISE' | 'ONE_TIME',
    description: '',
    paidAt: new Date().toISOString().slice(0, 10),
    reference: '',
    upgradeTier: true,
  });

  useEffect(() => {
    adminGet<BusinessOption[]>('/admin/businesses', token)
      .then(rows => setBizList(Array.isArray(rows) ? rows : []))
      .catch(() => null)
      .finally(() => setLoadingBiz(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.businessId || !form.amountUsd) { setError('Business and amount are required.'); return; }
    const amount = parseFloat(form.amountUsd);
    if (isNaN(amount) || amount <= 0) { setError('Enter a valid amount greater than 0.'); return; }
    setSaving(true);
    setError('');
    try {
      await adminPost('/admin/payments', {
        businessId: form.businessId,
        amountUsd: amount,
        plan: form.plan,
        description: form.description.trim() || undefined,
        paidAt: new Date(form.paidAt).toISOString(),
        reference: form.reference.trim() || undefined,
        upgradeTier: form.upgradeTier,
      }, token);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save payment.');
    } finally {
      setSaving(false);
    }
  }

  const fieldCls = 'w-full px-3 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark focus:outline-none focus:border-primary/50 placeholder:text-cream-dark';
  const labelCls = 'block text-xs font-medium text-primary-warm mb-1.5';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-dark">
          <h2 className="font-semibold text-primary-dark">Add manual payment</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-cream transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className={labelCls}>Business *</label>
            {loadingBiz ? <Skeleton className="h-10" /> : (
              <select value={form.businessId} onChange={e => setForm(f => ({ ...f, businessId: e.target.value }))} className={fieldCls} required>
                <option value="">Select a business…</option>
                {bizList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Amount (USD) *</label>
              <input type="number" step="0.01" min="0.01" placeholder="45.00"
                value={form.amountUsd} onChange={e => setForm(f => ({ ...f, amountUsd: e.target.value }))}
                className={fieldCls} required />
            </div>
            <div>
              <label className={labelCls}>Plan</label>
              <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value as typeof form.plan }))} className={fieldCls}>
                <option value="STARTER">Starter ($25)</option>
                <option value="GROWTH">Growth ($45)</option>
                <option value="ENTERPRISE">Enterprise</option>
                <option value="ONE_TIME">One-time ($20)</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <input type="text" placeholder="e.g. Growth plan — bank transfer"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className={fieldCls} maxLength={300} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Payment date</label>
              <input type="date" value={form.paidAt} onChange={e => setForm(f => ({ ...f, paidAt: e.target.value }))} className={fieldCls} />
            </div>
            <div>
              <label className={labelCls}>Reference / receipt no.</label>
              <input type="text" placeholder="TXN-12345"
                value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                className={fieldCls} maxLength={200} />
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div onClick={() => setForm(f => ({ ...f, upgradeTier: !f.upgradeTier }))}
              className={'w-10 h-5 rounded-full flex-shrink-0 relative transition-colors ' + (form.upgradeTier ? 'bg-primary' : 'bg-cream-dark')}>
              <div className={'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ' + (form.upgradeTier ? 'left-5' : 'left-0.5')} />
            </div>
            <div>
              <p className="text-sm font-medium text-primary-dark">Upgrade subscription tier</p>
              <p className="text-xs text-primary-warm">Also update this business&apos;s plan to match</p>
            </div>
          </label>

          {error && <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-xl px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-cream-dark text-sm font-medium text-primary-warm hover:bg-cream transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-primary text-cream-light text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>}
              {saving ? 'Saving…' : 'Save payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
  const [showAddPayment, setShowAddPayment] = useState(false);

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
    <>
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
            <div className="flex items-center gap-2">
              <select
                value={typeFilter}
                onChange={e => { setTypeFilter(e.target.value); setPaymentsPage(1); }}
                className="px-3 py-2 rounded-xl border border-cream-dark bg-white text-xs text-primary-dark focus:outline-none cursor-pointer"
              >
                <option value="all">All types</option>
                <option value="SUBSCRIPTION">Subscriptions</option>
                <option value="CAMPAIGN">Campaigns</option>
              </select>
              <button
                onClick={() => setShowAddPayment(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-cream-light text-xs font-medium hover:bg-primary-dark transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add payment
              </button>
            </div>
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

    {showAddPayment && token && (
      <AddPaymentModal
        token={token}
        onClose={() => setShowAddPayment(false)}
        onSaved={() => {
          setShowAddPayment(false);
          loadPayments(paymentsPage, typeFilter);
        }}
      />
    )}
  </>
  );
}
