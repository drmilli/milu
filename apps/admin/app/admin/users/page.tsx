'use client';

import { useState } from 'react';

type User = {
  id: string;
  name: string;
  email: string;
  business: string;
  role: 'Owner' | 'Admin' | 'Agent';
  lastActive: string;
  status: 'active' | 'inactive';
};

const users: User[] = [
  { id: 'u1', name: 'Amaka Obi', email: 'amaka@boutique.ng', business: "Amaka's Boutique", role: 'Owner', lastActive: '2 min ago', status: 'active' },
  { id: 'u2', name: 'Chidi Nwosu', email: 'chidi@boutique.ng', business: "Amaka's Boutique", role: 'Admin', lastActive: '1h ago', status: 'active' },
  { id: 'u3', name: 'Chidi Eze', email: 'chidi@quickdelivery.ng', business: 'QuickDelivery NG', role: 'Owner', lastActive: '3h ago', status: 'active' },
  { id: 'u4', name: 'Ngozi Okafor', email: 'ngozi@mamatiti.ng', business: 'Mama Titi Kitchen', role: 'Owner', lastActive: '1d ago', status: 'active' },
  { id: 'u5', name: 'Dr. Emeka Adaeze', email: 'emeka@medcity.ng', business: 'MedCity Pharmacy', role: 'Owner', lastActive: '5 min ago', status: 'active' },
  { id: 'u6', name: 'Kemi Adaeze', email: 'kemi@medcity.ng', business: 'MedCity Pharmacy', role: 'Admin', lastActive: '30 min ago', status: 'active' },
  { id: 'u7', name: 'Sade Balogun', email: 'sade@lagoslooks.ng', business: 'LagosLooks Beauty', role: 'Owner', lastActive: '2d ago', status: 'inactive' },
  { id: 'u8', name: 'Tunde Alabi', email: 'tunde@sunrise.ng', business: 'Sunrise Logistics', role: 'Owner', lastActive: '4h ago', status: 'active' },
  { id: 'u9', name: 'Bisi Lawson', email: 'bisi@velafashion.ng', business: 'VelaFashion', role: 'Owner', lastActive: '1d ago', status: 'inactive' },
];

const roleColors: Record<string, string> = {
  Owner: 'bg-primary/10 text-primary',
  Admin: 'bg-warning/10 text-warning',
  Agent: 'bg-success/10 text-success',
};

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = users.filter(u => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.business.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary-dark">Users</h1>
        <p className="text-sm text-primary-warm mt-0.5">{filtered.length} of {users.length} users</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50"
            placeholder="Search users, emails, businesses…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark focus:outline-none cursor-pointer">
          <option value="all">All roles</option>
          <option value="Owner">Owner</option>
          <option value="Admin">Admin</option>
          <option value="Agent">Agent</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark focus:outline-none cursor-pointer">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-dark bg-cream-light/60">
              <th className="text-left px-5 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Business</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Role</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Last active</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-primary-warm uppercase tracking-wider">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-dark">
            {filtered.map(u => (
              <tr key={u.id} className="hover:bg-cream-light/40 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-primary">{u.name[0]}</span>
                    </div>
                    <div>
                      <p className="font-medium text-primary-dark">{u.name}</p>
                      <p className="text-xs text-primary-warm">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-primary-warm">{u.business}</td>
                <td className="px-4 py-4">
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${roleColors[u.role]}`}>{u.role}</span>
                </td>
                <td className="px-4 py-4 text-primary-warm">{u.lastActive}</td>
                <td className="px-4 py-4">
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${u.status === 'active' ? 'bg-success/10 text-success' : 'bg-cream-dark text-primary-warm'}`}>
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <button className="text-xs text-danger hover:text-danger/80 font-medium transition-colors">Suspend</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-16 text-center text-primary-warm text-sm">No users match your filters.</div>
        )}
      </div>
    </div>
  );
}
