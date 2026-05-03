'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { AnimateIn } from '../../components/AnimateIn';
import Link from 'next/link';

const channels = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
    label: 'Email',
    value: 'dev@miluai.app',
    href: 'mailto:dev@miluai.app',
    note: 'We reply within 24 hours',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
    label: 'WhatsApp',
    value: '+2349157760803',
    href: 'https://wa.me/2349157760803',
    note: 'Mon – Fri, 9am – 6pm WAT',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
    label: 'Office',
    value: 'Lagos, Nigeria',
    href: null,
    note: 'Remote-first team',
  },
];

const reasons = [
  { value: 'demo', label: 'Request a demo' },
  { value: 'sales', label: 'Talk to sales' },
  { value: 'support', label: 'Technical support' },
  { value: 'partnership', label: 'Partnership inquiry' },
  { value: 'press', label: 'Press / media' },
  { value: 'other', label: 'Something else' },
];

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    businessName: '',
    reason: 'demo',
    message: '',
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
      const res = await fetch(`${API_URL}/api/v1/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          businessName: form.businessName.trim() || undefined,
          reason: form.reason,
          message: form.message.trim(),
          pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
        throw new Error(msg);
      }

      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="pt-24">
      {/* Hero */}
      <section className="py-20 px-6 md:px-10 bg-cream">
        <AnimateIn className="max-w-3xl">
          <p className="text-sm font-medium text-primary-warm uppercase tracking-widest mb-4">Contact</p>
          <h1 className="font-heading font-bold text-5xl md:text-6xl text-primary-dark mb-6 leading-tight">
            Let&apos;s talk
          </h1>
          <p className="text-lg text-primary-warm">
            Whether you&apos;re ready to start, have a question, or just want to see a live demo — we&apos;d love to hear from you.
          </p>
        </AnimateIn>
      </section>

      {/* Content */}
      <section className="py-16 px-6 md:px-10 bg-cream-light">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12">

          {/* Left — contact channels + team */}
          <AnimateIn direction="left">
            <div className="space-y-6 mb-12">
              {channels.map((c) => (
                <div key={c.label} className="flex items-start gap-4 p-5 bg-cream rounded-2xl border border-cream-dark">
                  <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center text-primary flex-shrink-0">
                    {c.icon}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-primary-warm uppercase tracking-wider mb-0.5">{c.label}</p>
                    {c.href ? (
                      <a href={c.href} className="font-semibold text-primary-dark hover:text-primary transition-colors">
                        {c.value}
                      </a>
                    ) : (
                      <p className="font-semibold text-primary-dark">{c.value}</p>
                    )}
                    <p className="text-xs text-primary-warm mt-0.5">{c.note}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Team quick links */}
            <div className="p-6 bg-cream rounded-2xl border border-cream-dark">
              <p className="font-semibold text-primary-dark mb-5">Talk directly to the team</p>
              <div className="space-y-4">
                {[
                  { initials: 'AO', role: 'CEO / CTO', email: 'ceo@miluai.app', note: 'Product, technical & investor inquiries' },
                  { initials: 'TI', role: 'CMO / COO', email: 'ops@miluai.app', note: 'Partnerships & press' },
                  { initials: 'NK', role: 'Head of Sales', email: 'sales@miluai.app', note: 'Pricing, demos & enterprise' },
                ].map((m) => (
                  <div key={m.role} className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/15 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                      {m.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-primary-dark text-sm">{m.role}</p>
                      <a href={`mailto:${m.email}`} className="text-xs text-primary hover:underline">{m.email}</a>
                      <p className="text-xs text-primary-warm">{m.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </AnimateIn>

          {/* Right — form */}
          <AnimateIn direction="right">
            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-cream border border-cream-dark rounded-3xl p-10 text-center flex flex-col items-center justify-center h-full"
              >
                <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mb-5">
                  <svg className="w-7 h-7 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h3 className="font-heading font-bold text-2xl text-primary-dark mb-3">Message sent</h3>
                <p className="text-primary-warm text-sm leading-relaxed max-w-xs">
                  Thanks for reaching out. We&apos;ll get back to you within 24 hours.
                </p>
              </motion.div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="bg-cream border border-cream-dark rounded-3xl p-8 space-y-5"
              >
                {error && (
                  <div className="bg-danger/10 border border-danger/20 text-danger rounded-2xl px-4 py-3 text-sm">
                    {error}
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-primary-dark mb-1.5">First name</label>
                    <input
                      required
                      type="text"
                      className="w-full px-4 py-3 rounded-xl border border-cream-dark bg-cream-light text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all text-sm"
                      placeholder="Amaka"
                      value={form.firstName}
                      onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary-dark mb-1.5">Last name</label>
                    <input
                      required
                      type="text"
                      className="w-full px-4 py-3 rounded-xl border border-cream-dark bg-cream-light text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all text-sm"
                      placeholder="Okonkwo"
                      value={form.lastName}
                      onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-primary-dark mb-1.5">Work email</label>
                  <input
                    required
                    type="email"
                    className="w-full px-4 py-3 rounded-xl border border-cream-dark bg-cream-light text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all text-sm"
                    placeholder="amaka@yourbusiness.ng"
                    value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-primary-dark mb-1.5">Business name</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 rounded-xl border border-cream-dark bg-cream-light text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all text-sm"
                    placeholder="QuickDelivery NG"
                    value={form.businessName}
                    onChange={(e) => setForm(f => ({ ...f, businessName: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-primary-dark mb-1.5">How can we help?</label>
                  <select
                    className="w-full px-4 py-3 rounded-xl border border-cream-dark bg-cream-light text-primary-dark focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all text-sm appearance-none"
                    value={form.reason}
                    onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))}
                  >
                    {reasons.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-primary-dark mb-1.5">Message</label>
                  <textarea
                    required
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-cream-dark bg-cream-light text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all text-sm resize-none"
                    placeholder="Tell us a bit about your business and what you need..."
                    value={form.message}
                    onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-cream-light py-3.5 rounded-full font-medium text-sm hover:bg-primary-dark transition-all duration-200 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Sending...
                    </>
                  ) : 'Send message'}
                </button>

                <p className="text-xs text-center text-primary-warm">
                  By submitting you agree to our{' '}
                  <Link href="/legal/privacy" className="underline hover:text-primary">Privacy Policy</Link>.
                </p>
              </form>
            )}
          </AnimateIn>

        </div>
      </section>
    </main>
  );
}
