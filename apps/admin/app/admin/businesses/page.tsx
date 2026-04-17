'use client';

import { useState } from 'react';
import Link from 'next/link';

type Business = {
  id: string;
  name: string;
  owner: string;
  email: string;
  plan: 'Starter' | 'Growth' | 'Enterprise';
  status: 'active' | 'trial' | 'suspended' | 'cancelled';
  calls: number;
  mrr: number;
  joined: string;
  industry: string;
};

const businesses: Business[] = [
  { id: 'b1', name: "Amaka's Boutique", owner: 'Amaka Obi', email: 'amaka@boutique.ng', plan: 'Growth', status: 'active', calls: 847, mrr: 45000, joined: '2024-01-15', industry: 'Retail & e-commerce' },
  { id: 'b2', name: 'QuickDelivery NG', owner: 'Chidi Eze', email: 'chidi@quickdelivery.ng', plan: 'Starter', status: 'active', calls: 312, mrr: 15000, joined: '2024-02-20', industry: 'Logistics & delivery' },
  { id: 'b3', name: 'Mama Titi Kitchen', owner: 'Ngozi Okafor', email: 'ngozi@mamatiti.ng', plan: 'Growth', status: 'active', calls: 523, mrr: 45000, joined: '2024-03-10', industry: 'Restaurant & food' },
  { id: 'b4', name: 'MedCity Pharmacy', owner: 'Dr. Emeka Adaeze', email: 'emeka@medcity.ng', plan: 'Enterprise', status: 'active', calls: 1847, mrr: 120000, joined: '2023-11-05', industry: 'Healthcare & pharmacy' },
  { id: 'b5', name: 'LagosLooks Beauty', owner: 'Sade Balogun', email: 'sade@lagoslooks.ng', plan: 'Starter', status: 'trial', calls: 89, mrr: 0, joined: '2024-04-01', industry: 'Beauty & wellness' },
  { id: 'b6', name: 'Sunrise Logistics', owner: 'Tunde Alabi', email: 'tunde@sunrise.ng', plan: 'Growth', status: 'active', calls: 634, mrr: 45000, joined: '2024-02-05', industry: 'Logistics & delivery' },
  { id: 'b7', name: 'PharmaCare Plus', owner: 'Dr. Kemi Adeyemi', email: 'kemi@pharmacare.ng', plan: 'Enterprise', status: 'active', calls: 2134, mrr: 120000, joined: '2023-09-18', industry: 'Healthcare & pharmacy' },
  { id: 'b8', name: 'VelaFashion', owner: 'Bisi Lawson', email: 'bisi@velafashion.ng', plan: 'Starter', status: 'trial', calls: 34, mrr: 0, joined: '2024-04-10', industry: 'Retail & e-commerce' },
];

const planColors: Record<string, string> = {
  Starter: 'bg-primary/10 text-primary',
  Growth: 'bg-success/10 text-success',
  Enterprise: 'bg-warning/10 text-warning',
};

const statusColors: Record<string, string> = {
  active: 'bg-success/10 text-success',
  trial: 'bg-primary/10 text-primary',
  suspended: 'bg-danger/10 text-danger',
  cancelled: 'bg-cream-dark text-primary-warm',
};

export default function BusinessesPage() {
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = businesses.filter((b) => {
    const matchesSearch = b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.owner.toLowerCase().includes(search.toLowerCase()) ||
      b.email.toLowerCase().includes(search.toLowerCase());
    const matchesPlan = planFilter === 'all' || b.plan === planFilter;
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    return matchesSearch && matchesPlan && matchesStatus;
  });

  const totalMRR = filtered.reduce((s, b) => s + b.mrr, 0);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Businesses</h1>
          <p className="text-sm text-primary-warm mt-0.5">{filtered.length} businesses · ₦{totalMRR.toLocaleString()} MRR</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50"
            placeholder="Search businesses, owners, emails…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          value={planFilter}
          onChange={e => setPlanFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark focus:outline-none focus:border-primary/50 cursor-pointer"
        >
          <option value="all">All plans</option>
          <option value="Starter">Starter</option>
          <option value="Growth">Growth</option>
          <option value="Enterprise">Enterprise</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark focus:outline-none focus:border-primary/50 cursor-pointer"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-dark bg-cream-light/60">
              <th className="text-left px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Business</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Plan</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Calls/mo</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">MRR</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-dark">
            {filtered.map((b) => (
              <tr key={b.id} className="hover:bg-cream-light/40 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-primary">{b.name[0]}</span>
                    </div>
                    <div>
                      <p className="font-medium text-primary-dark">{b.name}</p>
                      <p className="text-xs text-primary-warm">{b.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${planColors[b.plan]}`}>{b.plan}</span>
                </td>
                <td className="px-4 py-4">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${statusColors[b.status]}`}>{b.status}</span>
                </td>
                <td className="px-4 py-4 text-right font-medium text-primary-dark">{b.calls.toLocaleString()}</td>
                <td className="px-4 py-4 text-right font-medium text-primary-dark">
                  {b.mrr > 0 ? `₦${b.mrr.toLocaleString()}` : '—'}
                </td>
                <td className="px-4 py-4 text-primary-warm">{b.joined}</td>
                <td className="px-4 py-4">
                  <Link
                    href={`/admin/businesses/${b.id}`}
                    className="text-xs text-primary hover:text-primary-dark font-medium hover:underline"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-16 text-center text-primary-warm text-sm">No businesses match your filters.</div>
        )}
      </div>
    </div>
  );
}
