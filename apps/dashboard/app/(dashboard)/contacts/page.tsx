'use client';

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { useAuth } from '../../../hooks/useAuth';
import { usePlan } from '../../../hooks/usePlan';
import { UpgradeWall } from '../../../components/UpgradeWall';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../../lib/api';

type Stage = 'LEAD' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'CLOSED_WON' | 'CLOSED_LOST';

interface Contact {
  id: string;
  phone: string;
  name?: string | null;
  email?: string | null;
  location?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  stage: Stage;
  totalCalls?: number | null;
  lastCallAt?: string | null;
  businessId: string;
  createdAt: string;
}

interface ApiResponse {
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
}

const STAGES: Stage[] = ['LEAD', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'CLOSED_WON', 'CLOSED_LOST'];

const stageConfig: Record<Stage, { label: string; cls: string }> = {
  LEAD:        { label: 'Lead',        cls: 'bg-blue-500/10 text-blue-400' },
  CONTACTED:   { label: 'Contacted',   cls: 'bg-yellow-500/10 text-yellow-400' },
  QUALIFIED:   { label: 'Qualified',   cls: 'bg-purple-500/10 text-purple-400' },
  PROPOSAL:    { label: 'Proposal',    cls: 'bg-orange-500/10 text-orange-400' },
  CLOSED_WON:  { label: 'Won',         cls: 'bg-success/10 text-success' },
  CLOSED_LOST: { label: 'Lost',        cls: 'bg-danger/10 text-danger' },
};

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const emptyForm = { name: '', phone: '', email: '', location: '', notes: '', stage: 'LEAD' as Stage };

