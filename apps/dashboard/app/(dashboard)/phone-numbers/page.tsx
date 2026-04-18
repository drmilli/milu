'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { apiGet, apiPost } from '../../../lib/api';

type PhoneEntry = {
  id: string;
  number: string;
  label: string | null;
  verified: boolean;
  createdAt?: string;
};

type Step = 'idle' | 'sending' | 'awaiting_code' | 'verifying' | 'done';

const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all';

export default function PhoneNumbersPage() {
  const { token, user, ready } = useAuth();
  const businessId = user?.businessId ?? '';

  const [numbers, setNumbers] = useState<PhoneEntry[]>([]);
  const [loadingNums, setLoadingNums] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(() => {
    if (!token || !businessId) return;
    apiGet<PhoneEntry[]>(`/businesses/${businessId}/phone-numbers`, token)
      .then(setNumbers).catch(() => null).finally(() => setLoadingNums(false));
  }, [token, businessId]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const [inputNumber, setInputNumber] = useState('');
  const [inputLabel, setInputLabel] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const isVerifying = step === 'verifying';

  function startCooldown() {
    setCooldown(30);
    const t = setInterval(() => {
      setCooldown((v) => {
        if (v <= 1) { clearInterval(t); return 0; }
        return v - 1;
      });
    }, 1000);
  }

  async function sendOtp() {
    if (!inputNumber.trim()) return;
    setError('');
    setStep('sending');
    try {
      const res = await apiPost<{ message: string; devCode?: string }>(
        `/businesses/${businessId}/phone-numbers/send-otp`, { number: inputNumber }, token,
      );
      setStep('awaiting_code');
      startCooldown();
      // Dev mode: API couldn't send SMS, pre-fill the code
      if (res.devCode) setCode(res.devCode);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send SMS. Check the number and try again.');
      setStep('idle');
    }
  }

  async function verifyCode() {
    if (code.length !== 6) return;
    setError('');
    setStep('verifying');
    try {
      const newNum = await apiPost<PhoneEntry>(`/businesses/${businessId}/phone-numbers/verify`, {
        number: inputNumber, code, label: inputLabel || undefined,
      }, token);
      setNumbers(prev => [newNum, ...prev]);
      setStep('done');
      setTimeout(resetForm, 1800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Incorrect code. Please try again.');
      setStep('awaiting_code');
    }
  }

  function resetForm() {
    setShowForm(false);
    setInputNumber('');
    setInputLabel('');
    setCode('');
    setStep('idle');
    setError('');
    setCooldown(0);
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Phone Numbers</h1>
          <p className="text-sm text-primary-warm mt-0.5">Numbers connected to your AI agent.</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add number
          </button>
        )}
      </div>

      {/* Existing numbers */}
      <div className="space-y-3">
        {loadingNums && (
          <div className="bg-white rounded-2xl border border-cream-dark p-5 flex items-center gap-4 animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-cream flex-shrink-0" />
            <div className="flex-1 space-y-2"><div className="h-4 bg-cream rounded w-40" /><div className="h-3 bg-cream rounded w-32" /></div>
          </div>
        )}
        {!loadingNums && numbers.length === 0 && !showForm && (
          <p className="text-sm text-primary-warm py-4">No numbers connected yet.</p>
        )}
        {numbers.map((n) => (
          <div key={n.id} className="bg-white rounded-2xl border border-cream-dark p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${n.verified ? 'bg-success/10' : 'bg-warning/10'}`}>
              <svg className={`w-5 h-5 ${n.verified ? 'text-success' : 'text-warning'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-primary-dark">{n.number}</p>
              <p className="text-xs text-primary-warm">
                {n.label ?? 'No label'}{n.createdAt ? ` · Connected ${new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}
              </p>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${n.verified ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
              {n.verified ? 'Verified' : 'Unverified'}
            </span>
          </div>
        ))}
      </div>

      {/* Add & verify form */}
      {showForm && (
        <div className="bg-white rounded-2xl border-2 border-primary/30 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-primary-dark">Add & verify a number</h2>
            <button onClick={resetForm} className="text-primary-warm hover:text-primary-dark transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Step 1 — enter number */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Phone number</label>
              <input
                type="tel"
                className={inputCls}
                placeholder="+2348012345678"
                value={inputNumber}
                onChange={(e) => setInputNumber(e.target.value)}
                disabled={step !== 'idle'}
              />
              <p className="mt-1.5 text-xs text-primary-warm">
                Include country code. A 6-digit SMS code will be sent to verify you own this number.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">
                Label <span className="text-primary-warm font-normal">(optional)</span>
              </label>
              <input
                type="text"
                className={inputCls}
                placeholder="e.g. Main line, Customer care"
                value={inputLabel}
                onChange={(e) => setInputLabel(e.target.value)}
                disabled={step !== 'idle'}
              />
            </div>

            {step === 'idle' && (
              <button
                onClick={sendOtp}
                disabled={!inputNumber.trim()}
                className="w-full bg-primary text-cream-light py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                Send verification code
              </button>
            )}

            {step === 'sending' && (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-primary-warm">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Sending SMS to {inputNumber}…
              </div>
            )}
          </div>

          {/* Step 2 — enter OTP */}
          {(step === 'awaiting_code' || isVerifying) && (
            <div className="border-t border-cream-dark pt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-primary-dark">Verification code</label>
                  <span className="text-xs text-primary-warm">Sent to {inputNumber}</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    className={`${inputCls} tracking-[0.6em] text-center font-mono text-lg`}
                    placeholder="——————"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  />
                  <button
                    onClick={verifyCode}
                    disabled={code.length !== 6 || isVerifying}
                    className="flex-shrink-0 px-5 py-2.5 bg-success text-white rounded-xl text-sm font-medium hover:bg-success/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isVerifying && (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    Verify
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => { setStep('idle'); setCode(''); setError(''); }}
                  className="text-xs text-primary-warm hover:text-primary-dark transition-colors"
                >
                  Change number
                </button>
                <button
                  onClick={sendOtp}
                  disabled={cooldown > 0}
                  className="text-xs text-primary hover:underline disabled:text-primary-warm disabled:no-underline"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
            </div>
          )}

          {/* Success */}
          {step === 'done' && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-success/5 border border-success/20">
              <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-primary-dark">Number verified and connected!</p>
                <p className="text-xs text-primary-warm mt-0.5">{inputNumber} is now active on your agent.</p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
        <svg className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <p className="text-xs text-primary-dark leading-relaxed">
          Only <strong>verified</strong> numbers receive inbound calls through Milu. Add any number you own — we&apos;ll send a 6-digit SMS to confirm ownership, then configure call routing automatically.
        </p>
      </div>
    </div>
  );
}
