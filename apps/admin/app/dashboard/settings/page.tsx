'use client';

import { useState } from 'react';

const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all';

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-primary-dark">{title}</h2>
        {description && <p className="text-xs text-primary-warm mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-primary-dark mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-primary-warm">{hint}</p>}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-success' : 'bg-cream-dark'}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

type VerifyStep = 'idle' | 'sending' | 'awaiting_code' | 'verifying' | 'verified';

export default function BizSettingsPage() {
  // Notification prefs
  const [notifyEscalation, setNotifyEscalation] = useState(true);
  const [notifyOrder, setNotifyOrder] = useState(true);
  const [notifyAppt, setNotifyAppt] = useState(true);
  const [channels, setChannels] = useState<string[]>(['EMAIL', 'WHATSAPP']);
  const [timezone, setTimezone] = useState('Africa/Lagos');
  const [currency, setCurrency] = useState('NGN');
  const [smsNumber, setSmsNumber] = useState('');

  // WhatsApp verification flow
  const [waPhone, setWaPhone] = useState('');
  const [verifiedWa, setVerifiedWa] = useState<string | null>(null);
  const [step, setStep] = useState<VerifyStep>('idle');
  const [otp, setOtp] = useState('');
  const [waError, setWaError] = useState('');

  // Save feedback
  const [saved, setSaved] = useState(false);

  function toggleChannel(ch: string) {
    setChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]);
  }

  async function sendOtp() {
    if (!waPhone.trim()) return;
    setWaError('');
    setStep('sending');
    try {
      // In production: POST /api/v1/settings/:businessId/whatsapp/send-otp
      await new Promise((r) => setTimeout(r, 1200));
      setStep('awaiting_code');
    } catch {
      setWaError('Failed to send OTP. Check the number and try again.');
      setStep('idle');
    }
  }

  async function confirmOtp() {
    if (otp.length !== 6) return;
    setWaError('');
    setStep('verifying');
    try {
      // In production: POST /api/v1/settings/:businessId/whatsapp/verify
      await new Promise((r) => setTimeout(r, 1000));
      if (otp === '000000') {
        setWaError('Invalid code. Please try again.');
        setStep('awaiting_code');
        return;
      }
      setVerifiedWa(waPhone);
      setStep('verified');
      setOtp('');
    } catch {
      setWaError('Verification failed. Please try again.');
      setStep('awaiting_code');
    }
  }

  function removeWhatsApp() {
    setVerifiedWa(null);
    setWaPhone('');
    setStep('idle');
    setOtp('');
    setWaError('');
  }

  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const isVerifying = step === 'verifying';

  const CHANNELS = [
    { id: 'IN_APP', label: 'In-app', icon: '🔔' },
    { id: 'EMAIL', label: 'Email', icon: '📧' },
    { id: 'SMS', label: 'SMS', icon: '💬' },
    { id: 'WHATSAPP', label: 'WhatsApp', icon: '📱' },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary-dark">Settings</h1>
        <p className="text-sm text-primary-warm mt-0.5">Manage your notification preferences and business details.</p>
      </div>

      {/* Notification events */}
      <Section title="Notify me when…" description="Choose which events trigger a notification.">
        {[
          { label: 'New escalation', hint: 'When a call is escalated by the AI agent', value: notifyEscalation, set: setNotifyEscalation },
          { label: 'New order', hint: 'When a customer places an order via call', value: notifyOrder, set: setNotifyOrder },
          { label: 'New appointment', hint: 'When a customer books an appointment', value: notifyAppt, set: setNotifyAppt },
        ].map((item) => (
          <div key={item.label} className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary-dark">{item.label}</p>
              <p className="text-xs text-primary-warm mt-0.5">{item.hint}</p>
            </div>
            <Toggle checked={item.value} onChange={item.set} />
          </div>
        ))}
      </Section>

      {/* Notification channels */}
      <Section title="Notification channels" description="Where to send your notifications.">
        <div className="grid grid-cols-2 gap-3">
          {CHANNELS.map((ch) => {
            const active = channels.includes(ch.id);
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => toggleChannel(ch.id)}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                  active
                    ? 'border-primary/40 bg-primary/5 text-primary-dark'
                    : 'border-cream-dark text-primary-warm hover:border-primary/20'
                }`}
              >
                <span>{ch.icon}</span>
                {ch.label}
                {active && (
                  <svg className="w-4 h-4 text-success ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </Section>

      {/* WhatsApp number */}
      <Section
        title="WhatsApp notification number"
        description="Milu will send you alerts here. The number must be active on WhatsApp."
      >
        {step === 'verified' || verifiedWa ? (
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
            <button
              onClick={removeWhatsApp}
              className="text-xs text-danger hover:underline font-medium"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <Field
              label="WhatsApp number"
              hint="Include country code, e.g. +2348012345678"
            >
              <div className="flex gap-2">
                <input
                  type="tel"
                  className={inputCls}
                  placeholder="+2348012345678"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  disabled={step === 'awaiting_code' || step === 'sending'}
                />
                {step !== 'awaiting_code' && (
                  <button
                    onClick={sendOtp}
                    disabled={!waPhone.trim() || step === 'sending'}
                    className="flex-shrink-0 px-4 py-2.5 bg-primary text-cream-light rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {step === 'sending' ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : 'Send code'}
                  </button>
                )}
              </div>
            </Field>

            {step === 'awaiting_code' && (
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                <p className="text-sm text-primary-dark font-medium">Enter the 6-digit code sent to {waPhone}</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    className={`${inputCls} tracking-[0.5em] text-center font-mono text-lg`}
                    placeholder="——————"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  />
                  <button
                    onClick={confirmOtp}
                    disabled={otp.length !== 6 || isVerifying}
                    className="flex-shrink-0 px-4 py-2.5 bg-success text-white rounded-xl text-sm font-medium hover:bg-success/90 transition-colors disabled:opacity-50"
                  >
                    {isVerifying ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : 'Verify'}
                  </button>
                </div>
                <button
                  onClick={() => { setStep('idle'); setOtp(''); setWaError(''); }}
                  className="text-xs text-primary-warm hover:text-primary-dark transition-colors"
                >
                  Use a different number
                </button>
              </div>
            )}

            {waError && (
              <p className="text-xs text-danger bg-danger/8 border border-danger/20 rounded-lg px-3 py-2">
                {waError}
              </p>
            )}
          </div>
        )}
      </Section>

      {/* SMS number */}
      <Section title="SMS number" description="Fallback number for SMS notifications.">
        <Field label="Phone number" hint="Include country code, e.g. +2348012345678">
          <input
            type="tel"
            className={inputCls}
            placeholder="+2348012345678"
            value={smsNumber}
            onChange={(e) => setSmsNumber(e.target.value)}
          />
        </Field>
      </Section>

      {/* Regional */}
      <Section title="Regional" description="Timezone and currency for your reports.">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Timezone">
            <select className={inputCls} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              <option value="Africa/Lagos">Africa/Lagos (WAT)</option>
              <option value="Africa/Accra">Africa/Accra (GMT)</option>
              <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
              <option value="Africa/Johannesburg">Africa/Johannesburg (SAST)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="America/New_York">America/New_York (EST)</option>
            </select>
          </Field>
          <Field label="Currency">
            <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="NGN">NGN — Nigerian Naira</option>
              <option value="GHS">GHS — Ghanaian Cedi</option>
              <option value="KES">KES — Kenyan Shilling</option>
              <option value="ZAR">ZAR — South African Rand</option>
              <option value="USD">USD — US Dollar</option>
              <option value="GBP">GBP — British Pound</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          className="bg-primary text-cream-light px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          Save changes
        </button>
        {saved && (
          <span className="text-sm text-success flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
