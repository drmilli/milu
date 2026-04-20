'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { apiGet, apiPost, apiDelete } from '../../../lib/api';

type PhoneEntry = {
  id: string;
  number: string;
  label: string | null;
  verified: boolean;
  isVirtual: boolean;
  provider: string | null;
  createdAt?: string;
  forwardingInstructions?: ForwardingInstructions;
};

type ForwardingInstructions = {
  virtualNumber: string;
  instructions: Record<string, string>;
};

type AvailableNumber = {
  numberKey: string;
  number: string;
  country: string;
  type: string;
  pricePerMonth: number;
  currency: string;
};

type Step = 'idle' | 'sending' | 'awaiting_code' | 'verifying' | 'done';
type VirtualStep = 'idle' | 'searching' | 'selecting' | 'buying' | 'done';

const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all';

const POPUP_KEY = 'milu_virtual_number_reminder';

export default function PhoneNumbersPage() {
  const { token, user, ready } = useAuth();
  const businessId = user?.businessId ?? '';

  const [numbers, setNumbers] = useState<PhoneEntry[]>([]);
  const [loadingNums, setLoadingNums] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showVirtualForm, setShowVirtualForm] = useState(false);
  const [showReminderPopup, setShowReminderPopup] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [forwardingInfo, setForwardingInfo] = useState<ForwardingInstructions | null>(null);

  // Virtual number flow
  const [countryCode, setCountryCode] = useState('NG');
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<AvailableNumber | null>(null);
  const [virtualLabel, setVirtualLabel] = useState('');
  const [virtualStep, setVirtualStep] = useState<VirtualStep>('idle');
  const [virtualError, setVirtualError] = useState('');

  const load = useCallback(() => {
    if (!token || !businessId) return;
    apiGet<PhoneEntry[]>(`/businesses/${businessId}/phone-numbers`, token)
      .then(nums => {
        setNumbers(nums);
        // Check if no virtual number — show popup reminder after 24hr
        const hasVirtual = nums.some(n => n.isVirtual);
        if (!hasVirtual) {
          const last = localStorage.getItem(POPUP_KEY);
          const now = Date.now();
          if (!last || now - parseInt(last) > 24 * 60 * 60 * 1000) {
            setShowReminderPopup(true);
            localStorage.setItem(POPUP_KEY, String(now));
          }
        }
      })
      .catch(() => null)
      .finally(() => setLoadingNums(false));
  }, [token, businessId]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  // Manual number flow
  const [inputNumber, setInputNumber] = useState('');
  const [inputLabel, setInputLabel] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  function startCooldown() {
    setCooldown(30);
    const t = setInterval(() => {
      setCooldown((v) => { if (v <= 1) { clearInterval(t); return 0; } return v - 1; });
    }, 1000);
  }

  async function sendOtp() {
    if (!inputNumber.trim()) return;
    setError(''); setStep('sending');
    try {
      const res = await apiPost<{ message: string; devCode?: string }>(
        `/businesses/${businessId}/phone-numbers/send-otp`, { number: inputNumber }, token,
      );
      setStep('awaiting_code');
      startCooldown();
      if (res.devCode) setCode(res.devCode);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send SMS.');
      setStep('idle');
    }
  }

  async function verifyCode() {
    if (code.length !== 6) return;
    setError(''); setStep('verifying');
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

  async function deleteNumber(id: string) {
    setDeletingId(id);
    try {
      await apiDelete(`/businesses/${businessId}/phone-numbers/${id}`, token);
      setNumbers(prev => prev.filter(n => n.id !== id));
    } catch { /* ignore */ } finally { setDeletingId(null); }
  }

  function resetForm() {
    setShowForm(false); setInputNumber(''); setInputLabel('');
    setCode(''); setStep('idle'); setError(''); setCooldown(0);
  }

  // Virtual number flow
  async function searchNumbers() {
    setVirtualError(''); setVirtualStep('searching');
    try {
      const nums = await apiGet<AvailableNumber[]>(
        `/businesses/${businessId}/phone-numbers/virtual/available?countryCode=${countryCode}`, token,
      );
      setAvailableNumbers(nums);
      setVirtualStep('selecting');
    } catch (err: unknown) {
      setVirtualError(err instanceof Error ? err.message : 'Failed to search numbers.');
      setVirtualStep('idle');
    }
  }

  async function buyNumber() {
    if (!selectedNumber) return;
    setVirtualError(''); setVirtualStep('buying');
    try {
      const result = await apiPost<PhoneEntry & { forwardingInstructions: ForwardingInstructions }>(
        `/businesses/${businessId}/phone-numbers/virtual/buy`,
        { numberKey: selectedNumber.numberKey, label: virtualLabel || 'Milu Virtual Number' },
        token,
      );
      setNumbers(prev => [result, ...prev]);
      setForwardingInfo(result.forwardingInstructions);
      setVirtualStep('done');
    } catch (err: unknown) {
      setVirtualError(err instanceof Error ? err.message : 'Failed to purchase number.');
      setVirtualStep('selecting');
    }
  }

  function resetVirtualForm() {
    setShowVirtualForm(false); setVirtualStep('idle'); setVirtualError('');
    setAvailableNumbers([]); setSelectedNumber(null); setVirtualLabel('');
  }

  const hasVirtual = numbers.some(n => n.isVirtual);

  return (
    <div className="p-6 lg:p-8 max-w-2xl space-y-6">
      {/* 24hr reminder popup */}
      {showReminderPopup && !hasVirtual && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
              </div>
              <div>
                <h3 className="font-heading font-bold text-primary-dark text-lg">Get a virtual number</h3>
                <p className="text-sm text-primary-warm mt-1">
                  Your business doesn&apos;t have a virtual Milu number yet. Get one to start receiving calls through your AI agent — customers forward to it from their existing number.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowReminderPopup(false); setShowVirtualForm(true); }}
                className="flex-1 bg-primary text-cream-light py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors"
              >
                Get virtual number
              </button>
              <button
                onClick={() => setShowReminderPopup(false)}
                className="flex-1 border border-cream-dark text-primary-warm py-2.5 rounded-xl text-sm font-medium hover:bg-cream transition-colors"
              >
                Remind me later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forwarding instructions modal */}
      {forwardingInfo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-primary-dark">Virtual number activated!</h3>
              <button onClick={() => { setForwardingInfo(null); resetVirtualForm(); }} className="text-primary-warm hover:text-primary-dark">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-3 bg-success/5 border border-success/20 rounded-xl text-center">
              <p className="text-xs text-primary-warm">Your Milu virtual number</p>
              <p className="text-2xl font-mono font-bold text-primary-dark mt-1">{forwardingInfo.virtualNumber}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-primary-dark">Forward your existing number to this:</p>
              {Object.entries(forwardingInfo.instructions).filter(([k]) => k !== 'general').map(([carrier, instruction]) => (
                <div key={carrier} className="flex items-start gap-2 p-3 bg-cream-light rounded-xl">
                  <span className="text-xs font-semibold text-primary capitalize w-14 flex-shrink-0 mt-0.5">{carrier}</span>
                  <code className="text-xs text-primary-dark font-mono">{instruction}</code>
                </div>
              ))}
            </div>
            <p className="text-xs text-primary-warm text-center">Dial the code from your existing business number. Calls will be routed to your Milu AI agent.</p>
            <button
              onClick={() => { setForwardingInfo(null); resetVirtualForm(); }}
              className="w-full bg-primary text-cream-light py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Phone Numbers</h1>
          <p className="text-sm text-primary-warm mt-0.5">Numbers connected to your AI agent.</p>
        </div>
        <div className="flex gap-2">
          {!hasVirtual && !showVirtualForm && (
            <button
              onClick={() => setShowVirtualForm(true)}
              className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              Get virtual number
            </button>
          )}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="border border-cream-dark text-primary-dark px-4 py-2 rounded-xl text-sm font-medium hover:bg-cream transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Add number
            </button>
          )}
        </div>
      </div>

      {/* Virtual number purchase form */}
      {showVirtualForm && (
        <div className="bg-white rounded-2xl border-2 border-primary/30 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-primary-dark">Get a Milu virtual number</h2>
              <p className="text-xs text-primary-warm mt-0.5">Customers forward calls from their existing number to this.</p>
            </div>
            <button onClick={resetVirtualForm} className="text-primary-warm hover:text-primary-dark transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {virtualStep === 'idle' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-primary-dark mb-1.5">Country</label>
                <select
                  value={countryCode}
                  onChange={e => setCountryCode(e.target.value)}
                  className={inputCls}
                >
                  <option value="NG">Nigeria (+234)</option>
                  <option value="KE">Kenya (+254)</option>
                  <option value="GH">Ghana (+233)</option>
                  <option value="ZA">South Africa (+27)</option>
                  <option value="TZ">Tanzania (+255)</option>
                  <option value="UG">Uganda (+256)</option>
                </select>
              </div>
              <button onClick={searchNumbers} className="w-full bg-primary text-cream-light py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors">
                Search available numbers
              </button>
            </div>
          )}

          {virtualStep === 'searching' && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-primary-warm">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Searching available numbers…
            </div>
          )}

          {virtualStep === 'selecting' && (
            <div className="space-y-4">
              <p className="text-xs text-primary-warm">Select a number to purchase:</p>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {availableNumbers.length === 0 && (
                  <p className="text-sm text-primary-warm py-4 text-center">No numbers available for this country.</p>
                )}
                {availableNumbers.map(n => (
                  <button
                    key={n.numberKey}
                    onClick={() => setSelectedNumber(n)}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${selectedNumber?.numberKey === n.numberKey ? 'border-primary bg-primary/5' : 'border-cream-dark hover:border-primary/40'}`}
                  >
                    <div>
                      <p className="font-mono font-medium text-primary-dark">{n.number}</p>
                      <p className="text-xs text-primary-warm mt-0.5">{n.type} · {n.country}</p>
                    </div>
                    <span className="text-xs font-semibold text-primary">{n.currency} {n.pricePerMonth}/mo</span>
                  </button>
                ))}
              </div>
              {selectedNumber && (
                <div className="space-y-3 border-t border-cream-dark pt-4">
                  <div>
                    <label className="block text-xs font-medium text-primary-dark mb-1.5">Label (optional)</label>
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="e.g. Main business line"
                      value={virtualLabel}
                      onChange={e => setVirtualLabel(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={buyNumber}
                    className="w-full bg-primary text-cream-light py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors"
                  >
                    Purchase {selectedNumber.number}
                  </button>
                </div>
              )}
            </div>
          )}

          {virtualStep === 'buying' && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-primary-warm">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Purchasing number…
            </div>
          )}

          {virtualError && (
            <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{virtualError}</p>
          )}
        </div>
      )}

      {/* Existing numbers */}
      <div className="space-y-3">
        {loadingNums && (
          <div className="bg-white rounded-2xl border border-cream-dark p-5 flex items-center gap-4 animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-cream flex-shrink-0" />
            <div className="flex-1 space-y-2"><div className="h-4 bg-cream rounded w-40" /><div className="h-3 bg-cream rounded w-32" /></div>
          </div>
        )}
        {!loadingNums && numbers.length === 0 && !showForm && !showVirtualForm && (
          <p className="text-sm text-primary-warm py-4">No numbers connected yet.</p>
        )}
        {numbers.map((n) => (
          <div key={n.id} className="bg-white rounded-2xl border border-cream-dark p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${n.isVirtual ? 'bg-primary/10' : n.verified ? 'bg-success/10' : 'bg-warning/10'}`}>
              {n.isVirtual ? (
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              ) : (
                <svg className={`w-5 h-5 ${n.verified ? 'text-success' : 'text-warning'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-primary-dark font-mono">{n.number}</p>
              <p className="text-xs text-primary-warm">
                {n.label ?? 'No label'}
                {n.isVirtual && <span className="ml-1.5 text-primary font-medium">· Milu Virtual</span>}
                {n.createdAt ? ` · ${new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}
              </p>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${n.isVirtual ? 'bg-primary/10 text-primary' : n.verified ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
              {n.isVirtual ? 'Virtual' : n.verified ? 'Verified' : 'Unverified'}
            </span>
            <button
              onClick={() => deleteNumber(n.id)}
              disabled={deletingId === n.id}
              className="ml-1 p-1.5 rounded-lg text-primary-warm hover:text-danger hover:bg-danger/5 transition-colors disabled:opacity-40"
            >
              {deletingId === n.id ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Manual add form */}
      {showForm && (
        <div className="bg-white rounded-2xl border-2 border-cream-dark p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-primary-dark">Add & verify a number</h2>
            <button onClick={resetForm} className="text-primary-warm hover:text-primary-dark transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Phone number</label>
              <input type="tel" className={inputCls} placeholder="+2348012345678" value={inputNumber} onChange={e => setInputNumber(e.target.value)} disabled={step !== 'idle'} />
              <p className="mt-1.5 text-xs text-primary-warm">Include country code. A 6-digit SMS code will be sent to verify ownership.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Label <span className="text-primary-warm font-normal">(optional)</span></label>
              <input type="text" className={inputCls} placeholder="e.g. Main line, Customer care" value={inputLabel} onChange={e => setInputLabel(e.target.value)} disabled={step !== 'idle'} />
            </div>
            {step === 'idle' && (
              <button onClick={sendOtp} disabled={!inputNumber.trim()} className="w-full bg-primary text-cream-light py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50">
                Send verification code
              </button>
            )}
            {step === 'sending' && (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-primary-warm">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Sending SMS to {inputNumber}…
              </div>
            )}
          </div>
          {(step === 'awaiting_code' || step === 'verifying') && (
            <div className="border-t border-cream-dark pt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-primary-dark">Verification code</label>
                  <span className="text-xs text-primary-warm">Sent to {inputNumber}</span>
                </div>
                <div className="flex gap-2">
                  <input type="text" inputMode="numeric" maxLength={6} autoFocus className={`${inputCls} tracking-[0.6em] text-center font-mono text-lg`} placeholder="——————" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
                  <button onClick={verifyCode} disabled={code.length !== 6 || step === 'verifying'} className="flex-shrink-0 px-5 py-2.5 bg-success text-white rounded-xl text-sm font-medium hover:bg-success/90 transition-colors disabled:opacity-50 flex items-center gap-2">
                    {step === 'verifying' && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                    Verify
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <button onClick={() => { setStep('idle'); setCode(''); setError(''); }} className="text-xs text-primary-warm hover:text-primary-dark transition-colors">Change number</button>
                <button onClick={sendOtp} disabled={cooldown > 0} className="text-xs text-primary hover:underline disabled:text-primary-warm disabled:no-underline">{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}</button>
              </div>
            </div>
          )}
          {step === 'done' && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-success/5 border border-success/20">
              <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-primary-dark">Number verified and connected!</p>
                <p className="text-xs text-primary-warm mt-0.5">{inputNumber} is now active on your agent.</p>
              </div>
            </div>
          )}
          {error && <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{error}</p>}
        </div>
      )}

      {!hasVirtual && (
        <div className="flex gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
          <svg className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
          <p className="text-xs text-primary-dark leading-relaxed">
            Get a <strong>Milu virtual number</strong> so customers can reach your AI agent by forwarding calls from their existing number — no new SIM needed.
          </p>
        </div>
      )}
    </div>
  );
}
