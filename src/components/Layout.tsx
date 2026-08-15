"use client";

import { useState } from 'react';
import { useAuth } from './AuthProvider';
import InstallAppButton from './InstallAppButton';
import { usePathname, useRouter } from 'next/navigation';
import type { User } from '../data/types';
import { canAccessNav, isSuperAdmin, isStaff, normalizeRole, roleDisplayLabel } from '@/lib/permissions';

interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: string;
  roles: Array<User['role']>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', href: '/', label: 'Dashboard', icon: '◈', roles: ['superadmin', 'admin', 'staff'] },
  { id: 'companies', href: '/companies', label: 'Companies', icon: '▣', roles: ['superadmin'] },
  { id: 'houses', href: '/houses', label: 'Properties', icon: '⌂', roles: ['superadmin', 'admin', 'staff'] },
  { id: 'bookings', href: '/bookings', label: 'Bookings', icon: '◷', roles: ['admin'] },
  { id: 'purchases', href: '/purchases', label: 'Guest Purchases', icon: '＋', roles: ['admin'] },
  { id: 'customers', href: '/customers', label: 'Guests', icon: '◉', roles: ['admin'] },
  { id: 'catalogue', href: '/catalogue', label: 'Catalogue', icon: '≡', roles: ['admin'] },
  { id: 'staff', href: '/staff', label: 'Team', icon: '◎', roles: ['superadmin'] },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentUser, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublicRoute = pathname?.startsWith('/bill') || pathname === '/login';

  if (!currentUser || isPublicRoute) {
    return <>{children}</>;
  }

  const visibleNav = NAV_ITEMS.filter(n => {
    if (isSuperAdmin(currentUser)) {
      return n.roles.includes('superadmin') || n.id === 'dashboard' || n.id === 'houses' || n.id === 'companies' || n.id === 'staff';
    }
    if (isStaff(currentUser)) {
      return n.id === 'dashboard' || n.id === 'houses';
    }
    return canAccessNav(currentUser, n.roles);
  });

  const role = normalizeRole(currentUser.role);
  const roleLabel = roleDisplayLabel(role);
  const roleBadgeColor = role === 'superadmin'
    ? 'bg-[#2A5244] text-[#F7F3EE]'
    : role === 'admin'
      ? 'bg-[#B87333] text-white'
      : 'bg-[#E8E1D8] text-[#3D3228]';

  return (
    <div className="flex h-full min-h-screen" style={{ background: 'var(--background)' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 flex flex-col transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: '#1C1612', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Logo */}
        <div className="px-6 pt-7 pb-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded flex items-center justify-center text-lg" style={{ background: 'var(--accent)' }}>⌂</div>
            <div>
              <div className="text-white font-semibold text-sm tracking-wide" style={{ fontFamily: 'DM Serif Display, serif' }}>Havens</div>
              <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Mono, monospace' }}>Management</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {visibleNav.map(item => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <button
                key={item.id}
                onClick={() => { router.push(item.href); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium mb-0.5 text-left transition-all ${active ? 'text-white' : 'text-white/50 hover:text-white/80 hover:bg-white/5'}`}
                style={active ? { background: 'var(--primary)', color: 'white' } : {}}
              >
                <span className="text-base w-5 text-center">{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-4 pb-5 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: 'var(--accent)', color: 'white' }}>
              {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">{currentUser.name}</div>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${roleBadgeColor}`}>{roleLabel}</span>
            </div>
          </div>
          <InstallAppButton variant="sidebar" />
          <button
            onClick={logout}
            className="w-full text-left text-xs px-3 py-2 rounded transition-colors hover:bg-white/10"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            Sign out →
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Mobile menu only */}
        <header
          className="lg:hidden flex items-center px-4 py-3 border-b"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-1 text-lg"
            style={{ color: 'var(--foreground)' }}
            aria-label="Open menu"
          >
            ☰
          </button>
          <span className="ml-2 font-semibold text-sm" style={{ fontFamily: 'DM Serif Display, serif', color: 'var(--foreground)' }}>
            Havens
          </span>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export type Page = string;
