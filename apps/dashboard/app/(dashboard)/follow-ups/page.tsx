'use client';

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { useAuth } from '../../../hooks/useAuth';
import { usePlan } from '../../../hooks/usePlan';
import { UpgradeWall } from '../../../components/UpgradeWall';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../../lib/api';

type FollowUpType = 'CALL' | 'WHATSAPP' | 'NOTE' | 'EMAIL';
type FollowUpStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

interface FollowUp {
  id: string;
  businessId: string;
  contactId: string;
  callId?: string | null;
  type: FollowUpType;
  title: string;
  notes?: string | null;
  scheduledAt: string;
  status: FollowUpStatus;
  completedAt?: string | null;
  createdAt: string;
}

interface Contact {
  id: string;
  phone: string;
  name?: string | null;
}

const typeConfig: Record<FollowUpType, { label: string; icon: React.ReactNode; cls: string }> = {
  CALL:      { label: 'Call',      cls: 'bg-blue-500/10 text-blue-400',   icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg> },
  WHATSAPP:  { label: 'WhatsApp', cls: 'bg-success/10 text-success',      icon: <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> },
  EMAIL:     { label: 'Email',     cls: 'bg-purple-500/10 text-purple-400', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg> },
  NOTE:      { label: 'Note',      cls: 'bg-yellow-500/10 text-yellow-400', icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg> },
};

