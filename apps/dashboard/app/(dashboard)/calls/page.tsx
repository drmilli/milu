'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { useAuth } from '../../../hooks/useAuth';
import { apiGet } from '../../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Call {
  id: string;
  callerNumber?: string;
  durationSeconds?: number;
  intent?: string;
  resolution?: string;
  status?: string;
  startedAt: string;
  recordingUrl?: string | null;
}

interface Transcript {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(s?: number) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return isToday ? `Today, ${time}` : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${time}`;
}

function resolutionLabel(r?: string) {
  if (r === 'AI') return 'resolved';
  if (r === 'HUMAN') return 'escalated';
  return 'missed';
}

const statusCls: Record<string, string> = {
  resolved: 'bg-success/10 text-success',
  escalated: 'bg-warning/10 text-warning',
  missed: 'bg-danger/10 text-danger',
};

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-cream rounded-xl ${className}`} />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CallsPage() {
  return (
    <Suspense fallback={null}>
      <CallsPageInner />
    </Suspense>
  );
}

function CallsPageInner() {
  const { token, ready } = useAuth();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('call');

  const [calls, setCalls] = useState<Call[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingList, setLoadingList] = useState(true);

  const [selected, setSelected] = useState<Call | null>(null);
  const [transcript, setTranscript] = useState<Transcript[]>([]);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [loadingRecording, setLoadingRecording] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState('');

  const [filter, setFilter] = useState<'all' | 'AI' | 'HUMAN' | 'ABANDONED'>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const LIMIT = 30;

  const loadCalls = useCallback(() => {
    if (!token) return;
    setLoadingList(true);
    const res = filter === 'all' ? '' : `&resolution=${filter}`;
    const q = search ? `&intent=${encodeURIComponent(search)}` : '';
    apiGet<{ calls: Call[]; total: number }>(`/calls?limit=${LIMIT}&page=${page}${res}${q}`, token)
      .then(data => { setCalls(data.calls); setTotal(data.total); })
      .catch(() => null)
      .finally(() => setLoadingList(false));
  }, [token, filter, search, page]);

  useEffect(() => { if (ready) loadCalls(); }, [ready, loadCalls]);

  // Auto-select call when linked from live card (?call=<id>)
  useEffect(() => {
    if (!highlightId || calls.length === 0 || selected) return;
    const match = calls.find(c => c.id === highlightId);
    if (match) setSelected(match);
  }, [highlightId, calls, selected]);

  useEffect(() => {
    if (!selected || !token) return;
    setLoadingTranscript(true);
    setTranscript([]);
    apiGet<Transcript[]>(`/calls/${selected.id}/transcript`, token)
      .then(setTranscript)
      .catch(() => null)
      .finally(() => setLoadingTranscript(false));
  }, [selected, token]);

  useEffect(() => {
    setPlayingUrl(null);
    setLoadingRecording(false);
  }, [selected?.id]);

  async function playRecording() {
    if (!selected || !token) return;
    setLoadingRecording(true);
    try {
      const res = await apiGet<{ url: string }>(`/calls/${selected.id}/recording`, token);
      setPlayingUrl(res.url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('upgrade')) setUpgradeMsg(msg);
      setPlayingUrl(null);
    } finally {
      setLoadingRecording(false);
    }
  }

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="flex h-full">
      {upgradeMsg && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-primary-dark">Upgrade required</h3>
              <button onClick={() => setUpgradeMsg('')} className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-cream transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-primary-warm mt-2">{upgradeMsg}</p>
            <a href="/billing" className="inline-flex mt-5 bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors">
              Upgrade
            </a>
          </div>
        </div>
      )}
      {/* ── Call list ── */}
      <div className="w-80 flex-shrink-0 border-r border-cream-dark flex flex-col bg-white">
        {/* Search + filter */}
        <div className="p-4 border-b border-cream-dark space-y-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              className="w-full pl-9 pr-4 py-2 text-sm bg-cream-light border border-cream-dark rounded-xl placeholder:text-cream-dark focus:outline-none focus:border-primary/50"
              placeholder="Search by intent…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(['all', 'AI', 'HUMAN', 'ABANDONED'] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setPage(1); }}
                className={clsx(
                  'text-xs px-3 py-1.5 rounded-full font-medium transition-colors',
                  filter === f ? 'bg-primary text-cream-light' : 'bg-cream text-primary-warm hover:bg-cream-dark'
                )}
              >
                {f === 'all' ? 'All' : f === 'AI' ? 'Resolved' : f === 'HUMAN' ? 'Escalated' : 'Missed'}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-cream-dark">
          {loadingList ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-4 py-3.5 space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))
          ) : calls.length === 0 ? (
            <p className="text-sm text-primary-warm text-center py-12">No calls found</p>
          ) : (
            calls.map((call) => {
              const label = resolutionLabel(call.resolution);
              return (
                <button
                  key={call.id}
                  onClick={() => setSelected(call)}
                  className={clsx(
                    'w-full text-left px-4 py-3.5 transition-colors hover:bg-cream-light/60',
                    selected?.id === call.id ? 'bg-cream-light' : ''
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-primary-dark truncate max-w-[140px]">
                      {call.callerNumber ?? 'Unknown'}
                    </span>
                    <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0', statusCls[label])}>
                      {label}
                    </span>
                  </div>
                  <p className="text-xs text-primary-warm truncate capitalize">
                    {call.intent?.toLowerCase().replace('_', ' ') ?? '—'}
                  </p>
                  <p className="text-xs text-cream-dark mt-1">
                    {fmtDate(call.startedAt)} · {fmtDuration(call.durationSeconds)}
                  </p>
                </button>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-cream-dark flex items-center justify-between">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="text-xs text-primary-warm disabled:opacity-30 hover:text-primary transition-colors">
              ← Prev
            </button>
            <span className="text-xs text-primary-warm">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="text-xs text-primary-warm disabled:opacity-30 hover:text-primary transition-colors">
              Next →
            </button>
          </div>
        )}
      </div>

      {/* ── Transcript panel ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-cream-light/50">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-cream border border-cream-dark flex items-center justify-center">
              <svg className="w-7 h-7 text-cream-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
            </div>
            <p className="text-sm text-primary-warm">Select a call to view its transcript</p>
          </div>
        ) : (
          <>
            <div className="bg-white border-b border-cream-dark px-6 py-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-primary-dark">{selected.callerNumber ?? 'Unknown'}</p>
                <p className="text-xs text-primary-warm mt-0.5">
                  {fmtDate(selected.startedAt)} · {fmtDuration(selected.durationSeconds)} ·{' '}
                  <span className="capitalize">{selected.intent?.toLowerCase().replace('_', ' ') ?? '—'}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={playRecording}
                  disabled={loadingRecording}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-cream-dark text-primary-warm hover:text-primary hover:border-primary/30 transition-colors disabled:opacity-50"
                  title="Play recording"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.25v13.5l13.5-6.75-13.5-6.75z" />
                  </svg>
                </button>
                <span className={clsx('text-xs font-medium px-3 py-1.5 rounded-full', statusCls[resolutionLabel(selected.resolution)])}>
                  {resolutionLabel(selected.resolution)}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingTranscript ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className={clsx('flex gap-3', i % 2 === 0 ? 'flex-row' : 'flex-row-reverse')}>
                    <Skeleton className="w-7 h-7 rounded-full flex-shrink-0" />
                    <Skeleton className={`h-12 rounded-2xl ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'}`} />
                  </div>
                ))
              ) : transcript.length === 0 ? (
                <p className="text-sm text-primary-warm text-center py-8">No transcript available for this call</p>
              ) : (
                transcript.map((turn) => {
                  const isAgent = turn.role === 'AGENT' || turn.role === 'agent';
                  return (
                    <div key={turn.id} className={clsx('flex gap-3', isAgent ? 'flex-row' : 'flex-row-reverse')}>
                      <div className={clsx(
                        'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold',
                        isAgent ? 'bg-primary text-cream-light' : 'bg-cream-dark text-primary-warm'
                      )}>
                        {isAgent ? 'AI' : 'C'}
                      </div>
                      <div className={clsx(
                        'max-w-md px-4 py-3 rounded-2xl text-sm leading-relaxed',
                        isAgent
                          ? 'bg-white border border-cream-dark text-primary-dark rounded-tl-sm'
                          : 'bg-primary text-cream-light rounded-tr-sm'
                      )}>
                        {turn.content}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {playingUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary-dark/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-cream-dark">
              <h2 className="font-semibold text-primary-dark">Call recording</h2>
              <button onClick={() => setPlayingUrl(null)} className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-cream transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5">
              <audio controls autoPlay className="w-full" src={playingUrl} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
