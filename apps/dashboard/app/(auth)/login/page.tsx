'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

const inputCls = 'w-full px-4 py-3 rounded-xl border border-cream-dark bg-cream text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all text-sm';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    // TODO: wire up to /api/v1/auth/login
    setTimeout(() => {
      setLoading(false);
      setError('Invalid email or password.');
    }, 1000);
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-shrink-0 bg-primary-dark flex-col justify-between p-12">
        <Link href="/" aria-label="Milu home">
          <img src="/brand/wordmark.svg" alt="milu." className="h-8 w-auto" />
        </Link>
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
          <Link href="/" className="lg:hidden inline-block mb-8" aria-label="Milu home">
            <img src="/brand/wordmark-dark.svg" alt="milu." className="h-7 w-auto" />
          </Link>

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
              <input type="password" required className={inputCls} placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} />
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
            <a href="http://localhost:3003/legal/terms" className="underline hover:text-primary">Terms</a>
            {' '}and{' '}
            <a href="http://localhost:3003/legal/privacy" className="underline hover:text-primary">Privacy Policy</a>.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
