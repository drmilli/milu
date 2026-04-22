'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAdminAuth } from '../../../../hooks/useAdminAuth';
import { adminGet, adminPatch, adminPost, adminDelete } from '../../../../lib/api';

interface BusinessDetail {
  id: string;
  name: string;
  owner: string;
  email: string;
  phone?: string;
  plan: string;
  status: string;
  industry: string;
  joined: string;
  mrr: number;
  callsThisMonth: number;
  callsTotal: number;
  resolutionRate: number;
  escalations: number;
  agent?: {
    voiceId?: string;
    tone?: string;
    greeting?: string;
    faqCount?: number;
  };
  team?: { id: string; name: string; email: string; role: string }[];
  recentCalls?: {
    id: string;
    caller: string;
    durationSeconds: number;
    resolution: 'AI' | 'HUMAN' | 'ABANDONED';
    intent: string | null;
    startedAt: string;
  }[];
  invoices?: { id: string; date: string; amount: number; status: string; invoiceUrl?: string }[];
  subscription?: { nextBillingAt?: string };
}

const statusColors: Record<string, string> = {
  AI: 'bg-success/10 text-success',
  HUMAN: 'bg-warning/10 text-warning',
  ABANDONED: 'bg-danger/10 text-danger',
};

const statusLabel: Record<string, string> = { AI: 'Resolved', HUMAN: 'Escalated', ABANDONED: 'Missed' };

function fmtDuration(sec: number) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface PhoneNumber {
  id: string;
  number: string;
  label: string | null;
  provider: string | null;
  isVirtual: boolean;
  verified: boolean;
  createdAt: string;
}

const tabs = ['Overview', 'Agent', 'Calls', 'Team', 'Billing', 'Phone Numbers'];

