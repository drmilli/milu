'use client';

import { useState, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { apiGet, apiPost, apiPut } from '../../../lib/api';
import { saveSession } from '../../../lib/auth';
import type { StoredUser } from '../../../lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  // Step 1
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  password: string;
  confirmPassword: string;
  // Step 2 (verify email)
  verificationCode: string;
  // Step 3
  businessName: string;
  industry: string;
  weekdays: string;
  saturday: string;
  sunday: string;
  // Step 4
  faqs: { question: string; answer: string }[];
  // Step 5
  phoneNumber: string;
  phoneOption: 'existing' | 'new';
  // Step 6
  voiceStyle: string;
  agentTone: string;
}

const INITIAL: FormData = {
  firstName: '', lastName: '', email: '', contactNumber: '', password: '', confirmPassword: '',
  verificationCode: '',
  businessName: '', industry: '', weekdays: '8:00 AM – 8:00 PM', saturday: '9:00 AM – 6:00 PM', sunday: 'Closed',
  faqs: [{ question: '', answer: '' }],
  phoneNumber: '', phoneOption: 'existing',
  voiceStyle: 'professional', agentTone: 'friendly',
};

const STEPS = [
  { number: 1, label: 'Account' },
  { number: 2, label: 'Verify email' },
  { number: 3, label: 'Business' },
  { number: 4, label: 'Knowledge base' },
  { number: 5, label: 'Phone number' },
  { number: 6, label: 'Agent setup' },
];

const INDUSTRIES = [
  'Logistics & delivery', 'Restaurant & food', 'Retail & e-commerce',
  'Healthcare & pharmacy', 'Beauty & wellness', 'Finance & fintech',
  'Real estate', 'Education', 'Other',
];

const VOICES = [
  { id: 'professional', label: 'Professional', desc: 'Clear, neutral, business-like' },
  { id: 'warm', label: 'Warm', desc: 'Friendly, approachable, conversational' },
  { id: 'energetic', label: 'Energetic', desc: 'Upbeat, confident, engaging' },
];

const TONES = [
  { id: 'friendly', label: 'Friendly & helpful' },
  { id: 'formal', label: 'Formal & professional' },
  { id: 'concise', label: 'Brief & to the point' },
];

// ─── Shared field component ───────────────────────────────────────────────────

