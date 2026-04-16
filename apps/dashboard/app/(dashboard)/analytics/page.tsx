'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

const weekData = [
  { day: 'Mon', calls: 24 },
  { day: 'Tue', calls: 38 },
  { day: 'Wed', calls: 29 },
  { day: 'Thu', calls: 47 },
  { day: 'Fri', calls: 55 },
  { day: 'Sat', calls: 18 },
  { day: 'Sun', calls: 12 },
];

const intentData = [
  { name: 'Pricing', value: 38 },
  { name: 'Opening hours', value: 24 },
  { name: 'Complaints', value: 17 },
  { name: 'Bookings', value: 14 },
  { name: 'Other', value: 7 },
];

const COLORS = ['#5C3D2E', '#7A5230', '#4A7C59', '#C97D2E', '#EAD9BA'];

export default function AnalyticsPage() {
  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary-dark">Analytics</h1>
        <p className="text-sm text-primary-warm mt-0.5">Understand how your AI agent is performing.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Call volume */}
        <div className="bg-white rounded-2xl border border-cream-dark p-6">
          <h2 className="font-semibold text-primary-dark mb-1">Call volume</h2>
          <p className="text-xs text-primary-warm mb-6">Calls per day this week</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weekData} margin={{ left: -20, right: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EAD9BA" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#7A5230' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#7A5230' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#FAF6EE', border: '1px solid #EAD9BA', borderRadius: 12, fontSize: 12 }}
              />
              <Bar dataKey="calls" fill="#5C3D2E" radius={[6, 6, 0, 0]} name="Calls" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Intent breakdown */}
        <div className="bg-white rounded-2xl border border-cream-dark p-6">
          <h2 className="font-semibold text-primary-dark mb-1">Top intents</h2>
          <p className="text-xs text-primary-warm mb-6">What callers are asking about</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={intentData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {intentData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(v) => <span style={{ fontSize: 12, color: '#7A5230' }}>{v}</span>}
              />
              <Tooltip
                contentStyle={{ background: '#FAF6EE', border: '1px solid #EAD9BA', borderRadius: 12, fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { label: 'Avg. calls/day', value: '31.9' },
          { label: 'Peak hour', value: '11 AM – 12 PM' },
          { label: 'Busiest day', value: 'Friday' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-cream-dark p-5">
            <p className="text-2xl font-semibold text-primary-dark">{s.value}</p>
            <p className="text-sm text-primary-warm mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
