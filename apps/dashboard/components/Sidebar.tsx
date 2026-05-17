'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { useAuth } from '../hooks/useAuth';
import { useBusinesses } from '../hooks/useBusinesses';
import { usePlan } from '../hooks/usePlan';

const nav = [
  {
    label: 'Overview',
    href: '/overview',
    icon: <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>,
  },
  {
    label: 'Calls',
    href: '/calls',
    icon: <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>,
  },
  {
    label: 'Analytics',
    href: '/analytics',
    icon: <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
  },
  {
    label: 'Knowledge Base',
    href: '/knowledge-base',
    icon: <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>,
  },
  {
    label: 'Agent',
    href: '/agent',
    icon: <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>,
  },
  {
    label: 'Phone Numbers',
    href: '/phone-numbers',
    icon: <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>,
  },
  {
    label: 'Contacts',
    href: '/contacts',
    icon: <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
  {
    label: 'Follow-ups',
    href: '/follow-ups',
    icon: <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>,
  },
  {
    label: 'Broadcasts',
    href: '/broadcasts',
    icon: <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" /></svg>,
  },
  {
    label: 'Appointments',
    href: '/appointments',
    icon: <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5m-9-6h.008v.008H12V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM12 12.75h.008v.008H12v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-3 3h.008v.008H9.375v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3 3h.008v.008H12.375v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>,
  },
  {
    label: 'Orders',
    href: '/orders',
    icon: <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>,
  },
  {
    label: 'Products & Services',
    href: '/products-services',
    icon: <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-8.25-4.5-8.25 4.5m16.5 0v9l-8.25 4.5-8.25-4.5v-9m16.5 0l-8.25 4.5m0 0L3.75 7.5m8.25 4.5v9" /></svg>,
  },
  {
    label: 'Team',
    href: '/team',
    icon: <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>,
  },
  {
    label: 'Billing',
    href: '/billing',
    icon: <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>,
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
];

interface ActiveCall {
  id: string;
  callerNumber: string;
  startedAt: string;
}

function LiveCallCard({ token, collapsed }: { token: string; collapsed: boolean }) {
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!token) return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

    const poll = () =>
      fetch(`${API_URL}/api/v1/calls?status=ACTIVE&limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then((data: { calls?: ActiveCall[] }) => {
          setCall(data.calls?.[0] ?? null);
        })
        .catch(() => null);

    poll();
    const id = setInterval(poll, 8_000);
    return () => clearInterval(id);
  }, [token]);

  useEffect(() => {
    if (!call) { setElapsed(0); return; }
    const started = new Date(call.startedAt).getTime();
    const age = Date.now() - started;
    if (age > 4 * 60 * 60 * 1000) { setCall(null); return; }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [call]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!call) return null;

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  if (collapsed) {
    return (
      <div className="mx-2 mb-3 flex justify-center">
        <Link href={`/calls?call=${call.id}`} title="Live call in progress">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-success" />
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-3 mb-3 p-3 rounded-xl bg-success/10 border border-success/20">
      <div className="flex items-center gap-2 mb-2">
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
        </span>
        <span className="text-xs font-semibold text-success">Live Call</span>
        <span className="ml-auto text-xs font-mono text-success/80">{mm}:{ss}</span>
      </div>
      <p className="text-xs text-cream/70 font-mono truncate">{call.callerNumber}</p>
      <Link
        href={`/calls?call=${call.id}`}
        className="mt-2 block text-center text-[11px] font-medium text-success/80 hover:text-success transition-colors"
      >
        View call →
      </Link>
    </div>
  );
}

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
  collapsed: boolean;
}

export default function Sidebar({ mobileOpen, onMobileClose, collapsed }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, ready, token } = useAuth(false);
  const [businessName, setBusinessName] = useState('');
  const [bizMenuOpen, setBizMenuOpen] = useState(false);
  const bizMenuRef = useRef<HTMLDivElement>(null);

  const { businesses, activeId, switchBusiness, createBusiness } = useBusinesses(token ?? '');
  const { features: planFeatures } = usePlan(token ?? '');
  const [showCreateBiz, setShowCreateBiz] = useState(false);
  const [newBizName, setNewBizName] = useState('');
  const [creatingBiz, setCreatingBiz] = useState(false);

  useEffect(() => {
    if (user?.businessName) setBusinessName(user.businessName);
  }, [user]);

  useEffect(() => {
    if (!bizMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (bizMenuRef.current && !bizMenuRef.current.contains(e.target as Node)) setBizMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [bizMenuOpen]);

  const activeBiz = businesses.find(b => b.id === activeId) ?? businesses[0];
  const displayedBizName = activeBiz?.name || businessName || '—';

  const initials = user
    ? ((user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '')).toUpperCase() || user.email[0].toUpperCase()
    : '?';
  const displayName = user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email : '';
  const bizInitial = displayedBizName[0]?.toUpperCase() ?? '?';

  async function handleCreateBiz() {
    if (!newBizName.trim()) return;
    setCreatingBiz(true);
    try {
      const biz = await createBusiness(newBizName.trim());
      switchBusiness(biz.id);
    } catch { /* ignore */ } finally {
      setCreatingBiz(false);
      setShowCreateBiz(false);
      setNewBizName('');
    }
  }

  return (
    <aside
      className={clsx(
        // Base: fixed drawer on mobile, sticky on desktop
        'fixed inset-y-0 left-0 z-50 flex flex-col bg-primary-dark h-screen',
        'lg:sticky lg:top-0 lg:z-auto',
        // Width
        collapsed ? 'w-16' : 'w-64',
        // Mobile open/close via transform
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        // Smooth transitions
        'transition-all duration-200 ease-in-out',
      )}
    >
      {/* Logo + business switcher */}
      <div className={clsx(
        'border-b border-white/10 flex-shrink-0',
        collapsed ? 'px-0 py-4 flex flex-col items-center' : 'px-5 py-4'
      )}>
        {collapsed ? (
          <img src="/brand/icon-mark.svg" alt="milu." className="h-7 w-7" />
        ) : (
          <>
            <img src="/brand/wordmark.svg" alt="milu." className="h-6 w-auto mb-1" />
            {ready && (
              <div className="relative mt-2" ref={bizMenuRef}>
                <button
                  onClick={() => user?.role === 'OWNER' && businesses.length > 0 && setBizMenuOpen(v => !v)}
                  className={clsx(
                    'flex items-center gap-2 w-full text-left',
                    user?.role === 'OWNER' && businesses.length > 0 && 'cursor-pointer hover:opacity-80'
                  )}
                >
                  <div className="w-5 h-5 rounded bg-primary/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-cream-light">{bizInitial}</span>
                  </div>
                  <span className="text-xs text-cream/60 truncate flex-1">{displayedBizName}</span>
                  {user?.role === 'OWNER' && businesses.length > 0 && (
                    <svg className="w-3 h-3 text-cream/40 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  )}
                </button>

                {bizMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 w-52 bg-[#2A1A0E] border border-white/10 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                    {businesses.map(biz => (
                      <button
                        key={biz.id}
                        onClick={() => { switchBusiness(biz.id); setBizMenuOpen(false); }}
                        className={clsx(
                          'w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors',
                          biz.id === (activeId ?? businesses[0]?.id)
                            ? 'text-cream-light bg-white/10'
                            : 'text-cream/60 hover:bg-white/5 hover:text-cream-light'
                        )}
                      >
                        <div className="w-4 h-4 rounded bg-primary/30 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-bold text-cream-light">{biz.name[0]?.toUpperCase()}</span>
                        </div>
                        <span className="truncate">{biz.name}</span>
                        {biz.id === (activeId ?? businesses[0]?.id) && (
                          <svg className="w-3 h-3 text-cream/60 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </button>
                    ))}
                    <div className="border-t border-white/10 mt-1 pt-1">
                      {showCreateBiz ? (
                        <div className="px-3 py-2">
                          <input
                            autoFocus
                            value={newBizName}
                            onChange={e => setNewBizName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreateBiz()}
                            placeholder="Business name"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-cream-light placeholder:text-cream/30 outline-none focus:border-primary/60 mb-2"
                          />
                          <div className="flex gap-1.5">
                            <button onClick={handleCreateBiz} disabled={creatingBiz} className="flex-1 text-[11px] py-1 rounded-lg bg-primary text-cream-light hover:bg-primary/80 transition-colors disabled:opacity-50">
                              {creatingBiz ? '...' : 'Create'}
                            </button>
                            <button onClick={() => { setShowCreateBiz(false); setNewBizName(''); }} className="flex-1 text-[11px] py-1 rounded-lg bg-white/5 text-cream/60 hover:bg-white/10 transition-colors">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : planFeatures.multiBusiness ? (
                        <button
                          onClick={() => setShowCreateBiz(true)}
                          className="w-full text-left px-3 py-2 text-xs text-cream/50 hover:text-cream-light hover:bg-white/5 transition-colors flex items-center gap-2"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                          Add business
                        </button>
                      ) : (
                        <div className="px-3 py-2 text-xs text-cream/30 flex items-center gap-2">
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" />
                          </svg>
                          Add business · Enterprise
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Nav */}
      <nav className={clsx('flex-1 py-3 overflow-y-auto space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              onClick={onMobileClose}
              className={clsx(
                'flex items-center rounded-xl text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                active
                  ? 'bg-white/12 text-cream-light'
                  : 'text-cream/50 hover:text-cream-light hover:bg-white/6'
              )}
            >
              <span className={active ? 'text-cream-light' : 'text-cream/40'}>{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      {/* Live call card */}
      {token && <LiveCallCard token={token} collapsed={collapsed} />}

      {/* User footer */}
      <div className={clsx(
        'border-t border-white/10 flex-shrink-0',
        collapsed ? 'px-2 py-3 flex flex-col items-center gap-2' : 'px-4 py-3.5'
      )}>
        {collapsed ? (
          <>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <span className="text-xs font-semibold text-cream-light">{initials}</span>
            </div>
            <button
              onClick={logout}
              title="Log out"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream-light hover:bg-white/8 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-cream-light">{initials}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-cream-light truncate">{displayName}</p>
              <p className="text-xs text-cream/40 truncate">{user?.email ?? ''}</p>
            </div>
            <button
              onClick={logout}
              title="Log out"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-cream/40 hover:text-cream-light hover:bg-white/8 transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
