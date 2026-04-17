'use client';

import { usePathname } from 'next/navigation';

const titles: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/calls': 'Calls',
  '/dashboard/orders': 'Orders',
  '/dashboard/appointments': 'Appointments',
  '/dashboard/contacts': 'Contacts',
  '/dashboard/escalations': 'Escalations',
  '/dashboard/callbacks': 'Callbacks',
  '/dashboard/reports': 'Reports',
  '/dashboard/phone-numbers': 'Phone Numbers',
  '/dashboard/agent': 'Agent Setup',
  '/dashboard/settings': 'Settings',
};

export default function BizTopbar() {
  const pathname = usePathname();
  const title = titles[pathname] ?? 'Dashboard';

  return (
    <header className="h-14 border-b border-cream-dark bg-white flex items-center justify-between px-6 flex-shrink-0">
      <h1 className="text-sm font-semibold text-primary-dark">{title}</h1>
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <button className="relative w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-cream-light transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-danger border-2 border-white" />
        </button>
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-xs font-bold text-primary">B</span>
        </div>
      </div>
    </header>
  );
}
