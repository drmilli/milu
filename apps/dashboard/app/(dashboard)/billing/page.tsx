'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { apiGet } from '../../../lib/api';

// ─── Whop plan config ─────────────────────────────────────────────────────────
// Fill in your Whop checkout links below.

interface WhopPlan {
  id: string;
  name: string;
  tagline: string;
  billing: 'one_time' | 'monthly' | 'sales';
  callLimit: number | null;
  memberLimit: number | null;
  features: string[];
  highlighted: boolean;
  usd: { price: number; checkoutUrl: string } | null;
}

const ONE_TIME_FEATURES = [
  'Voice calls',
  'AI answers',
  'Call logs',
];

const PLANS: WhopPlan[] = [
  {
    id: 'one_time',
    name: 'One-time',
    tagline: 'Pay once, access core features',
    billing: 'one_time',
    callLimit: 200,
    memberLimit: 1,
    features: ONE_TIME_FEATURES,
    highlighted: false,
    usd: { price: 20, checkoutUrl: 'https://whop.com/checkout/plan_wVq0cVPGuVcNM' },
  },
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Best value for consistent monthly use',
    billing: 'monthly',
    callLimit: 200,
    memberLimit: 1,
    features: [
      '200 AI calls / month',
      '1 phone number',
      'Knowledge base & FAQ handling',
      'Basic analytics',
      'Email support',
    ],
    highlighted: false,
    usd: { price: 25, checkoutUrl: 'https://whop.com/checkout/plan_NP7nmD2igcr6r' },
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'More calls for busier businesses',
    billing: 'monthly',
    callLimit: 500,
    memberLimit: null,
    features: [
      '500 AI calls / month',
      '1 phone number',
      'Unlimited team members',
      'Knowledge base & FAQ handling',
      'Booking + escalation',
      'Full analytics',
      'WhatsApp alerts',
      'Priority support',
    ],
    highlighted: true,
    usd: { price: 45, checkoutUrl: 'https://whop.com/checkout/plan_2KpoWlIQeuDfL' },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Custom volume and dedicated support',
    billing: 'sales',
    callLimit: null,
    memberLimit: null,
    features: [
      'Unlimited AI calls',
      'Unlimited team members',
      'Custom voice & greeting',
      'Dedicated account manager',
      'SLA guarantee',
      'Custom integrations',
    ],
    highlighted: false,
    usd: null,
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Subscription {
  planId: string;
  planName: string;
  status: 'active' | 'trialing' | 'cancelled' | 'past_due';
  price: number;
  currency: string;
  renewsAt: string;
  usage: {
    calls: { used: number; limit: number | null };
    teamMembers: { used: number; limit: number | null };
  };
}

interface Invoice {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: 'paid' | 'open' | 'void';
  invoiceUrl?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAmount(amount: number, currency: string) {
  if (currency === 'USD') return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2 });
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const isHigh = pct >= 80;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-primary-warm mb-1.5">
        <span>{label}</span>
        <span className={`font-medium ${isHigh ? 'text-warning' : 'text-primary-dark'}`}>
          {used.toLocaleString()} / {limit ? limit.toLocaleString() : '∞'}
        </span>
      </div>
      <div className="h-2 bg-cream rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isHigh ? 'bg-warning' : 'bg-primary'}`}
          style={{ width: limit ? `${pct}%` : '0%' }}
        />
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { token, user, ready } = useAuth();
  const businessId = user?.businessId ?? '';

  const [sub, setSub] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const [showPlans, setShowPlans] = useState(false);
  const [checkoutTarget, setCheckoutTarget] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token || !businessId) return;
    Promise.all([
      apiGet<Subscription>(`/billing/subscription/${businessId}`, token),
      apiGet<Invoice[]>(`/billing/invoices/${businessId}`, token),
    ]).then(([subscription, invoiceList]) => {
      setSub(subscription);
      setInvoices(invoiceList);
    }).catch(() => null).finally(() => setLoading(false));
  }, [token, businessId]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  function goToCheckout(plan: WhopPlan) {
    const pricing = plan.usd;
    if (!pricing) return;
    setCheckoutTarget(plan.id);
    window.location.href = pricing.checkoutUrl;
  }

  const activePlan = PLANS.find(p => p.id === sub?.planId || p.name === sub?.planName);

  return (
    <div className="p-6 lg:p-8 max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Billing</h1>
          <p className="text-sm text-primary-warm mt-0.5">Manage your plan, usage, and payment history.</p>
        </div>
      </div>

      {/* Current plan / usage */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6">
        {loading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-5 bg-cream rounded w-24" />
            <div className="h-8 bg-cream rounded w-40" />
            <div className="h-4 bg-cream rounded w-52" />
            <div className="h-2 bg-cream rounded-full mt-6" />
            <div className="h-2 bg-cream rounded-full" />
          </div>
        ) : sub ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-primary-warm uppercase tracking-wider mb-1">Current plan</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="font-heading font-bold text-2xl text-primary-dark">{sub.planName}</p>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    sub.status === 'active' ? 'bg-success/10 text-success' :
                    sub.status === 'trialing' ? 'bg-primary/10 text-primary' :
                    sub.status === 'past_due' ? 'bg-warning/10 text-warning' :
                    'bg-danger/10 text-danger'
                  }`}>
                    {sub.status === 'active' ? 'Active'
                      : sub.status === 'trialing' ? 'Trial'
                      : sub.status === 'past_due' ? 'Past due'
                      : 'Cancelled'}
                  </span>
                </div>
                <p className="text-sm text-primary-warm mt-1">
                  {sub.status === 'trialing'
                    ? `Free trial · Ends ${fmtDate(sub.renewsAt)}`
                    : `${fmtAmount(sub.price, sub.currency)} / month${sub.status !== 'cancelled' ? ` · Renews ${fmtDate(sub.renewsAt)}` : ''}`}
                </p>
              </div>
              <button
                onClick={() => setShowPlans(v => !v)}
                className="text-sm text-primary border border-primary/30 px-4 py-2 rounded-xl hover:bg-primary hover:text-cream-light transition-colors flex-shrink-0"
              >
                {showPlans ? 'Hide plans' : 'Change plan'}
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <UsageBar label="Calls used this month"
                used={sub.usage.calls.used}
                limit={sub.usage.calls.limit} />
              <UsageBar label="Team members"
                used={sub.usage.teamMembers.used}
                limit={sub.usage.teamMembers.limit} />
            </div>
          </>
        ) : (
          <div className="text-center py-4 space-y-3">
            <p className="text-sm text-primary-warm">You&apos;re not on a paid plan yet.</p>
            <button onClick={() => setShowPlans(true)}
              className="bg-primary text-cream-light px-5 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors">
              Choose a plan
            </button>
          </div>
        )}
      </div>

      {/* Plan picker */}
      {showPlans && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-primary-dark">Choose a plan</h2>
            <span className="text-xs text-primary-warm">Showing prices in US Dollars ($)</span>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {PLANS.map(plan => {
              const isCurrent = activePlan?.id === plan.id;
              return (
                <div key={plan.id}
                  className={`relative rounded-2xl border-2 p-5 flex flex-col transition-all ${
                    plan.highlighted
                      ? 'border-primary bg-primary/3'
                      : isCurrent
                      ? 'border-success/40 bg-success/3'
                      : 'border-cream-dark bg-white hover:border-primary/30'
                  }`}
                >
                  {plan.highlighted && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-cream-light text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                      Most popular
                    </span>
                  )}

                  <div className="mb-4">
                    <p className="font-semibold text-primary-dark">{plan.name}</p>
                    <p className="text-xs text-primary-warm mt-0.5">{plan.tagline}</p>
                  </div>

                  <div className="mb-4">
                    {plan.usd ? (
                      <>
                        <span className="font-heading font-bold text-2xl text-primary-dark">
                          {'$' + plan.usd.price.toLocaleString('en-US')}
                        </span>
                        <span className="text-xs text-primary-warm ml-1">
                          {plan.billing === 'one_time' ? 'one time' : '/ month'}
                        </span>
                      </>
                    ) : (
                      <span className="font-heading font-bold text-2xl text-primary-dark">Custom</span>
                    )}
                  </div>

                  <ul className="space-y-2 flex-1 mb-5">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2 text-xs text-primary-warm">
                        <svg className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <span className="text-center text-xs font-medium text-success py-2">
                      ✓ Current plan
                    </span>
                  ) : plan.billing === 'sales' ? (
                    <a
                      href="mailto:info.miluai@gmail.com?subject=Enterprise%20plan%20enquiry"
                      className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors border border-primary/30 text-primary hover:bg-primary hover:text-cream-light flex items-center justify-center"
                    >
                      Contact sales
                    </a>
                  ) : (
                    <button
                      onClick={() => goToCheckout(plan)}
                      disabled={checkoutTarget === plan.id}
                      className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                        plan.highlighted
                          ? 'bg-primary text-cream-light hover:bg-primary-dark'
                          : 'border border-primary/30 text-primary hover:bg-primary hover:text-cream-light'
                      }`}
                    >
                      {checkoutTarget === plan.id ? (
                        <>
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Redirecting…
                        </>
                      ) : sub ? 'Switch to this plan' : 'Get started'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-center text-primary-warm">
            Payments processed securely via{' '}
            <a href="https://whop.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Whop
            </a>
            . Prices shown in US Dollars ($).
          </p>
        </div>
      )}

      {/* Invoice history */}
      <div className="bg-white rounded-2xl border border-cream-dark">
        <div className="px-6 py-4 border-b border-cream-dark">
          <h2 className="font-semibold text-primary-dark">Invoice history</h2>
        </div>
        {loading ? (
          <div className="divide-y divide-cream-dark">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-4 px-6 py-3.5 animate-pulse">
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 bg-cream rounded w-28" />
                  <div className="h-3 bg-cream rounded w-20" />
                </div>
                <div className="h-4 bg-cream rounded w-20" />
                <div className="h-6 bg-cream rounded-full w-14" />
              </div>
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-primary-warm text-center py-8">No invoices yet.</p>
        ) : (
          <div className="divide-y divide-cream-dark">
            {invoices.map(inv => (
              <div key={inv.id} className="flex items-center gap-4 px-6 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary-dark">{inv.id}</p>
                  <p className="text-xs text-primary-warm">{fmtDate(inv.date)}</p>
                </div>
                <p className="text-sm font-medium text-primary-dark whitespace-nowrap">
                  {fmtAmount(inv.amount, inv.currency)}
                </p>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full w-14 text-center flex-shrink-0 ${
                  inv.status === 'paid' ? 'bg-success/10 text-success' :
                  inv.status === 'open' ? 'bg-warning/10 text-warning' :
                  'bg-cream-dark text-primary-warm'
                }`}>
                  {inv.status}
                </span>
                {inv.invoiceUrl && (
                  <a href={inv.invoiceUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex-shrink-0">
                    Download
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cancel / manage */}
      {sub && sub.status !== 'cancelled' && (
        <div className="bg-white rounded-2xl border border-danger/20 p-5">
          <h2 className="font-semibold text-danger mb-1">Cancel subscription</h2>
          <p className="text-sm text-primary-warm mb-4">
            Your agent will keep answering calls until the end of your current billing period. To cancel, contact us.
          </p>
          <a
            href="mailto:info.miluai@gmail.com?subject=Cancel%20my%20subscription"
            className="inline-block text-sm text-danger border border-danger/30 px-4 py-2 rounded-xl hover:bg-danger/4 transition-colors"
          >
            Contact support to cancel
          </a>
        </div>
      )}
    </div>
  );
}
