'use client';

import { useState } from 'react';

const invoices = [
  { id: 'INV-0012', date: 'Apr 1, 2025', amount: '₦45,000', status: 'paid' },
  { id: 'INV-0011', date: 'Mar 1, 2025', amount: '₦45,000', status: 'paid' },
  { id: 'INV-0010', date: 'Feb 1, 2025', amount: '₦45,000', status: 'paid' },
  { id: 'INV-0009', date: 'Jan 1, 2025', amount: '₦15,000', status: 'paid' },
];

export default function BillingPage() {
  const [showUpgrade, setShowUpgrade] = useState(false);

  return (
    <div className="p-6 lg:p-8 max-w-3xl space-y-8">
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary-dark">Billing</h1>
        <p className="text-sm text-primary-warm mt-0.5">Manage your plan, usage, and payment details.</p>
      </div>

      {/* Current plan */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-primary-warm uppercase tracking-wider mb-1">Current plan</p>
            <div className="flex items-center gap-3">
              <p className="font-heading font-bold text-2xl text-primary-dark">Growth</p>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-success/10 text-success">Active</span>
            </div>
            <p className="text-sm text-primary-warm mt-1">₦45,000 / month · Renews May 1, 2025</p>
          </div>
          <button
            onClick={() => setShowUpgrade(!showUpgrade)}
            className="text-sm text-primary border border-primary/30 px-4 py-2 rounded-xl hover:bg-primary hover:text-cream-light transition-colors flex-shrink-0"
          >
            Change plan
          </button>
        </div>

        {/* Usage meters */}
        <div className="mt-6 space-y-4">
          <div>
            <div className="flex items-center justify-between text-xs text-primary-warm mb-1.5">
              <span>Calls used this month</span>
              <span className="font-medium text-primary-dark">223 / 1,000</span>
            </div>
            <div className="h-2 bg-cream rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: '22.3%' }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-primary-warm mb-1.5">
              <span>Team members</span>
              <span className="font-medium text-primary-dark">4 / 10</span>
            </div>
            <div className="h-2 bg-cream rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: '40%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade panel */}
      {showUpgrade && (
        <div className="bg-white rounded-2xl border-2 border-primary/25 p-6">
          <h2 className="font-semibold text-primary-dark mb-4">Choose a plan</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { name: 'Starter', price: '₦15,000', calls: '200 calls/mo', current: false },
              { name: 'Growth', price: '₦45,000', calls: '1,000 calls/mo', current: true },
              { name: 'Enterprise', price: 'Custom', calls: 'Unlimited', current: false },
            ].map((p) => (
              <div
                key={p.name}
                className={`p-4 rounded-xl border text-center transition-colors ${
                  p.current
                    ? 'border-primary/40 bg-primary/4'
                    : 'border-cream-dark hover:border-primary/25 cursor-pointer'
                }`}
              >
                <p className="font-semibold text-primary-dark">{p.name}</p>
                <p className="font-heading font-bold text-xl text-primary-dark mt-1">{p.price}</p>
                <p className="text-xs text-primary-warm mt-1">{p.calls}</p>
                {p.current ? (
                  <span className="mt-3 inline-block text-xs text-primary font-medium">Current plan</span>
                ) : (
                  <button className="mt-3 text-xs text-primary border border-primary/30 px-3 py-1.5 rounded-lg hover:bg-primary hover:text-cream-light transition-colors">
                    {p.name === 'Enterprise' ? 'Contact us' : 'Switch'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment method */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-primary-dark">Payment method</h2>
          <button className="text-xs text-primary hover:underline">Update</button>
        </div>
        <div className="flex items-center gap-4 p-4 bg-cream-light rounded-xl border border-cream-dark">
          <div className="w-10 h-7 rounded bg-primary-dark flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-cream-light">VISA</span>
          </div>
          <div>
            <p className="text-sm font-medium text-primary-dark">•••• •••• •••• 4242</p>
            <p className="text-xs text-primary-warm">Expires 09/27</p>
          </div>
          <span className="ml-auto text-xs font-medium px-2.5 py-1 rounded-full bg-success/10 text-success">Default</span>
        </div>
      </div>

      {/* Invoice history */}
      <div className="bg-white rounded-2xl border border-cream-dark">
        <div className="px-6 py-4 border-b border-cream-dark">
          <h2 className="font-semibold text-primary-dark">Invoice history</h2>
        </div>
        <div className="divide-y divide-cream-dark">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center gap-4 px-6 py-3.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary-dark">{inv.id}</p>
                <p className="text-xs text-primary-warm">{inv.date}</p>
              </div>
              <p className="text-sm font-medium text-primary-dark">{inv.amount}</p>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-success/10 text-success w-14 text-center">
                {inv.status}
              </span>
              <button className="text-xs text-primary hover:underline">Download</button>
            </div>
          ))}
        </div>
      </div>

      {/* Cancel */}
      <div className="bg-white rounded-2xl border border-danger/20 p-5">
        <h2 className="font-semibold text-danger mb-1">Cancel subscription</h2>
        <p className="text-sm text-primary-warm mb-4">
          Your agent will stop answering calls at the end of the current billing period.
        </p>
        <button className="text-sm text-danger border border-danger/30 px-4 py-2 rounded-xl hover:bg-danger/4 transition-colors">
          Cancel plan
        </button>
      </div>
    </div>
  );
}
