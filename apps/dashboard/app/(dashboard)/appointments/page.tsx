'use client';

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { useAuth } from '../../../hooks/useAuth';
import { apiGet, apiPost, apiPatch } from '../../../lib/api';

type Status = 'confirmed' | 'pending' | 'cancelled' | 'completed';

type Appointment = {
  id: string;
  caller: string;
  name: string;
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM
  duration: string;
  purpose: string;
  status: Status;
  bookedVia: 'AI call' | 'Manual';
  notes?: string;
};

// Raw shape returned by the API
interface ApiAppointment {
  id: string;
  scheduledAt: string;
  duration: number;
  serviceType?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
  status: 'SCHEDULED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  callId?: string | null;
}

const STATUS_FROM_API: Record<ApiAppointment['status'], Status> = {
  SCHEDULED: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  NO_SHOW: 'cancelled',
};

const STATUS_TO_API: Record<Status, ApiAppointment['status']> = {
  pending: 'SCHEDULED',
  confirmed: 'CONFIRMED',
  cancelled: 'CANCELLED',
  completed: 'COMPLETED',
};

function fromApi(a: ApiAppointment): Appointment {
  const dt = new Date(a.scheduledAt);
  const date = dt.toISOString().slice(0, 10);
  const time = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  return {
    id: a.id,
    caller: a.customerPhone ?? '',
    name: a.customerName ?? a.customerPhone ?? 'Unknown',
    date,
    time,
    duration: `${a.duration} min`,
    purpose: a.serviceType ?? '',
    status: STATUS_FROM_API[a.status] ?? 'pending',
    bookedVia: a.callId ? 'AI call' : 'Manual',
    notes: a.notes ?? undefined,
  };
}

const statusConfig: Record<Status, { label: string; cls: string }> = {
  confirmed: { label: 'Confirmed', cls: 'bg-success/10 text-success' },
  pending:   { label: 'Pending',   cls: 'bg-warning/10 text-warning' },
  cancelled: { label: 'Cancelled', cls: 'bg-danger/10 text-danger' },
  completed: { label: 'Completed', cls: 'bg-cream-dark text-primary-warm' },
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function groupByDate(list: Appointment[]) {
  const map = new Map<string, Appointment[]>();
  [...list].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).forEach((apt) => {
    const existing = map.get(apt.date) ?? [];
    map.set(apt.date, [...existing, apt]);
  });
  return map;
}

