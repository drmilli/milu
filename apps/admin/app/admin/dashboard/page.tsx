'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { adminGet } from '../../../lib/api';

interface AdminStats {
  totalBusinesses: number;
  newBusinessesThisMonth: number;
  activeTrials: number;
  trialsExpiringSoon: number;
  callsThisMonth: number;
  callsGrowthPct: number;
  mrr: number;
  mrrGrowth: number;
  aiResolutionRate: number;
  aiResolutionRateChange: number;
  escalationsToday: number;
  escalationBusinessCount: number;
}

interface RevenuePoint { month: string; mrr: number }
interface CallVolumePoint { day: string; calls: number }

interface RecentSignup {
  id: string;
  name: string;
  plan: string;
  owner: string;
  joinedAt: string;
}

const planColors: Record<string, string> = {
  Starter: 'bg-primary/10 text-primary',
  Growth: 'bg-success/10 text-success',
  Enterprise: 'bg-warning/10 text-warning',
};

function fmtMrr(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}k`;
  return `₦${n}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-cream rounded-xl ${className}`} />;
}

export default function AdminDashboardPage() {
  const { token, ready } = useAdminAuth();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [callVolume, setCallVolume] = useState<CallVolumePoint[]>([]);
  const [recentSignups, setRecentSignups] = useState<RecentSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    Promise.allSettled([
      adminGet<AdminStats>('/admin/stats', token),
      adminGet<RevenuePoint[]>('/admin/analytics/revenue', token),
      adminGet<CallVolumePoint[]>('/admin/analytics/call-volume', token),
      adminGet<RecentSignup[]>('/admin/businesses/recent', token),
    ]).then((results) => {
      const [statsRes, revRes, volRes, signupsRes] = results;

      if (statsRes.status === 'fulfilled') setStats(statsRes.value);
      if (revRes.status === 'fulfilled') setRevenue(revRes.value);
      if (volRes.status === 'fulfilled') setCallVolume(volRes.value);
      if (signupsRes.status === 'fulfilled') setRecentSignups(signupsRes.value);

      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed) setError('Some dashboard data failed to load. Check API URL, admin token, and server logs.');
    }).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const statCards = stats ? [
    { label: 'Total Businesses', value: stats.totalBusinesses.toLocaleString(), change: `+${stats.newBusinessesThisMonth} this month`, up: true as const },
    { label: 'Active Trials', value: stats.activeTrials.toString(), change: `${stats.trialsExpiringSoon} expiring soon`, up: null },
    { label: 'Calls This Month', value: stats.callsThisMonth.toLocaleString(), change: `+${stats.callsGrowthPct.toFixed(1)}% vs last month`, up: true as const },
    { label: 'MRR', value: fmtMrr(stats.mrr), change: `+${fmtMrr(stats.mrrGrowth)} vs last month`, up: true as const },
    { label: 'AI Resolution Rate', value: `${stats.aiResolutionRate.toFixed(1)}%`, change: `+${stats.aiResolutionRateChange.toFixed(1)}% vs last month`, up: true as const },
    { label: 'Escalations Today', value: stats.escalationsToday.toString(), change: `Across ${stats.escalationBusinessCount} businesses`, up: null },
  ] : null;

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {error && (
        <div className="bg-danger/10 border border-danger/20 text-danger rounded-2xl px-5 py-4 text-sm">
          {error}
        </div>
      )}
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : statCards?.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-cream-dark p-5">
            <p className="text-xs text-primary-warm mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-primary-dark font-heading">{s.value}</p>
            <p className={`text-xs mt-1 ${s.up === true ? 'text-success' : s.up === false ? 'text-danger' : 'text-primary-warm'}`}>
              {s.up === true ? '↑ ' : s.up == null ? '' : '↓ '}{s.change}
            </p>
          </div>
        )) ?? (
          <div className="col-span-2 lg:col-span-3 bg-white rounded-2xl border border-cream-dark p-6 text-sm text-primary-warm">
            No stats available yet.
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-cream-dark p-6">
          <h2 className="text-sm font-semibold text-primary-dark mb-4">Monthly Recurring Revenue</h2>
          {loading ? <Skeleton className="h-52" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={revenue} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAD9BA" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#7A5230' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtMrr} tick={{ fontSize: 11, fill: '#7A5230' }} axisLine={false} tickLine={false} width={52} />
                <Tooltip formatter={(v: number) => [fmtMrr(v), 'MRR']} contentStyle={{ borderRadius: 12, border: '1px solid #EAD9BA', fontSize: 12 }} />
                <Bar dataKey="mrr" fill="#5C3D2E" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-cream-dark p-6">
          <h2 className="text-sm font-semibold text-primary-dark mb-4">Call Volume (This Month)</h2>
          {loading ? <Skeleton className="h-52" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={callVolume}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAD9BA" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#7A5230' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#7A5230' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #EAD9BA', fontSize: 12 }} />
                <Line type="monotone" dataKey="calls" stroke="#5C3D2E" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent signups */}
      <div className="bg-white rounded-2xl border border-cream-dark">
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-dark">
          <h2 className="text-sm font-semibold text-primary-dark">Recent Sign-ups</h2>
          <a href="/admin/businesses" className="text-xs text-primary hover:underline">View all</a>
        </div>
        {loading ? (
          <div className="divide-y divide-cream-dark">
            {[1,2,3].map(i => (
              <div key={i} className="flex items-center justify-between px-6 py-3.5 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-cream flex-shrink-0" />
                  <div className="space-y-1.5"><div className="h-4 bg-cream rounded w-32" /><div className="h-3 bg-cream rounded w-20" /></div>
                </div>
                <div className="h-5 bg-cream rounded-full w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-cream-dark">
            {recentSignups.map((b) => (
              <div key={b.id} className="flex items-center justify-between px-6 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">{b.name[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-primary-dark">{b.name}</p>
                    <p className="text-xs text-primary-warm">{b.owner}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${planColors[b.plan] ?? 'bg-cream-dark text-primary-warm'}`}>{b.plan}</span>
                  <span className="text-xs text-primary-warm">{timeAgo(b.joinedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
