'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { apiGet, apiPut } from '../../../lib/api';

interface Faq { question: string; answer: string }

interface KB {
  businessName: string;
  operatingHours: Record<string, string>;
  faqs: Faq[];
  escalationNumber?: string;
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-cream rounded-xl ${className}`} />;
}

const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all';

export default function KnowledgeBasePage() {
  const { token, user, ready } = useAuth();
  const businessId = user?.businessId ?? '';

  const [kb, setKb] = useState<KB | null>(null);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Faq>({ question: '', answer: '' });
  const [draft, setDraft] = useState<Record<number, Faq>>({});

  const load = useCallback(() => {
    if (!token || !businessId) return;
    apiGet<KB>(`/businesses/${businessId}/kb`, token)
      .then(data => { setKb(data); setFaqs(data.faqs ?? []); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [token, businessId]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function persist(newFaqs: Faq[]) {
    if (!token || !kb) return;
    setSaving(true);
    try {
      await apiPut(`/businesses/${businessId}/kb`, { ...kb, faqs: newFaqs }, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // TODO: show error toast
    } finally {
      setSaving(false);
    }
  }

  function startEdit(i: number) {
    setEditing(i);
    setDraft(d => ({ ...d, [i]: { ...faqs[i] } }));
  }

  function saveEdit(i: number) {
    const updated = faqs.map((f, idx) => idx === i ? draft[i] : f);
    setFaqs(updated);
    setEditing(null);
    persist(updated);
  }

  function deleteEntry(i: number) {
    const updated = faqs.filter((_, idx) => idx !== i);
    setFaqs(updated);
    persist(updated);
  }

  function addEntry() {
    if (!form.question.trim() || !form.answer.trim()) return;
    const updated = [...faqs, { ...form }];
    setFaqs(updated);
    setForm({ question: '', answer: '' });
    setAdding(false);
    persist(updated);
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Knowledge Base</h1>
          <p className="text-sm text-primary-warm mt-0.5">FAQs your agent uses to answer callers.</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-success font-medium">Saved ✓</span>}
          {saving && <span className="text-xs text-primary-warm">Saving…</span>}
          <button
            onClick={() => setAdding(true)}
            disabled={adding}
            className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add entry
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {/* Add form */}
        {adding && (
          <div className="bg-white rounded-2xl border-2 border-primary/30 p-5 space-y-3">
            <input className={inputCls} placeholder="Question"
              value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} />
            <textarea rows={3} className={`${inputCls} resize-none`} placeholder="Answer"
              value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAdding(false)} className="text-sm text-primary-warm hover:text-primary-dark px-4 py-2">Cancel</button>
              <button onClick={addEntry} disabled={!form.question.trim() || !form.answer.trim()}
                className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40">
                Save
              </button>
            </div>
          </div>
        )}

        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)
        ) : faqs.length === 0 && !adding ? (
          <div className="bg-white rounded-2xl border border-cream-dark p-10 text-center">
            <p className="text-sm text-primary-warm">No FAQs yet. Add your first entry above.</p>
          </div>
        ) : (
          faqs.map((entry, i) => (
            <div key={i} className="bg-white rounded-2xl border border-cream-dark p-5">
              {editing === i ? (
                <div className="space-y-3">
                  <input className={inputCls} value={draft[i]?.question ?? ''}
                    onChange={e => setDraft(d => ({ ...d, [i]: { ...d[i], question: e.target.value } }))} />
                  <textarea rows={3} className={`${inputCls} resize-none`} value={draft[i]?.answer ?? ''}
                    onChange={e => setDraft(d => ({ ...d, [i]: { ...d[i], answer: e.target.value } }))} />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditing(null)} className="text-sm text-primary-warm hover:text-primary-dark px-4 py-2">Cancel</button>
                    <button onClick={() => saveEdit(i)} className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors">Save</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-primary-dark text-sm">{entry.question}</p>
                    <p className="text-sm text-primary-warm mt-1 leading-relaxed">{entry.answer}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(i)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-cream hover:text-primary-dark transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                      </svg>
                    </button>
                    <button onClick={() => deleteEntry(i)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-danger/8 hover:text-danger transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
