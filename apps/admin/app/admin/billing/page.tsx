'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const stats = [
  { label: 'MRR', value: '₦6,800,000', change: '+6.6% vs last month' },
  { label: 'ARR', value: '₦81,600,000', change: 'Annualised' },
  { label: 'Active Subscriptions', value: '111', change: '31 on trial' },
  { label: 'Trial Conversions', value: '68%', change: 'Last 30 days' },
];

const planDist = [
  { name: 'Starter', value: 58, color: '#5C3D2E' },
  { name: 'Growth', value: 40, color: '#4A7C59' },
  { name: 'Enterprise', value: 13, color: '#C97D2E' },
];

type Sub = {
  id: string;
  business: string;
  plan: 'Starter' | 'Growth' | 'Enterprise';
  status: 'active' | 'trial' | 'past_due' | 'cancelled';
  mrr: number;
  nextBilling: string;
};

const subscriptions: Sub[] = [
  { id: 's1', business: "Amaka's Boutique", plan: 'Growth', status: 'active', mrr: 45000, nextBilling: '2024-05-01' },
  { id: 's2', business: 'QuickDelivery NG', plan: 'Starter', status: 'active', mrr: 15000, nextBilling: '2024-05-01' },
  { id: 's3', business: 'MedCity Pharmacy', plan: 'Enterprise', status: 'active', mrr: 120000, nextBilling: '2024-05-01' },
  { id: 's4', business: 'Mama Titi Kitchen', plan: 'Growth', status: 'active', mrr: 45000, nextBilling: '2024-05-01' },
  { id: 's5', business: 'LagosLooks Beauty', plan: 'Starter', status: 'trial', mrr: 0, nextBilling: '2024-04-22' },
  { id: 's6', business: 'PharmaCare Plus', plan: 'Enterprise', status: 'active', mrr: 120000, nextBilling: '2024-05-01' },
  { id: 's7', business: 'Sunrise Logistics', plan: 'Growth', status: 'active', mrr: 45000, nextBilling: '2024-05-01' },
  { id: 's8', business: 'VelaFashion', plan: 'Starter', status: 'trial', mrr: 0, nextBilling: '2024-04-20' },
];

const planColors: Record<string, string> = {
  Starter: 'bg-primary/10 text-primary',
  Growth: 'bg-success/10 text-success',
  Enterprise: 'bg-warning/10 text-warning',
};

const statusColors: Record<string, string> = {
  active: 'bg-success/10 text-success',
  trial: 'bg-primary/10 text-primary',
  past_due: 'bg-danger/10 text-danger',
  cancelled: 'bg-cream-dark text-primary-warm',
};

export default function BillingPage() {
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = subscriptions.filter(s => {
    const matchesPlan = planFilter === 'all' || s.plan === planFilter;
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesPlan && matchesStatus;
  });

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-cream-dark p-5">
            <p className="text-xs text-primary-warm mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-primary-dark font-heading">{s.value}</p>
            <p className="text-xs text-primary-warm mt-1">{s.change}</p>
          </div>
        ))}
      </div>

      {/* Plan distribution */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6">
        <h2 className="text-sm font-semibold text-primary-dark mb-4">Plan distribution</h2>
        <div className="flex items-center gap-8">
          <ResponsiveContainer width={180} height={180}>
            <PieChart>
              <Pie data={planDist} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" strokeWidth={0}>
                {planDist.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #EAD9BA', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-3 flex-1">
            {planDist.map(p => (
              <div key={p.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-sm text-primary-dark">{p.name}</span>
                </div>
                <span className="text-sm font-semibold text-primary-dark">{p.value} businesses</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Subscriptions table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary-dark">Subscriptions</h2>
          <div className="flex gap-2">
            <select value={planFilter} onChange={e => setPlanFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-cream-dark bg-white text-xs text-primary-dark focus:outline-none cursor-pointer">
              <option value="all">All plans</option>
              <option value="Starter">Starter</option>
              <option value="Growth">Growth</option>
              <option value="Enterprise">Enterprise</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-cream-dark bg-white text-xs text-primary-dark focus:outline-none cursor-pointer">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="past_due">Past due</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-dark bg-cream-light/60">
                <th className="text-left px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Business</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">MRR</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Next billing</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-dark">
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-cream-light/40 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-primary-dark">{s.business}</td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${planColors[s.plan]}`}>{s.plan}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize ${statusColors[s.status]}`}>
                      {s.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium text-primary-dark">
                    {s.mrr > 0 ? `₦${s.mrr.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-primary-warm">{s.nextBilling}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-2 justify-end">
                      <button className="text-xs text-primary hover:underline font-medium">Manage</button>
                      <button className="text-xs text-danger hover:underline font-medium">Cancel</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