function AddModal({ onClose, onSave }: { onClose: () => void; onSave: (a: Omit<Appointment, 'id' | 'bookedVia'>) => Promise<void> }) {
  const [form, setForm] = useState({
    name: '', caller: '', date: '', time: '', duration: '30 min', purpose: '', notes: '',
    status: 'confirmed' as Status,
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.name || !form.date || !form.time || !form.purpose) return;
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary-dark/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-dark">
          <h2 className="font-semibold text-primary-dark">New appointment</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-cream transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Customer name</label>
              <input className={inputCls} placeholder="Chidinma Eze" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Phone number</label>
              <input className={inputCls} placeholder="+234 800 000 0000" value={form.caller} onChange={e => setForm(f => ({ ...f, caller: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Date</label>
              <input type="date" className={inputCls} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Time</label>
              <input type="time" className={inputCls} value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Purpose</label>
              <input className={inputCls} placeholder="e.g. Fitting session" value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Duration</label>
              <select className={inputCls} value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}>
                <option>15 min</option>
                <option>30 min</option>
                <option>45 min</option>
                <option>60 min</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-primary-dark mb-1.5">Notes (optional)</label>
            <textarea rows={2} className={`${inputCls} resize-none`} placeholder="Any extra details…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <div className="flex gap-3 justify-end px-6 py-4 border-t border-cream-dark">
          <button onClick={onClose} className="text-sm text-primary-warm hover:text-primary-dark px-4 py-2">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="bg-primary text-cream-light px-5 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save appointment'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AppointmentsPage() {
  const { token, ready } = useAuth();

  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgradeMsg, setUpgradeMsg] = useState('');
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    apiGet<{ appointments: ApiAppointment[] }>('/appointments', token)
      .then(res => setItems((res.appointments ?? []).map(fromApi)))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : '';
        if (msg.toLowerCase().includes('upgrade')) setUpgradeMsg(msg);
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const filtered = filter === 'all' ? items : items.filter(a => a.status === filter);
  const grouped = groupByDate(filtered);

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

  async function updateStatus(id: string, status: Status) {
    setItems(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null);
    try {
      await apiPatch(`/appointments/${id}`, { status: STATUS_TO_API[status] }, token);
    } catch {
      load();
    }
  }

  async function addAppointment(data: Omit<Appointment, 'id' | 'bookedVia'>) {
    const scheduledAt = new Date(`${data.date}T${data.time}:00`).toISOString();
    const durationMins = parseInt(data.duration) || 30;
    const created = await apiPost<ApiAppointment>('/appointments', {
      scheduledAt,
      duration: durationMins,
      serviceType: data.purpose || undefined,
      customerName: data.name || undefined,
      customerPhone: data.caller || undefined,
      notes: data.notes || undefined,
      status: STATUS_TO_API[data.status],
    }, token);
    setItems(prev => [...prev, fromApi(created)]);
  }

  const today = new Date();
  const calYear = today.getFullYear();
  const calMonth = today.getMonth();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calCells = Array.from({ length: firstDay + daysInMonth }, (_, i) =>
    i < firstDay ? null : i - firstDay + 1
  );
  const aptsThisMonth = items.filter(a => a.date.startsWith(`${calYear}-${String(calMonth + 1).padStart(2, '0')}`));

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Appointments</h1>
          <p className="text-sm text-primary-warm mt-0.5">Bookings made by your AI agent and manually.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex gap-0.5 bg-cream rounded-xl p-1 border border-cream-dark">
            <button
              onClick={() => setView('list')}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', view === 'list' ? 'bg-white text-primary-dark shadow-sm' : 'text-primary-warm hover:text-primary-dark')}
            >
              List
            </button>
            <button
              onClick={() => setView('calendar')}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', view === 'calendar' ? 'bg-white text-primary-dark shadow-sm' : 'text-primary-warm hover:text-primary-dark')}
            >
              Calendar
            </button>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="hidden sm:inline">New appointment</span>
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total this month', value: items.length, color: 'text-primary-dark' },
          { label: 'Confirmed', value: items.filter(a => a.status === 'confirmed').length, color: 'text-success' },
          { label: 'Pending', value: items.filter(a => a.status === 'pending').length, color: 'text-warning' },
          { label: 'Booked by AI', value: items.filter(a => a.bookedVia === 'AI call').length, color: 'text-primary' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-cream-dark px-5 py-4">
            {loading ? (
              <div className="animate-pulse space-y-1.5"><div className="h-7 bg-cream rounded w-10" /><div className="h-3 bg-cream rounded w-24" /></div>
            ) : (
              <>
                <p className={`text-2xl font-semibold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-primary-warm mt-0.5">{s.label}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {(['all', 'confirmed', 'pending', 'completed', 'cancelled'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'text-xs px-3.5 py-1.5 rounded-full font-medium transition-colors capitalize',
              filter === f ? 'bg-primary text-cream-light' : 'bg-cream text-primary-warm hover:bg-cream-dark border border-cream-dark'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {view === 'list' ? (
        <div className="flex gap-6">
          <div className="flex-1 min-w-0 space-y-6">
            {loading && (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-cream-dark px-5 py-4 animate-pulse flex items-center gap-4">
                  <div className="w-16 flex-shrink-0 space-y-1.5"><div className="h-4 bg-cream rounded" /><div className="h-3 bg-cream rounded" /></div>
                  <div className="w-px h-10 bg-cream flex-shrink-0" />
                  <div className="flex-1 space-y-1.5"><div className="h-4 bg-cream rounded w-36" /><div className="h-3 bg-cream rounded w-52" /></div>
                  <div className="h-6 bg-cream rounded-full w-20" />
                </div>
              ))
            )}
            {!loading && grouped.size === 0 && (
              <p className="text-sm text-primary-warm py-12 text-center">No appointments found.</p>
            )}
            {!loading && Array.from(grouped.entries()).map(([date, apts]) => (
              <div key={date}>
                <div className="flex items-center gap-3 mb-3">
                  <p className="text-xs font-semibold text-primary-warm uppercase tracking-wider">{formatDate(date)}</p>
                  <div className="flex-1 h-px bg-cream-dark" />
                </div>
                <div className="space-y-2">
                  {apts.map(apt => (
                    <button
                      key={apt.id}
                      onClick={() => setSelected(apt)}
                      className={clsx(
                        'w-full text-left bg-white rounded-2xl border px-5 py-4 flex items-center gap-4 hover:border-primary/25 hover:shadow-sm transition-all',
                        selected?.id === apt.id ? 'border-primary/30 shadow-sm' : 'border-cream-dark'
                      )}
                    >
                      <div className="w-16 flex-shrink-0 text-center">
                        <p className="text-sm font-semibold text-primary-dark">{formatTime(apt.time)}</p>
                        <p className="text-xs text-primary-warm">{apt.duration}</p>
                      </div>

                      <div className="w-px h-10 bg-cream-dark flex-shrink-0" />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-primary-dark">{apt.name}</p>
                          {apt.bookedVia === 'AI call' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/8 text-primary border border-primary/15">AI booked</span>
                          )}
                        </div>
                        <p className="text-xs text-primary-warm mt-0.5">{apt.purpose} · {apt.caller}</p>
                      </div>

                      <span className={clsx('text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0', statusConfig[apt.status].cls)}>
                        {statusConfig[apt.status].label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {selected && (
            <div className={clsx(
              'bg-white border border-cream-dark',
              'fixed inset-0 z-50 overflow-y-auto',
              'lg:relative lg:inset-auto lg:z-auto lg:w-72 lg:flex-shrink-0 lg:h-fit lg:sticky lg:top-6 lg:rounded-2xl lg:overflow-visible'
            )}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-cream-dark">
                <div className="flex items-center gap-2 min-w-0">
                  <button onClick={() => setSelected(null)} className="lg:hidden flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-primary-warm hover:bg-cream transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                    </svg>
                  </button>
                  <p className="font-semibold text-primary-dark text-sm truncate">{selected.name}</p>
                </div>
                <button onClick={() => setSelected(null)} className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-primary-warm hover:bg-cream transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-xs text-primary-warm mb-1">Customer</p>
                  <p className="text-sm font-medium text-primary-dark">{selected.name}</p>
                  <p className="text-xs text-primary-warm">{selected.caller}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-primary-warm mb-0.5">Date</p>
                    <p className="font-medium text-primary-dark">{formatDate(selected.date)}</p>
                  </div>
                  <div>
                    <p className="text-primary-warm mb-0.5">Time</p>
                    <p className="font-medium text-primary-dark">{formatTime(selected.time)}</p>
                  </div>
                  <div>
                    <p className="text-primary-warm mb-0.5">Duration</p>
                    <p className="font-medium text-primary-dark">{selected.duration}</p>
                  </div>
                  <div>
                    <p className="text-primary-warm mb-0.5">Booked via</p>
                    <p className="font-medium text-primary-dark">{selected.bookedVia}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-primary-warm mb-0.5">Purpose</p>
                  <p className="text-sm text-primary-dark">{selected.purpose}</p>
                </div>
                {selected.notes && (
                  <div>
                    <p className="text-xs text-primary-warm mb-0.5">Notes</p>
                    <p className="text-xs text-primary-dark leading-relaxed">{selected.notes}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-primary-warm mb-2">Status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['confirmed', 'completed', 'cancelled'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => updateStatus(selected.id, s)}
                        className={clsx(
                          'text-xs px-3 py-1.5 rounded-full font-medium border transition-colors capitalize',
                          selected.status === s
                            ? statusConfig[s].cls + ' border-transparent'
                            : 'bg-cream text-primary-warm border-cream-dark hover:border-primary/20'
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
        <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden min-w-[560px]">
          <div className="px-6 py-4 border-b border-cream-dark flex items-center justify-between">
            <p className="font-semibold text-primary-dark">
              {MONTHS[calMonth]} {calYear}
            </p>
            <span className="text-xs text-primary-warm">{aptsThisMonth.length} appointments</span>
          </div>

          <div className="grid grid-cols-7 border-b border-cream-dark">
            {DAYS.map(d => (
              <div key={d} className="py-2.5 text-center text-xs font-semibold text-primary-warm">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calCells.map((day, i) => {
              if (!day) return <div key={i} className="min-h-[90px] bg-cream-light/40 border-r border-b border-cream-dark" />;

              const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayApts = aptsThisMonth.filter(a => a.date === dateStr);
              const isToday = day === today.getDate();

              return (
                <div key={i} className={clsx('min-h-[90px] p-2 border-r border-b border-cream-dark', isToday && 'bg-primary/3')}>
                  <div className={clsx(
                    'w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-1',
                    isToday ? 'bg-primary text-cream-light' : 'text-primary-warm'
                  )}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {dayApts.slice(0, 2).map(apt => (
                      <button
                        key={apt.id}
                        onClick={() => { setSelected(apt); setView('list'); }}
                        className={clsx(
                          'w-full text-left text-[10px] px-1.5 py-0.5 rounded font-medium truncate',
                          apt.status === 'confirmed' ? 'bg-success/15 text-success' :
                          apt.status === 'pending'   ? 'bg-warning/15 text-warning' :
                          apt.status === 'cancelled' ? 'bg-danger/10 text-danger' :
                          'bg-cream-dark text-primary-warm'
                        )}
                      >
                        {formatTime(apt.time)} {apt.name.split(' ')[0]}
                      </button>
                    ))}
                    {dayApts.length > 2 && (
                      <p className="text-[10px] text-primary-warm px-1">+{dayApts.length - 2} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </div>
      )}

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onSave={addAppointment} />}
    </div>
  );
}