function Field({
  label, id, error, children,
}: {
  label: string; id?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-primary-dark mb-1.5">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

const inputCls = 'w-full px-4 py-3 rounded-xl border border-cream-dark bg-cream text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all text-sm';

function EyeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function Step1({ data, set }: { data: FormData; set: (k: keyof FormData, v: string) => void }) {
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const mismatch = data.confirmPassword.length > 0 && data.password !== data.confirmPassword;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading font-bold text-2xl text-primary-dark mb-1">Create your account</h2>
        <p className="text-sm text-primary-warm">Start your 14-day free trial — no credit card needed.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="First name" id="firstName">
          <input id="firstName" className={inputCls} placeholder="Amaka" value={data.firstName}
            onChange={e => set('firstName', e.target.value)} />
        </Field>
        <Field label="Last name" id="lastName">
          <input id="lastName" className={inputCls} placeholder="Okonkwo" value={data.lastName}
            onChange={e => set('lastName', e.target.value)} />
        </Field>
      </div>
      <Field label="Work email" id="email">
        <input id="email" type="email" className={inputCls} placeholder="amaka@yourbusiness.ng"
          value={data.email} onChange={e => set('email', e.target.value)} />
      </Field>
      <Field label="Contact number" id="contactNumber">
        <input id="contactNumber" className={inputCls} placeholder="+234 801 234 5678"
          value={data.contactNumber} onChange={e => set('contactNumber', e.target.value)} />
      </Field>
      <Field label="Password" id="password">
        <div className="relative">
          <input
            id="password"
            type={showPw ? 'text' : 'password'}
            className={`${inputCls} pr-11`}
            placeholder="At least 8 characters"
            value={data.password}
            onChange={e => set('password', e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPw(v => !v)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-primary-warm hover:text-primary-dark transition-colors"
          >
            {showPw ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </Field>
      <Field label="Confirm password" id="confirmPassword" error={mismatch ? "Passwords don't match" : undefined}>
        <div className="relative">
          <input
            id="confirmPassword"
            type={showConfirm ? 'text' : 'password'}
            className={`${inputCls} pr-11 ${mismatch ? 'border-danger/60 focus:border-danger/60 focus:ring-danger/10' : ''}`}
            placeholder="Repeat your password"
            value={data.confirmPassword}
            onChange={e => set('confirmPassword', e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowConfirm(v => !v)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-primary-warm hover:text-primary-dark transition-colors"
          >
            {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </Field>
      <p className="text-xs text-primary-warm">
        Already have an account?{' '}
        <Link href="/login" className="text-primary underline hover:text-primary-dark">Log in</Link>
      </p>
    </div>
  );
}

function StepVerify({
  data, set, onResend,
}: {
  data: FormData;
  set: (k: keyof FormData, v: string) => void;
  onResend: () => void;
}) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null, null, null]);
  const [resent, setResent] = useState(false);

  function handleDigit(i: number, val: string) {
    const v = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    set('verificationCode', next.join(''));
    if (v && i < 5) inputRefs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = ['', '', '', '', '', ''];
    pasted.split('').forEach((ch, i) => { next[i] = ch; });
    setDigits(next);
    set('verificationCode', next.join(''));
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
  }

  async function handleResend() {
    onResend();
    setResent(true);
    setTimeout(() => setResent(false), 30000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-2xl text-primary-dark mb-1">Check your email</h2>
        <p className="text-sm text-primary-warm leading-relaxed">
          We sent a 6-digit code to{' '}
          <span className="font-semibold text-primary-dark">{data.email}</span>.
          <br />Enter it below to verify your address.
        </p>
      </div>

      <div className="flex gap-2 justify-center py-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={el => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={e => handleDigit(i, e.target.value)}
            onKeyDown={e => handleKeyDown(i, e)}
            onPaste={handlePaste}
            autoFocus={i === 0}
            className={`w-12 h-14 text-center text-2xl font-bold rounded-xl border-2 bg-cream text-primary-dark focus:outline-none transition-all ${
              d ? 'border-primary bg-primary/5' : 'border-cream-dark'
            } focus:border-primary focus:ring-2 focus:ring-primary/10`}
          />
        ))}
      </div>

      <p className="text-xs text-center text-primary-warm">
        {resent ? (
          <span className="text-success font-medium">Code resent — check your inbox.</span>
        ) : (
          <>
            Didn&apos;t receive the code?{' '}
            <button type="button" onClick={handleResend}
              className="text-primary underline hover:text-primary-dark font-medium">
              Resend code
            </button>
          </>
        )}
      </p>
    </div>
  );
}

function StepBusiness({ data, set }: { data: FormData; set: (k: keyof FormData, v: string) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading font-bold text-2xl text-primary-dark mb-1">Your business</h2>
        <p className="text-sm text-primary-warm">This helps us personalise your agent.</p>
      </div>
      <Field label="Business name" id="businessName">
        <input id="businessName" className={inputCls} placeholder="QuickDelivery NG"
          value={data.businessName} onChange={e => set('businessName', e.target.value)} />
      </Field>
      <Field label="Industry" id="industry">
        <select id="industry" className={inputCls} value={data.industry}
          onChange={e => set('industry', e.target.value)}>
          <option value="">Select your industry</option>
          {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
      </Field>
      <div>
        <p className="text-sm font-medium text-primary-dark mb-3">Operating hours</p>
        <div className="space-y-3">
          {[
            { key: 'weekdays', label: 'Mon – Fri' },
            { key: 'saturday', label: 'Saturday' },
            { key: 'sunday', label: 'Sunday' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-sm text-primary-warm w-20 flex-shrink-0">{label}</span>
              <input className={`${inputCls} flex-1`} value={data[key as keyof FormData] as string}
                onChange={e => set(key as keyof FormData, e.target.value)}
                placeholder="Closed" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepKnowledge({ data, setFaq, addFaq, removeFaq }: {
  data: FormData;
  setFaq: (i: number, k: 'question' | 'answer', v: string) => void;
  addFaq: () => void;
  removeFaq: (i: number) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading font-bold text-2xl text-primary-dark mb-1">Knowledge base</h2>
        <p className="text-sm text-primary-warm">
          Add the FAQs your agent will answer. You can add more from the dashboard later.
        </p>
      </div>
      <div className="space-y-4">
        {data.faqs.map((faq, i) => (
          <div key={i} className="bg-cream border border-cream-dark rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-primary-warm uppercase tracking-wider">
                FAQ {i + 1}
              </span>
              {data.faqs.length > 1 && (
                <button onClick={() => removeFaq(i)}
                  className="text-xs text-danger hover:text-danger/80 transition-colors">
                  Remove
                </button>
              )}
            </div>
            <input className={inputCls} placeholder="e.g. How much does delivery to Lekki cost?"
              value={faq.question} onChange={e => setFaq(i, 'question', e.target.value)} />
            <textarea className={`${inputCls} resize-none`} rows={2}
              placeholder="e.g. Delivery to Lekki Phase 1 and 2 is ₦4,500."
              value={faq.answer} onChange={e => setFaq(i, 'answer', e.target.value)} />
          </div>
        ))}
      </div>
      {data.faqs.length < 8 && (
        <button onClick={addFaq}
          className="flex items-center gap-2 text-sm text-primary hover:text-primary-dark transition-colors font-medium">
          <span className="w-6 h-6 rounded-full border border-primary/30 flex items-center justify-center text-lg leading-none">+</span>
          Add another FAQ
        </button>
      )}
    </div>
  );
}

function StepPhone({ data, set }: { data: FormData; set: (k: keyof FormData, v: string) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading font-bold text-2xl text-primary-dark mb-1">Phone number</h2>
        <p className="text-sm text-primary-warm">Connect the number your customers call.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { id: 'existing', label: 'Use existing number', desc: "Link a number you already own" },
          { id: 'new', label: 'Get a new number', desc: "We'll provision one for you" },
        ].map(opt => (
          <button key={opt.id} onClick={() => set('phoneOption', opt.id)}
            className={`text-left p-4 rounded-xl border-2 transition-all ${
              data.phoneOption === opt.id
                ? 'border-primary bg-primary/5'
                : 'border-cream-dark bg-cream hover:border-primary/30'
            }`}>
            <p className="font-semibold text-sm text-primary-dark mb-1">{opt.label}</p>
            <p className="text-xs text-primary-warm">{opt.desc}</p>
          </button>
        ))}
      </div>

      {data.phoneOption === 'existing' ? (
        <Field label="Your phone number" id="phoneNumber">
          <input id="phoneNumber" className={inputCls} placeholder="+234 801 234 5678"
            value={data.phoneNumber} onChange={e => set('phoneNumber', e.target.value)} />
          <p className="mt-1.5 text-xs text-primary-warm">
            You&apos;ll verify ownership via SMS from your dashboard after setup.
          </p>
        </Field>
      ) : (
        <div className="bg-cream border border-cream-dark rounded-xl p-4">
          <p className="text-sm text-primary-warm leading-relaxed">
            We&apos;ll provision a local Nigerian number for you after setup. You&apos;ll be able to choose
            your area code from the dashboard.
          </p>
        </div>
      )}
    </div>
  );
}

function StepAgent({ data, set }: { data: FormData; set: (k: keyof FormData, v: string) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-2xl text-primary-dark mb-1">Configure your agent</h2>
        <p className="text-sm text-primary-warm">Choose how your AI agent sounds and speaks.</p>
      </div>

      <div>
        <p className="text-sm font-medium text-primary-dark mb-3">Voice style</p>
        <div className="space-y-2.5">
          {VOICES.map(v => (
            <button key={v.id} onClick={() => set('voiceStyle', v.id)}
              className={`w-full text-left px-4 py-3.5 rounded-xl border-2 flex items-center gap-3 transition-all ${
                data.voiceStyle === v.id
                  ? 'border-primary bg-primary/5'
                  : 'border-cream-dark bg-cream hover:border-primary/30'
              }`}>
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                data.voiceStyle === v.id ? 'border-primary bg-primary' : 'border-cream-dark'
              }`} />
              <div>
                <p className="font-semibold text-sm text-primary-dark">{v.label}</p>
                <p className="text-xs text-primary-warm">{v.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-primary-dark mb-3">Conversation tone</p>
        <div className="flex flex-wrap gap-2.5">
          {TONES.map(t => (
            <button key={t.id} onClick={() => set('agentTone', t.id)}
              className={`px-4 py-2 rounded-full text-sm border-2 font-medium transition-all ${
                data.agentTone === t.id
                  ? 'border-primary bg-primary text-cream-light'
                  : 'border-cream-dark text-primary-warm hover:border-primary/40'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-cream border border-cream-dark rounded-xl p-4">
        <p className="text-xs font-medium text-primary-dark mb-1">Agent preview</p>
        <p className="text-sm text-primary-warm italic">
          &ldquo;Hello, thank you for calling {data.businessName || 'your business'}. How can I help you today?&rdquo;
        </p>
      </div>
    </div>
  );
}

function Done({ data }: { data: FormData }) {
  return (
    <div className="text-center py-4 space-y-6">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="w-20 h-20 rounded-full bg-success/10 border-2 border-success/20 flex items-center justify-center mx-auto"
      >
        <svg className="w-9 h-9 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </motion.div>
      <div>
        <h2 className="font-heading font-bold text-3xl text-primary-dark mb-2">
          You&apos;re all set, {data.firstName}!
        </h2>
        <p className="text-primary-warm">
          {data.businessName} is ready to start answering calls.
        </p>
      </div>
      <div className="bg-cream border border-cream-dark rounded-2xl p-5 text-left space-y-3">
        {[
          { label: 'Business', value: data.businessName },
          { label: 'Phone', value: data.phoneOption === 'new' ? 'Provisioning your number…' : data.phoneNumber },
          { label: 'Voice', value: VOICES.find(v => v.id === data.voiceStyle)?.label ?? '' },
          { label: 'FAQs loaded', value: `${data.faqs.filter(f => f.question).length} questions` },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between text-sm">
            <span className="text-primary-warm">{row.label}</span>
            <span className="font-medium text-primary-dark">{row.value}</span>
          </div>
        ))}
      </div>
      <Link href="/overview"
        className="block w-full bg-primary text-cream-light py-3.5 rounded-full font-medium text-sm hover:bg-primary-dark transition-colors">
        Go to dashboard
      </Link>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex-1 h-1 rounded-full overflow-hidden bg-cream-dark">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: i < current ? '100%' : '0%' }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          />
        </div>
      ))}
      <span className="text-xs text-primary-warm flex-shrink-0 ml-1">
        {current}/{total}
      </span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -48 : 48, opacity: 0 }),
};

function RegisterPageInner() {
  const searchParams = useSearchParams();
  const referralCode = searchParams.get('ref') ?? undefined;
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [data, setData] = useState<FormData>(INITIAL);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Stored after successful register call
  const [token, setToken] = useState('');
  const [businessId, setBusinessId] = useState('');

  const TOTAL = STEPS.length;

  function set(k: keyof FormData, v: string) {
    setData(prev => ({ ...prev, [k]: v }));
  }

  function setFaq(i: number, k: 'question' | 'answer', v: string) {
    setData(prev => {
      const faqs = [...prev.faqs];
      faqs[i] = { ...faqs[i], [k]: v };
      return { ...prev, faqs };
    });
  }

  function addFaq() {
    setData(prev => ({ ...prev, faqs: [...prev.faqs, { question: '', answer: '' }] }));
  }

  function removeFaq(i: number) {
    setData(prev => ({ ...prev, faqs: prev.faqs.filter((_, idx) => idx !== i) }));
  }

  async function handleResend() {
    try {
      await apiPost('/auth/resend-verification', { email: data.email });
    } catch {
      // silently fail — UI still shows "Code resent"
    }
  }

  async function next() {
    setError('');

    // ── Step 1: register ────────────────────────────────────────────────────
    if (step === 1) {
      setLoading(true);
      try {
        const res = await apiPost<{ token: string; businessId: string }>(
          '/auth/register',
          {
            email: data.email,
            password: data.password,
            businessName: data.businessName || data.firstName + "'s Business",
            contactNumber: data.contactNumber,
            referralCode,
            firstName: data.firstName,
            lastName: data.lastName,
          },
        );
        setToken(res.token);
        setBusinessId(res.businessId);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Registration failed');
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    // ── Step 2: verify email ────────────────────────────────────────────────
    if (step === 2) {
      setLoading(true);
      try {
        await apiPost('/auth/verify-email', { email: data.email, code: data.verificationCode });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Invalid code');
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    // ── Final step: save business profile, KB, and agent config ─────────────
    if (step === TOTAL) {
      setLoading(true);
      try {
        const activeFaqs = data.faqs.filter(f => f.question && f.answer);
        await Promise.all([
          apiPut(`/businesses/${businessId}`, {
            industry: data.industry,
            name: data.businessName,
          }, token),
          apiPut(`/businesses/${businessId}/kb`, {
            operatingHours: {
              weekdays: data.weekdays,
              saturday: data.saturday,
              sunday: data.sunday,
            },
            faqs: activeFaqs,
            voiceId: data.voiceStyle,
          }, token),
        ]);
        // Fetch full user profile and save session
        const me = await apiGet<StoredUser>('/auth/me', token);
        saveSession(token, { ...me, businessName: data.businessName });
        setDone(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Setup failed — please try again');
        setLoading(false);
        return;
      }
      setLoading(false);
      return;
    }

    setDirection(1);
    setStep(s => s + 1);
  }

  function back() {
    if (step > 1) {
      setError('');
      setDirection(-1);
      setStep(s => s - 1);
    }
  }

  function canProceed() {
    if (loading) return false;
    if (step === 1) {
      return (
        data.firstName.trim() &&
        data.email.trim() &&
        data.contactNumber.trim().length > 6 &&
        data.password.length >= 8 &&
        data.password === data.confirmPassword
      );
    }
    if (step === 2) return data.verificationCode.length === 6;
    if (step === 3) return !!(data.businessName.trim() && data.industry);
    if (step === 4) return data.faqs.some(f => f.question && f.answer);
    if (step === 5) return data.phoneOption === 'new' || data.phoneNumber.length > 6;
    return true;
  }

  function renderStep() {
    switch (step) {
      case 1: return <Step1 data={data} set={set} />;
      case 2: return <StepVerify data={data} set={set} onResend={handleResend} />;
      case 3: return <StepBusiness data={data} set={set} />;
      case 4: return <StepKnowledge data={data} setFaq={setFaq} addFaq={addFaq} removeFaq={removeFaq} />;
      case 5: return <StepPhone data={data} set={set} />;
      default: return <StepAgent data={data} set={set} />;
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-shrink-0 bg-primary-dark flex-col justify-between p-12">
        <Link href="/" aria-label="Milu home">
          <img src="/brand/wordmark.svg" alt="milu." className="h-8 w-auto" />
        </Link>

        <div>
          <p className="font-heading font-bold text-4xl text-cream-light leading-snug mb-6">
            Your business phone,<br />on autopilot.
          </p>
          <div className="space-y-4">
            {[
              { text: 'Answer every call, 24/7' },
              { text: 'AI handles FAQs and bookings' },
              { text: 'WhatsApp alerts when you need to step in' },
              { text: 'Full transcripts and analytics' },
            ].map(item => (
              <div key={item.text} className="flex items-center gap-3">
                <svg className="w-4 h-4 text-success/70 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <p className="text-sm text-cream/70">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-cream/30">Built in Nigeria, for Africa · miluai.app</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <Link href="/" className="lg:hidden inline-block mb-8" aria-label="Milu home">
            <img src="/brand/wordmark-dark.svg" alt="milu." className="h-7 w-auto" />
          </Link>

          {!done && <ProgressBar current={step} total={TOTAL} />}

          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={done ? 'done' : step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {done ? <Done data={data} /> : renderStep()}
            </motion.div>
          </AnimatePresence>

          {error && (
            <p className="mt-4 text-sm text-danger bg-danger/5 border border-danger/20 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          {!done && (
            <div className={`flex mt-8 gap-3 ${step > 1 ? 'justify-between' : 'justify-end'}`}>
              {step > 1 && (
                <button onClick={back} disabled={loading}
                  className="px-6 py-3 rounded-full border border-cream-dark text-primary-warm text-sm font-medium hover:border-primary/30 hover:text-primary transition-all disabled:opacity-40">
                  Back
                </button>
              )}
              <button onClick={next} disabled={!canProceed()}
                className="flex-1 sm:flex-none sm:min-w-[160px] bg-primary text-cream-light py-3 px-8 rounded-full text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {loading && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {step === TOTAL ? 'Launch my agent →' : 'Continue'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterPageInner />
    </Suspense>
  );
}