const statusConfig: Record<FollowUpStatus, { label: string; cls: string }> = {
  PENDING:   { label: 'Pending',   cls: 'bg-yellow-500/10 text-yellow-500' },
  COMPLETED: { label: 'Completed', cls: 'bg-success/10 text-success' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-danger/10 text-danger' },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return `Today ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function isOverdue(iso: string, status: FollowUpStatus) {
  return status === 'PENDING' && new Date(iso) < new Date();
}

const emptyForm = {
  contactId: '',
  type: 'CALL' as FollowUpType,
  title: '',
  notes: '',
  scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
};

export default function FollowUpsPage() {
  const { token, ready } = useAuth();
  const { features, ready: planReady } = usePlan(token);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [statusFilter, setStatusFilter] = useState<FollowUpStatus | ''>('PENDING');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const [fuData, cData] = await Promise.all([
        apiGet<{ followUps: FollowUp[] }>(`/follow-ups?${params}`, token),
        apiGet<{ contacts: Contact[] }>('/contacts?limit=100', token),
      ]);
      setFollowUps(fuData.followUps);
      setContacts(cData.contacts);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token, statusFilter]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  function openCreate() {
    setForm(emptyForm);
    setEditId(null);
    setErr('');
    setShowModal(true);
  }

  function openEdit(fu: FollowUp) {
    setForm({
      contactId: fu.contactId,
      type: fu.type,
      title: fu.title,
      notes: fu.notes ?? '',
      scheduledAt: new Date(fu.scheduledAt).toISOString().slice(0, 16),
    });
    setEditId(fu.id);
    setErr('');
    setShowModal(true);
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    setErr('');
    try {
      const body = {
        ...form,
        notes: form.notes || undefined,
      };
      if (editId) {
        const updated = await apiPatch<FollowUp>(`/follow-ups/${editId}`, body, token);
        setFollowUps(prev => prev.map(f => f.id === updated.id ? updated : f));
      } else {
        const created = await apiPost<FollowUp>('/follow-ups', body, token);
        setFollowUps(prev => [created, ...prev]);
      }
      setShowModal(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  async function markStatus(id: string, status: FollowUpStatus) {
    if (!token) return;
    try {
      const updated = await apiPatch<FollowUp>(`/follow-ups/${id}`, { status }, token);
      setFollowUps(prev => prev.map(f => f.id === updated.id ? updated : f));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to update follow-up');
    }
  }

  async function deleteFu(id: string) {
    if (!token || !confirm('Delete this follow-up?')) return;
    try {
      await apiDelete(`/follow-ups/${id}`, token);
      setFollowUps(prev => prev.filter(f => f.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete follow-up');
    }
  }

  const contactMap = Object.fromEntries(contacts.map(c => [c.id, c]));

  const pending = followUps.filter(f => f.status === 'PENDING');
  const rest = followUps.filter(f => f.status !== 'PENDING');
  const overdue = pending.filter(f => isOverdue(f.scheduledAt, f.status));
  const upcoming = pending.filter(f => !isOverdue(f.scheduledAt, f.status));

  if (planReady && !features.crm) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 h-full flex flex-col">
        <h1 className="font-heading font-bold text-2xl text-primary-dark mb-1">Follow-ups</h1>
        <p className="text-sm text-primary-warm mb-6">Sales & customer follow-up tasks</p>
        <UpgradeWall
          requiredPlan="Enterprise"
          title="Sales Follow-ups"
          description="Schedule and track follow-up calls, WhatsApp messages, emails, and notes for your leads. Part of the Enterprise CRM suite."
          icon={
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z" />
            </svg>
          }
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold font-display text-primary-dark">Follow-ups</h1>
          <p className="text-sm text-primary-warm mt-0.5">
            {pending.length} pending{overdue.length > 0 ? `, ${overdue.length} overdue` : ''}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-primary text-cream-light text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="hidden sm:inline">New follow-up</span>
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-1 px-1 flex-shrink-0">
        {(['PENDING', 'COMPLETED', 'CANCELLED', ''] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={clsx(
              'px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap',
              statusFilter === s
                ? 'bg-primary text-cream-light'
                : 'bg-white border border-cream-dark text-primary-warm hover:bg-cream-light'
            )}
          >
            {s === '' ? 'All' : statusConfig[s].label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-primary-warm/60 text-sm">Loading…</div>
      ) : followUps.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2">
          <svg className="w-10 h-10 text-primary-warm/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
          </svg>
          <p className="text-sm text-primary-warm/50">No follow-ups found</p>
          <button onClick={openCreate} className="text-sm text-primary hover:underline">Create one</button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-6">
          {statusFilter === 'PENDING' || statusFilter === '' ? (
            <>
              {overdue.length > 0 && (
                <Section title={`Overdue (${overdue.length})`} titleCls="text-danger">
                  {overdue.map(fu => <FuCard key={fu.id} fu={fu} contact={contactMap[fu.contactId]} onEdit={openEdit} onDelete={deleteFu} onStatus={markStatus} />)}
                </Section>
              )}
              {upcoming.length > 0 && (
                <Section title="Upcoming">
                  {upcoming.map(fu => <FuCard key={fu.id} fu={fu} contact={contactMap[fu.contactId]} onEdit={openEdit} onDelete={deleteFu} onStatus={markStatus} />)}
                </Section>
              )}
              {statusFilter === '' && rest.length > 0 && (
                <Section title="Past">
                  {rest.map(fu => <FuCard key={fu.id} fu={fu} contact={contactMap[fu.contactId]} onEdit={openEdit} onDelete={deleteFu} onStatus={markStatus} />)}
                </Section>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {followUps.map(fu => (
                <FuCard key={fu.id} fu={fu} contact={contactMap[fu.contactId]} onEdit={openEdit} onDelete={deleteFu} onStatus={markStatus} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-cream-dark">
              <h2 className="text-lg font-bold text-primary-dark">{editId ? 'Edit Follow-up' : 'New Follow-up'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-cream-light text-primary-warm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Contact *">
                <select value={form.contactId} onChange={e => setForm(f => ({ ...f, contactId: e.target.value }))} className="input">
                  <option value="">Select contact…</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>{c.name || c.phone}</option>
                  ))}
                </select>
              </Field>
              <Field label="Type">
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as FollowUpType }))} className="input">
                  {(['CALL', 'WHATSAPP', 'EMAIL', 'NOTE'] as const).map(t => (
                    <option key={t} value={t}>{typeConfig[t].label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Title *">
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Follow up on proposal" className="input" />
              </Field>
              <Field label="Scheduled at *">
                <input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} className="input" />
              </Field>
              <Field label="Notes">
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Details…" className="input resize-none" />
              </Field>
              {err && <p className="text-sm text-danger">{err}</p>}
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-cream-dark text-sm text-primary-warm hover:bg-cream-light transition-colors">Cancel</button>
              <button onClick={save} disabled={saving || !form.contactId || !form.title} className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-cream-light text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60">
                {saving ? 'Saving…' : editId ? 'Save changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .input { width: 100%; padding: 0.5rem 0.75rem; border-radius: 0.75rem; border: 1px solid #E8DDD3; background: #FAF6EE; font-size: 0.875rem; color: #3B2314; outline: none; }
        .input:focus { border-color: rgba(92,61,46,0.5); }
      `}</style>
    </div>
  );
}

function Section({ title, titleCls, children }: { title: string; titleCls?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className={clsx('text-sm font-semibold mb-3', titleCls || 'text-primary-warm/70')}>{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
    </div>
  );
}

function FuCard({ fu, contact, onEdit, onDelete, onStatus }: {
  fu: FollowUp;
  contact?: Contact;
  onEdit: (fu: FollowUp) => void;
  onDelete: (id: string) => void;
  onStatus: (id: string, s: FollowUpStatus) => void;
}) {
  const overdue = isOverdue(fu.scheduledAt, fu.status);
  const tc = typeConfig[fu.type];
  const sc = statusConfig[fu.status];

  return (
    <div className={clsx(
      'bg-white rounded-2xl border p-4 flex flex-col gap-3 transition-colors',
      overdue ? 'border-danger/30 bg-danger/5' : 'border-cream-dark'
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={clsx('p-1.5 rounded-lg flex-shrink-0', tc.cls)}>{tc.icon}</span>
          <p className="text-sm font-medium text-primary-dark truncate">{fu.title}</p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={() => onEdit(fu)} className="p-1.5 rounded-lg hover:bg-cream-light text-primary-warm/60 hover:text-primary-dark transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
          </button>
          <button onClick={() => onDelete(fu.id)} className="p-1.5 rounded-lg hover:bg-danger/10 text-primary-warm/60 hover:text-danger transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
          </button>
        </div>
      </div>

      {contact && (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-semibold text-primary">{(contact.name || contact.phone)[0]?.toUpperCase()}</span>
          </div>
          <span className="text-xs text-primary-warm truncate">{contact.name || contact.phone}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className={clsx('text-[11px] font-medium', overdue ? 'text-danger' : 'text-primary-warm/60')}>
          {formatDate(fu.scheduledAt)}
        </span>
        <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-medium', sc.cls)}>{sc.label}</span>
      </div>

      {fu.status === 'PENDING' && (
        <div className="flex gap-2 pt-1 border-t border-cream-dark">
          <button onClick={() => onStatus(fu.id, 'COMPLETED')} className="flex-1 text-xs py-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors font-medium">
            Mark done
          </button>
          <button onClick={() => onStatus(fu.id, 'CANCELLED')} className="flex-1 text-xs py-1.5 rounded-lg bg-cream-light text-primary-warm/70 hover:bg-cream-dark transition-colors">
            Cancel
          </button>
        </div>
      )}

      {fu.notes && (
        <p className="text-xs text-primary-warm/70 line-clamp-2">{fu.notes}</p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-primary-warm mb-1.5">{label}</label>
      {children}
    </div>
  );
}
