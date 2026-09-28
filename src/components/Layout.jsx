import React from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { Clapperboard, Bookmark, Compass, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', label: 'Discover', icon: Compass, end: true },
  { to: '/now-showing', label: 'Now Showing', icon: Ticket, end: false },
  { to: '/watchlist', label: 'Watchlist', icon: Bookmark, end: false },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-white/5 bg-slate-950/80 backdrop-blur">
        <Link to="/" className="flex items-center gap-2.5 px-6 py-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-slate-950">
            <Clapperboard className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">Reel</span>
        </Link>
        <nav className="flex flex-col gap-1 px-3 mt-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                )
              }
            >
              <item.icon className="h-4.5 w-4.5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-6 py-5 text-[11px] leading-relaxed text-slate-600">
          Picks curated for your taste.
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 h-14 border-b border-white/5 bg-slate-950/90 backdrop-blur">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-slate-950">
            <Clapperboard className="h-4 w-4" />
          </span>
          <span className="font-display text-base font-semibold tracking-tight">Reel</span>
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-100'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}