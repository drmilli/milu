'use client';

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const stats = [
  { label: 'Total Calls', value: '1,284', change: '+18% this month', up: true },
  { label: 'AI Resolved', value: '87.4%', change: '+1.2% vs last month', up: true },
  { label: 'Open Escalations', value: '3', change: 'Needs attention', up: false },
  { label: 'New Orders', value: '47', change: '+12 today', up: true },
  { label: 'Appointments', value: '31', change: '8 this week', up: null },
  { label: 'Revenue', value: '₦284,500', change: 'This month', up: null },
];

const callData = [
  { day: 'Mon', calls: 48 }, { day: 'Tue', calls: 62 }, { day: 'Wed', calls: 57 },
  { day: 'Thu', calls: 71 }, { day: 'Fri', calls: 83 }, { day: 'Sat', calls: 39 }, { day: 'Sun', calls: 28 },
];

const recentCalls = [
  { number: '+234 801 234 5678', intent: 'Order Status', resolution: 'AI', duration: '2m 14s', ago: '5m ago' },
  { number: '+234 802 987 6543', intent: 'Booking', resolution: 'AI', duration: '3m 41s', ago: '18m ago' },
  { number: '+234 703 456 1122', intent: 'Complaint', resolution: 'Escalated', duration: '1m 09s', ago: '34m ago' },
  { number: '+234 814 321 0099', intent: 'FAQ', resolution: 'AI', duration: '0m 58s', ago: '1h ago' },
  { number: '+234 805 678 9900', intent: 'Order Status', resolution: 'AI', duration: '1m 47s', ago: '2h ago' },
];

const resolutionColor: Record<string, string> = {
  AI: 'bg-success/10 text-success',
  Escalated: 'bg-danger/10 text-danger',
  Human: 'bg-warning/10 text-warning',
};

export default function BizDashboardPage() {
  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-cream-dark p-5">
            <p className="text-xs text-primary-warm mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-primary-dark font-heading">{s.value}</p>
            <p className={`text-xs mt-1 ${s.up === true ? 'text-success' : s.up === false ? 'text-danger' : 'text-primary-warm'}`}>
              {s.up === true && '↑ '}{s.up === false && '↓ '}{s.change}
            </p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Call volume */}
        <div className="bg-white rounded-2xl border border-cream-dark p-6">
          <h2 className="text-sm font-semibold text-primary-dark mb-4">Calls this week</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={callData} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EAD9BA" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#7A5230' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#7A5230' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #EAD9BA', fontSize: 12 }} />
              <Bar dataKey="calls" fill="#5C3D2E" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-2xl border border-cream-dark p-6">
          <h2 className="text-sm font-semibold text-primary-dark mb-4">Quick actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'View escalations', href: '/dashboard/escalations', icon: '⚠️' },
              { label: 'Add knowledge', href: '/dashboard/agent', icon: '🧠' },
              { label: 'Export report', href: '/dashboard/reports', icon: '📊' },
              { label: 'Manage contacts', href: '/dashboard/contacts', icon: '👥' },
            ].map((a) => (
              <a
                key={a.label}
                href={a.href}
                className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl border border-cream-dark hover:border-primary/30 hover:bg-primary/5 transition-all text-sm text-primary-dark font-medium"
              >
                <span className="text-base">{a.icon}</span>
                {a.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Recent calls */}
      <div className="bg-white rounded-2xl border border-cream-dark">
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-dark">
          <h2 className="text-sm font-semibold text-primary-dark">Recent calls</h2>
          <a href="/dashboard/calls" className="text-xs text-primary hover:underline">View all</a>
        </div>
        <div className="divide-y divide-cream-dark">
          {recentCalls.map((c, i) => (
            <div key={i} className="flex items-center justify-between px-6 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-primary-dark">{c.number}</p>
                  <p className="text-xs text-primary-warm">{c.intent} · {c.duration}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${resolutionColor[c.resolution] ?? 'bg-primary/10 text-primary'}`}>
                  {c.resolution}
                </span>
                <span className="text-xs text-primary-warm">{c.ago}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
