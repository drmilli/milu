'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    firstName: 'Amaka',
    lastName: 'Obi',
    email: 'amaka@yourbusiness.ng',
    businessName: "Amaka's Boutique",
    industry: 'Retail / Fashion',
    whatsapp: '+234 801 234 5678',
    notifyEscalation: true,
    notifyMissed: true,
    notifyWeekly: false,
  });

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 transition-colors';

  return (
    <div className="p-6 lg:p-8 max-w-2xl space-y-8">
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary-dark">Settings</h1>
        <p className="text-sm text-primary-warm mt-0.5">Manage your account and preferences.</p>
      </div>

      {/* Profile */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-4">
        <h2 className="font-semibold text-primary-dark">Profile</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-primary-dark mb-1.5">First name</label>
            <input className={inputCls} value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-primary-dark mb-1.5">Last name</label>
            <input className={inputCls} value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-primary-dark mb-1.5">Email</label>
          <input type="email" className={inputCls} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
      </div>

      {/* Business */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-4">
        <h2 className="font-semibold text-primary-dark">Business</h2>
        <div>
          <label className="block text-xs font-medium text-primary-dark mb-1.5">Business name</label>
          <input className={inputCls} value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-primary-dark mb-1.5">Industry</label>
          <input className={inputCls} value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-primary-dark mb-1.5">WhatsApp for escalations</label>
          <input className={inputCls} value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} />
          <p className="text-xs text-primary-warm mt-1.5">We send call summaries here when the agent escalates.</p>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-4">
        <h2 className="font-semibold text-primary-dark">Notifications</h2>
        {[
          { key: 'notifyEscalation', label: 'Escalation alerts', desc: 'Get notified on WhatsApp when a call is escalated' },
          { key: 'notifyMissed', label: 'Missed call alerts', desc: 'Get notified when the agent misses a call' },
          { key: 'notifyWeekly', label: 'Weekly summary', desc: 'Receive a weekly performance digest via email' },
        ].map((n) => (
          <div key={n.key} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary-dark">{n.label}</p>
              <p className="text-xs text-primary-warm">{n.desc}</p>
            </div>
            <button
              onClick={() => setForm((f) => ({ ...f, [n.key]: !f[n.key as keyof typeof f] }))}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                form[n.key as keyof typeof form] ? 'bg-primary' : 'bg-cream-dark'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                  form[n.key as keyof typeof form] ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl border border-danger/20 p-6">
        <h2 className="font-semibold text-danger mb-1">Danger zone</h2>
        <p className="text-sm text-primary-warm mb-4">These actions are irreversible.</p>
        <button className="text-sm text-danger border border-danger/30 px-4 py-2 rounded-xl hover:bg-danger/4 transition-colors">
          Delete account
        </button>
      </div>

      <button
        onClick={handleSave}
        className={`px-6 py-3 rounded-full text-sm font-medium transition-colors ${
          saved ? 'bg-success text-white' : 'bg-primary text-cream-light hover:bg-primary-dark'
        }`}
      >
        {saved ? '✓ Saved' : 'Save changes'}
      </button>
    </div>
  );
}
