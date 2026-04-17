'use client';

import { useState } from 'react';
import Link from 'next/link';

// Mock data — in production, fetched by business ID
const business = {
  id: 'b1',
  name: "Amaka's Boutique",
  owner: 'Amaka Obi',
  email: 'amaka@boutique.ng',
  phone: '+234 803 111 2222',
  plan: 'Growth',
  status: 'active',
  industry: 'Retail & e-commerce',
  joined: '2024-01-15',
  mrr: 45000,
  callsThisMonth: 847,
  callsTotal: 3241,
  resolutionRate: 89,
  escalations: 12,
  agentVoice: 'Warm',
  agentTone: 'Friendly & helpful',
  greeting: 'Hello, thank you for calling Amaka\'s Boutique. How can I help you today?',
  faqCount: 14,
};

const recentCalls = [
  { id: 'c1', caller: '+234 803 444 5555', duration: '1m 32s', status: 'resolved', intent: 'Price enquiry', time: '10 min ago' },
  { id: 'c2', caller: '+234 706 888 9999', duration: '3m 47s', status: 'escalated', intent: 'Return request', time: '42 min ago' },
  { id: 'c3', caller: '+234 812 222 3333', duration: '0m 58s', status: 'resolved', intent: 'Opening hours', time: '1h ago' },
  { id: 'c4', caller: '+234 816 777 8888', duration: '2m 11s', status: 'resolved', intent: 'Order status', time: '2h ago' },
  { id: 'c5', caller: '+234 701 555 6666', duration: '—', status: 'missed', intent: '—', time: '3h ago' },
];

const team = [
  { name: 'Amaka Obi', email: 'amaka@boutique.ng', role: 'Owner' },
  { name: 'Chidi Nwosu', email: 'chidi@boutique.ng', role: 'Admin' },
];

const invoices = [
  { id: 'INV-001', date: '2024-04-01', amount: 45000, status: 'paid' },
  { id: 'INV-002', date: '2024-03-01', amount: 45000, status: 'paid' },
  { id: 'INV-003', date: '2024-02-01', amount: 45000, status: 'paid' },
];

const statusColors: Record<string, string> = {
  resolved: 'bg-success/10 text-success',
  escalated: 'bg-warning/10 text-warning',
  missed: 'bg-danger/10 text-danger',
};

const tabs = ['Overview', 'Agent', 'Calls', 'Team', 'Billing'];

