'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { apiPost } from '../../../lib/api';
import { saveSession } from '../../../lib/auth';
import type { StoredUser } from '../../../lib/auth';

const inputCls = 'w-full px-4 py-3 rounded-xl border border-cream-dark bg-cream text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all text-sm';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiPost<{ token: string; user: StoredUser }>('/auth/login', { email, password });
      saveSession(res.token, res.user, res.user.businessId);
      router.replace('/overview');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-shrink-0 bg-primary-dark flex-col justify-between p-12">
        <a href="https://www.miluai.app" aria-label="Milu home">
          <img src="/brand/wordmark.svg" alt="milu." className="h-8 w-auto" />
        </a>
        <div>
          <p className="font-heading font-bold text-4xl text-cream-light leading-snug mb-4">
            Welcome back.
          </p>
          <p className="text-cream/50 text-sm leading-relaxed">
            Your AI agent has been answering calls while you were away. Log in to review.
          </p>
        </div>
        <p className="text-xs text-cream/30">Built in Nigeria, for Africa · miluai.app</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md"
        >
          <a href="https://www.miluai.app" className="lg:hidden inline-block mb-8" aria-label="Milu home">
            <img src="/brand/wordmark-dark.svg" alt="milu." className="h-7 w-auto" />
          </a>

          <div className="mb-8">
            <h1 className="font-heading font-bold text-2xl text-primary-dark mb-1">Log in to Milu</h1>
            <p className="text-sm text-primary-warm">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-primary underline hover:text-primary-dark">Start for free</Link>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-primary-dark mb-1.5">Email</label>
              <input type="email" required className={inputCls} placeholder="amaka@yourbusiness.ng"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-primary-dark">Password</label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} required className={`${inputCls} pr-11`} placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)} />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-primary-warm hover:text-primary-dark transition-colors"
                >
                  {showPw ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-danger bg-danger/8 border border-danger/20 rounded-xl px-4 py-3"
              >
                {error}
              </motion.p>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-primary text-cream-light py-3.5 rounded-full font-medium text-sm hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2">
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </>
              ) : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-xs text-center text-primary-warm">
            By signing in you agree to our{' '}
            <a href="https://www.miluai.app/legal/terms" className="underline hover:text-primary">Terms</a>
            {' '}and{' '}
            <a href="https://www.miluai.app/legal/privacy" className="underline hover:text-primary">Privacy Policy</a>.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
