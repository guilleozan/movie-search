import React from 'react';
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import { Clapperboard, Bookmark, Compass, Ticket, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { useProfile } from '@/hooks/use-profile';

const navItems = [
  { to: '/', label: 'Discover', icon: Compass, end: true },
  { to: '/now-showing', label: 'Now Showing', icon: Ticket, end: false },
  { to: '/watchlist', label: 'Watchlist', icon: Bookmark, end: false },
];

export default function Layout() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();

  const displayName = profile?.display_name || user?.email || '';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex sticky top-0 h-screen w-60 shrink-0 flex-col border-r border-white/5 bg-slate-950/80 backdrop-blur">
        <Link to="/" className="flex items-center gap-2.5 px-6 py-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-slate-950">
            <Clapperboard className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">CineMatch</span>
        </Link>
        <nav className="flex flex-col gap-1 px-3 mt-2" aria-label="Main">
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
              <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/5 px-3 py-4">
          <div className="flex items-center gap-3 px-3">
            <Avatar name={displayName} url={profile?.avatar_url} />
            <span className="min-w-0 flex-1 truncate text-sm text-slate-300" title={displayName}>
              {displayName}
            </span>
          </div>
          <button
            onClick={handleSignOut}
            className="mt-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar: icon-only nav below 640px so it fits at 375px */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between gap-2 px-4 h-14 border-b border-white/5 bg-slate-950/90 backdrop-blur">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-slate-950">
            <Clapperboard className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="font-display text-base font-semibold tracking-tight">CineMatch</span>
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              aria-label={item.label}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 rounded-lg p-2 sm:px-3 sm:py-1.5 text-xs font-medium transition-colors',
                  isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-100'
                )
              }
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{item.label}</span>
            </NavLink>
          ))}
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:text-slate-100"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      </div>

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}

function Avatar({ name, url }) {
  if (url) {
    return <img src={url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />;
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold uppercase text-slate-200" aria-hidden="true">
      {(name || '?').charAt(0)}
    </span>
  );
}
