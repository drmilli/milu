'use client';

import { useState } from 'react';

const numbers = [
  { number: '+234 700 654 3210', label: 'Main line', status: 'active', since: 'Mar 2025' },
];

export default function PhoneNumbersPage() {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="p-6 lg:p-8 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Phone Numbers</h1>
          <p className="text-sm text-primary-warm mt-0.5">Numbers connected to your AI agent.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add number
        </button>
      </div>

      <div className="space-y-3">
        {numbers.map((n) => (
          <div key={n.number} className="bg-white rounded-2xl border border-cream-dark p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-primary-dark">{n.number}</p>
              <p className="text-xs text-primary-warm">{n.label} · Connected since {n.since}</p>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-success/10 text-success">{n.status}</span>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="bg-white rounded-2xl border-2 border-primary/30 p-6 space-y-4">
          <h2 className="font-semibold text-primary-dark">Add a number</h2>
          <div>
            <label className="block text-xs font-medium text-primary-dark mb-1.5">Phone number</label>
            <input
              className="w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50"
              placeholder="+234 700 000 0000"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-primary-dark mb-1.5">Label</label>
            <input
              className="w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50"
              placeholder="e.g. Main line, Customer care"
            />
          </div>
          <p className="text-xs text-primary-warm">
            The number must be registered on Africa&apos;s Talking. We&apos;ll configure the voice webhook automatically.
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="text-sm text-primary-warm hover:text-primary-dark px-4 py-2">Cancel</button>
            <button className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors">Connect</button>
          </div>
        </div>
      )}
    </div>
  );
}
