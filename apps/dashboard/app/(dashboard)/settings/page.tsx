'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { apiGet, apiPost, apiPatch, apiPut } from '../../../lib/api';

const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all';

type WaStep = 'idle' | 'sending' | 'awaiting_code' | 'verifying' | 'verified';

interface Settings {
  notifyOnEscalation: boolean;
  notifyOnMissed: boolean;
  notifyWeekly: boolean;
  whatsappNumber?: string | null;
}

export default function SettingsPage() {
  const { token, user, ready } = useAuth();
  const businessId = user?.businessId ?? '';

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    businessName: '',
    industry: '',
    notifyEscalation: false,
    notifyMissed: false,
    notifyWeekly: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [verifiedWa, setVerifiedWa] = useState<string | null>(null);
  const [waPhone, setWaPhone] = useState('');
  const [waCode, setWaCode] = useState('');
  const [waStep, setWaStep] = useState<WaStep>('idle');
  const [waError, setWaError] = useState('');
  const [waCooldown, setWaCooldown] = useState(0);
  const isVerifyingWa = waStep === 'verifying';

  const load = useCallback(() => {
    if (!token || !businessId) return;
    Promise.all([
      apiGet<Settings>(`/settings/${businessId}`, token),
    ]).then(([settings]) => {
      setForm(f => ({
        ...f,
        firstName: user?.firstName ?? '',
        lastName: user?.lastName ?? '',
        email: user?.email ?? '',
        notifyEscalation: settings.notifyOnEscalation,
        notifyMissed: settings.notifyOnMissed,
        notifyWeekly: settings.notifyWeekly,
      }));
      if (settings.whatsappNumber) setVerifiedWa(settings.whatsappNumber);
    }).catch(() => {
      setForm(f => ({
        ...f,
        firstName: user?.firstName ?? '',
        lastName: user?.lastName ?? '',
        email: user?.email ?? '',
      }));
    }).finally(() => setLoading(false));
  }, [token, businessId, user]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  function startCooldown() {
    setWaCooldown(30);
    const t = setInterval(() => {
      setWaCooldown((v) => { if (v <= 1) { clearInterval(t); return 0; } return v - 1; });
    }, 1000);
  }

  async function sendWaOtp() {
    if (!waPhone.trim()) return;
    setWaError('');
    setWaStep('sending');
    try {
      const res = await apiPost<{ message: string; devCode?: string }>(`/settings/${businessId}/whatsapp/send-otp`, { phone: waPhone }, token);
      setWaStep('awaiting_code');
      startCooldown();
      if (res.devCode) setWaCode(res.devCode);
    } catch (err: unknown) {
      setWaError(err instanceof Error ? err.message : 'Failed to send code. Check the number and try again.');
      setWaStep('idle');
    }
  }

  async function confirmWaOtp() {
    if (waCode.length !== 6) return;
    setWaError('');
    setWaStep('verifying');
    try {
      await apiPost(`/settings/${businessId}/whatsapp/verify`, { phone: waPhone, code: waCode }, token);
      setVerifiedWa(waPhone);
      setWaStep('verified');
      setWaPhone('');
      setWaCode('');
    } catch (err: unknown) {
      setWaError(err instanceof Error ? err.message : 'Invalid code. Please try again.');
      setWaStep('awaiting_code');
    }
  }

  function removeWa() {
    setVerifiedWa(null);
    setWaStep('idle');
    setWaPhone('');
    setWaCode('');
    setWaError('');
  }

  async function handleSave() {
    if (!token || !user) return;
    setSaving(true);
    setError('');
    try {
      await Promise.all([
        apiPatch(`/users/${user.id}`, {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
        }, token),
        apiPut(`/settings/${businessId}`, {
          notifyOnEscalation: form.notifyEscalation,
          notifyOnMissed: form.notifyMissed,
          notifyWeekly: form.notifyWeekly,
        }, token),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl space-y-8">
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary-dark">Settings</h1>
        <p className="text-sm text-primary-warm mt-0.5">Manage your account and preferences.</p>
      </div>

      {/* Profile */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-4">
        <h2 className="font-semibold text-primary-dark">Profile</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-primary-dark mb-1.5">First name</label>
            <input className={inputCls} value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} disabled={loading} />
          </div>
          <div>
            <label className="block text-xs font-medium text-primary-dark mb-1.5">Last name</label>
            <input className={inputCls} value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} disabled={loading} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-primary-dark mb-1.5">Email</label>
          <input type="email" className={inputCls} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} disabled={loading} />
        </div>
      </div>

      {/* WhatsApp for escalations */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-primary-dark">WhatsApp for escalations</h2>
          <p className="text-xs text-primary-warm mt-0.5">Milu sends you alerts here when the agent escalates a call. Number must be active on WhatsApp.</p>
        </div>

        {verifiedWa ? (
          <div className="flex items-center justify-between p-4 rounded-xl bg-success/5 border border-success/20">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-success/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-primary-dark">{verifiedWa}</p>
                <p className="text-xs text-success font-medium mt-0.5">Verified WhatsApp number</p>
              </div>
            </div>
            <button onClick={removeWa} className="text-xs text-danger hover:underline font-medium">Remove</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">WhatsApp number</label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  className={inputCls}
                  placeholder="+2348012345678"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  disabled={waStep !== 'idle'}
                />
                {waStep === 'idle' && (
                  <button
                    onClick={sendWaOtp}
                    disabled={!waPhone.trim()}
                    className="flex-shrink-0 px-4 py-2.5 bg-primary text-cream-light rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    Send code
                  </button>
                )}
                {waStep === 'sending' && (
                  <div className="flex-shrink-0 flex items-center gap-1.5 px-4 text-sm text-primary-warm">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending…
                  </div>
                )}
              </div>
            </div>

            {(waStep === 'awaiting_code' || isVerifyingWa) && (
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                <p className="text-sm text-primary-dark font-medium">
                  Enter the 6-digit code sent to {waPhone} via WhatsApp
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    className={`${inputCls} tracking-[0.5em] text-center font-mono text-lg`}
                    placeholder="——————"
                    value={waCode}
                    onChange={(e) => setWaCode(e.target.value.replace(/\D/g, ''))}
                  />
                  <button
                    onClick={confirmWaOtp}
                    disabled={waCode.length !== 6 || isVerifyingWa}
                    className="flex-shrink-0 px-4 py-2.5 bg-success text-white rounded-xl text-sm font-medium hover:bg-success/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isVerifyingWa && (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    Verify
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => { setWaStep('idle'); setWaCode(''); setWaError(''); }}
                    className="text-xs text-primary-warm hover:text-primary-dark transition-colors"
                  >
                    Use a different number
                  </button>
                  <button
                    onClick={sendWaOtp}
                    disabled={waCooldown > 0}
                    className="text-xs text-primary hover:underline disabled:text-primary-warm disabled:no-underline"
                  >
                    {waCooldown > 0 ? `Resend in ${waCooldown}s` : 'Resend code'}
                  </button>
                </div>
              </div>
            )}

            {waError && (
              <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">
                {waError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-4">
        <h2 className="font-semibold text-primary-dark">Notifications</h2>
        {[
          { key: 'notifyEscalation', label: 'Escalation alerts', desc: 'Get notified on WhatsApp when a call is escalated' },
          { key: 'notifyMissed', label: 'Missed call alerts', desc: 'Get notified when the agent misses a call' },
          { key: 'notifyWeekly', label: 'Weekly summary', desc: 'Receive a weekly performance digest via email' },
        ].map((n) => (
          <div key={n.key} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary-dark">{n.label}</p>
              <p className="text-xs text-primary-warm">{n.desc}</p>
            </div>
            <button
              onClick={() => setForm((f) => ({ ...f, [n.key]: !f[n.key as keyof typeof f] }))}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                form[n.key as keyof typeof form] ? 'bg-primary' : 'bg-cream-dark'
              }`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                form[n.key as keyof typeof form] ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        ))}
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl border border-danger/20 p-6">
        <h2 className="font-semibold text-danger mb-1">Danger zone</h2>
        <p className="text-sm text-primary-warm mb-4">These actions are irreversible.</p>
        <button className="text-sm text-danger border border-danger/30 px-4 py-2 rounded-xl hover:bg-danger/5 transition-colors">
          Delete account
        </button>
      </div>

      {error && <p className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-xl px-4 py-3">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || loading}
        className={`px-6 py-3 rounded-full text-sm font-medium transition-colors disabled:opacity-40 ${
          saved ? 'bg-success text-white' : 'bg-primary text-cream-light hover:bg-primary-dark'
        }`}
      >
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
      </button>
    </div>
  );
}
