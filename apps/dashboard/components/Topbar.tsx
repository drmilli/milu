'use client';

import { useState, useRef, useEffect } from 'react';

const notifications = [
  {
    id: 1,
    type: 'escalation',
    title: 'Call escalated',
    body: '+234 803 111 2222 requested a human agent.',
    time: '2 min ago',
    read: false,
  },
  {
    id: 2,
    type: 'escalation',
    title: 'Call escalated',
    body: '+234 701 888 9999 could not be handled by AI.',
    time: '1 hr ago',
    read: false,
  },
  {
    id: 3,
    type: 'missed',
    title: 'Missed call',
    body: '+234 809 333 4444 called while agent was busy.',
    time: '3 hr ago',
    read: true,
  },
  {
    id: 4,
    type: 'system',
    title: 'Weekly summary ready',
    body: 'Your performance report for Apr 7–13 is available.',
    time: 'Yesterday',
    read: true,
  },
];

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

export default function Topbar() {
  const [notifOpen, setNotifOpen] = useState(false);
  const [items, setItems] = useState(notifications);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = items.filter((n) => !n.read).length;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [notifOpen]);

  function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function markRead(id: number) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  return (
    <header className="h-14 border-b border-cream-dark bg-cream-light flex items-center justify-between px-6 flex-shrink-0 relative z-30">
      {/* Business name */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <span className="text-xs font-bold text-primary">A</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-primary-dark leading-tight">Amaka&apos;s Boutique</p>
          <p className="text-xs text-primary-warm leading-tight">Growth plan</p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* Notifications */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setNotifOpen((v) => !v)}
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

          {/* Dropdown */}
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl shadow-primary/10 border border-cream-dark overflow-hidden">
              {/* Header */}
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
                  <button
                    onClick={markAllRead}
                    className="text-xs text-primary hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-cream-dark">
                {items.map((notif) => (
                  <button
                    key={notif.id}
                    onClick={() => markRead(notif.id)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3.5 hover:bg-cream-light/60 transition-colors ${
                      !notif.read ? 'bg-cream-light/40' : ''
                    }`}
                  >
                    {typeIcon[notif.type]}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm leading-tight ${notif.read ? 'font-normal text-primary-dark' : 'font-semibold text-primary-dark'}`}>
                          {notif.title}
                        </p>
                        <span className="text-xs text-cream-dark flex-shrink-0">{notif.time}</span>
                      </div>
                      <p className="text-xs text-primary-warm mt-0.5 leading-relaxed">{notif.body}</p>
                    </div>
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                    )}
                  </button>
                ))}
              </div>

              {/* Footer */}
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
          href="mailto:support@miluai.app"
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
