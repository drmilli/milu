'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { affiliatePost } from '../../lib/api';
import { saveAffiliateSession, type AffiliateUser } from '../../lib/auth';

type LoginResponse = {
  token: string;
  agent: AffiliateUser;
};

const inputCls = 'w-full px-4 py-3 rounded-xl border border-cream-dark bg-cream text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all text-sm';

export default function AffiliateLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await affiliatePost<LoginResponse>('/affiliate/auth/login', { email, password });
      saveAffiliateSession(res.token, res.agent);
      router.replace('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl border border-cream-dark p-6">
        <div className="mb-6">
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Affiliate login</h1>
          <p className="text-sm text-primary-warm mt-1">Sign in to your agent dashboard.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-primary-dark mb-1.5">Email</label>
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-dark mb-1.5">Password</label>
            <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          {error && <div className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-xl px-4 py-3">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-cream-light py-3.5 rounded-full font-medium text-sm hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-sm text-center text-primary-warm">
          New agent? <Link href="/signup" className="text-primary underline hover:text-primary-dark">Create account</Link>
        </p>
      </div>
    </div>
  );
}

