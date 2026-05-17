'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useBusinesses } from '../hooks/useBusinesses';
import { usePlan } from '../hooks/usePlan';
import { apiGet } from '../lib/api';

interface Notification {
  id: string;
  type: 'escalation' | 'missed' | 'system';
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

interface Subscription {
  planName: string;
  status: 'active' | 'trialing' | 'cancelled' | 'past_due';
  renewsAt: string;
}

const typeIcon: Record<string, React.ReactNode> = {
  escalation: (
    <div className="w-8 h-8 rounded-full bg-warning/15 flex items-center justify-center flex-shrink-0">
      <svg className="w-4 h-4 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 3M21 7.5H7.5" />
      </svg>
    </div>
  ),
  missed: (
    <div className="w-8 h-8 rounded-full bg-danger/12 flex items-center justify-center flex-shrink-0">
      <svg className="w-4 h-4 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
      </svg>
    </div>
  ),
  system: (
    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
      <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    </div>
  ),
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface TopbarProps {
  onMobileMenu: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Topbar({ onMobileMenu, collapsed, onToggleCollapse }: TopbarProps) {
  const { token, user, ready } = useAuth(false);
  const { businesses, activeId, switchBusiness, createBusiness } = useBusinesses(token ?? '');
  const { features: planFeatures } = usePlan(token ?? '');
  const [bizMenuOpen, setBizMenuOpen] = useState(false);
  const bizMenuRef = useRef<HTMLDivElement>(null);
  const [showCreateBiz, setShowCreateBiz] = useState(false);
  const [newBizName, setNewBizName] = useState('');
  const [creatingBiz, setCreatingBiz] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  async function handleCreateBiz() {
    if (!newBizName.trim() || creatingBiz) return;
    setCreatingBiz(true);
    try {
      await createBusiness(newBizName.trim());
      setShowCreateBiz(false);
      setNewBizName('');
      setBizMenuOpen(false);
    } catch { /* ignore */ }
    finally { setCreatingBiz(false); }
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bizMenuRef.current && !bizMenuRef.current.contains(e.target as Node)) {
        setBizMenuOpen(false);
        setShowCreateBiz(false);
      }
    }
    if (bizMenuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [bizMenuOpen]);

  const loadNotifications = useCallback(() => {
    if (!token || !user?.businessId) return;
    apiGet<Notification[]>(`/businesses/${user.businessId}/notifications`, token)
      .then(setNotifications).catch(() => null);
  }, [token, user?.businessId]);

  const loadSubscription = useCallback(() => {
    if (!token || !user?.businessId) return;
    apiGet<Subscription>(`/billing/subscription/${user.businessId}`, token)
      .then(setSubscription).catch(() => null);
  }, [token, user?.businessId]);

  useEffect(() => {
    if (!ready) return;
    loadNotifications();
    loadSubscription();
  }, [ready, loadNotifications, loadSubscription]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [notifOpen]);

  function markRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    if (token && user?.businessId) {
      apiGet(`/businesses/${user.businessId}/notifications/${id}/read`, token).catch(() => null);
    }
  }

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    if (token && user?.businessId) {
      apiGet(`/businesses/${user.businessId}/notifications/read-all`, token).catch(() => null);
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length;
  const bizInitial = (user?.businessName || user?.email || '?')[0].toUpperCase();
  const planLine = subscription
    ? `${subscription.planName} · ${subscription.status === 'trialing' ? 'ends' : 'renews'} ${fmtDate(subscription.renewsAt)}`
    : (user?.planName ? `${user.planName} plan` : '');

  return (
    <header className="h-14 border-b border-cream-dark bg-cream-light flex items-center justify-between px-4 flex-shrink-0 relative z-30">
      <div className="flex items-center gap-2">
        {/* Mobile hamburger */}
        <button
          onClick={onMobileMenu}
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl text-primary-warm hover:bg-cream hover:text-primary-dark transition-colors"
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>

        {/* Desktop collapse toggle */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex w-9 h-9 items-center justify-center rounded-xl text-primary-warm hover:bg-cream hover:text-primary-dark transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          )}
        </button>

        {/* Business switcher — clickable on mobile, decorative on desktop (sidebar handles it there) */}
        <div className="relative lg:hidden" ref={bizMenuRef}>
          <button
            onClick={() => user?.role === 'OWNER' && businesses.length > 0 && setBizMenuOpen(v => !v)}
            className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-cream transition-colors"
          >
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-primary">{bizInitial}</span>
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-semibold text-primary-dark leading-tight">
                {user?.businessName || '—'}
              </p>
              <p className="text-xs text-primary-warm leading-tight capitalize">{planLine}</p>
            </div>
            {user?.role === 'OWNER' && businesses.length > 0 && (
              <svg className="w-3 h-3 text-primary-warm hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            )}
          </button>

          {bizMenuOpen && (
            <div className="absolute left-0 top-full mt-1 w-56 bg-white border border-cream-dark rounded-2xl shadow-xl z-50 py-1 overflow-hidden">
              {businesses.map(biz => (
                <button
                  key={biz.id}
                  onClick={() => { switchBusiness(biz.id); setBizMenuOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${
                    biz.id === (activeId ?? businesses[0]?.id)
                      ? 'bg-primary/5 text-primary-dark font-medium'
                      : 'text-primary-warm hover:bg-cream-light'
                  }`}
                >
                  <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-primary">{biz.name[0]?.toUpperCase()}</span>
                  </div>
                  <span className="truncate flex-1">{biz.name}</span>
                  {biz.id === (activeId ?? businesses[0]?.id) && (
                    <svg className="w-3.5 h-3.5 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              ))}
              <div className="border-t border-cream-dark mt-1 pt-1">
                {showCreateBiz ? (
                  <div className="px-3 py-2">
                    <input
                      autoFocus
                      value={newBizName}
                      onChange={e => setNewBizName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateBiz()}
                      placeholder="Business name"
                      className="w-full border border-cream-dark rounded-lg px-2.5 py-1.5 text-sm text-primary-dark placeholder:text-primary-warm/50 outline-none focus:border-primary/50 mb-2"
                    />
                    <div className="flex gap-1.5">
                      <button onClick={handleCreateBiz} disabled={creatingBiz} className="flex-1 text-xs py-1.5 rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-50">
                        {creatingBiz ? '…' : 'Create'}
                      </button>
                      <button onClick={() => { setShowCreateBiz(false); setNewBizName(''); }} className="flex-1 text-xs py-1.5 rounded-lg border border-cream-dark text-primary-warm hover:bg-cream-light transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : planFeatures.multiBusiness ? (
                  <button
                    onClick={() => setShowCreateBiz(true)}
                    className="w-full text-left px-3 py-2.5 text-sm text-primary-warm hover:bg-cream-light transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Add business
                  </button>
                ) : (
                  <div className="px-3 py-2.5 text-sm text-primary-warm/40 flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" />
                    </svg>
                    Add business · Enterprise
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Business name — desktop only (switcher is in sidebar) */}
        <div className="hidden lg:flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-xs font-bold text-primary">{bizInitial}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-primary-dark leading-tight">{user?.businessName || '—'}</p>
            <p className="text-xs text-primary-warm leading-tight capitalize">{planLine}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* Notifications */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setNotifOpen(v => !v)}
            className="relative w-9 h-9 flex items-center justify-center rounded-xl text-primary-warm hover:bg-cream hover:text-primary-dark transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-danger rounded-full flex items-center justify-center">
                <span className="text-[9px] font-bold text-white leading-none">{unreadCount}</span>
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl shadow-primary/10 border border-cream-dark overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-cream-dark">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-primary-dark">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-danger/10 text-danger">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-cream-dark">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-sm text-primary-warm">No notifications yet.</div>
                ) : notifications.map((notif) => (
                  <button
                    key={notif.id}
                    onClick={() => markRead(notif.id)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3.5 hover:bg-cream-light/60 transition-colors ${
                      !notif.read ? 'bg-cream-light/40' : ''
                    }`}
                  >
                    {typeIcon[notif.type] ?? typeIcon.system}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm leading-tight ${notif.read ? 'font-normal text-primary-dark' : 'font-semibold text-primary-dark'}`}>
                          {notif.title}
                        </p>
                        <span className="text-xs text-cream-dark flex-shrink-0">{timeAgo(notif.createdAt)}</span>
                      </div>
                      <p className="text-xs text-primary-warm mt-0.5 leading-relaxed">{notif.body}</p>
                    </div>
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                    )}
                  </button>
                ))}
              </div>

              <div className="px-4 py-3 border-t border-cream-dark text-center">
                <a href="/notifications" className="text-xs text-primary hover:underline font-medium">
                  View all notifications
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Help */}
        <a
          href="mailto:info.miluai@gmail.com"
          className="w-9 h-9 flex items-center justify-center rounded-xl text-primary-warm hover:bg-cream hover:text-primary-dark transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
          </svg>
        </a>
      </div>
    </header>
  );
}
