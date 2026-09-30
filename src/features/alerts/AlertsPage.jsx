import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Clapperboard, Play, Tv } from 'lucide-react';
import { cn } from '@/lib/utils';
import ErrorBox from '@/components/ErrorBox';
import { tmdbImage } from '@/lib/tmdb-images';
import { useMarkAllRead, useNotifications } from '@/features/alerts/hooks';

const KINDS = {
  now_streaming: { icon: Tv, tone: 'text-emerald-300' },
  in_cinemas: { icon: Clapperboard, tone: 'text-amber-300' },
  new_episode: { icon: Play, tone: 'text-sky-300' },
};

/** Alerts about the watchlist. Opening the page marks them read. */
export default function AlertsPage() {
  const notifications = useNotifications();
  const markAllRead = useMarkAllRead();
  const list = notifications.data ?? [];
  const hasUnread = list.some((n) => !n.read_at);

  // Mark as read shortly after the page is seen, so the unread dots show first.
  useEffect(() => {
    if (!hasUnread) return;
    const timer = setTimeout(() => markAllRead.mutate(), 1500);
    return () => clearTimeout(timer);
  }, [hasUnread]); // eslint-disable-line react-hooks/exhaustive-deps -- mutate is stable enough; run once per unread batch

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Alerts</h1>
      <p className="mt-1 text-sm text-slate-400">
        When something on your watchlist lands on one of your services, opens in cinemas, or has a new episode.{' '}
        <Link to="/profile" className="text-amber-300 hover:underline">Services & email alerts</Link>
      </p>

      {notifications.isPending && <div className="mt-8 h-40 animate-pulse rounded-2xl bg-white/5" />}
      {notifications.isError && <div className="mt-8"><ErrorBox message="Couldn't load your alerts." onRetry={() => notifications.refetch()} /></div>}

      {notifications.isSuccess && list.length === 0 && (
        <div className="mt-10 flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-slate-500">
            <Bell className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="mt-4 font-medium text-slate-300">No alerts yet</p>
          <p className="mt-1 max-w-xs text-sm text-slate-500">
            Save films and series to your watchlist and pick your streaming services. We'll tell you when they're available.
          </p>
        </div>
      )}

      {list.length > 0 && (
        <ul className="mt-6 divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03]">
          {list.map((n) => {
            const { icon: Icon, tone } = KINDS[n.kind] ?? KINDS.now_streaming;
            return (
              <li key={n.id}>
                <Link to={n.url} className="flex items-start gap-3 p-4 transition-colors hover:bg-white/5">
                  {n.image_path ? (
                    <img src={tmdbImage(n.image_path, 'w185')} alt="" loading="lazy" className="h-12 w-20 shrink-0 rounded-lg object-cover sm:h-14 sm:w-24" />
                  ) : (
                    <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-white/5 sm:h-14 sm:w-24" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-1.5">
                      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} aria-hidden="true" />
                      <span className="line-clamp-2 text-sm font-semibold text-white">{n.title}</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-400">{n.body}</span>
                    <span className="mt-1 block text-xs text-slate-500">{timeAgo(n.created_at)}</span>
                  </span>
                  {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-label="New" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "just now", "3h ago", "2d ago", or a date. */
function timeAgo(iso) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)}h ago`;
  if (minutes < 14 * 24 * 60) return `${Math.round(minutes / 1440)}d ago`;
  return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' });
}