export default function ContactsPage() {
  const { token, ready } = useAuth();
  const { features, ready: planReady } = usePlan(token);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [mobileDetail, setMobileDetail] = useState(false);

  const LIMIT = 25;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search) params.set('search', search);
      if (stageFilter) params.set('stage', stageFilter);
      const data = await apiGet<ApiResponse>(`/contacts?${params}`, token);
      setContacts(data.contacts);
      setTotal(data.total);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token, page, search, stageFilter]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  function openCreate() {
    setForm(emptyForm);
    setSelected(null);
    setErr('');
    setShowModal(true);
  }

  function openEdit(c: Contact) {
    setForm({
      name: c.name ?? '',
      phone: c.phone,
      email: c.email ?? '',
      location: c.location ?? '',
      notes: c.notes ?? '',
      stage: c.stage,
    });
    setSelected(c);
    setErr('');
    setShowModal(true);
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    setErr('');
    try {
      const body: Record<string, unknown> = {
        name: form.name || undefined,
        email: form.email || undefined,
        location: form.location || undefined,
        notes: form.notes || undefined,
        stage: form.stage,
      };
      if (selected) {
        const updated = await apiPatch<Contact>(`/contacts/${selected.id}`, body, token);
        setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
        setSelected(updated);
      } else {
        body.phone = form.phone;
        const created = await apiPost<Contact>('/contacts', body, token);
        setContacts(prev => [created, ...prev]);
        setTotal(t => t + 1);
      }
      setShowModal(false);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  async function deleteContact(id: string) {
    if (!token || !confirm('Delete this contact?')) return;
    try {
      await apiDelete(`/contacts/${id}`, token);
      setContacts(prev => prev.filter(c => c.id !== id));
      setTotal(t => t - 1);
      if (selected?.id === id) { setSelected(null); setMobileDetail(false); }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete contact');
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  if (planReady && !features.crm) {
    return (
      <div className="p-6 lg:p-8 h-full flex flex-col">
        <h1 className="font-heading font-bold text-2xl text-primary-dark mb-1">Contacts</h1>
        <p className="text-sm text-primary-warm mb-6">CRM & sales pipeline</p>
        <UpgradeWall
          requiredPlan="Enterprise"
          title="CRM & Sales Pipeline"
          description="Track leads, manage contacts, view call history per customer, and move deals through your sales pipeline. Available on the Enterprise plan."
          icon={
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
            </svg>
          }
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-display text-primary-dark">Contacts</h1>
          <p className="text-sm text-primary-warm mt-0.5">{total.toLocaleString()} contact{total !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-cream-light text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add contact
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-warm/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name, phone, email…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-primary-warm/50 focus:outline-none focus:border-primary/50"
          />
        </div>
        <select
          value={stageFilter}
          onChange={e => { setStageFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark focus:outline-none focus:border-primary/50"
        >
          <option value="">All stages</option>
          {STAGES.map(s => <option key={s} value={s}>{stageConfig[s].label}</option>)}
        </select>
      </div>

      {/* Two-panel layout */}
      <div className="flex-1 min-h-0 flex gap-5 overflow-hidden">
        {/* List */}
        <div className={clsx('flex flex-col min-h-0 flex-1 lg:max-w-[55%]', selected && mobileDetail ? 'hidden lg:flex' : 'flex')}>
          <div className="flex-1 overflow-y-auto rounded-2xl border border-cream-dark bg-white">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-primary-warm/60 text-sm">Loading…</div>
            ) : contacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <svg className="w-8 h-8 text-primary-warm/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm text-primary-warm/50">No contacts found</p>
              </div>
            ) : contacts.map((c, i) => (
              <div
                key={c.id}
                onClick={() => { setSelected(c); setMobileDetail(true); }}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
                  i !== contacts.length - 1 && 'border-b border-cream-dark',
                  selected?.id === c.id ? 'bg-cream-light' : 'hover:bg-cream-light/50'
                )}
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-primary">{(c.name || c.phone)[0]?.toUpperCase()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-primary-dark truncate">{c.name || c.phone}</p>
                  <p className="text-xs text-primary-warm/70 truncate">{c.name ? c.phone : c.email || '—'}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-medium', stageConfig[c.stage].cls)}>
                    {stageConfig[c.stage].label}
                  </span>
                  {c.totalCalls != null && c.totalCalls > 0 && (
                    <span className="text-[10px] text-primary-warm/50">{c.totalCalls} call{c.totalCalls !== 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 text-sm text-primary-warm">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg border border-cream-dark bg-white disabled:opacity-40 hover:bg-cream-light transition-colors">
                ← Prev
              </button>
              <span className="text-xs">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg border border-cream-dark bg-white disabled:opacity-40 hover:bg-cream-light transition-colors">
                Next →
              </button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className={clsx(
          'flex-1 rounded-2xl border border-cream-dark bg-white overflow-y-auto',
          selected && mobileDetail ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
        )}>
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-primary-warm/40">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm">Select a contact</p>
            </div>
          ) : (
            <>
              {/* Mobile back */}
              <div className="lg:hidden border-b border-cream-dark px-4 py-3">
                <button onClick={() => { setMobileDetail(false); setSelected(null); }} className="flex items-center gap-1 text-sm text-primary-warm hover:text-primary-dark">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                  Back
                </button>
              </div>

              <div className="p-5">
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg font-semibold text-primary">{(selected.name || selected.phone)[0]?.toUpperCase()}</span>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-primary-dark">{selected.name || 'No name'}</h2>
                      <p className="text-sm text-primary-warm">{selected.phone}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(selected)} className="p-2 rounded-lg border border-cream-dark hover:bg-cream-light transition-colors text-primary-warm hover:text-primary-dark">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                    </button>
                    <button onClick={() => deleteContact(selected.id)} className="p-2 rounded-lg border border-cream-dark hover:bg-danger/10 transition-colors text-primary-warm hover:text-danger">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-5">
                  <InfoRow label="Stage">
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', stageConfig[selected.stage].cls)}>
                      {stageConfig[selected.stage].label}
                    </span>
                  </InfoRow>
                  <InfoRow label="Email">{selected.email || '—'}</InfoRow>
                  <InfoRow label="Location">{selected.location || '—'}</InfoRow>
                  <InfoRow label="Total Calls">{selected.totalCalls ?? 0}</InfoRow>
                  <InfoRow label="Last Call">{formatDate(selected.lastCallAt)}</InfoRow>
                  <InfoRow label="Added">{formatDate(selected.createdAt)}</InfoRow>
                </div>

                {selected.tags && selected.tags.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-primary-warm/60 uppercase tracking-wide mb-2">Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.tags.map(t => (
                        <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-cream-light border border-cream-dark text-primary-warm">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selected.notes && (
                  <div>
                    <p className="text-xs font-medium text-primary-warm/60 uppercase tracking-wide mb-1.5">Notes</p>
                    <p className="text-sm text-primary-dark whitespace-pre-wrap">{selected.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-cream-dark">
              <h2 className="text-lg font-bold text-primary-dark">{selected ? 'Edit Contact' : 'New Contact'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-cream-light text-primary-warm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {!selected && (
                <Field label="Phone *">
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+234…" className="input" />
                </Field>
              )}
              <Field label="Name">
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" className="input" />
              </Field>
              <Field label="Email">
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" className="input" />
              </Field>
              <Field label="Location">
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="City, Country" className="input" />
              </Field>
              <Field label="Stage">
                <select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value as Stage }))} className="input">
                  {STAGES.map(s => <option key={s} value={s}>{stageConfig[s].label}</option>)}
                </select>
              </Field>
              <Field label="Notes">
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Any notes…" className="input resize-none" />
              </Field>
              {err && <p className="text-sm text-danger">{err}</p>}
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-cream-dark text-sm text-primary-warm hover:bg-cream-light transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-cream-light text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60">
                {saving ? 'Saving…' : selected ? 'Save changes' : 'Create'}
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

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-primary-warm/60 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-primary-dark">{children}</p>
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
