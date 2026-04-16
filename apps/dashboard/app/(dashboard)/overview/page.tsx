'use client';

import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const callData = [
  { day: 'Mon', calls: 24, resolved: 19 },
  { day: 'Tue', calls: 38, resolved: 31 },
  { day: 'Wed', calls: 29, resolved: 25 },
  { day: 'Thu', calls: 47, resolved: 40 },
  { day: 'Fri', calls: 55, resolved: 48 },
  { day: 'Sat', calls: 18, resolved: 15 },
  { day: 'Sun', calls: 12, resolved: 10 },
];

const recentCalls = [
  { id: 'C-1041', caller: '+234 801 234 5678', duration: '2m 14s', intent: 'Pricing enquiry', status: 'resolved', time: '10 min ago' },
  { id: 'C-1040', caller: '+234 802 987 6543', duration: '0m 58s', intent: 'Opening hours', status: 'resolved', time: '23 min ago' },
  { id: 'C-1039', caller: '+234 803 111 2222', duration: '4m 02s', intent: 'Complaint', status: 'escalated', time: '41 min ago' },
  { id: 'C-1038', caller: '+234 805 444 5555', duration: '1m 30s', intent: 'Appointment booking', status: 'resolved', time: '1 hr ago' },
  { id: 'C-1037', caller: '+234 701 888 9999', duration: '3m 17s', intent: 'Product return', status: 'escalated', time: '2 hr ago' },
];

function StatCard({
  label,
  value,
  sub,
  trend,
  icon,
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
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              trend.dir === 'up'
                ? 'bg-success/10 text-success'
                : 'bg-danger/10 text-danger'
            }`}
          >
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

export default function OverviewPage() {
  const [range, setRange] = useState<'7d' | '30d'>('7d');

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary-dark">Overview</h1>
        <p className="text-sm text-primary-warm mt-0.5">Your AI agent activity at a glance.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Calls"
          value="223"
          sub="This week"
          trend={{ dir: 'up', pct: '12%' }}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
          }
        />
        <StatCard
          label="AI Resolution Rate"
          value="84%"
          sub="↑ 3pts vs last week"
          trend={{ dir: 'up', pct: '3pt' }}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Escalations"
          value="36"
          sub="Transferred to you"
          trend={{ dir: 'down', pct: '8%' }}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 8.25H9m6 3H9m3 6l-3-3h1.5a3 3 0 100-6M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Avg. Handle Time"
          value="1m 52s"
          sub="Per resolved call"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-semibold text-primary-dark">Call volume</h2>
            <p className="text-xs text-primary-warm mt-0.5">Total vs AI-resolved</p>
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
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={callData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="callsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#5C3D2E" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#5C3D2E" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="resolvedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4A7C59" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#4A7C59" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#EAD9BA" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#7A5230' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#7A5230' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#FAF6EE', border: '1px solid #EAD9BA', borderRadius: 12, fontSize: 12 }}
              labelStyle={{ color: '#3B2314', fontWeight: 600 }}
            />
            <Area type="monotone" dataKey="calls" stroke="#5C3D2E" strokeWidth={2} fill="url(#callsGrad)" name="Total calls" />
            <Area type="monotone" dataKey="resolved" stroke="#4A7C59" strokeWidth={2} fill="url(#resolvedGrad)" name="AI resolved" />
          </AreaChart>
        </ResponsiveContainer>
        {/* Legend */}
        <div className="flex gap-6 mt-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-xs text-primary-warm">Total calls</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-success" />
            <span className="text-xs text-primary-warm">AI resolved</span>
          </div>
        </div>
      </div>

      {/* Recent calls */}
      <div className="bg-white rounded-2xl border border-cream-dark">
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-dark">
          <h2 className="font-semibold text-primary-dark">Recent calls</h2>
          <a href="/calls" className="text-xs text-primary hover:underline font-medium">View all</a>
        </div>
        <div className="divide-y divide-cream-dark">
          {recentCalls.map((call) => (
            <div key={call.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-cream-light/50 transition-colors">
              <div className="w-8 h-8 rounded-full bg-cream flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-primary-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary-dark">{call.caller}</p>
                <p className="text-xs text-primary-warm truncate">{call.intent}</p>
              </div>
              <div className="hidden sm:block text-xs text-primary-warm w-16 text-right">{call.duration}</div>
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded-full w-20 text-center ${
                  call.status === 'resolved'
                    ? 'bg-success/10 text-success'
                    : 'bg-warning/10 text-warning'
                }`}
              >
                {call.status}
              </span>
              <span className="text-xs text-cream-dark w-20 text-right hidden md:block">{call.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
