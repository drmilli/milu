'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

const inputCls = 'w-full px-4 py-3 rounded-xl border border-cream-dark bg-cream text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all text-sm';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // TODO: wire up to /api/v1/auth/forgot-password
    setTimeout(() => {
      setLoading(false);
      setSent(true);
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
            Reset your password.
          </p>
          <p className="text-cream/50 text-sm leading-relaxed">
            Enter your email and we&apos;ll send you a link to get back in.
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

          <AnimatePresence mode="wait">
            {sent ? (
              <motion.div
                key="sent"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-4 space-y-6"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
                  className="w-20 h-20 rounded-full bg-success/10 border-2 border-success/20 flex items-center justify-center mx-auto"
                >
                  <svg className="w-9 h-9 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </motion.div>
                <div>
                  <h1 className="font-heading font-bold text-2xl text-primary-dark mb-2">Check your inbox</h1>
                  <p className="text-sm text-primary-warm leading-relaxed">
                    We sent a reset link to{' '}
                    <span className="font-semibold text-primary-dark">{email}</span>.
                    <br />It expires in 30 minutes.
                  </p>
                </div>
                <div className="bg-cream border border-cream-dark rounded-xl p-4 text-left">
                  <p className="text-xs text-primary-warm leading-relaxed">
                    Didn&apos;t receive it? Check your spam folder, or{' '}
                    <button
                      onClick={() => setSent(false)}
                      className="text-primary underline hover:text-primary-dark"
                    >
                      try a different email
                    </button>.
                  </p>
                </div>
                <Link
                  href="/login"
                  className="block w-full text-center bg-primary text-cream-light py-3.5 rounded-full font-medium text-sm hover:bg-primary-dark transition-colors"
                >
                  Back to log in
                </Link>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="mb-8">
                  <h1 className="font-heading font-bold text-2xl text-primary-dark mb-1">Forgot your password?</h1>
                  <p className="text-sm text-primary-warm">
                    Enter your email and we&apos;ll send you a reset link.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-primary-dark mb-1.5">Email</label>
                    <input
                      type="email"
                      required
                      className={inputCls}
                      placeholder="amaka@yourbusiness.ng"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="w-full bg-primary text-cream-light py-3.5 rounded-full font-medium text-sm hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                  >
                    {loading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Sending…
                      </>
                    ) : 'Send reset link'}
                  </button>
                </form>

                <p className="mt-6 text-sm text-center text-primary-warm">
                  Remember it?{' '}
                  <Link href="/login" className="text-primary underline hover:text-primary-dark">Back to log in</Link>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
