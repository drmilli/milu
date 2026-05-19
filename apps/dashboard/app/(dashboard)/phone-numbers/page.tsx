'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

type PhoneNumberRequest = {
  id: string;
  quantity: number;
  amountUsd: number;
  checkoutUrl: string;
  note?: string | null;
  status: string;
  createdAt: string;
};

type Step = 'idle' | 'sending' | 'awaiting_code' | 'verifying' | 'done';
type VirtualStep = 'idle' | 'searching' | 'selecting' | 'buying' | 'done';
type Carrier = 'mtn' | 'airtel' | 'glo' | '9mobile';

const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all';

const FORWARDING_CODES: Record<string, { label: string; code: (n: string) => string }> = {
  mtn:   { label: 'MTN',   code: n => `*21*${n}#` },
  airtel: { label: 'Airtel', code: n => `**21*${n}#` },
  glo:   { label: 'Glo',   code: n => `*62*${n}#` },
  '9mobile': { label: '9mobile', code: n => `*62*${n}#` },
};

export default function PhoneNumbersPage() {
  const { token, user, ready } = useAuth();
  const businessId = user?.businessId ?? '';

  const [numbers, setNumbers] = useState<PhoneEntry[]>([]);
  const [loadingNums, setLoadingNums] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [upgradeMsg, setUpgradeMsg] = useState('');
  const [requests, setRequests] = useState<PhoneNumberRequest[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [reqError, setReqError] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [forwardingInfo, setForwardingInfo] = useState<ForwardingInstructions | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<Carrier>('mtn');
  const [copied, setCopied] = useState<string | null>(null);

  function copyCode(code: string, key: string) {
    navigator.clipboard.writeText(code).catch(() => null);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  // UI tabs
  const [activeTab, setActiveTab] = useState<'call-line' | 'business'>('call-line');

  // Virtual number flow
  const [showVirtualForm, setShowVirtualForm] = useState(false);
  const [countryCode, setCountryCode] = useState('NG');
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<AvailableNumber | null>(null);
  const [virtualLabel, setVirtualLabel] = useState('');
  const [virtualStep, setVirtualStep] = useState<VirtualStep>('idle');
  const [virtualError, setVirtualError] = useState('');

  // Manual verify flow
  const [showAddForm, setShowAddForm] = useState(false);
  const [inputNumber, setInputNumber] = useState('');
  const [inputLabel, setInputLabel] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const load = useCallback(() => {
    if (!token || !businessId) return;
    apiGet<PhoneEntry[]>(`/businesses/${businessId}/phone-numbers`, token)
      .then(nums => setNumbers(nums))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : '';
        if (msg.toLowerCase().includes('upgrade')) setUpgradeMsg(msg);
      })
      .finally(() => setLoadingNums(false));
  }, [token, businessId]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const loadRequests = useCallback(() => {
    if (!token || !businessId) return;
    setLoadingReqs(true);
    apiGet<PhoneNumberRequest[]>(`/businesses/${businessId}/phone-number-requests`, token)
      .then(setRequests)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : '';
        if (msg.toLowerCase().includes('upgrade')) setUpgradeMsg(msg);
      })
      .finally(() => setLoadingReqs(false));
  }, [token, businessId]);

  useEffect(() => { if (ready) loadRequests(); }, [ready, loadRequests]);

  const callLineNumbers = numbers.filter(n => n.isVirtual);
  const businessNumbers = numbers.filter(n => !n.isVirtual);

  if (upgradeMsg) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl">
        <div className="bg-warning/10 border border-warning/25 rounded-2xl p-6">
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Upgrade required</h1>
          <p className="text-sm text-primary-warm mt-2">{upgradeMsg}</p>
          <a href="/billing" className="inline-flex mt-5 bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors">
            Upgrade
          </a>
        </div>
      </div>
    );
  }

  async function requestAnotherNumber() {
    if (!token || !businessId) return;
    setReqError('');
    setRequesting(true);
    try {
      const res = await apiPost<{ id: string; checkoutUrl: string; amountUsd: number; quantity: number; createdAt: string }>(
        `/businesses/${businessId}/phone-number-requests`,
        { quantity: 1, note: reqNote.trim() || undefined },
        token,
      );
      await loadRequests();
      if (res?.checkoutUrl) window.open(res.checkoutUrl, '_blank', 'noreferrer');
      setReqNote('');
    } catch (err: unknown) {
      setReqError(err instanceof Error ? err.message : 'Failed to request number.');
    } finally {
      setRequesting(false);
    }
  }

  // ── Virtual number flow ──────────────────────────────────────────────────

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
        { numberKey: selectedNumber.numberKey, label: virtualLabel || 'AI Call Line' },
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

  // ── Manual verify flow ───────────────────────────────────────────────────

  function startCooldown() {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setCooldown(30);
    cooldownRef.current = setInterval(() => {
      setCooldown(v => {
        if (v <= 1) { clearInterval(cooldownRef.current!); cooldownRef.current = null; return 0; }
        return v - 1;
      });
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
      setTimeout(resetAddForm, 1800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Incorrect code. Please try again.');
      setStep('awaiting_code');
    }
  }

  function resetAddForm() {
    setShowAddForm(false); setInputNumber(''); setInputLabel('');
    setCode(''); setStep('idle'); setError(''); setCooldown(0);
  }

  async function deleteNumber(id: string) {
    setDeletingId(id);
    try {
      await apiDelete(`/businesses/${businessId}/phone-numbers/${id}`, token);
      setNumbers(prev => prev.filter(n => n.id !== id));
    } catch { /* ignore */ } finally { setDeletingId(null); }
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl space-y-6">

      {/* Forwarding instructions modal */}
      {forwardingInfo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-primary-dark text-lg">🎉 AI Call Line activated!</h3>
              <button onClick={() => { setForwardingInfo(null); resetVirtualForm(); }} className="text-primary-warm hover:text-primary-dark">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl text-center">
              <p className="text-xs text-primary-warm mb-1">Your Milu AI number</p>
              <p className="text-2xl font-mono font-bold text-primary-dark">{forwardingInfo.virtualNumber}</p>
              <p className="text-xs text-primary-warm mt-2">Customers can call this directly — or forward your existing number to it.</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-primary-dark uppercase tracking-wide">Set up call forwarding from your SIM:</p>
              {Object.entries(FORWARDING_CODES).map(([key, { label, code: codeFn }]) => (
                <div key={key} className="flex items-center gap-3 p-3 bg-cream-light rounded-xl">
                  <span className="text-xs font-semibold text-primary w-16 flex-shrink-0">{label}</span>
                  <code className="text-sm text-primary-dark font-mono bg-white px-2 py-0.5 rounded-lg border border-cream-dark">{codeFn(forwardingInfo.virtualNumber)}</code>
                  <span className="text-xs text-primary-warm">then dial</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-primary-warm text-center leading-relaxed">Dial the code from your existing business number. Calls will be answered by your AI agent.</p>
            <button onClick={() => { setForwardingInfo(null); resetVirtualForm(); }} className="w-full bg-primary text-cream-light py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors">
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary-dark">Phone Numbers</h1>
        <p className="text-sm text-primary-warm mt-0.5">Manage numbers connected to your AI agent.</p>
      </div>

      {/* Additional number request */}
      <div className="bg-white rounded-2xl border border-cream-dark p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-primary-dark">Need an additional phone number?</p>
            <p className="text-xs text-primary-warm mt-1">
              Additional numbers cost $3. Submitting a request notifies our admin team and opens the checkout link.
            </p>
          </div>
          <button
            onClick={requestAnotherNumber}
            disabled={requesting}
            className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-60 flex-shrink-0"
          >
            {requesting ? 'Requesting…' : 'Request ($3)'}
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-primary-dark mb-1.5">Note (optional)</label>
          <input
            className={inputCls}
            placeholder="e.g. need Lagos number"
            value={reqNote}
            onChange={(e) => setReqNote(e.target.value)}
          />
        </div>
        {reqError && <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">{reqError}</div>}
      </div>

      {/* Request history */}
      <div className="bg-white rounded-2xl border border-cream-dark p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-primary-dark">Request history</p>
          <button
            onClick={loadRequests}
            className="text-xs text-primary hover:underline"
            disabled={loadingReqs}
          >
            Refresh
          </button>
        </div>
        {loadingReqs ? (
          <p className="text-sm text-primary-warm">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-primary-warm">No requests yet.</p>
        ) : (
          <div className="space-y-3">
            {requests.slice(0, 10).map((r) => (
              <div key={r.id} className="p-4 rounded-xl border border-cream-dark bg-cream-light">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-primary-dark">
                      {r.quantity} number{r.quantity !== 1 ? 's' : ''} · ${r.amountUsd} each
                    </p>
                    <p className="text-xs text-primary-warm mt-1">
                      Status: {r.status} · {new Date(r.createdAt).toLocaleString()}
                    </p>
                    {r.note ? <p className="text-xs text-primary-warm mt-2">{r.note}</p> : null}
                  </div>
                  <a
                    href={r.checkoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-primary text-cream-light px-3 py-2 rounded-xl text-xs font-medium hover:bg-primary-dark transition-colors flex-shrink-0"
                  >
                    Checkout
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How calls work banner */}
      <div className="bg-primary/5 border border-primary/15 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-semibold text-primary uppercase tracking-wide">How calls work</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { icon: '📞', label: 'Customer calls', sub: 'your business number' },
            { icon: '↪️', label: 'Call forwards', sub: 'to your AI line' },
            { icon: '🤖', label: 'AI agent answers', sub: '24/7, instantly' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-xl p-3 border border-primary/10">
              <div className="text-xl mb-1">{s.icon}</div>
              <p className="text-xs font-medium text-primary-dark">{s.label}</p>
              <p className="text-xs text-primary-warm">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-cream rounded-xl p-1">
        {(['call-line', 'business'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab ? 'bg-white text-primary-dark shadow-sm' : 'text-primary-warm hover:text-primary-dark'}`}
          >
            {tab === 'call-line' ? `🤖 AI Call Line (${callLineNumbers.length})` : `📱 Business Numbers (${businessNumbers.length})`}
          </button>
        ))}
      </div>

      {/* ── AI CALL LINE TAB ── */}
      {activeTab === 'call-line' && (
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-primary-dark">AI Call Line</p>
              <p className="text-xs text-primary-warm mt-0.5">This is the number your AI agent listens on. Customers call or forward here.</p>
            </div>
            {!showVirtualForm && (
              <button
                onClick={() => setShowVirtualForm(true)}
                className="flex-shrink-0 bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Get number
              </button>
            )}
          </div>

          {/* Virtual number form */}
          {showVirtualForm && (
            <div className="bg-white rounded-2xl border-2 border-primary/20 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-primary-dark text-sm">Get a virtual AI number</p>
                <button onClick={resetVirtualForm} className="text-primary-warm hover:text-primary-dark">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {virtualStep === 'idle' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-primary-dark mb-1.5">Country</label>
                    <select value={countryCode} onChange={e => setCountryCode(e.target.value)} className={inputCls}>
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
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Searching available numbers…
                </div>
              )}

              {virtualStep === 'selecting' && (
                <div className="space-y-3">
                  <p className="text-xs text-primary-warm">Select a number:</p>
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {availableNumbers.length === 0 && (
                      <p className="text-sm text-primary-warm py-4 text-center">No numbers available for this country right now.</p>
                    )}
                    {availableNumbers.map(n => (
                      <button
                        key={n.numberKey}
                        onClick={() => setSelectedNumber(n)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${selectedNumber?.numberKey === n.numberKey ? 'border-primary bg-primary/5' : 'border-cream-dark hover:border-primary/40'}`}
                      >
                        <div>
                          <p className="font-mono font-medium text-primary-dark text-sm">{n.number}</p>
                          <p className="text-xs text-primary-warm">{n.type} · {n.country}</p>
                        </div>
                        <span className="text-xs font-semibold text-primary">{n.currency} {n.pricePerMonth}/mo</span>
                      </button>
                    ))}
                  </div>
                  {selectedNumber && (
                    <div className="border-t border-cream-dark pt-3 space-y-3">
                      <input type="text" className={inputCls} placeholder="Label (e.g. Main AI line)" value={virtualLabel} onChange={e => setVirtualLabel(e.target.value)} />
                      <button onClick={buyNumber} className="w-full bg-primary text-cream-light py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors">
                        Purchase {selectedNumber.number}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {virtualStep === 'buying' && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-primary-warm">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Activating your number…
                </div>
              )}

              {virtualError && <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{virtualError}</p>}
            </div>
          )}

          {/* Call line list */}
          {loadingNums ? (
            <div className="bg-white rounded-2xl border border-cream-dark p-4 animate-pulse flex gap-3 items-center">
              <div className="w-10 h-10 rounded-xl bg-cream" />
              <div className="flex-1 space-y-2"><div className="h-4 bg-cream rounded w-40" /><div className="h-3 bg-cream rounded w-32" /></div>
            </div>
          ) : callLineNumbers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-cream-dark p-8 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
              </div>
              <p className="text-sm font-medium text-primary-dark">No AI call line yet</p>
              <p className="text-xs text-primary-warm max-w-xs mx-auto">Get a virtual number so your AI agent can start answering calls.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {callLineNumbers.map(n => (
                <div key={n.id} className="bg-white rounded-2xl border border-primary/20 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono font-semibold text-primary-dark">{n.number}</p>
                      <p className="text-xs text-primary-warm">{n.label ?? 'AI Call Line'} · {n.provider ?? 'Virtual'}</p>
                    </div>
                    <span className="text-xs font-medium bg-success/10 text-success px-2.5 py-1 rounded-full">Active</span>
                    <button onClick={() => deleteNumber(n.id)} disabled={deletingId === n.id} className="p-1.5 rounded-lg text-primary-warm hover:text-danger hover:bg-danger/5 transition-colors disabled:opacity-40">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                    </button>
                  </div>
                  {/* Forwarding setup guide */}
                  <div className="border border-primary/15 rounded-xl overflow-hidden">
                    <div className="bg-primary/5 px-4 py-2.5 flex items-center gap-2 border-b border-primary/10">
                      <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9.75h4.875a2.625 2.625 0 010 5.25H12M8.25 9.75L10.5 7.5M8.25 9.75L10.5 12m9-7.243V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185z" /></svg>
                      <p className="text-xs font-semibold text-primary">Set up call forwarding on your SIM</p>
                    </div>
                    <div className="p-4 space-y-4 bg-white">
                      {/* Step 1 — pick carrier */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-primary-dark flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-primary text-cream-light flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
                          Select your network carrier
                        </p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {(Object.entries(FORWARDING_CODES) as [Carrier, typeof FORWARDING_CODES[Carrier]][]).map(([key, { label }]) => (
                            <button
                              key={key}
                              onClick={() => setSelectedCarrier(key)}
                              className={`py-1.5 rounded-lg text-xs font-medium transition-all border ${selectedCarrier === key ? 'bg-primary text-cream-light border-primary' : 'border-cream-dark text-primary-warm hover:border-primary/40 hover:text-primary-dark'}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Step 2 — dial the code */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-primary-dark flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-primary text-cream-light flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span>
                          Open your phone dialer and type this code
                        </p>
                        <div className="flex items-center gap-2 bg-cream-light rounded-xl px-4 py-3 border border-cream-dark">
                          <code className="flex-1 text-lg font-mono font-bold text-primary-dark tracking-wider">
                            {FORWARDING_CODES[selectedCarrier].code(n.number)}
                          </code>
                          <button
                            onClick={() => copyCode(FORWARDING_CODES[selectedCarrier].code(n.number), `${n.id}-${selectedCarrier}`)}
                            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${copied === `${n.id}-${selectedCarrier}` ? 'bg-success/10 text-success' : 'bg-white border border-cream-dark text-primary-warm hover:text-primary-dark hover:border-primary/30'}`}
                          >
                            {copied === `${n.id}-${selectedCarrier}` ? (
                              <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>Copied</>
                            ) : (
                              <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>Copy</>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Step 3 — press call */}
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-primary-dark flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-primary text-cream-light flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</span>
                          Press the green call button
                        </p>
                        <p className="text-xs text-primary-warm pl-6.5">You&apos;ll hear a confirmation tone or message from your carrier when forwarding is active.</p>
                      </div>

                      {/* To cancel */}
                      <div className="pt-1 border-t border-cream-dark">
                        <p className="text-xs text-primary-warm">
                          To cancel forwarding later, dial{' '}
                          <code className="font-mono text-primary-dark bg-cream px-1 py-0.5 rounded">
                            {selectedCarrier === 'mtn' ? '##21#' : selectedCarrier === 'airtel' ? '##21#' : '#62#'}
                          </code>{' '}
                          from your SIM.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Test call instructions */}
          {callLineNumbers.length > 0 && (
            <div className="bg-white border border-cream-dark rounded-2xl p-4 space-y-3">
              <p className="text-xs font-semibold text-primary-dark uppercase tracking-wide">Test your setup</p>
              <div className="space-y-2 text-xs text-primary-warm">
                <div className="flex gap-2">
                  <span className="bg-primary text-cream-light rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-xs font-bold">1</span>
                  <p>Call <span className="font-mono font-medium text-primary-dark">{callLineNumbers[0]?.number}</span> directly from any phone</p>
                </div>
                <div className="flex gap-2">
                  <span className="bg-primary text-cream-light rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-xs font-bold">2</span>
                  <p>Your AI agent should answer with the greeting you set in <strong className="text-primary-dark">Agent Settings</strong></p>
                </div>
                <div className="flex gap-2">
                  <span className="bg-primary text-cream-light rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-xs font-bold">3</span>
                  <p>After the call, check the <strong className="text-primary-dark">Calls</strong> page for the recording and transcript</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BUSINESS NUMBERS TAB ── */}
      {activeTab === 'business' && (
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-primary-dark">Business Numbers</p>
              <p className="text-xs text-primary-warm mt-0.5">Your real phone numbers — used for WhatsApp and caller ID. Set up forwarding to your AI line for calls.</p>
            </div>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex-shrink-0 border border-cream-dark text-primary-dark px-4 py-2 rounded-xl text-sm font-medium hover:bg-cream transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Add number
              </button>
            )}
          </div>

          {/* Note about calls */}
          <div className="flex gap-2 p-3 bg-warning/5 border border-warning/20 rounded-xl">
            <svg className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            <p className="text-xs text-primary-warm">These numbers do <strong className="text-primary-dark">not</strong> receive calls directly. To route calls through AI, set up forwarding from this number to your AI Call Line.</p>
          </div>

          {/* Add form */}
          {showAddForm && (
            <div className="bg-white rounded-2xl border-2 border-cream-dark p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-primary-dark text-sm">Verify your business number</p>
                <button onClick={resetAddForm} className="text-primary-warm hover:text-primary-dark">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-primary-dark mb-1.5">Phone number</label>
                  <input type="tel" className={inputCls} placeholder="+2348012345678" value={inputNumber} onChange={e => setInputNumber(e.target.value)} disabled={step !== 'idle'} />
                  <p className="mt-1 text-xs text-primary-warm">A 6-digit SMS code will be sent to verify you own this number.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-primary-dark mb-1.5">Label <span className="text-primary-warm font-normal">(optional)</span></label>
                  <input type="text" className={inputCls} placeholder="e.g. Main line" value={inputLabel} onChange={e => setInputLabel(e.target.value)} disabled={step !== 'idle'} />
                </div>
                {step === 'idle' && (
                  <button onClick={sendOtp} disabled={!inputNumber.trim()} className="w-full bg-primary text-cream-light py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50">
                    Send verification code
                  </button>
                )}
                {step === 'sending' && (
                  <div className="flex items-center justify-center gap-2 py-2 text-sm text-primary-warm">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Sending SMS…
                  </div>
                )}
              </div>
              {(step === 'awaiting_code' || step === 'verifying') && (
                <div className="border-t border-cream-dark pt-4 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-primary-dark">Enter code sent to {inputNumber}</label>
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
                    <button onClick={() => { setStep('idle'); setCode(''); setError(''); }} className="text-xs text-primary-warm hover:text-primary-dark">Change number</button>
                    <button onClick={sendOtp} disabled={cooldown > 0} className="text-xs text-primary hover:underline disabled:text-primary-warm disabled:no-underline">{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}</button>
                  </div>
                </div>
              )}
              {step === 'done' && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-success/5 border border-success/20">
                  <svg className="w-5 h-5 text-success flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  <p className="text-sm font-semibold text-primary-dark">Number verified!</p>
                </div>
              )}
              {error && <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{error}</p>}
            </div>
          )}

          {/* Business numbers list */}
          {!loadingNums && businessNumbers.length === 0 && !showAddForm && (
            <div className="bg-white rounded-2xl border border-dashed border-cream-dark p-8 text-center space-y-2">
              <p className="text-sm font-medium text-primary-dark">No business numbers yet</p>
              <p className="text-xs text-primary-warm">Add your real business number for WhatsApp and caller ID.</p>
            </div>
          )}
          <div className="space-y-3">
            {businessNumbers.map(n => (
              <div key={n.id} className="bg-white rounded-2xl border border-cream-dark p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${n.verified ? 'bg-success/10' : 'bg-warning/10'}`}>
                  <svg className={`w-5 h-5 ${n.verified ? 'text-success' : 'text-warning'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-medium text-primary-dark">{n.number}</p>
                  <p className="text-xs text-primary-warm">{n.label ?? 'Business number'}</p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${n.verified ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                  {n.verified ? 'Verified' : 'Unverified'}
                </span>
                <button onClick={() => deleteNumber(n.id)} disabled={deletingId === n.id} className="p-1.5 rounded-lg text-primary-warm hover:text-danger hover:bg-danger/5 transition-colors disabled:opacity-40">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
