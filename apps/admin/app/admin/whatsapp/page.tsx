'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { adminGet, adminPost } from '../../../lib/api';

interface Message {
  id: string;
  title: string;
  body: string;
  status: string;
  recipient: string;
  createdAt: string;
  data: {
    direction?: 'inbound' | 'outbound';
    from?: string;
    to?: string;
    twilioSid?: string;
    twilioStatus?: string;
  } | null;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 3600000;
  if (diffH < 1) return `${Math.round(diffMs / 60000)}m ago`;
  if (diffH < 24) return `${Math.round(diffH)}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function normalizePhone(raw: string) {
  return raw.replace(/^whatsapp:/, '');
}

function groupByPhone(messages: Message[]): Map<string, Message[]> {
  const map = new Map<string, Message[]>();
  for (const msg of messages) {
    const phone = normalizePhone(msg.data?.direction === 'inbound' ? (msg.data.from ?? msg.recipient) : (msg.data?.to ?? msg.recipient));
    const list = map.get(phone) ?? [];
    list.push(msg);
    map.set(phone, list);
  }
  return map;
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'SENT' ? 'bg-success' : status === 'FAILED' ? 'bg-danger' : 'bg-cream-dark';
  return <span className={`inline-block w-2 h-2 rounded-full ${color} flex-shrink-0`} />;
}

export default function WhatsAppInboxPage() {
  const { token, ready } = useAdminAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (!token) return;
    adminGet<Message[]>('/admin/whatsapp/messages', token)
      .then(setMessages).catch(() => null).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedPhone, messages]);

  const grouped = groupByPhone(messages);
  const threads = Array.from(grouped.entries())
    .map(([phone, msgs]) => ({
      phone,
      lastMsg: msgs[msgs.length - 1],
      unread: msgs.filter(m => m.data?.direction === 'inbound').length,
    }))
    .filter(t => !search.trim() || t.phone.includes(search.trim()))
    .sort((a, b) => new Date(b.lastMsg.createdAt).getTime() - new Date(a.lastMsg.createdAt).getTime());

  const thread = selectedPhone ? (grouped.get(selectedPhone) ?? []) : [];

  async function sendReply() {
    if (!reply.trim() || !selectedPhone || !token) return;
    setSending(true);
    try {
      const msg = await adminPost<Message>('/admin/whatsapp/send', { to: selectedPhone, message: reply.trim() }, token);
      setMessages(prev => [...prev, msg]);
      setReply('');
    } catch {
      // silently ignore
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Thread list */}
      <div className="w-72 flex-shrink-0 border-r border-cream-dark flex flex-col bg-white">
        <div className="px-4 py-3 border-b border-cream-dark">
          <h1 className="font-heading font-bold text-base text-primary-dark">WhatsApp Inbox</h1>
          <input
            className="mt-2 w-full px-3 py-2 rounded-xl border border-cream-dark bg-cream-light text-xs text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50"
            placeholder="Search number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-cream-dark">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-cream flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-cream rounded w-28" />
                  <div className="h-3 bg-cream rounded w-40" />
                </div>
              </div>
            ))
          ) : threads.length === 0 ? (
            <div className="py-16 text-center text-xs text-primary-warm">No messages yet.</div>
          ) : threads.map(t => (
            <button
              key={t.phone}
              onClick={() => setSelectedPhone(t.phone)}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${selectedPhone === t.phone ? 'bg-primary/5' : 'hover:bg-cream-light/60'}`}
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-primary">{t.phone.slice(-2)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs font-semibold text-primary-dark truncate">{t.phone}</p>
                  <span className="text-[10px] text-primary-warm flex-shrink-0">{fmtTime(t.lastMsg.createdAt)}</span>
                </div>
                <p className="text-xs text-primary-warm truncate mt-0.5">{t.lastMsg.body || '—'}</p>
              </div>
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-cream-dark">
          <button onClick={load} className="w-full text-xs text-primary hover:underline font-medium">Refresh</button>
        </div>
      </div>

      {/* Conversation pane */}
      {selectedPhone ? (
        <div className="flex-1 flex flex-col bg-cream-light/30 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-cream-dark bg-white">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.557 4.116 1.532 5.842L0 24l6.335-1.652A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.126-1.448l-.368-.22-3.766.981.996-3.665-.24-.377A9.818 9.818 0 1112 21.818z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-primary-dark">{selectedPhone}</p>
              <p className="text-xs text-primary-warm">{thread.length} message{thread.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {thread.map((msg) => {
              const isOutbound = msg.data?.direction === 'outbound' || msg.title === 'Outgoing WhatsApp';
              return (
                <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-sm rounded-2xl px-4 py-2.5 shadow-sm ${isOutbound ? 'bg-primary text-cream-light rounded-br-sm' : 'bg-white text-primary-dark rounded-bl-sm border border-cream-dark'}`}>
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                    <div className={`flex items-center gap-1.5 mt-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                      <span className={`text-[10px] ${isOutbound ? 'text-cream/60' : 'text-primary-warm'}`}>{fmtTime(msg.createdAt)}</span>
                      {isOutbound && <StatusDot status={msg.status} />}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Reply input */}
          <div className="px-5 py-3 border-t border-cream-dark bg-white">
            <div className="flex items-end gap-3">
              <textarea
                rows={2}
                className="flex-1 px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 resize-none transition-all"
                placeholder={`Reply to ${selectedPhone}…`}
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
              />
              <button
                onClick={sendReply}
                disabled={sending || !reply.trim()}
                className="h-10 px-4 rounded-xl bg-primary text-cream-light text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40 flex-shrink-0"
              >
                {sending ? '…' : 'Send'}
              </button>
            </div>
            <p className="text-[10px] text-primary-warm mt-1.5">Press Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-cream-light/30">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-primary-dark">Select a conversation</p>
            <p className="text-xs text-primary-warm mt-1">Pick a thread on the left to read and reply</p>
          </div>
        </div>
      )}
    </div>
  );
}
