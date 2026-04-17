'use client';

import { useState } from 'react';

const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all';

type WaStep = 'idle' | 'sending' | 'awaiting_code' | 'verifying' | 'verified';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    firstName: 'Amaka',
    lastName: 'Obi',
    email: 'amaka@yourbusiness.ng',
    businessName: "Amaka's Boutique",
    industry: 'Retail / Fashion',
    notifyEscalation: true,
    notifyMissed: true,
    notifyWeekly: false,
  });

  // WhatsApp verification
  const [verifiedWa, setVerifiedWa] = useState<string | null>('+234 801 234 5678');
  const [waPhone, setWaPhone] = useState('');
  const [waCode, setWaCode] = useState('');
  const [waStep, setWaStep] = useState<WaStep>('idle');
  const [waError, setWaError] = useState('');
  const [waCooldown, setWaCooldown] = useState(0);
  const isVerifyingWa = waStep === 'verifying';

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
      // await fetch(`/api/v1/settings/${BIZ_ID}/whatsapp/send-otp`, {
      //   method: 'POST', body: JSON.stringify({ phone: waPhone })
      // })
      await new Promise((r) => setTimeout(r, 1200));
      setWaStep('awaiting_code');
      startCooldown();
    } catch {
      setWaError('Failed to send code. Check the number and try again.');
      setWaStep('idle');
    }
  }

  async function confirmWaOtp() {
    if (waCode.length !== 6) return;
    setWaError('');
    setWaStep('verifying');
    try {
      // await fetch(`/api/v1/settings/${BIZ_ID}/whatsapp/verify`, {
      //   method: 'POST', body: JSON.stringify({ phone: waPhone, code: waCode })
      // })
      await new Promise((r) => setTimeout(r, 1000));
      setVerifiedWa(waPhone);
      setWaStep('verified');
      setWaPhone('');
      setWaCode('');
    } catch {
      setWaError('Invalid code. Please try again.');
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

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
            <input className={inputCls} value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-primary-dark mb-1.5">Last name</label>
            <input className={inputCls} value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-primary-dark mb-1.5">Email</label>
          <input type="email" className={inputCls} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
      </div>

      {/* Business */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-4">
        <h2 className="font-semibold text-primary-dark">Business</h2>
        <div>
          <label className="block text-xs font-medium text-primary-dark mb-1.5">Business name</label>
          <input className={inputCls} value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-primary-dark mb-1.5">Industry</label>
          <input className={inputCls} value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} />
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

      <button
        onClick={handleSave}
        className={`px-6 py-3 rounded-full text-sm font-medium transition-colors ${
          saved ? 'bg-success text-white' : 'bg-primary text-cream-light hover:bg-primary-dark'
        }`}
      >
        {saved ? '✓ Saved' : 'Save changes'}
      </button>
    </div>
  );
}
