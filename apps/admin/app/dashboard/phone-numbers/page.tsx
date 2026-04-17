'use client';

import { useState } from 'react';

type PhoneNumber = {
  id: string;
  number: string;
  label: string | null;
  verified: boolean;
  createdAt: string;
};

type Step = 'idle' | 'sending' | 'awaiting_code' | 'verifying' | 'done';

const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all';

// Mock existing numbers — replace with real API fetch
const MOCK: PhoneNumber[] = [
  { id: '1', number: '+2348012345678', label: 'Main line', verified: true, createdAt: '2025-11-01' },
  { id: '2', number: '+2348099887766', label: null, verified: false, createdAt: '2025-11-03' },
];

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-primary-dark">No phone numbers yet</p>
      <p className="text-xs text-primary-warm mt-1 max-w-xs">Add a verified phone number so Milu can route inbound calls to your business.</p>
    </div>
  );
}

export default function PhoneNumbersPage() {
  const [numbers, setNumbers] = useState<PhoneNumber[]>(MOCK);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [inputNumber, setInputNumber] = useState('');
  const [inputLabel, setInputLabel] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  function startCooldown() {
    setResendCooldown(30);
    const t = setInterval(() => {
      setResendCooldown((v) => {
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
      // POST /api/v1/businesses/:id/phone-numbers/send-otp
      await new Promise((r) => setTimeout(r, 1200));
      setStep('awaiting_code');
      startCooldown();
    } catch {
      setError('Failed to send SMS. Check the number and try again.');
      setStep('idle');
    }
  }

  async function verifyCode() {
    if (code.length !== 6) return;
    setError('');
    setStep('verifying');
    try {
      // POST /api/v1/businesses/:id/phone-numbers/verify
      await new Promise((r) => setTimeout(r, 1000));
      const newNumber: PhoneNumber = {
        id: Date.now().toString(),
        number: inputNumber,
        label: inputLabel || null,
        verified: true,
        createdAt: new Date().toISOString().split('T')[0],
      };
      setNumbers((prev) => [newNumber, ...prev]);
      setStep('done');
      setTimeout(resetForm, 1500);
    } catch {
      setError('Incorrect code. Please try again.');
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
    setResendCooldown(0);
  }

  function removeNumber(id: string) {
    setNumbers((prev) => prev.filter((n) => n.id !== id));
  }

  const isVerifying = step === 'verifying';

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Phone Numbers</h1>
          <p className="text-sm text-primary-warm mt-0.5">Verified numbers Milu routes inbound calls to.</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex-shrink-0 flex items-center gap-2 bg-primary text-cream-light px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add number
          </button>
        )}
      </div>

      {/* Add number form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-primary-dark">Add & verify a phone number</h2>
            <button onClick={resetForm} className="text-primary-warm hover:text-primary-dark transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Step 1: Enter number */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">
                Phone number
              </label>
              <input
                type="tel"
                className={inputCls}
                placeholder="+2348012345678"
                value={inputNumber}
                onChange={(e) => setInputNumber(e.target.value)}
                disabled={step !== 'idle'}
              />
              <p className="mt-1.5 text-xs text-primary-warm">Include country code. We'll send a 6-digit SMS code to verify you own this number.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">
                Label <span className="text-primary-warm font-normal">(optional)</span>
              </label>
              <input
                type="text"
                className={inputCls}
                placeholder="e.g. Main line, Support"
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
              <div className="flex items-center justify-center gap-2 py-2.5 text-sm text-primary-warm">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Sending SMS…
              </div>
            )}
          </div>

          {/* Step 2: Enter OTP */}
          {(step === 'awaiting_code' || step === 'verifying') && (
            <div className="pt-1 border-t border-cream-dark space-y-4">
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
                    className={`${inputCls} tracking-[0.6em] text-center font-mono text-lg`}
                    placeholder="——————"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                  />
                  <button
                    onClick={verifyCode}
                    disabled={code.length !== 6 || isVerifying}
                    className="flex-shrink-0 px-5 py-2.5 bg-success text-white rounded-xl text-sm font-medium hover:bg-success/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isVerifying ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : null}
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
                  disabled={resendCooldown > 0}
                  className="text-xs text-primary hover:underline disabled:text-primary-warm disabled:no-underline transition-colors"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
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
                <p className="text-sm font-semibold text-primary-dark">Number verified!</p>
                <p className="text-xs text-primary-warm mt-0.5">{inputNumber} has been added to your account.</p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-danger bg-danger/8 border border-danger/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>
      )}

      {/* Numbers list */}
      {numbers.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
          <div className="px-6 py-4 border-b border-cream-dark">
            <p className="text-sm font-semibold text-primary-dark">{numbers.length} number{numbers.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="divide-y divide-cream-dark">
            {numbers.map((n) => (
              <div key={n.id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${n.verified ? 'bg-success/10' : 'bg-warning/10'}`}>
                    <svg
                      className={`w-4 h-4 ${n.verified ? 'text-success' : 'text-warning'}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary-dark">{n.number}</p>
                    <p className="text-xs text-primary-warm truncate">
                      {n.label ?? 'No label'} · Added {n.createdAt}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {n.verified ? (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-success bg-success/10 px-2.5 py-1 rounded-full">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Verified
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-warning bg-warning/10 px-2.5 py-1 rounded-full">
                      Unverified
                    </span>
                  )}
                  <button
                    onClick={() => removeNumber(n.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:text-danger hover:bg-danger/5 transition-colors"
                    title="Remove number"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="flex gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
        <svg className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <p className="text-xs text-primary-dark leading-relaxed">
          Only <strong>verified</strong> numbers can receive inbound calls through Milu. Verification ensures you own the number before we route calls to it.
        </p>
      </div>
    </div>
  );
}
