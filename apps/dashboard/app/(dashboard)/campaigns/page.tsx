'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import { apiGet, apiPost, apiDelete } from '../../../lib/api';
import * as XLSX from 'xlsx';

const PRICE_PER_CALL = 0.25;
const MIN_CALLS = 4;

type CampaignStatus = 'DRAFT' | 'PENDING_PAYMENT' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';
type ContactStatus = 'PENDING' | 'CALLING' | 'ANSWERED' | 'VOICEMAIL' | 'NO_ANSWER' | 'FAILED';

interface Campaign {
  id: string;
  name: string;
  goal: string;
  script?: string | null;
  status: CampaignStatus;
  contactCount: number;
  dialedCount: number;
  answeredCount: number;
  voicemailCount: number;
  totalCost: string;
  paidAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

interface CampaignContact {
  id: string;
  name?: string | null;
  phoneNumber: string;
  status: ContactStatus;
  calledAt?: string | null;
}

interface ContactInput {
  name: string;
  phoneNumber: string;
}

interface BusinessContact {
  id: string;
  name: string | null;
  phone: string;
}

const STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'Draft',
  PENDING_PAYMENT: 'Awaiting Payment',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_COLORS: Record<CampaignStatus, string> = {
  DRAFT: 'bg-sand-light text-primary',
  PENDING_PAYMENT: 'bg-yellow-100 text-yellow-800',
  RUNNING: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const CONTACT_STATUS_COLORS: Record<ContactStatus, string> = {
  PENDING: 'bg-sand-light text-primary',
  CALLING: 'bg-yellow-100 text-yellow-800',
  ANSWERED: 'bg-green-100 text-green-700',
  VOICEMAIL: 'bg-blue-100 text-blue-700',
  NO_ANSWER: 'bg-orange-100 text-orange-700',
  FAILED: 'bg-red-100 text-red-700',
};

type Step = 'list' | 'create-1' | 'create-2' | 'create-3' | 'detail';

function PaymentReturnHandler({ onPaid }: { onPaid: () => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (searchParams.get('paid')) { onPaid(); router.replace('/campaigns'); }
    if (searchParams.get('cancelled')) { router.replace('/campaigns'); }
  }, [searchParams, onPaid, router]);
  return null;
}

export default function CampaignsPage() {
  const { token } = useAuth();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('list');
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [detailContacts, setDetailContacts] = useState<CampaignContact[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [deleting, setDeleting] = useState('');
  const [error, setError] = useState('');

  // Create form state
  const [form, setForm] = useState({ name: '', goal: '', script: '' });
  const [contacts, setContacts] = useState<ContactInput[]>([{ name: '', phoneNumber: '' }]);
  const [creating, setCreating] = useState(false);
  const [newCampaign, setNewCampaign] = useState<Campaign | null>(null);

  // Contact import / picker state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bizContacts, setBizContacts] = useState<BusinessContact[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const [loadingBizContacts, setLoadingBizContacts] = useState(false);

  const callCount = Math.max(contacts.filter(c => c.phoneNumber.trim()).length, MIN_CALLS);
  const totalCost = (callCount * PRICE_PER_CALL).toFixed(2);
  const actualContacts = contacts.filter(c => c.phoneNumber.trim()).length;

  const loadCampaigns = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiGet<{ campaigns: Campaign[] }>('/campaigns', token);
      setCampaigns(res.campaigns);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  async function loadDetail(campaign: Campaign) {
    setSelected(campaign);
    setStep('detail');
    setLoadingDetail(true);
    try {
      const res = await apiGet<{ campaign: Campaign; contacts: CampaignContact[] }>(`/campaigns/${campaign.id}`, token);
      setSelected(res.campaign);
      setDetailContacts(res.contacts);
    } catch {
      // ignore
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleCreate() {
    if (!token) return;
    const validContacts = contacts.filter(c => c.phoneNumber.trim());
    if (!validContacts.length) { setError('Add at least one contact.'); return; }
    setCreating(true);
    setError('');
    try {
      const res = await apiPost<{ campaign: Campaign }>('/campaigns', {
        name: form.name,
        goal: form.goal,
        script: form.script || undefined,
        contacts: validContacts,
      }, token);
      setNewCampaign(res.campaign);
      setStep('create-3');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setCreating(false);
    }
  }

  async function handleCheckout(campaign: Campaign) {
    if (!token) return;
    setCheckingOut(true);
    setError('');
    try {
      const res = await apiPost<{ url: string }>(`/campaigns/${campaign.id}/checkout`, {}, token);
      if (res.url) window.location.href = res.url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create checkout session. Make sure Stripe is configured.');
      setCheckingOut(false);
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    setDeleting(id);
    try {
      await apiDelete(`/campaigns/${id}`, token);
      setCampaigns(prev => prev.filter(c => c.id !== id));
      if (selected?.id === id) setStep('list');
    } catch {
      // ignore
    } finally {
      setDeleting('');
    }
  }

  function addContact() {
    setContacts(prev => [...prev, { name: '', phoneNumber: '' }]);
  }

  function updateContact(idx: number, field: keyof ContactInput, value: string) {
    setContacts(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  function removeContact(idx: number) {
    setContacts(prev => prev.filter((_, i) => i !== idx));
  }

  function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
        const imported: ContactInput[] = [];
        for (const row of rows as unknown[][]) {
          if (!row || row.length === 0) continue;
          const phone = String(row[0] ?? '').trim();
          const name = String(row[1] ?? '').trim();
          if (phone && phone.match(/^\+?[\d\s\-().]{5,}/)) {
            imported.push({ phoneNumber: phone, name });
          }
        }
        if (imported.length > 0) {
          setContacts(prev => {
            const existing = prev.filter(c => c.phoneNumber.trim());
            const merged = [...existing, ...imported];
            return merged.length > 0 ? merged : [{ name: '', phoneNumber: '' }];
          });
        }
      } catch { /* ignore parse errors */ }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  async function openContactPicker() {
    setShowPicker(true);
    if (bizContacts.length > 0) return;
    setLoadingBizContacts(true);
    try {
      const res = await apiGet<{ contacts: BusinessContact[] }>('/campaigns/contacts/list', token);
      setBizContacts(res.contacts);
    } catch { /* ignore */ } finally {
      setLoadingBizContacts(false);
    }
  }

  function confirmPickerSelection() {
    const toAdd = bizContacts
      .filter(c => pickerSelected.has(c.id))
      .map(c => ({ name: c.name ?? '', phoneNumber: c.phone }));
    if (toAdd.length > 0) {
      setContacts(prev => {
        const existing = prev.filter(c => c.phoneNumber.trim());
        return [...existing, ...toAdd];
      });
    }
    setShowPicker(false);
    setPickerSelected(new Set());
    setPickerSearch('');
  }

  function resetCreate() {
    setForm({ name: '', goal: '', script: '' });
    setContacts([{ name: '', phoneNumber: '' }]);
    setNewCampaign(null);
    setError('');
    setStep('list');
    loadCampaigns();
  }

  // ── Detail view ───────────────────────────────────────────────────────────
  if (step === 'detail' && selected) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button onClick={() => setStep('list')} className="flex items-center gap-1.5 text-sm text-primary/60 hover:text-primary mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Campaigns
        </button>

        <div className="bg-white rounded-2xl border border-sand p-6 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-xl font-semibold text-primary">{selected.name}</h1>
              <p className="text-sm text-primary/60 mt-1">{selected.goal}</p>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[selected.status]}`}>
              {STATUS_LABELS[selected.status]}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Contacts', value: selected.contactCount },
              { label: 'Dialed', value: selected.dialedCount },
              { label: 'Answered', value: selected.answeredCount },
              { label: 'Total Cost', value: `$${selected.totalCost}` },
            ].map(s => (
              <div key={s.label} className="bg-sand-light rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-primary">{s.value}</div>
                <div className="text-xs text-primary/50 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {selected.status === 'PENDING_PAYMENT' && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-yellow-900">Payment required to start this campaign</p>
                <p className="text-xs text-yellow-700 mt-0.5">${selected.totalCost} total · ${PRICE_PER_CALL}/call</p>
              </div>
              <button
                onClick={() => handleCheckout(selected)}
                disabled={checkingOut}
                className="px-4 py-2 bg-primary text-cream-light rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex-shrink-0"
              >
                {checkingOut ? 'Redirecting…' : 'Pay & Activate'}
              </button>
            </div>
          )}
        </div>

        <h2 className="text-sm font-semibold text-primary mb-3">Contacts ({detailContacts.length})</h2>
        {loadingDetail ? (
          <div className="text-center py-8 text-primary/40 text-sm">Loading…</div>
        ) : (
          <div className="bg-white rounded-2xl border border-sand overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand bg-sand-light/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-primary/50">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-primary/50">Phone</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-primary/50">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-primary/50">Called At</th>
                </tr>
              </thead>
              <tbody>
                {detailContacts.map(c => (
                  <tr key={c.id} className="border-b border-sand/50 last:border-0 hover:bg-sand-light/30">
                    <td className="px-4 py-3 text-primary">{c.name || '—'}</td>
                    <td className="px-4 py-3 text-primary/70 font-mono text-xs">{c.phoneNumber}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CONTACT_STATUS_COLORS[c.status]}`}>
                        {c.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-primary/50 text-xs">
                      {c.calledAt ? new Date(c.calledAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── Create Step 1: Details ────────────────────────────────────────────────
  if (step === 'create-1') {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <button onClick={() => setStep('list')} className="flex items-center gap-1.5 text-sm text-primary/60 hover:text-primary mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-primary">New Campaign</h1>
          <p className="text-sm text-primary/60 mt-1">Step 1 of 2 — Campaign details</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-primary mb-1.5">Campaign Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. June Follow-Up, Quote Reminder"
              className="w-full px-4 py-2.5 rounded-xl border border-sand bg-white text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary mb-1.5">Goal / Purpose</label>
            <input
              type="text"
              value={form.goal}
              onChange={e => setForm(p => ({ ...p, goal: e.target.value }))}
              placeholder="e.g. Follow up on quote sent last week"
              className="w-full px-4 py-2.5 rounded-xl border border-sand bg-white text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-xs text-primary/40 mt-1">The AI uses this to open the call naturally.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-primary mb-1.5">Opening Script Hint <span className="text-primary/40 font-normal">(optional)</span></label>
            <textarea
              value={form.script}
              onChange={e => setForm(p => ({ ...p, script: e.target.value }))}
              rows={3}
              placeholder="e.g. Mention the 20% discount offer that expires this Friday."
              className="w-full px-4 py-2.5 rounded-xl border border-sand bg-white text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={() => { if (form.name && form.goal) { setError(''); setStep('create-2'); } else setError('Fill in name and goal.'); }}
            className="px-6 py-2.5 bg-primary text-cream-light rounded-xl text-sm font-medium hover:bg-primary/90"
          >
            Next — Add Contacts
          </button>
        </div>
        {error && <p className="text-red-500 text-xs mt-3 text-right">{error}</p>}
      </div>
    );
  }

  // ── Create Step 2: Contacts ────────────────────────────────────────────────
  if (step === 'create-2') {
    const filteredBizContacts = bizContacts.filter(c =>
      !pickerSearch || (c.name ?? c.phone).toLowerCase().includes(pickerSearch.toLowerCase()) || c.phone.includes(pickerSearch)
    );

    return (
      <div className="p-6 max-w-xl mx-auto">
        <button onClick={() => setStep('create-1')} className="flex items-center gap-1.5 text-sm text-primary/60 hover:text-primary mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>

        <div className="mb-5">
          <h1 className="text-2xl font-bold text-primary">Add Contacts</h1>
          <p className="text-sm text-primary/60 mt-1">Step 2 of 2 — Who should be called?</p>
        </div>

        {/* Import actions */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={openContactPicker}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-sand bg-white text-sm text-primary hover:bg-sand-light transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            From Contacts
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-sand bg-white text-sm text-primary hover:bg-sand-light transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Import Excel
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelImport} />
          <p className="text-xs text-primary/40 self-center">Column A: phone, Column B: name</p>
        </div>

        {/* Contacts picker modal */}
        {showPicker && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]">
              <div className="p-4 border-b border-sand flex items-center justify-between">
                <h3 className="font-semibold text-primary">Select Contacts</h3>
                <button onClick={() => { setShowPicker(false); setPickerSelected(new Set()); }} className="text-primary/40 hover:text-primary">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-3 border-b border-sand">
                <input
                  type="text"
                  placeholder="Search by name or phone…"
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-sand text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-sand/50">
                {loadingBizContacts ? (
                  <div className="py-8 text-center text-primary/40 text-sm">Loading contacts…</div>
                ) : filteredBizContacts.length === 0 ? (
                  <div className="py-8 text-center text-primary/40 text-sm">No contacts found</div>
                ) : filteredBizContacts.map(c => (
                  <label key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-sand-light cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pickerSelected.has(c.id)}
                      onChange={e => setPickerSelected(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) { next.add(c.id); } else { next.delete(c.id); }
                        return next;
                      })}
                      className="rounded border-sand text-primary focus:ring-primary/20"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary truncate">{c.name || 'Unknown'}</p>
                      <p className="text-xs text-primary/50 font-mono">{c.phone}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="p-4 border-t border-sand flex items-center justify-between gap-3">
                <span className="text-xs text-primary/50">{pickerSelected.size} selected</span>
                <button
                  onClick={confirmPickerSelection}
                  disabled={pickerSelected.size === 0}
                  className="px-4 py-2 bg-primary text-cream-light rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-40"
                >
                  Add {pickerSelected.size > 0 ? `${pickerSelected.size} ` : ''}Contact{pickerSelected.size !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {contacts.map((c, i) => (
            <div key={i} className="flex gap-2 items-start">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Name (optional)"
                  value={c.name}
                  onChange={e => updateContact(i, 'name', e.target.value)}
                  className="px-3 py-2 rounded-xl border border-sand bg-white text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <input
                  type="tel"
                  placeholder="+234..."
                  value={c.phoneNumber}
                  onChange={e => updateContact(i, 'phoneNumber', e.target.value)}
                  className="px-3 py-2 rounded-xl border border-sand bg-white text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {contacts.length > 1 && (
                <button onClick={() => removeContact(i)} className="mt-2 text-primary/30 hover:text-red-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>

        <button onClick={addContact} className="mt-3 flex items-center gap-1.5 text-sm text-primary/60 hover:text-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add another contact
        </button>

        <div className="mt-6 p-4 bg-sand-light rounded-xl">
          <div className="flex justify-between text-sm">
            <span className="text-primary/60">{actualContacts} contact{actualContacts !== 1 ? 's' : ''} × ${PRICE_PER_CALL}/call</span>
            <span className="font-semibold text-primary">${totalCost}</span>
          </div>
          {actualContacts < MIN_CALLS && (
            <p className="text-xs text-primary/40 mt-1">Minimum {MIN_CALLS} calls charged (${(MIN_CALLS * PRICE_PER_CALL).toFixed(2)})</p>
          )}
        </div>

        {error && <p className="text-red-500 text-xs mt-3">{error}</p>}

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-6 py-2.5 bg-primary text-cream-light rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Review & Pay'}
          </button>
        </div>
      </div>
    );
  }

  // ── Create Step 3: Review & Pay ────────────────────────────────────────────
  if (step === 'create-3' && newCampaign) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="mb-8 text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-2xl font-bold text-primary">Campaign Created</h1>
          <p className="text-sm text-primary/60 mt-1">Pay to activate your campaign and start the calls.</p>
        </div>

        <div className="bg-white border border-sand rounded-2xl p-5 mb-6 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-primary/60">Campaign</span>
            <span className="font-medium text-primary">{newCampaign.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-primary/60">Goal</span>
            <span className="text-primary text-right max-w-[60%]">{newCampaign.goal}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-primary/60">Contacts</span>
            <span className="text-primary">{newCampaign.contactCount}</span>
          </div>
          <div className="border-t border-sand pt-3 flex justify-between font-semibold">
            <span className="text-primary">Total</span>
            <span className="text-primary text-lg">${newCampaign.totalCost}</span>
          </div>
          <p className="text-xs text-primary/40">$0.25 per call · minimum 4 calls ($1.00)</p>
        </div>

        {error && <p className="text-red-500 text-xs mb-4">{error}</p>}

        <div className="flex flex-col gap-3">
          <button
            onClick={() => handleCheckout(newCampaign)}
            disabled={checkingOut}
            className="w-full py-3 bg-primary text-cream-light rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {checkingOut ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Redirecting to payment…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                Pay ${newCampaign.totalCost} & Activate
              </>
            )}
          </button>
          <button onClick={resetCreate} className="text-sm text-primary/50 hover:text-primary text-center">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Campaign List ──────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Suspense fallback={null}>
        <PaymentReturnHandler onPaid={loadCampaigns} />
      </Suspense>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">Campaigns</h1>
          <p className="text-sm text-primary/60 mt-0.5">AI-powered outbound calls for sales & follow-ups</p>
        </div>
        <button
          onClick={() => { setStep('create-1'); setError(''); }}
          className="px-4 py-2.5 bg-primary text-cream-light rounded-xl text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New Campaign
        </button>
      </div>

      {/* Pricing info */}
      <div className="bg-sand-light rounded-2xl p-4 mb-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <p className="text-sm text-primary/70">
          <span className="font-semibold text-primary">$0.25 per call</span> · minimum 4 calls per campaign ($1.00) · pay before activation · all calls recorded
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-primary/40 text-sm">Loading campaigns…</div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-sand-light rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary/30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
          </div>
          <p className="text-primary/50 text-sm">No campaigns yet</p>
          <p className="text-primary/30 text-xs mt-1">Create your first outbound campaign to start calling contacts.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <div
              key={c.id}
              className="bg-white border border-sand rounded-2xl p-4 hover:border-primary/20 transition-colors cursor-pointer"
              onClick={() => loadDetail(c)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-primary text-sm truncate">{c.name}</h3>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[c.status]}`}>
                      {STATUS_LABELS[c.status]}
                    </span>
                  </div>
                  <p className="text-xs text-primary/50 truncate">{c.goal}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-xs text-primary/40">{c.contactCount} contact{c.contactCount !== 1 ? 's' : ''}</span>
                    <span className="text-xs text-primary/40">{c.dialedCount} dialed</span>
                    <span className="text-xs text-primary/40">{c.answeredCount} answered</span>
                    <span className="text-xs font-medium text-primary">${c.totalCost}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  {c.status === 'PENDING_PAYMENT' && (
                    <button
                      onClick={() => handleCheckout(c)}
                      disabled={checkingOut}
                      className="px-3 py-1.5 bg-primary text-cream-light rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                    >
                      Pay & Activate
                    </button>
                  )}
                  {(c.status === 'DRAFT' || c.status === 'PENDING_PAYMENT') && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={deleting === c.id}
                      className="p-1.5 text-primary/30 hover:text-red-500 rounded-lg"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </div>
              </div>

              {c.status === 'RUNNING' && c.contactCount > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-primary/50 mb-1">
                    <span>Progress</span>
                    <span>{c.dialedCount}/{c.contactCount}</span>
                  </div>
                  <div className="h-1.5 bg-sand-light rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.min(100, (c.dialedCount / c.contactCount) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
