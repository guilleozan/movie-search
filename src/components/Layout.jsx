import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import { Bell, Clapperboard, Bookmark, Compass, Ticket, LogOut, Search, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { useProfile } from '@/hooks/use-profile';
import Footer from '@/components/Footer';
import SearchDialog from '@/features/movies/SearchDialog';
import MobileTopBar from '@/components/MobileTopBar';
import { useAlertsCheck, useUnreadCount } from '@/features/alerts/hooks';

const navItems = [
  { to: '/', label: 'Discover', icon: Compass, end: true },
  { to: '/now-showing', label: 'Now Showing', icon: Ticket, end: false },
  { to: '/watchlist', label: 'Watchlist', icon: Bookmark, end: false },
];

// On mobile, Profile joins the tab bar (sign out lives on the profile page).
const mobileNavItems = [...navItems, { to: '/profile', label: 'Profile', icon: UserRound, end: false }];

export default function Layout() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const unread = useUnreadCount();
  useAlertsCheck();

  // "/" or Cmd/Ctrl+K opens search, unless the user is typing in a field.
  useEffect(() => {
    const onKeyDown = (e) => {
      const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
      if ((e.key === '/' && !typing) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
        <button
          onClick={() => setSearchOpen(true)}
          className="mx-3 flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400 transition-colors hover:border-white/20 hover:text-slate-200"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="flex-1 text-left">Search movies</span>
          <kbd className="rounded border border-white/10 px-1.5 text-[10px] text-slate-500">/</kbd>
        </button>
        <nav className="flex flex-col gap-1 px-3 mt-3" aria-label="Main">
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
          <NavLink
            to="/alerts"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
              )
            }
          >
            <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
            Alerts
            {unread > 0 && (
              <span className="ml-auto rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-slate-950">
                {unread}<span className="sr-only"> unread</span>
              </span>
            )}
          </NavLink>
        </nav>
        <div className="mt-auto border-t border-white/5 px-3 py-4">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
                isActive ? 'bg-white/10' : 'hover:bg-white/5'
              )
            }
          >
            <Avatar name={displayName} url={profile?.avatar_url} />
            <span className="min-w-0 flex-1 truncate text-sm text-slate-300" title={displayName}>
              {displayName}
            </span>
          </NavLink>
          <button
            onClick={handleSignOut}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>

      <MobileTopBar unread={unread} />

      <main className="flex min-h-screen flex-1 min-w-0 flex-col pt-14 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pt-0 md:pb-0">
        <Outlet />
        <Footer />
      </main>

      {/* Mobile tab bar, always visible. */}
      <nav
        aria-label="Main"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="grid h-16 grid-cols-4">
          {mobileNavItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                    isActive ? 'text-amber-300' : 'text-slate-400 hover:text-slate-100'
                  )
                }
              >
                <item.icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
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
