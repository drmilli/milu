'use client';

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useAuth } from '../../../hooks/useAuth';
import { apiGet } from '../../../lib/api';

const COLORS = ['#5C3D2E', '#7A5230', '#4A7C59', '#C97D2E', '#EAD9BA'];

interface Summary {
  totalCalls: number;
  resolvedByAI: number;
  resolvedByHuman: number;
  abandoned: number;
  escalations: number;
  aiResolutionRate: string;
}

interface IntentRow { intent: string; count: number }
interface DayVolume { day: string; count: number }

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-cream rounded-xl ${className}`} />;
}

function fmtIntent(s: string) {
  return s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

export default function AnalyticsPage() {
  const { token, ready } = useAuth();
  const [range, setRange] = useState<7 | 30>(30);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [intents, setIntents] = useState<{ name: string; value: number }[]>([]);
  const [volume, setVolume] = useState<{ day: string; calls: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancedLocked, setAdvancedLocked] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState('');

  useEffect(() => {
    if (!ready || !token) return;
    setLoading(true);
    setAdvancedLocked(false);
    const from = new Date(Date.now() - range * 86400000).toISOString().split('T')[0];

    (async () => {
      try {
        const [s, vol] = await Promise.all([
          apiGet<Summary>(`/analytics/summary?from=${from}`, token),
          apiGet<DayVolume[]>(`/analytics/daily-volume?days=${range}`, token),
        ]);
        setSummary(s);
        setVolume(vol.map(r => ({
          day: new Date(r.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          calls: r.count,
        })));

        try {
          const intentRows = await apiGet<IntentRow[]>(`/analytics/intents`, token);
          setIntents(intentRows.map(r => ({ name: fmtIntent(r.intent), value: r.count })));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : '';
          if (msg.toLowerCase().includes('upgrade')) {
            setAdvancedLocked(true);
            setIntents([]);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.toLowerCase().includes('upgrade')) setUpgradeMsg(msg);
      } finally {
        setLoading(false);
      }
    })().catch(() => null);
  }, [ready, token, range]);

  const avgPerDay = summary && range > 0 ? (summary.totalCalls / range).toFixed(1) : '—';

  // Find busiest day from volume
  const busiestDay = volume.length
    ? volume.reduce((a, b) => (b.calls > a.calls ? b : a), volume[0]).day
    : '—';

  if (upgradeMsg) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl">
        <div className="bg-warning/10 border border-warning/25 rounded-2xl p-6">
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Upgrade required</h1>
          <p className="text-sm text-primary-warm mt-2">{upgradeMsg}</p>
          <a href="/billing" className="inline-flex mt-5 bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors">
            Upgrade
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Analytics</h1>
          <p className="text-sm text-primary-warm mt-0.5">Understand how your AI agent is performing.</p>
        </div>
        <div className="flex gap-1 bg-cream rounded-xl p-1">
          {([7, 30] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                range === r ? 'bg-white text-primary-dark shadow-sm' : 'text-primary-warm hover:text-primary-dark'
              }`}>
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Call volume */}
        <div className="bg-white rounded-2xl border border-cream-dark p-6">
          <h2 className="font-semibold text-primary-dark mb-1">Call volume</h2>
          <p className="text-xs text-primary-warm mb-6">Daily calls — last {range} days</p>
          {loading ? <Skeleton className="h-[200px] w-full" /> : volume.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-sm text-primary-warm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={volume} margin={{ left: -20, right: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EAD9BA" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#7A5230' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#7A5230' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#FAF6EE', border: '1px solid #EAD9BA', borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="calls" fill="#5C3D2E" radius={[6, 6, 0, 0]} name="Calls" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Intent breakdown */}
        <div className="bg-white rounded-2xl border border-cream-dark p-6">
          <h2 className="font-semibold text-primary-dark mb-1">Top intents</h2>
          <p className="text-xs text-primary-warm mb-6">What callers are asking about</p>
          {loading ? <Skeleton className="h-[200px] w-full" /> : advancedLocked ? (
            <div className="h-[200px] flex flex-col items-center justify-center text-center gap-3">
              <p className="text-sm text-primary-warm">Upgrade to Growth to unlock advanced analytics.</p>
              <a href="/billing" className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors">
                Upgrade
              </a>
            </div>
          ) : intents.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-sm text-primary-warm">No data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={intents} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {intents.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend iconType="circle" iconSize={8}
                  formatter={(v) => <span style={{ fontSize: 12, color: '#7A5230' }}>{v}</span>} />
                <Tooltip contentStyle={{ background: '#FAF6EE', border: '1px solid #EAD9BA', borderRadius: 12, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Resolution breakdown */}
      <div className="bg-white rounded-2xl border border-cream-dark p-6">
        <h2 className="font-semibold text-primary-dark mb-4">Resolution breakdown</h2>
        {loading ? (
          <div className="grid sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-4 gap-4">
            {[
              { label: 'Total calls', value: summary?.totalCalls.toLocaleString() ?? '—', color: 'text-primary-dark' },
              { label: 'AI resolved', value: summary?.resolvedByAI.toLocaleString() ?? '—', color: 'text-success' },
              { label: 'Escalated', value: summary?.resolvedByHuman.toLocaleString() ?? '—', color: 'text-warning' },
              { label: 'Abandoned', value: summary?.abandoned.toLocaleString() ?? '—', color: 'text-danger' },
            ].map(s => (
              <div key={s.label} className="bg-cream-light rounded-xl p-4 border border-cream-dark">
                <p className={`text-2xl font-semibold ${s.color}`}>{s.value}</p>
                <p className="text-sm text-primary-warm mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary row */}
      <div className="grid sm:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-cream-dark p-5">
              <p className="text-2xl font-semibold text-primary-dark">{avgPerDay}</p>
              <p className="text-sm text-primary-warm mt-0.5">Avg. calls/day</p>
            </div>
            <div className="bg-white rounded-2xl border border-cream-dark p-5">
              <p className="text-2xl font-semibold text-primary-dark">{summary ? parseFloat(summary.aiResolutionRate).toFixed(1) + '%' : '—'}</p>
              <p className="text-sm text-primary-warm mt-0.5">AI resolution rate</p>
            </div>
            <div className="bg-white rounded-2xl border border-cream-dark p-5">
              <p className="text-2xl font-semibold text-primary-dark">{busiestDay}</p>
              <p className="text-sm text-primary-warm mt-0.5">Busiest day</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
