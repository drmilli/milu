'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../../../hooks/useAuth';
import { apiGet } from '../../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
  totalCalls: number;
  resolvedByAI: number;
  escalations: number;
  aiResolutionRate: string;
  avgDurationSeconds?: number;
}

interface DayVolume { day: string; count: number }

interface Call {
  id: string;
  callerNumber?: string;
  durationSeconds?: number;
  intent?: string;
  resolution?: string;
  startedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(s?: number) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, trend, icon,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: { dir: 'up' | 'down'; pct: string };
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-cream-dark p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center text-primary">
          {icon}
        </div>
        {trend && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            trend.dir === 'up' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
          }`}>
            {trend.dir === 'up' ? '↑' : '↓'} {trend.pct}
          </span>
        )}
      </div>
      <p className="text-2xl font-semibold text-primary-dark">{value}</p>
      <p className="text-sm text-primary-warm mt-0.5">{label}</p>
      {sub && <p className="text-xs text-cream-dark mt-1">{sub}</p>}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-cream rounded-xl ${className}`} />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { token, user, ready } = useAuth();
  const [range, setRange] = useState<'7d' | '30d'>('7d');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [volume, setVolume] = useState<{ day: string; calls: number }[]>([]);
  const [recentCalls, setRecentCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !token) return;
    setLoading(true);

    const days = range === '7d' ? 7 : 30;
    const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

    Promise.all([
      apiGet<Summary>(`/analytics/summary?from=${from}`, token),
      apiGet<DayVolume[]>(`/analytics/daily-volume?days=${days}`, token),
      apiGet<{ calls: Call[] }>(`/calls?limit=5`, token),
    ]).then(([s, vol, c]) => {
      setSummary(s);
      setVolume(vol.map(r => ({ day: new Date(r.day).toLocaleDateString('en-US', { weekday: 'short' }), calls: r.count })));
      setRecentCalls(c.calls);
    }).catch(() => null).finally(() => setLoading(false));
  }, [ready, token, range]);

  const resRate = summary ? parseFloat(summary.aiResolutionRate) : 0;

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary-dark">Overview</h1>
        <p className="text-sm text-primary-warm mt-0.5">
          {user?.firstName ? `Welcome back, ${user.firstName}.` : 'Your AI agent activity at a glance.'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-cream-dark p-6 space-y-3">
              <Skeleton className="w-10 h-10" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))
        ) : (
          <>
            <StatCard
              label="Total Calls"
              value={summary?.totalCalls.toLocaleString() ?? '—'}
              sub={range === '7d' ? 'Last 7 days' : 'Last 30 days'}
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>}
            />
            <StatCard
              label="AI Resolution Rate"
              value={summary ? `${resRate.toFixed(1)}%` : '—'}
              sub="AI-handled vs total"
              trend={resRate >= 80 ? { dir: 'up', pct: `${resRate.toFixed(0)}%` } : { dir: 'down', pct: `${resRate.toFixed(0)}%` }}
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
            <StatCard
              label="Escalations"
              value={summary?.escalations.toLocaleString() ?? '—'}
              sub="Transferred to you"
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15 8.25H9m6 3H9m3 6l-3-3h1.5a3 3 0 100-6M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
            <StatCard
              label="Avg. Handle Time"
              value={fmtDuration(summary?.avgDurationSeconds)}
              sub="Per call"
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
          </>
        )}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-semibold text-primary-dark">Call volume</h2>
            <p className="text-xs text-primary-warm mt-0.5">Daily call count</p>
          </div>
          <div className="flex gap-1 bg-cream rounded-xl p-1">
            {(['7d', '30d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  range === r ? 'bg-white text-primary-dark shadow-sm' : 'text-primary-warm hover:text-primary-dark'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <Skeleton className="h-[220px] w-full" />
        ) : volume.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-sm text-primary-warm">No call data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={volume} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="callsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#5C3D2E" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#5C3D2E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#EAD9BA" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#7A5230' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#7A5230' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#FAF6EE', border: '1px solid #EAD9BA', borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: '#3B2314', fontWeight: 600 }}
              />
              <Area type="monotone" dataKey="calls" stroke="#5C3D2E" strokeWidth={2} fill="url(#callsGrad)" name="Calls" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent calls */}
      <div className="bg-white rounded-2xl border border-cream-dark">
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-dark">
          <h2 className="font-semibold text-primary-dark">Recent calls</h2>
          <Link href="/calls" className="text-xs text-primary hover:underline font-medium">View all</Link>
        </div>
        {loading ? (
          <div className="divide-y divide-cream-dark">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-3.5">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : recentCalls.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-primary-warm">No calls yet — your agent is ready!</div>
        ) : (
          <div className="divide-y divide-cream-dark">
            {recentCalls.map((call) => (
              <div key={call.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-cream-light/50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-cream flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-primary-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary-dark">{call.callerNumber ?? 'Unknown'}</p>
                  <p className="text-xs text-primary-warm truncate capitalize">{call.intent?.toLowerCase().replace('_', ' ') ?? '—'}</p>
                </div>
                <div className="hidden sm:block text-xs text-primary-warm w-16 text-right">
                  {fmtDuration(call.durationSeconds)}
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full w-20 text-center ${
                  call.resolution === 'AI' ? 'bg-success/10 text-success'
                  : call.resolution === 'HUMAN' ? 'bg-warning/10 text-warning'
                  : 'bg-cream text-primary-warm'
                }`}>
                  {call.resolution === 'AI' ? 'resolved' : call.resolution === 'HUMAN' ? 'escalated' : 'abandoned'}
                </span>
                <span className="text-xs text-cream-dark w-20 text-right hidden md:block">
                  {timeAgo(call.startedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
