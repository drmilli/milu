'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAffiliateAuth } from '../../hooks/useAffiliateAuth';
import { affiliateGet, affiliatePost } from '../../lib/api';

type DashboardResponse = {
  referralCode: string;
  referralLink: string;
  commissionPercent: number;
  stats: {
    referrals: number;
    totalEarnedUsd: number;
    pendingWithdrawalsUsd: number;
    paidWithdrawalsUsd: number;
  };
};

type ReferralRow = {
  id: string;
  businessId: string;
  businessName: string;
  referredAt: string;
  eligibilityEndsAt: string;
  plan: string;
  status: string;
};

type WithdrawalRow = {
  id: string;
  amountUsd: number;
  status: string;
  adminNote?: string | null;
  payoutReference?: string | null;
  createdAt: string;
  updatedAt: string;
};

const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all';

export default function AffiliateDashboardPage() {
  const { token, ready, logout } = useAffiliateAuth(true);
  const [dash, setDash] = useState<DashboardResponse | null>(null);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [requesting, setRequesting] = useState(false);

  const canRequest = useMemo(() => {
    const amt = Number(withdrawAmount);
    return Number.isFinite(amt) && amt > 0 && bankName.trim() && accountName.trim() && accountNumber.trim();
  }, [withdrawAmount, bankName, accountName, accountNumber]);

  const qrUrl = useMemo(() => {
    if (!dash?.referralLink) return '';
    const data = encodeURIComponent(dash.referralLink);
    return `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${data}`;
  }, [dash?.referralLink]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [d, r, w] = await Promise.all([
        affiliateGet<DashboardResponse>('/affiliate/dashboard', token),
        affiliateGet<ReferralRow[]>('/affiliate/referrals', token),
        affiliateGet<WithdrawalRow[]>('/affiliate/withdrawals', token),
      ]);
      setDash(d);
      setReferrals(r);
      setWithdrawals(w);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function copyLink() {
    if (!dash?.referralLink) return;
    await navigator.clipboard.writeText(dash.referralLink);
  }

  async function requestWithdrawal() {
    if (!token || !canRequest) return;
    setRequesting(true);
    setError('');
    try {
      await affiliatePost('/affiliate/withdrawals', {
        amountUsd: Number(withdrawAmount),
        bankDetails: { bankName, accountName, accountNumber },
      }, token);
      setWithdrawAmount('');
      setBankName('');
      setAccountName('');
      setAccountNumber('');
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Withdrawal request failed');
    } finally {
      setRequesting(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen">
      <div className="border-b border-cream-dark bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-heading font-bold text-xl text-primary-dark">Affiliate dashboard</h1>
            <p className="text-xs text-primary-warm mt-0.5">Track referrals, commissions, and withdrawals.</p>
          </div>
          <button onClick={logout} className="text-sm px-4 py-2 rounded-full bg-cream border border-cream-dark hover:bg-cream-light">
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {error && <div className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-xl px-4 py-3">{error}</div>}

        {loading || !dash ? (
          <div className="text-sm text-primary-warm">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Referrals', value: dash.stats.referrals.toLocaleString() },
                { label: 'Total earned', value: `$${dash.stats.totalEarnedUsd.toLocaleString()}` },
                { label: 'Pending withdrawals', value: `$${dash.stats.pendingWithdrawalsUsd.toLocaleString()}` },
                { label: 'Commission', value: `${dash.commissionPercent}%` },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-cream-dark p-4">
                  <p className="text-xs text-primary-warm">{s.label}</p>
                  <p className="text-2xl font-bold text-primary-dark mt-1">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-primary-dark">Your referral link</h2>
                  <p className="text-xs text-primary-warm mt-1">Share this link. Businesses that sign up earn you commissions.</p>
                  <div className="mt-3 flex flex-col sm:flex-row gap-3">
                    <input className={inputCls} value={dash.referralLink} readOnly />
                    <button onClick={copyLink} className="px-4 py-2.5 rounded-xl bg-primary text-cream-light text-sm font-medium hover:bg-primary-dark">
                      Copy link
                    </button>
                  </div>
                </div>
                {qrUrl && (
                  <div className="flex-shrink-0">
                    <img src={qrUrl} alt="Referral QR code" className="w-28 h-28 rounded-xl border border-cream-dark bg-cream" />
                    <a href={qrUrl} className="block text-center text-xs text-primary underline mt-2">
                      Download
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
                <div className="px-6 py-4 border-b border-cream-dark">
                  <h3 className="text-sm font-semibold text-primary-dark">Referred businesses</h3>
                </div>
                <div className="divide-y divide-cream-dark">
                  {referrals.length === 0 ? (
                    <div className="px-6 py-10 text-center text-sm text-primary-warm">No referrals yet.</div>
                  ) : (
                    referrals.slice(0, 20).map(r => (
                      <div key={r.id} className="px-6 py-3.5 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-primary-dark truncate">{r.businessName}</p>
                          <p className="text-xs text-primary-warm">
                            {new Date(r.referredAt).toLocaleDateString()} · {r.plan} · {r.status}
                          </p>
                        </div>
                        <div className="text-xs text-primary-warm whitespace-nowrap">
                          Ends {new Date(r.eligibilityEndsAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-4">
                <h3 className="text-sm font-semibold text-primary-dark">Request withdrawal</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-primary-warm mb-1.5">Amount (USD)</label>
                    <input className={inputCls} value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="50" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-primary-warm mb-1.5">Bank name</label>
                    <input className={inputCls} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="GTBank" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-primary-warm mb-1.5">Account name</label>
                    <input className={inputCls} value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="John Doe" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-primary-warm mb-1.5">Account number</label>
                    <input className={inputCls} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="0123456789" />
                  </div>
                </div>
                <button
                  onClick={requestWithdrawal}
                  disabled={!canRequest || requesting}
                  className="w-full bg-primary text-cream-light py-3 rounded-xl font-medium text-sm hover:bg-primary-dark disabled:opacity-60"
                >
                  {requesting ? 'Submitting…' : 'Submit request'}
                </button>

                <div className="pt-2">
                  <h4 className="text-xs font-semibold text-primary-dark mb-2">Recent requests</h4>
                  <div className="space-y-2">
                    {withdrawals.slice(0, 5).map(w => (
                      <div key={w.id} className="flex items-center justify-between text-xs bg-cream-light border border-cream-dark rounded-xl px-3 py-2">
                        <span className="text-primary-dark font-medium">${w.amountUsd}</span>
                        <span className="text-primary-warm">{w.status}</span>
                      </div>
                    ))}
                    {!withdrawals.length && <p className="text-xs text-primary-warm">No withdrawal requests.</p>}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
