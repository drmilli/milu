'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { adminGet, adminPatch } from '../../../lib/api';

type User = {
  id: string;
  name: string;
  email: string;
  business: string;
  role: string;
  lastActive: string;
  status: 'active' | 'inactive' | 'suspended';
};

const roleColors: Record<string, string> = {
  OWNER: 'bg-primary/10 text-primary',
  ADMIN: 'bg-warning/10 text-warning',
  Owner: 'bg-primary/10 text-primary',
  Admin: 'bg-warning/10 text-warning',
  Agent: 'bg-success/10 text-success',
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Skeleton() {
  return (
    <tr>
      <td className="px-5 py-4">
        <div className="flex items-center gap-3 animate-pulse">
          <div className="w-8 h-8 rounded-full bg-cream flex-shrink-0" />
          <div className="space-y-1.5"><div className="h-4 bg-cream rounded w-32" /><div className="h-3 bg-cream rounded w-40" /></div>
        </div>
      </td>
      {[1,2,3,4].map(i => <td key={i} className="px-4 py-4"><div className="h-4 bg-cream rounded animate-pulse w-16" /></td>)}
      <td className="px-4 py-4"><div className="h-4 bg-cream rounded animate-pulse w-12" /></td>
    </tr>
  );
}

export default function UsersPage() {
  const { token, ready } = useAdminAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [suspending, setSuspending] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    adminGet<User[]>('/admin/users', token)
      .then(setUsers).catch(() => null).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function toggleSuspend(u: User) {
    setSuspending(u.id);
    const newStatus = u.status === 'suspended' ? 'active' : 'suspended';
    try {
      await adminPatch(`/admin/users/${u.id}`, { status: newStatus }, token);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: newStatus } : x));
    } catch {
      // ignore
    } finally {
      setSuspending(null);
    }
  }

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
        <p className="text-sm text-primary-warm mt-0.5">
          {loading ? 'Loading…' : `${filtered.length} of ${users.length} users`}
        </p>
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
          <option value="OWNER">Owner</option>
          <option value="ADMIN">Admin</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-cream-dark bg-white text-sm text-primary-dark focus:outline-none cursor-pointer">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
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
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} />)
            ) : filtered.map(u => (
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
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${roleColors[u.role] ?? 'bg-cream-dark text-primary-warm'}`}>
                    {u.role.charAt(0) + u.role.slice(1).toLowerCase()}
                  </span>
                </td>
                <td className="px-4 py-4 text-primary-warm">{timeAgo(u.lastActive)}</td>
                <td className="px-4 py-4">
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize ${
                    u.status === 'active' ? 'bg-success/10 text-success' :
                    u.status === 'suspended' ? 'bg-danger/10 text-danger' :
                    'bg-cream-dark text-primary-warm'
                  }`}>
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <button
                    onClick={() => toggleSuspend(u)}
                    disabled={suspending === u.id}
                    className={`text-xs font-medium transition-colors disabled:opacity-50 ${
                      u.status === 'suspended' ? 'text-success hover:text-success/80' : 'text-danger hover:text-danger/80'
                    }`}
                  >
                    {suspending === u.id ? '…' : u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && (
          <div className="py-16 text-center text-primary-warm text-sm">No users match your filters.</div>
        )}
      </div>
    </div>
  );
}
