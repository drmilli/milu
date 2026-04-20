'use client';

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { apiGet, apiPut, apiPost, apiDelete } from '../../../lib/api';

interface Faq { question: string; answer: string }

interface KB {
  businessName: string;
  operatingHours: Record<string, string>;
  faqs: Faq[];
  escalationNumber?: string;
  websiteUrl?: string;
  websiteContent?: string;
  websiteSummary?: string;
  websiteScrapedAt?: string;
}

interface ChatMsg { id: string; role: string; content: string; createdAt: string }

interface KnowledgeDoc {
  id: string;
  name: string;
  fileType: string;
  extractedText?: string;
  summary?: string;
  sizeBytes?: number;
  createdAt: string;
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-cream rounded-xl ${className}`} />;
}

const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all';

function Section({ title, desc, children, action }: { title: string; desc?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-primary-dark">{title}</h2>
          {desc && <p className="text-xs text-primary-warm mt-0.5">{desc}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function FileTypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = { pdf: '📄', docx: '📝', txt: '📃', image: '🖼️' };
  return <span className="text-lg">{icons[type] ?? '📎'}</span>;
}

function formatBytes(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function KnowledgeBasePage() {
  const { token, user, ready } = useAuth();
  const businessId = user?.businessId ?? '';

  const [kb, setKb] = useState<KB | null>(null);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Faq>({ question: '', answer: '' });
  const [draft, setDraft] = useState<Record<number, Faq>>({});

  // Website
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<{ chars: number; preview: string; summary?: string | null } | null>(null);
  const [scrapeError, setScrapeError] = useState('');

  // Documents
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (!token || !businessId) return;
    Promise.all([
      apiGet<KB>(`/businesses/${businessId}/kb`, token),
      apiGet<KnowledgeDoc[]>(`/businesses/${businessId}/kb/documents`, token),
      apiGet<ChatMsg[]>(`/businesses/${businessId}/kb/chat`, token),
    ]).then(([kbData, docsData, chatData]) => {
      setKb(kbData);
      setFaqs(kbData.faqs ?? []);
      setWebsiteUrl(kbData.websiteUrl ?? '');
      setScrapeResult(kbData.websiteContent ? { chars: kbData.websiteContent.length, preview: kbData.websiteContent.slice(0, 300), summary: kbData.websiteSummary } : null);
      setDocs(docsData);
      setChatMsgs(chatData);
    }).catch(() => null).finally(() => setLoading(false));
  }, [token, businessId]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function persist(newFaqs: Faq[]) {
    if (!token || !kb) return;
    setSaving(true);
    try {
      await apiPut(`/businesses/${businessId}/kb`, { ...kb, faqs: newFaqs }, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  function startEdit(i: number) { setEditing(i); setDraft(d => ({ ...d, [i]: { ...faqs[i] } })); }
  function saveEdit(i: number) { const u = faqs.map((f, idx) => idx === i ? draft[i] : f); setFaqs(u); setEditing(null); persist(u); }
  function deleteEntry(i: number) { const u = faqs.filter((_, idx) => idx !== i); setFaqs(u); persist(u); }
  function addEntry() {
    if (!form.question.trim() || !form.answer.trim()) return;
    const u = [...faqs, { ...form }];
    setFaqs(u); setForm({ question: '', answer: '' }); setAdding(false); persist(u);
  }

  async function handleScrape() {
    if (!websiteUrl.trim()) return;
    const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
    setScraping(true); setScrapeError(''); setScrapeResult(null);
    try {
      const result = await apiPost<{ chars: number; preview: string; summary?: string | null }>(
        `/businesses/${businessId}/kb/scrape-website`, { url }, token,
      );
      setScrapeResult(result);
      setKb(prev => prev ? { ...prev, websiteUrl, websiteSummary: result.summary ?? undefined, websiteScrapedAt: new Date().toISOString() } : prev);
    } catch (err: unknown) {
      setScrapeError(err instanceof Error ? err.message : 'Failed to scrape website');
    } finally { setScraping(false); }
  }

  async function handleDocUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploadingDoc(true); setUploadError('');
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/businesses/${businessId}/kb/documents`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? 'Upload failed'); }
        const doc = await res.json() as KnowledgeDoc;
        setDocs(prev => [doc, ...prev]);
        if (doc.summary || doc.extractedText) setExpandedDoc(doc.id);
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally { setUploadingDoc(false); }
  }

  async function deleteDoc(id: string) {
    setDeletingDocId(id);
    try {
      await apiDelete(`/businesses/${businessId}/kb/documents/${id}`, token);
      setDocs(prev => prev.filter(d => d.id !== id));
    } catch { /* ignore */ } finally { setDeletingDocId(null); }
  }

  useLayoutEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMsgs]);

  async function sendChat(e?: React.FormEvent) {
    e?.preventDefault();
    const msg = chatInput.trim();
    if (!msg || chatSending) return;
    const optimistic: ChatMsg = { id: `tmp-${Date.now()}`, role: 'user', content: msg, createdAt: new Date().toISOString() };
    setChatMsgs(prev => [...prev, optimistic]);
    setChatInput('');
    setChatSending(true);
    try {
      const { reply } = await apiPost<{ reply: string }>(`/businesses/${businessId}/kb/chat`, { message: msg }, token);
      const aiMsg: ChatMsg = { id: `tmp-ai-${Date.now()}`, role: 'assistant', content: reply, createdAt: new Date().toISOString() };
      setChatMsgs(prev => [...prev.filter(m => m.id !== optimistic.id), { ...optimistic, id: `saved-${Date.now()}` }, aiMsg]);
    } catch {
      setChatMsgs(prev => prev.filter(m => m.id !== optimistic.id));
    } finally { setChatSending(false); }
  }

  async function clearChat() {
    setClearingChat(true);
    try {
      await apiDelete(`/businesses/${businessId}/kb/chat`, token);
      setChatMsgs([]);
    } catch { /* ignore */ } finally { setClearingChat(false); }
  }

  function addFaqFromChat(content: string) {
    const lines = content.split('\n');
    const qLine = lines.find(l => l.trim().startsWith('Q:'));
    const aLine = lines.find(l => l.trim().startsWith('A:'));
    if (qLine && aLine) {
      const newFaq = { question: qLine.replace(/^Q:\s*/i, '').trim(), answer: aLine.replace(/^A:\s*/i, '').trim() };
      const updated = [...faqs, newFaq];
      setFaqs(updated);
      persist(updated);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Knowledge Base</h1>
          <p className="text-sm text-primary-warm mt-0.5">Everything your AI agent knows about your business.</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-success font-medium">Saved ✓</span>}
          {saving && <span className="text-xs text-primary-warm">Saving…</span>}
        </div>
      </div>

      {/* Website */}
      <Section title="Website" desc="Your agent learns from your website automatically.">
        {loading ? <Skeleton className="h-16" /> : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="url"
                className={inputCls}
                placeholder="https://yourwebsite.com"
                value={websiteUrl}
                onChange={e => setWebsiteUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleScrape()}
              />
              <button
                onClick={handleScrape}
                disabled={scraping || !websiteUrl.trim()}
                className="flex-shrink-0 px-4 py-2.5 bg-primary text-cream-light rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {scraping ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                )}
                {scraping ? 'Scanning…' : 'Scan'}
              </button>
            </div>
            {scrapeError && <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{scrapeError}</p>}
            {scrapeResult && (
              <div className="rounded-xl border border-success/20 overflow-hidden">
                <div className="px-3 py-2 bg-success/5 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-success flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  <p className="text-xs font-medium text-success">Website scanned — {scrapeResult.chars.toLocaleString()} characters extracted</p>
                </div>
                {scrapeResult.summary ? (
                  <div className="px-3 py-3 border-t border-success/10 bg-white">
                    <div className="flex items-center gap-1.5 mb-2">
                      <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                      <span className="text-xs font-semibold text-primary">AI Breakdown</span>
                    </div>
                    <div className="text-xs text-primary-dark leading-relaxed whitespace-pre-wrap">{scrapeResult.summary}</div>
                  </div>
                ) : (
                  <div className="px-3 py-2 border-t border-success/10 bg-white">
                    <p className="text-xs text-primary-warm line-clamp-2">{scrapeResult.preview}…</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Documents */}
      <Section
        title="Documents & images"
        desc="Upload PDFs, Word docs, text files, or images. Your agent reads them."
        action={
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingDoc}
            className="flex-shrink-0 bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40 flex items-center gap-2"
          >
            {uploadingDoc ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
            )}
            {uploadingDoc ? 'Uploading…' : 'Upload'}
          </button>
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,image/*"
          className="hidden"
          onChange={e => handleDocUpload(e.target.files)}
        />

        {/* Drop zone */}
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleDocUpload(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-cream-dark rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/2 transition-colors"
        >
          <svg className="w-8 h-8 text-cream-dark mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
          <p className="text-sm text-primary-warm">Drag & drop files here or click to browse</p>
          <p className="text-xs text-cream-dark mt-1">PDF, DOCX, TXT, PNG, JPG — max 20MB each</p>
        </div>

        {uploadError && <p className="text-xs text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{uploadError}</p>}

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : docs.length > 0 ? (
          <div className="space-y-2">
            {docs.map(doc => (
              <div key={doc.id} className="bg-cream-light rounded-xl border border-cream-dark overflow-hidden">
                {/* Header row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <FileTypeIcon type={doc.fileType} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary-dark truncate">{doc.name}</p>
                    <p className="text-xs text-primary-warm">
                      {doc.fileType.toUpperCase()} · {formatBytes(doc.sizeBytes)}
                      {doc.extractedText && ` · ${doc.extractedText.length.toLocaleString()} chars`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {!doc.summary && doc.extractedText && (
                      <button
                        onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                        className="p-1.5 rounded-lg text-primary-warm hover:bg-cream hover:text-primary-dark transition-colors"
                        title="View extracted text"
                      >
                        <svg className={`w-4 h-4 transition-transform ${expandedDoc === doc.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                      </button>
                    )}
                    <button
                      onClick={() => deleteDoc(doc.id)}
                      disabled={deletingDocId === doc.id}
                      className="p-1.5 rounded-lg text-primary-warm hover:bg-danger/8 hover:text-danger transition-colors disabled:opacity-40"
                    >
                      {deletingDocId === doc.id ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* AI breakdown — always shown */}
                {doc.summary && (
                  <div className="border-t border-cream-dark px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                      <span className="text-xs font-semibold text-primary">AI Breakdown</span>
                    </div>
                    <div className="text-xs text-primary-dark leading-relaxed whitespace-pre-wrap">{doc.summary}</div>
                  </div>
                )}

                {/* Raw text fallback if no summary, collapsible */}
                {!doc.summary && expandedDoc === doc.id && doc.extractedText && (
                  <div className="border-t border-cream-dark px-4 py-3">
                    <p className="text-xs text-primary-warm leading-relaxed whitespace-pre-wrap line-clamp-6">{doc.extractedText}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-primary-warm text-center py-2">No documents uploaded yet.</p>
        )}
      </Section>

      {/* AI Prompt / Chat */}
      <Section
        title="AI Assistant"
        desc="Chat with AI to build your knowledge base. Ask it to suggest FAQs, refine your business info, or explore what your agent knows."
        action={
          chatMsgs.length > 0 ? (
            <button
              onClick={clearChat}
              disabled={clearingChat}
              className="flex-shrink-0 text-xs text-primary-warm hover:text-danger border border-cream-dark px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              {clearingChat ? 'Clearing…' : 'Clear history'}
            </button>
          ) : undefined
        }
      >
        {/* Message history */}
        <div className="h-72 overflow-y-auto flex flex-col gap-3 pr-1">
          {chatMsgs.length === 0 && !chatSending && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center py-8">
              <svg className="w-8 h-8 text-cream-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>
              <p className="text-sm text-primary-warm font-medium">Ask me anything about your business</p>
              <p className="text-xs text-cream-dark max-w-xs">Try: &ldquo;Suggest 5 FAQs for my business&rdquo; or &ldquo;What are my operating hours?&rdquo;</p>
            </div>
          )}
          {chatMsgs.map((msg) => {
            const isUser = msg.role === 'user';
            const hasFaq = !isUser && /^Q:/im.test(msg.content) && /^A:/im.test(msg.content);
            return (
              <div key={msg.id} className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                    <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                  </div>
                )}
                <div className={`max-w-[80%] ${isUser ? 'bg-primary text-cream-light' : 'bg-cream-light text-primary-dark border border-cream-dark'} rounded-2xl px-3 py-2.5 text-xs leading-relaxed`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {hasFaq && (
                    <button
                      onClick={() => addFaqFromChat(msg.content)}
                      className="mt-2 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      Add to FAQs
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {chatSending && (
            <div className="flex gap-2 justify-start">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-primary animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              </div>
              <div className="bg-cream-light border border-cream-dark rounded-2xl px-3 py-2.5">
                <div className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 bg-primary-warm rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-primary-warm rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-primary-warm rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={sendChat} className="flex gap-2 mt-2">
          <input
            className={`${inputCls} flex-1`}
            placeholder="Ask the AI about your business…"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            disabled={chatSending}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
          />
          <button
            type="submit"
            disabled={chatSending || !chatInput.trim()}
            className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40 flex items-center gap-2 flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
            Send
          </button>
        </form>
      </Section>

      {/* FAQs */}
      <Section
        title="FAQs"
        desc="Common questions your agent answers on calls."
        action={
          <button
            onClick={() => setAdding(true)}
            disabled={adding}
            className="flex-shrink-0 bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Add entry
          </button>
        }
      >
        <div className="space-y-3">
          {adding && (
            <div className="bg-cream-light rounded-xl border-2 border-primary/30 p-4 space-y-3">
              <input className={inputCls} placeholder="Question" value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} />
              <textarea rows={3} className={`${inputCls} resize-none`} placeholder="Answer" value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setAdding(false)} className="text-sm text-primary-warm hover:text-primary-dark px-4 py-2">Cancel</button>
                <button onClick={addEntry} disabled={!form.question.trim() || !form.answer.trim()} className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40">Save</button>
              </div>
            </div>
          )}
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          ) : faqs.length === 0 && !adding ? (
            <p className="text-sm text-primary-warm py-2">No FAQs yet. Add your first entry above.</p>
          ) : (
            faqs.map((entry, i) => (
              <div key={i} className="bg-cream-light rounded-xl border border-cream-dark p-4">
                {editing === i ? (
                  <div className="space-y-3">
                    <input className={inputCls} value={draft[i]?.question ?? ''} onChange={e => setDraft(d => ({ ...d, [i]: { ...d[i], question: e.target.value } }))} />
                    <textarea rows={3} className={`${inputCls} resize-none`} value={draft[i]?.answer ?? ''} onChange={e => setDraft(d => ({ ...d, [i]: { ...d[i], answer: e.target.value } }))} />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditing(null)} className="text-sm text-primary-warm hover:text-primary-dark px-4 py-2">Cancel</button>
                      <button onClick={() => saveEdit(i)} className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium">Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-primary-dark text-sm">{entry.question}</p>
                      <p className="text-sm text-primary-warm mt-1 leading-relaxed">{entry.answer}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => startEdit(i)} className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-cream hover:text-primary-dark transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                      </button>
                      <button onClick={() => deleteEntry(i)} className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-danger/8 hover:text-danger transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Section>
    </div>
  );
}
