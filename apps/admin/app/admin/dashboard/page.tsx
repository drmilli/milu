'use client';

import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const stats = [
  { label: 'Total Businesses', value: '142', change: '+12 this month', up: true },
  { label: 'Active Trials', value: '31', change: '8 expiring soon', up: null },
  { label: 'Calls This Month', value: '48,291', change: '+18% vs last month', up: true },
  { label: 'MRR', value: '₦6.8M', change: '+₦420k vs last month', up: true },
  { label: 'AI Resolution Rate', value: '87.4%', change: '+1.2% vs last month', up: true },
  { label: 'Escalations Today', value: '23', change: 'Across 11 businesses', up: null },
];

const revenueData = [
  { month: 'Nov', mrr: 4100000 },
  { month: 'Dec', mrr: 4600000 },
  { month: 'Jan', mrr: 5200000 },
  { month: 'Feb', mrr: 5900000 },
  { month: 'Mar', mrr: 6400000 },
  { month: 'Apr', mrr: 6800000 },
];

const callData = [
  { day: '1', calls: 1420 }, { day: '3', calls: 1680 }, { day: '5', calls: 1540 },
  { day: '7', calls: 1820 }, { day: '9', calls: 1960 }, { day: '11', calls: 1750 },
  { day: '13', calls: 2100 }, { day: '15', calls: 1880 }, { day: '17', calls: 2240 },
  { day: '19', calls: 2050 }, { day: '21', calls: 1930 }, { day: '23', calls: 2180 },
];

const recentSignups = [
  { name: "Amaka's Boutique", plan: 'Growth', owner: 'Amaka Obi', joined: '2h ago' },
  { name: 'SunriseLogs NG', plan: 'Starter', owner: 'Tunde Alabi', joined: '5h ago' },
  { name: 'PharmaCare Plus', plan: 'Enterprise', owner: 'Dr. Kemi Adeyemi', joined: '1d ago' },
  { name: 'Mama Titi Kitchen', plan: 'Growth', owner: 'Ngozi Okafor', joined: '1d ago' },
  { name: 'VelaFashion', plan: 'Starter', owner: 'Bisi Lawson', joined: '2d ago' },
];

const planColors: Record<string, string> = {
  Starter: 'bg-primary/10 text-primary',
  Growth: 'bg-success/10 text-success',
  Enterprise: 'bg-warning/10 text-warning',
};

function fmt(n: number) {
  return `₦${(n / 1000000).toFixed(1)}M`;
}

export default function AdminDashboardPage() {
  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Stats grid */}
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

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Revenue chart */}
        <div className="bg-white rounded-2xl border border-cream-dark p-6">
          <h2 className="text-sm font-semibold text-primary-dark mb-4">Monthly Recurring Revenue</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={revenueData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EAD9BA" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#7A5230' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: '#7A5230' }} axisLine={false} tickLine={false} width={52} />
              <Tooltip formatter={(v: number) => [fmt(v), 'MRR']} contentStyle={{ borderRadius: 12, border: '1px solid #EAD9BA', fontSize: 12 }} />
              <Bar dataKey="mrr" fill="#5C3D2E" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Call volume chart */}
        <div className="bg-white rounded-2xl border border-cream-dark p-6">
          <h2 className="text-sm font-semibold text-primary-dark mb-4">Call Volume (April)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={callData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EAD9BA" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#7A5230' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#7A5230' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #EAD9BA', fontSize: 12 }} />
              <Line type="monotone" dataKey="calls" stroke="#5C3D2E" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent signups */}
      <div className="bg-white rounded-2xl border border-cream-dark">
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-dark">
          <h2 className="text-sm font-semibold text-primary-dark">Recent Sign-ups</h2>
          <a href="/admin/businesses" className="text-xs text-primary hover:underline">View all</a>
        </div>
        <div className="divide-y divide-cream-dark">
          {recentSignups.map((b) => (
            <div key={b.name} className="flex items-center justify-between px-6 py-3.5">
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
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${planColors[b.plan]}`}>{b.plan}</span>
                <span className="text-xs text-primary-warm">{b.joined}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