export default function BusinessDetailPage() {
  const [tab, setTab] = useState('Overview');
  const [planInput, setPlanInput] = useState(business.plan);
  const [statusInput, setStatusInput] = useState(business.status);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-4xl">
      {/* Back + header */}
      <div>
        <Link href="/admin/businesses" className="text-xs text-primary-warm hover:text-primary flex items-center gap-1 mb-3">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to businesses
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="text-lg font-bold text-primary">{business.name[0]}</span>
            </div>
            <div>
              <h1 className="font-heading font-bold text-2xl text-primary-dark">{business.name}</h1>
              <p className="text-sm text-primary-warm">{business.industry} · {business.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={planInput}
              onChange={e => setPlanInput(e.target.value)}
              className="text-xs border border-cream-dark rounded-lg px-2.5 py-1.5 bg-cream-light text-primary-dark focus:outline-none focus:border-primary/50"
            >
              <option value="Starter">Starter</option>
              <option value="Growth">Growth</option>
              <option value="Enterprise">Enterprise</option>
            </select>
            <select
              value={statusInput}
              onChange={e => setStatusInput(e.target.value)}
              className="text-xs border border-cream-dark rounded-lg px-2.5 py-1.5 bg-cream-light text-primary-dark focus:outline-none focus:border-primary/50"
            >
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button className="bg-primary text-cream-light text-xs px-3 py-1.5 rounded-lg hover:bg-primary-dark transition-colors">
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-cream-dark">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-primary-warm hover:text-primary-dark'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Calls this month', value: business.callsThisMonth.toLocaleString() },
              { label: 'Total calls', value: business.callsTotal.toLocaleString() },
              { label: 'Resolution rate', value: `${business.resolutionRate}%` },
              { label: 'Escalations', value: business.escalations },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-cream-dark p-4">
                <p className="text-xs text-primary-warm">{s.label}</p>
                <p className="text-2xl font-bold text-primary-dark mt-1">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-cream-dark p-5 space-y-3">
            <h3 className="text-sm font-semibold text-primary-dark">Business details</h3>
            {[
              { label: 'Owner', value: business.owner },
              { label: 'Email', value: business.email },
              { label: 'Phone', value: business.phone },
              { label: 'Industry', value: business.industry },
              { label: 'Joined', value: business.joined },
              { label: 'MRR', value: `₦${business.mrr.toLocaleString()}` },
            ].map(row => (
              <div key={row.label} className="flex justify-between text-sm border-b border-cream-dark last:border-0 pb-2 last:pb-0">
                <span className="text-primary-warm">{row.label}</span>
                <span className="font-medium text-primary-dark">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'Agent' && (
        <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-4">
          <h3 className="text-sm font-semibold text-primary-dark">Agent configuration</h3>
          {[
            { label: 'Voice style', value: business.agentVoice },
            { label: 'Tone', value: business.agentTone },
            { label: 'FAQs loaded', value: `${business.faqCount} questions` },
          ].map(row => (
            <div key={row.label} className="flex justify-between text-sm border-b border-cream-dark last:border-0 pb-3 last:pb-0">
              <span className="text-primary-warm">{row.label}</span>
              <span className="font-medium text-primary-dark">{row.value}</span>
            </div>
          ))}
          <div className="pt-1">
            <p className="text-xs font-medium text-primary-dark mb-1.5">Greeting script</p>
            <div className="bg-cream rounded-xl p-4 text-sm text-primary-warm italic">
              &ldquo;{business.greeting}&rdquo;
            </div>
          </div>
        </div>
      )}

      {tab === 'Calls' && (
        <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-dark bg-cream-light/60">
                <th className="text-left px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Caller</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Intent</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Duration</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-dark">
              {recentCalls.map(c => (
                <tr key={c.id} className="hover:bg-cream-light/40">
                  <td className="px-5 py-3.5 font-medium text-primary-dark">{c.caller}</td>
                  <td className="px-4 py-3.5 text-primary-warm">{c.intent}</td>
                  <td className="px-4 py-3.5 text-primary-warm">{c.duration}</td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize ${statusColors[c.status]}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-primary-warm">{c.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Team' && (
        <div className="bg-white rounded-2xl border border-cream-dark divide-y divide-cream-dark">
          {team.map(m => (
            <div key={m.email} className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-semibold text-primary">{m.name[0]}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-primary-dark">{m.name}</p>
                  <p className="text-xs text-primary-warm">{m.email}</p>
                </div>
              </div>
              <span className="text-xs font-medium text-primary-warm bg-cream px-2.5 py-1 rounded-full border border-cream-dark">
                {m.role}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'Billing' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-cream-dark p-5 space-y-3">
            <h3 className="text-sm font-semibold text-primary-dark">Subscription</h3>
            {[
              { label: 'Plan', value: business.plan },
              { label: 'MRR', value: `₦${business.mrr.toLocaleString()}` },
              { label: 'Status', value: business.status },
              { label: 'Next billing', value: '2024-05-01' },
            ].map(row => (
              <div key={row.label} className="flex justify-between text-sm border-b border-cream-dark last:border-0 pb-2 last:pb-0">
                <span className="text-primary-warm">{row.label}</span>
                <span className="font-medium text-primary-dark capitalize">{row.value}</span>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
            <div className="px-5 py-3.5 border-b border-cream-dark bg-cream-light/60">
              <h3 className="text-xs font-semibold text-primary-warm uppercase tracking-wider">Invoice history</h3>
            </div>
            <div className="divide-y divide-cream-dark">
              {invoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <div>
                    <p className="font-medium text-primary-dark">{inv.id}</p>
                    <p className="text-xs text-primary-warm">{inv.date}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-primary-dark">₦{inv.amount.toLocaleString()}</span>
                    <span className="text-xs font-medium bg-success/10 text-success px-2 py-0.5 rounded-full capitalize">
                      {inv.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl border border-cream-dark text-sm text-primary-warm hover:text-primary hover:border-primary/30 transition-colors">
              Issue credit
            </button>
            <button className="px-4 py-2 rounded-xl border border-danger/30 text-sm text-danger hover:bg-danger/5 transition-colors">
              Suspend account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
