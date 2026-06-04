'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { usePlan } from '../../../hooks/usePlan';
import { UpgradeWall } from '../../../components/UpgradeWall';
import { apiGet, apiPost, apiDelete } from '../../../lib/api';

type BroadcastStatus = 'SENDING' | 'COMPLETED' | 'FAILED';
type RecipientStatus = 'PENDING' | 'SENT' | 'FAILED';

interface Broadcast {
  id: string;
  title?: string | null;
  message: string;
  status: BroadcastStatus;
  totalRecipients: number;
  sentCount?: number | null;
  failedCount?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

interface Recipient {
  id: string;
  contactId: string;
  phone: string;
  status: RecipientStatus;
  error?: string | null;
  sentAt?: string | null;
}

interface Contact {
  id: string;
  phone: string;
  name?: string | null;
  tags?: string[] | null;
}

const statusColors: Record<BroadcastStatus, string> = {
  SENDING: 'bg-sky-500/10 text-sky-700',
  COMPLETED: 'bg-emerald-500/10 text-emerald-700',
  FAILED: 'bg-red-500/10 text-red-700',
};

const recipientStatusColors: Record<RecipientStatus, string> = {
  PENDING: 'bg-amber-500/10 text-amber-700',
  SENT: 'bg-emerald-500/10 text-emerald-700',
  FAILED: 'bg-red-500/10 text-red-700',
};

function ProgressBar({ sent, failed, total }: { sent: number; failed: number; total: number }) {
  const sentPct = total > 0 ? (sent / total) * 100 : 0;
  const failedPct = total > 0 ? (failed / total) * 100 : 0;
  return (
    <div className="w-full h-1.5 bg-cream-dark rounded-full overflow-hidden flex">
      <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${sentPct}%` }} />
      <div className="h-full bg-red-400 transition-all duration-500" style={{ width: `${failedPct}%` }} />
    </div>
  );
}

export default function BroadcastsPage() {
  const { token } = useAuth();
  const { features, ready: planReady } = usePlan(token);

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Broadcast | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);

  // Compose modal state
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [recipientMode, setRecipientMode] = useState<'all' | 'tags' | 'specific' | 'phone'>('all');
  const [tagInput, setTagInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const selectedRef = useRef<Broadcast | null>(null);

  const loadBroadcasts = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiGet<{ broadcasts: Broadcast[] }>('/broadcasts', token);
      setBroadcasts(data.broadcasts);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadBroadcasts(); }, [loadBroadcasts]);

  // Keep selectedRef in sync so the polling interval always sees current selected
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Poll for updates if any broadcast is SENDING
  useEffect(() => {
    const hasSending = broadcasts.some(b => b.status === 'SENDING');
    if (hasSending) {
      pollingRef.current = setInterval(() => {
        loadBroadcasts();
        const cur = selectedRef.current;
        if (cur?.status === 'SENDING') loadRecipients(cur.id);
      }, 4000);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [broadcasts, loadBroadcasts]);

  async function loadRecipients(broadcastId: string) {
    if (!token) return;
    setRecipientsLoading(true);
    try {
      const data = await apiGet<Broadcast & { recipients: Recipient[] }>(`/broadcasts/${broadcastId}`, token);
      setSelected(prev => prev ? { ...prev, ...data } : data);
      setRecipients(data.recipients);
    } catch {
      // ignore
    } finally {
      setRecipientsLoading(false);
    }
  }

  function openDetail(b: Broadcast) {
    setSelected(b);
    setRecipients([]);
    loadRecipients(b.id);
  }

  async function deleteBroadcast(id: string) {
    if (!token) return;
    try {
      await apiDelete(`/broadcasts/${id}`, token);
      setBroadcasts(prev => prev.filter(b => b.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete broadcast');
    }
  }

  // Compose modal helpers
  async function loadContacts() {
    if (!token) return;
    try {
      const data = await apiGet<{ contacts: Contact[] }>('/contacts?limit=500', token);
      setContacts(data.contacts);
    } catch (err) {
      console.error('Failed to load contacts for broadcast:', err);
    }
  }

  function openCompose() {
    setTitle('');
    setMessage('');
    setRecipientMode('all');
    setTagInput('');
    setPhoneInput('');
    setSelectedContactIds([]);
    setContactSearch('');
    setSendError('');
    loadContacts();
    setComposing(true);
  }

  function toggleContact(id: string) {
    setSelectedContactIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleSend() {
    if (!token || !message.trim()) return;
    setSending(true);
    setSendError('');
    try {
      const body: Record<string, unknown> = { message: message.trim() };
      if (title.trim()) body.title = title.trim();
      if (recipientMode === 'all') {
        body.all = true;
      } else if (recipientMode === 'tags') {
        const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
        if (!tags.length) { setSendError('Enter at least one tag.'); setSending(false); return; }
        body.tags = tags;
      } else if (recipientMode === 'phone') {
        const phones = phoneInput.split(/[\n,]+/).map(p => p.trim()).filter(Boolean);
        if (!phones.length) { setSendError('Enter at least one phone number.'); setSending(false); return; }
        body.phones = phones;
      } else {
        if (!selectedContactIds.length) { setSendError('Select at least one contact.'); setSending(false); return; }
        body.contactIds = selectedContactIds;
      }
      const result = await apiPost<{ id: string; totalRecipients: number }>('/broadcasts', body, token);
      setComposing(false);
      await loadBroadcasts();
      // Auto-open the new broadcast detail
      const newBroadcast = broadcasts.find(b => b.id === result.id) ?? {
        id: result.id,
        message: message.trim(),
        status: 'SENDING' as BroadcastStatus,
        totalRecipients: result.totalRecipients,
        sentCount: 0,
        failedCount: 0,
        createdAt: new Date().toISOString(),
      };
      openDetail(newBroadcast);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send broadcast');
    } finally {
      setSending(false);
    }
  }

  const filteredContacts = contacts.filter(c =>
    !contactSearch ||
    c.name?.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.phone.includes(contactSearch)
  );

  if (planReady && !features.broadcasts) {
    return (
      <div className="p-6 lg:p-8 h-full flex flex-col">
        <h1 className="font-heading font-bold text-2xl text-primary-dark mb-1">Broadcasts</h1>
        <p className="text-sm text-primary-warm mb-6">Send WhatsApp messages to your contacts</p>
        <UpgradeWall
          requiredPlan="Growth"
          title="Bulk WhatsApp Broadcasts"
          description="Send personalised WhatsApp messages to all your contacts or targeted segments. Available on the Growth and Enterprise plans."
          icon={
            <svg className="w-8 h-8 text-primary" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          }
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 h-full flex flex-col gap-4 sm:gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Broadcasts</h1>
          <p className="text-sm text-primary-warm mt-0.5">Send WhatsApp messages to your contacts</p>
        </div>
        <button
          onClick={openCompose}
          className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-primary-dark transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Broadcast
        </button>
      </div>

      {/* Main content: list + detail */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* List */}
        <div className={`flex flex-col gap-3 ${selected ? 'hidden lg:flex lg:w-80 xl:w-96 flex-shrink-0' : 'flex-1'}`}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-cream-dark p-4 animate-pulse">
                <div className="h-4 bg-cream rounded w-3/4 mb-2" />
                <div className="h-3 bg-cream rounded w-1/2 mb-3" />
                <div className="h-1.5 bg-cream rounded-full" />
              </div>
            ))
          ) : broadcasts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-24">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
              </div>
              <p className="text-primary-dark font-medium mb-1">No broadcasts yet</p>
              <p className="text-primary-warm text-sm mb-4">Send your first WhatsApp message to contacts</p>
              <button onClick={openCompose} className="text-sm text-primary font-semibold hover:underline">
                New Broadcast →
              </button>
            </div>
          ) : (
            broadcasts.map(b => (
              <button
                key={b.id}
                onClick={() => openDetail(b)}
                className={`text-left bg-white rounded-2xl border transition-colors p-4 hover:border-primary/40 ${selected?.id === b.id ? 'border-primary/50 shadow-sm' : 'border-cream-dark'}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm text-primary-dark font-semibold line-clamp-1 flex-1">{b.title || b.message}</p>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${statusColors[b.status]}`}>
                    {b.status === 'SENDING' ? 'Sending…' : b.status.charAt(0) + b.status.slice(1).toLowerCase()}
                  </span>
                </div>
                {b.title && <p className="text-xs text-primary-warm line-clamp-1 mb-1">{b.message}</p>}
                <div className="flex items-center gap-3 text-xs text-primary-warm mb-3">
                  <span>{b.totalRecipients} recipients</span>
                  {b.sentCount != null && <span>{b.sentCount} sent</span>}
                  {b.failedCount != null && b.failedCount > 0 && <span className="text-red-500">{b.failedCount} failed</span>}
                  <span className="ml-auto">{new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
                {b.status === 'SENDING' && (
                  <ProgressBar sent={b.sentCount ?? 0} failed={b.failedCount ?? 0} total={b.totalRecipients} />
                )}
                {b.status === 'COMPLETED' && (
                  <ProgressBar sent={b.sentCount ?? b.totalRecipients} failed={b.failedCount ?? 0} total={b.totalRecipients} />
                )}
              </button>
            ))
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="flex-1 bg-white rounded-2xl border border-cream-dark flex flex-col overflow-hidden">
            {/* Detail header */}
            <div className="px-5 py-4 border-b border-cream-dark flex items-center gap-3">
              <button
                onClick={() => setSelected(null)}
                className="lg:hidden p-1 rounded-lg hover:bg-cream transition-colors"
              >
                <svg className="w-5 h-5 text-primary-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColors[selected.status]}`}>
                    {selected.status === 'SENDING' ? 'Sending…' : selected.status.charAt(0) + selected.status.slice(1).toLowerCase()}
                  </span>
                  <span className="text-xs text-primary-warm">
                    {new Date(selected.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
              <button
                onClick={() => { if (confirm('Delete this broadcast?')) deleteBroadcast(selected.id); }}
                className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>

            {/* Message + stats */}
            <div className="px-5 py-4 border-b border-cream-dark">
              <p className="text-sm text-primary-dark whitespace-pre-wrap mb-4">{selected.message}</p>
              <div className="flex items-center gap-4 text-sm">
                <div>
                  <p className="text-xs text-primary-warm">Total</p>
                  <p className="font-semibold text-primary-dark">{selected.totalRecipients}</p>
                </div>
                <div>
                  <p className="text-xs text-primary-warm">Sent</p>
                  <p className="font-semibold text-emerald-600">{selected.sentCount ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-primary-warm">Failed</p>
                  <p className="font-semibold text-red-500">{selected.failedCount ?? 0}</p>
                </div>
                {selected.status === 'SENDING' && selected.totalRecipients > 0 && (
                  <div className="ml-auto">
                    <p className="text-xs text-primary-warm">Progress</p>
                    <p className="font-semibold text-sky-600">
                      {Math.round(((selected.sentCount ?? 0) + (selected.failedCount ?? 0)) / selected.totalRecipients * 100)}%
                    </p>
                  </div>
                )}
              </div>
              {selected.status === 'SENDING' && (
                <div className="mt-3">
                  <ProgressBar sent={selected.sentCount ?? 0} failed={selected.failedCount ?? 0} total={selected.totalRecipients} />
                </div>
              )}
            </div>

            {/* Recipients list */}
            <div className="flex-1 overflow-y-auto">
              {recipientsLoading && recipients.length === 0 ? (
                <div className="p-5 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between animate-pulse">
                      <div className="h-3.5 bg-cream rounded w-32" />
                      <div className="h-5 bg-cream rounded-full w-14" />
                    </div>
                  ))}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-dark bg-cream-light/60 sticky top-0">
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-primary-warm uppercase tracking-wider">Phone</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-primary-warm uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-primary-warm uppercase tracking-wider hidden lg:table-cell">Sent at</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-dark">
                    {recipients.map(r => (
                      <tr key={r.id} className="hover:bg-cream-light/30 transition-colors">
                        <td className="px-5 py-3 text-primary-dark font-medium">{r.phone}</td>
                        <td className="px-4 py-3">
                          <div>
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${recipientStatusColors[r.status]}`}>
                              {r.status}
                            </span>
                            {r.error && <p className="text-xs text-red-500 mt-0.5 max-w-xs truncate">{r.error}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-primary-warm hidden lg:table-cell">
                          {r.sentAt ? new Date(r.sentAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Compose modal */}
      {composing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-cream-dark flex items-center justify-between">
              <h2 className="font-heading font-bold text-lg text-primary-dark">New Broadcast</h2>
              <button onClick={() => setComposing(false)} className="p-1.5 rounded-lg hover:bg-cream transition-colors text-primary-warm">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Title */}
              <div>
                <label className="block text-sm font-semibold text-primary-dark mb-1.5">Title</label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 rounded-xl border border-cream-dark text-sm text-primary-dark placeholder:text-primary-warm/60 focus:outline-none focus:border-primary/50"
                  placeholder="e.g. Summer Sale Announcement"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-sm font-semibold text-primary-dark mb-1.5">Message Body</label>
                <textarea
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-xl border border-cream-dark text-sm text-primary-dark placeholder:text-primary-warm/60 focus:outline-none focus:border-primary/50 resize-none"
                  placeholder="Type your message…"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                />
                <p className="text-xs text-primary-warm mt-1">{message.length}/1000 characters</p>
              </div>

              {/* Recipients */}
              <div>
                <label className="block text-sm font-semibold text-primary-dark mb-1.5">Send To</label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {([
                    { key: 'phone', label: 'Contact number' },
                    { key: 'all', label: 'All contacts' },
                    { key: 'tags', label: 'By tag' },
                    { key: 'specific', label: 'Select contacts' },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setRecipientMode(key)}
                      className={`py-2 px-3 rounded-xl text-sm font-medium border transition-colors text-left ${recipientMode === key ? 'bg-primary text-white border-primary' : 'border-cream-dark text-primary-warm hover:border-primary/40'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {recipientMode === 'phone' && (
                  <div>
                    <textarea
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-xl border border-cream-dark text-sm text-primary-dark placeholder:text-primary-warm/60 focus:outline-none focus:border-primary/50 resize-none font-mono"
                      placeholder={"+2348120889843\n+2349035735555\nOne number per line"}
                      value={phoneInput}
                      onChange={e => setPhoneInput(e.target.value)}
                    />
                    <p className="text-xs text-primary-warm mt-1">Enter phone numbers with country code, one per line</p>
                  </div>
                )}

                {recipientMode === 'tags' && (
                  <input
                    className="w-full px-3 py-2.5 rounded-xl border border-cream-dark text-sm text-primary-dark placeholder:text-primary-warm/60 focus:outline-none focus:border-primary/50"
                    placeholder="Enter tags separated by commas e.g. vip, regular"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                  />
                )}

                {recipientMode === 'specific' && (
                  <div className="border border-cream-dark rounded-xl overflow-hidden">
                    <div className="p-2 border-b border-cream-dark">
                      <input
                        className="w-full px-2 py-1.5 text-sm text-primary-dark placeholder:text-primary-warm/60 focus:outline-none"
                        placeholder="Search contacts…"
                        value={contactSearch}
                        onChange={e => setContactSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-cream-dark">
                      {filteredContacts.length === 0 ? (
                        <p className="py-6 text-center text-sm text-primary-warm">No contacts found</p>
                      ) : filteredContacts.map(c => (
                        <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-cream-light/40 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedContactIds.includes(c.id)}
                            onChange={() => toggleContact(c.id)}
                            className="rounded border-cream-dark text-primary focus:ring-primary"
                          />
                          <div>
                            <p className="text-sm text-primary-dark font-medium">{c.name ?? c.phone}</p>
                            {c.name && <p className="text-xs text-primary-warm">{c.phone}</p>}
                          </div>
                        </label>
                      ))}
                    </div>
                    {selectedContactIds.length > 0 && (
                      <div className="px-3 py-2 bg-primary/5 border-t border-cream-dark">
                        <p className="text-xs text-primary font-medium">{selectedContactIds.length} selected</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {sendError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">{sendError}</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-cream-dark flex gap-3">
              <button
                onClick={() => setComposing(false)}
                className="flex-1 py-2.5 rounded-xl border border-cream-dark text-sm text-primary-warm font-medium hover:bg-cream-light transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!message.trim() || sending}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending…
                  </>
                ) : 'Send Broadcast'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
