'use client';

import { usePathname } from 'next/navigation';

const titles: Record<string, string> = {
  '/admin/dashboard': 'Overview',
  '/admin/businesses': 'Businesses',
  '/admin/users': 'Users',
  '/admin/calls': 'Calls',
  '/admin/billing': 'Billing',
  '/admin/settings': 'Settings',
};

export default function Topbar() {
  const pathname = usePathname();

  // Match business detail pages
  const isBusinessDetail = /^\/admin\/businesses\/.+/.test(pathname);
  const title = isBusinessDetail ? 'Business Detail' : (titles[pathname] ?? 'Admin');

  return (
    <header className="h-14 border-b border-cream-dark bg-white flex items-center justify-between px-6 flex-shrink-0">
      <h1 className="text-sm font-semibold text-primary-dark">{title}</h1>
      <div className="flex items-center gap-3">
        <span className="text-xs text-primary-warm bg-danger/10 text-danger border border-danger/20 px-2.5 py-1 rounded-full font-medium">
          Internal only
        </span>
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-xs font-bold text-primary">M</span>
        </div>
      </div>
    </header>
  );
}