export default function BusinessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, ready } = useAdminAuth();

  const [biz, setBiz] = useState<BusinessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Overview');
  const [planInput, setPlanInput] = useState('');
  const [statusInput, setStatusInput] = useState('');
  const [saving, setSaving] = useState(false);

  const [phoneNums, setPhoneNums] = useState<PhoneNumber[]>([]);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [newNumber, setNewNumber] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [addingPhone, setAddingPhone] = useState(false);

  const load = useCallback(() => {
    if (!token || !id) return;
    adminGet<BusinessDetail>(`/admin/businesses/${id}`, token)
      .then(data => {
        setBiz(data);
        setPlanInput(data.plan);
        setStatusInput(data.status);
      }).catch(() => null).finally(() => setLoading(false));
  }, [token, id]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const loadPhoneNums = useCallback(() => {
    if (!token || !id) return;
    setPhoneLoading(true);
    adminGet<PhoneNumber[]>(`/admin/businesses/${id}/phone-numbers`, token)
      .then(setPhoneNums).catch(() => null).finally(() => setPhoneLoading(false));
  }, [token, id]);

  useEffect(() => { if (tab === 'Phone Numbers' && token && id) loadPhoneNums(); }, [tab, loadPhoneNums, token, id]);

  async function handleAddPhone() {
    if (!token || !id || !newNumber.trim()) return;
    setAddingPhone(true);
    try {
      await adminPost(`/admin/businesses/${id}/phone-numbers`, {
        number: newNumber.trim(),
        label: newLabel.trim() || undefined,
        isVirtual: true,
      }, token);
      setNewNumber('');
      setNewLabel('');
      loadPhoneNums();
    } catch {
      // ignore
    } finally {
      setAddingPhone(false);
    }
  }

  async function handleRemovePhone(numberId: string) {
    if (!token || !id) return;
    await adminDelete(`/admin/businesses/${id}/phone-numbers/${numberId}`, token).catch(() => null);
    setPhoneNums(prev => prev.filter(p => p.id !== numberId));
  }

  async function handleSave() {
    if (!token || !id) return;
    setSaving(true);
    try {
      await adminPatch(`/admin/businesses/${id}`, { plan: planInput, status: statusInput }, token);
      setBiz(prev => prev ? { ...prev, plan: planInput, status: statusInput } : prev);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6 max-w-4xl animate-pulse">
        <div className="h-6 bg-cream rounded w-32" />
        <div className="h-12 bg-cream rounded w-64" />
        <div className="h-10 bg-cream rounded" />
        <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-24 bg-cream rounded-xl" />)}</div>
      </div>
    );
  }

  if (!biz) {
    return (
      <div className="p-6 lg:p-8">
        <Link href="/admin/businesses" className="text-xs text-primary-warm hover:text-primary flex items-center gap-1 mb-4">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
          Back to businesses
        </Link>
        <p className="text-sm text-primary-warm">Business not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
      <div>
        <Link href="/admin/businesses" className="text-xs text-primary-warm hover:text-primary flex items-center gap-1 mb-3">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to businesses
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="text-lg font-bold text-primary">{biz.name[0]}</span>
            </div>
            <div>
              <h1 className="font-heading font-bold text-2xl text-primary-dark">{biz.name}</h1>
              <p className="text-sm text-primary-warm">{biz.industry} · {biz.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={planInput}
              onChange={e => setPlanInput(e.target.value)}
              className="text-xs border border-cream-dark rounded-lg px-2.5 py-1.5 bg-cream-light text-primary-dark focus:outline-none focus:border-primary/50"
            >
              <option value="Starter">Starter</option>
              <option value="Growth">Growth</option>
              <option value="Enterprise">Enterprise</option>
            </select>
            <select
              value={statusInput}
              onChange={e => setStatusInput(e.target.value)}
              className="text-xs border border-cream-dark rounded-lg px-2.5 py-1.5 bg-cream-light text-primary-dark focus:outline-none focus:border-primary/50"
            >
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary text-cream-light text-xs px-3 py-1.5 rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-cream-dark">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-primary-warm hover:text-primary-dark'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Calls this month', value: biz.callsThisMonth.toLocaleString() },
              { label: 'Total calls', value: biz.callsTotal.toLocaleString() },
              { label: 'Resolution rate', value: `${biz.resolutionRate}%` },
              { label: 'Escalations', value: biz.escalations },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-cream-dark p-4">
                <p className="text-xs text-primary-warm">{s.label}</p>
                <p className="text-2xl font-bold text-primary-dark mt-1">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-cream-dark p-5 space-y-3">
            <h3 className="text-sm font-semibold text-primary-dark">Business details</h3>
            {[
              { label: 'Owner', value: biz.owner },
              { label: 'Email', value: biz.email },
              { label: 'Phone', value: biz.phone ?? '—' },
              { label: 'Industry', value: biz.industry },
              { label: 'Joined', value: new Date(biz.joined).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) },
              { label: 'MRR', value: biz.mrr > 0 ? `₦${biz.mrr.toLocaleString()}` : '—' },
            ].map(row => (
              <div key={row.label} className="flex justify-between text-sm border-b border-cream-dark last:border-0 pb-2 last:pb-0">
                <span className="text-primary-warm">{row.label}</span>
                <span className="font-medium text-primary-dark">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'Agent' && biz.agent && (
        <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-4">
          <h3 className="text-sm font-semibold text-primary-dark">Agent configuration</h3>
          {[
            { label: 'Voice', value: biz.agent.voiceId ?? '—' },
            { label: 'Tone', value: biz.agent.tone ?? '—' },
            { label: 'FAQs loaded', value: biz.agent.faqCount != null ? `${biz.agent.faqCount} questions` : '—' },
          ].map(row => (
            <div key={row.label} className="flex justify-between text-sm border-b border-cream-dark last:border-0 pb-3 last:pb-0">
              <span className="text-primary-warm">{row.label}</span>
              <span className="font-medium text-primary-dark capitalize">{row.value}</span>
            </div>
          ))}
          {biz.agent.greeting && (
            <div className="pt-1">
              <p className="text-xs font-medium text-primary-dark mb-1.5">Greeting script</p>
              <div className="bg-cream rounded-xl p-4 text-sm text-primary-warm italic">
                &ldquo;{biz.agent.greeting}&rdquo;
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'Calls' && (
        <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-dark bg-cream-light/60">
                <th className="text-left px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Caller</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Intent</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Duration</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-dark">
              {(biz.recentCalls ?? []).map(c => (
                <tr key={c.id} className="hover:bg-cream-light/40">
                  <td className="px-5 py-3.5 font-medium text-primary-dark font-mono text-xs">{c.caller}</td>
                  <td className="px-4 py-3.5 text-primary-warm">{c.intent ?? '—'}</td>
                  <td className="px-4 py-3.5 text-primary-warm">{fmtDuration(c.durationSeconds)}</td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${statusColors[c.resolution]}`}>
                      {statusLabel[c.resolution]}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-primary-warm">{timeAgo(c.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(biz.recentCalls ?? []).length === 0 && (
            <div className="py-16 text-center text-primary-warm text-sm">No calls yet.</div>
          )}
        </div>
      )}

      {tab === 'Team' && (
        <div className="bg-white rounded-2xl border border-cream-dark divide-y divide-cream-dark">
          {(biz.team ?? []).map(m => (
            <div key={m.id} className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-semibold text-primary">{m.name[0]}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-primary-dark">{m.name}</p>
                  <p className="text-xs text-primary-warm">{m.email}</p>
                </div>
              </div>
              <span className="text-xs font-medium text-primary-warm bg-cream px-2.5 py-1 rounded-full border border-cream-dark capitalize">
                {m.role.toLowerCase()}
              </span>
            </div>
          ))}
          {(biz.team ?? []).length === 0 && (
            <div className="py-10 text-center text-primary-warm text-sm">No team members.</div>
          )}
        </div>
      )}

      {tab === 'Phone Numbers' && (
        <div className="space-y-5">
          {/* Assign number form */}
          <div className="bg-white rounded-2xl border border-cream-dark p-5 space-y-4">
            <h3 className="text-sm font-semibold text-primary-dark">Assign virtual call line</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Number e.g. +2349000001234"
                value={newNumber}
                onChange={e => setNewNumber(e.target.value)}
                className="col-span-1 text-sm border border-cream-dark rounded-lg px-3 py-2 bg-cream-light text-primary-dark placeholder:text-primary-warm/50 focus:outline-none focus:border-primary/50"
              />
              <input
                type="text"
                placeholder="Label (optional)"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                className="text-sm border border-cream-dark rounded-lg px-3 py-2 bg-cream-light text-primary-dark placeholder:text-primary-warm/50 focus:outline-none focus:border-primary/50"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddPhone}
                  disabled={addingPhone || !newNumber.trim()}
                  className="px-4 py-2 bg-primary text-cream-light text-sm rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 whitespace-nowrap w-full"
                >
                  {addingPhone ? 'Adding…' : 'Assign'}
                </button>
              </div>
            </div>
            <p className="text-xs text-primary-warm">
              Enter a Twilio number to assign to this business. It will immediately appear in the business&apos;s AI Call Line tab.
            </p>
          </div>

          {/* Existing numbers */}
          <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
            <div className="px-5 py-3.5 border-b border-cream-dark bg-cream-light/60 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-primary-warm uppercase tracking-wider">Virtual numbers assigned</h3>
              <span className="text-xs text-primary-warm">{phoneNums.length} number{phoneNums.length !== 1 ? 's' : ''}</span>
            </div>
            {phoneLoading ? (
              <div className="py-10 text-center text-primary-warm text-sm animate-pulse">Loading…</div>
            ) : phoneNums.length === 0 ? (
              <div className="py-12 text-center space-y-1">
                <p className="text-sm font-medium text-primary-dark">No virtual numbers yet</p>
                <p className="text-xs text-primary-warm">Assign one above to enable AI call handling for this business.</p>
              </div>
            ) : (
              <div className="divide-y divide-cream-dark">
                {phoneNums.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-primary-dark font-mono">{p.number}</p>
                        <p className="text-xs text-primary-warm capitalize">
                          {p.label ? `${p.label} · ` : ''}{p.provider ?? 'twilio'} · Virtual
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemovePhone(p.id)}
                      className="text-xs text-danger hover:text-danger/70 transition-colors px-2 py-1 rounded-lg hover:bg-danger/5"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Billing' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-cream-dark p-5 space-y-3">
            <h3 className="text-sm font-semibold text-primary-dark">Subscription</h3>
            {[
              { label: 'Plan', value: biz.plan },
              { label: 'MRR', value: biz.mrr > 0 ? `₦${biz.mrr.toLocaleString()}` : '—' },
              { label: 'Status', value: biz.status },
              { label: 'Next billing', value: biz.subscription?.nextBillingAt ? new Date(biz.subscription.nextBillingAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
            ].map(row => (
              <div key={row.label} className="flex justify-between text-sm border-b border-cream-dark last:border-0 pb-2 last:pb-0">
                <span className="text-primary-warm">{row.label}</span>
                <span className="font-medium text-primary-dark capitalize">{row.value}</span>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
            <div className="px-5 py-3.5 border-b border-cream-dark bg-cream-light/60">
              <h3 className="text-xs font-semibold text-primary-warm uppercase tracking-wider">Invoice history</h3>
            </div>
            <div className="divide-y divide-cream-dark">
              {(biz.invoices ?? []).map(inv => (
                <div key={inv.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <div>
                    <p className="font-medium text-primary-dark">{inv.id}</p>
                    <p className="text-xs text-primary-warm">{new Date(inv.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-primary-dark">₦{inv.amount.toLocaleString()}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${inv.status === 'paid' ? 'bg-success/10 text-success' : 'bg-cream-dark text-primary-warm'}`}>
                      {inv.status}
                    </span>
                  </div>
                </div>
              ))}
              {(biz.invoices ?? []).length === 0 && (
                <div className="py-10 text-center text-primary-warm text-sm">No invoices yet.</div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl border border-cream-dark text-sm text-primary-warm hover:text-primary hover:border-primary/30 transition-colors">
              Issue credit
            </button>
            <button
              onClick={() => {
                setStatusInput('suspended');
                handleSave();
              }}
              className="px-4 py-2 rounded-xl border border-danger/30 text-sm text-danger hover:bg-danger/5 transition-colors"
            >
              Suspend account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
