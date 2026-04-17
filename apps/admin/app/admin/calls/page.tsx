'use client';

import { useState } from 'react';

type Call = {
  id: string;
  business: string;
  caller: string;
  duration: string;
  status: 'resolved' | 'escalated' | 'missed';
  intent: string;
  time: string;
  date: string;
};

const calls: Call[] = [
  { id: 'c1', business: "Amaka's Boutique", caller: '+234 803 444 5555', duration: '1m 32s', status: 'resolved', intent: 'Price enquiry', time: '10:42 AM', date: '2024-04-16' },
  { id: 'c2', business: 'MedCity Pharmacy', caller: '+234 706 888 9999', duration: '3m 47s', status: 'escalated', intent: 'Prescription refill', time: '10:38 AM', date: '2024-04-16' },
  { id: 'c3', business: 'QuickDelivery NG', caller: '+234 812 222 3333', duration: '0m 58s', status: 'resolved', intent: 'Delivery status', time: '10:21 AM', date: '2024-04-16' },
  { id: 'c4', business: 'Mama Titi Kitchen', caller: '+234 816 777 8888', duration: '2m 11s', status: 'resolved', intent: 'Menu enquiry', time: '10:05 AM', date: '2024-04-16' },
  { id: 'c5', business: "Amaka's Boutique", caller: '+234 701 555 6666', duration: '—', status: 'missed', intent: '—', time: '9:52 AM', date: '2024-04-16' },
  { id: 'c6', business: 'Sunrise Logistics', caller: '+234 809 333 4444', duration: '4m 12s', status: 'escalated', intent: 'Shipment complaint', time: '9:31 AM', date: '2024-04-16' },
  { id: 'c7', business: 'MedCity Pharmacy', caller: '+234 803 111 2222', duration: '1m 05s', status: 'resolved', intent: 'Store hours', time: '9:18 AM', date: '2024-04-16' },
  { id: 'c8', business: 'LagosLooks Beauty', caller: '+234 706 999 0000', duration: '0m 44s', status: 'resolved', intent: 'Appointment booking', time: '8:57 AM', date: '2024-04-16' },
  { id: 'c9', business: 'PharmaCare Plus', caller: '+234 815 444 5555', duration: '2m 38s', status: 'resolved', intent: 'Drug availability', time: '8:43 AM', date: '2024-04-16' },
  { id: 'c10', business: 'QuickDelivery NG', caller: '+234 701 222 3333', duration: '—', status: 'missed', intent: '—', time: '8:30 AM', date: '2024-04-16' },
];

const statusColors: Record<string, string> = {
  resolved: 'bg-success/10 text-success',
  escalated: 'bg-warning/10 text-warning',
  missed: 'bg-danger/10 text-danger',
};

export default function CallsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [bizFilter, setBizFilter] = useState('all');

  const businesses = Array.from(new Set(calls.map(c => c.business))).sort();

  const filtered = calls.filter(c => {
    const matchesSearch = c.business.toLowerCase().includes(search.toLowerCase()) ||
      c.caller.includes(search) ||
      c.intent.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchesBiz = bizFilter === 'all' || c.business === bizFilter;
    return matchesSearch && matchesStatus && matchesBiz;
  });

  const resolved = filtered.filter(c => c.status === 'resolved').length;
  const escalated = filtered.filter(c => c.status === 'escalated').length;
  const missed = filtered.filter(c => c.status === 'missed').length;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary-dark">Calls</h1>
        <p className="text-sm text-primary-warm mt-0.5">All calls across all businesses</p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Resolved', value: resolved, color: 'text-success' },
          { label: 'Escalated', value: escalated, color: 'text-warning' },
          { label: 'Missed', value: missed, color: 'text-danger' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-cream-dark p-4 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-primary-warm mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50"
            placeholder="Search business, caller, intent…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select value={bizFilter} onChange={e => setBizFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark focus:outline-none cursor-pointer">
          <option value="all">All businesses</option>
          {businesses.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark focus:outline-none cursor-pointer">
          <option value="all">All statuses</option>
          <option value="resolved">Resolved</option>
          <option value="escalated">Escalated</option>
          <option value="missed">Missed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-dark bg-cream-light/60">
              <th className="text-left px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Business</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Caller</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Intent</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Duration</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-dark">
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-cream-light/40 transition-colors">
                <td className="px-5 py-3.5 font-medium text-primary-dark">{c.business}</td>
                <td className="px-4 py-3.5 text-primary-warm font-mono text-xs">{c.caller}</td>
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
        {filtered.length === 0 && (
          <div className="py-16 text-center text-primary-warm text-sm">No calls match your filters.</div>
        )}
      </div>
    </div>
  );
}
