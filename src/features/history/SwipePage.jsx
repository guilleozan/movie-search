import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { Bookmark, Heart, SkipForward, ThumbsDown } from 'lucide-react';
import SwipeCard, { SwipePoster } from '@/components/SwipeCard';
import { cn } from '@/lib/utils';
import ErrorBox from '@/components/ErrorBox';
import { callTmdb } from '@/lib/tmdb';
import { retryServerErrors } from '@/lib/edge-functions';
import { useSaveWatchlistItem, useWatchlist } from '@/features/watchlist/hooks';

const SKIPPED_KEY = 'cinematch.swipeSkipped';

/** The four answers; `save` is what goes into the watchlist (null: nothing saved). */
const ANSWERS = {
  loved: { label: 'Loved it', save: { status: 'watched', reaction: 'loved' } },
  disliked: { label: 'Not for me', save: { status: 'watched', reaction: 'not_for_me' } },
  want: { label: 'Want to watch', save: { status: 'want_to_watch' } },
  skip: { label: "Haven't seen", save: null },
};

/**
 * Quick taste training: well-known titles one at a time. Swipe right if you loved
 * it, left if it wasn't for you; or save it, or skip what you haven't seen.
 */
export default function SwipePage() {
  const [media, setMedia] = useState('movie');
  const deck = useDeck(media);
  const watchlist = useWatchlist();
  const save = useSaveWatchlistItem();
  const queryClient = useQueryClient();
  const [skipped, setSkipped] = useState(readSkipped);
  const [answered, setAnswered] = useState(() => new Set());
  const [count, setCount] = useState(0);
  const [exit, setExit] = useState(0); // direction of the card leaving: -1 left, 1 right, 0 up/down

  const known = useMemo(
    () => new Set((watchlist.data ?? []).map((i) => `${i.media_type}:${i.tmdb_id}`)),
    [watchlist.data]
  );
  const cards = (deck.data?.pages.flatMap((p) => p.results) ?? [])
    .map((t) => ({ ...t, media_type: media }))
    .filter((t) => t.poster_path)
    .filter((t) => {
      const key = `${media}:${t.id}`;
      return !known.has(key) && !skipped.has(key) && !answered.has(key);
    });
  const current = cards[0];

  // Keep a few cards queued so the next one is ready.
  useEffect(() => {
    if (cards.length < 5 && deck.hasNextPage && !deck.isFetchingNextPage) deck.fetchNextPage();
  }, [cards.length, deck]);

  const answer = (kind) => {
    if (!current) return;
    const key = `${media}:${current.id}`;
    setExit(kind === 'loved' ? 1 : kind === 'disliked' ? -1 : 0);
    setAnswered((prev) => new Set(prev).add(key));
    if (ANSWERS[kind].save) {
      save.mutate({ tmdb_id: current.id, media_type: media, ...ANSWERS[kind].save });
      setCount((n) => n + 1);
      // Fresh picks next time Discover opens.
      queryClient.removeQueries({ queryKey: ['recommendations'] });
    } else {
      setSkipped((prev) => {
        const next = new Set(prev).add(key);
        writeSkipped(next);
        return next;
      });
    }
  };

  // Arrow keys: → loved, ← not for me, ↑ want to watch, ↓ haven't seen.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      const kind = { ArrowRight: 'loved', ArrowLeft: 'disliked', ArrowUp: 'want', ArrowDown: 'skip' }[e.key];
      if (!kind) return;
      e.preventDefault();
      answer(kind);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-5 py-8 sm:py-12">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white">Quick rate</h1>
          <p className="mt-1 text-sm text-slate-400">Swipe right if you loved it, left if it wasn't for you.</p>
        </div>
        <Link to="/" className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 hover:border-white/20">
          {count > 0 ? `Done (${count})` : 'Done'}
        </Link>
      </div>

      <div className="mt-4 flex w-fit gap-1 rounded-xl border border-white/10 bg-white/5 p-1" role="group" aria-label="Movies or series">
        {[['movie', 'Movies'], ['tv', 'Series']].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={media === value}
            onClick={() => setMedia(value)}
            className={cn('rounded-lg px-4 py-1.5 text-sm font-medium transition-colors', media === value ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-100')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Sized by screen height so the buttons stay visible on phones. */}
      <div className="relative mx-auto mt-5 aspect-[2/3] h-[min(46svh,34rem)] max-w-full">
        {deck.isError && <ErrorBox message={deck.error.message} onRetry={() => deck.refetch()} />}
        {!deck.isError && !current && (
          <div className="flex h-full items-center justify-center rounded-3xl border border-white/5 bg-white/[0.03] p-6 text-center text-sm text-slate-400">
            {deck.isPending || deck.isFetchingNextPage ? 'Loading…' : "That's all for now. Your picks will use everything you rated."}
          </div>
        )}
        {/* The next card sits underneath, so it's there when the top one flies off. */}
        {cards[1] && <SwipePoster title={cards[1]} caption={false} className="absolute inset-0 scale-95 opacity-50" />}
        <AnimatePresence custom={exit}>
          {current && (
            <SwipeCard
              key={`${media}:${current.id}`}
              title={current}
              rightLabel="Loved it"
              leftLabel="Not for me"
              onSwipe={(dir) => answer(dir === 'right' ? 'loved' : 'disliked')}
            />
          )}
        </AnimatePresence>
      </div>

      {current && (
        <div className="mt-5 grid grid-cols-4 gap-2" role="group" aria-label={`Rate ${current.title}`}>
          <ActionButton onClick={() => answer('disliked')} icon={ThumbsDown} label={ANSWERS.disliked.label} tone="rose" />
          <ActionButton onClick={() => answer('skip')} icon={SkipForward} label={ANSWERS.skip.label} tone="slate" />
          <ActionButton onClick={() => answer('want')} icon={Bookmark} label={ANSWERS.want.label} tone="sky" />
          <ActionButton onClick={() => answer('loved')} icon={Heart} label={ANSWERS.loved.label} tone="emerald" />
        </div>
      )}
      <p className="mt-4 hidden text-center text-xs text-slate-500 sm:block">
        Keyboard: → loved · ← not for me · ↑ want to watch · ↓ haven't seen
      </p>
    </div>
  );
}

/** Most-voted titles first: the ones people are most likely to have seen. */
function useDeck(media) {
  return useInfiniteQuery({
    queryKey: ['tmdb', 'swipe-deck', media],
    initialPageParam: 1,
    staleTime: 24 * 60 * 60 * 1000,
    retry: retryServerErrors,
    queryFn: ({ pageParam }) => callTmdb('discover', { media, sort_by: 'vote_count.desc', page: pageParam }),
    getNextPageParam: (last) => (last.page < Math.min(last.total_pages, 25) ? last.page + 1 : undefined),
  });
}

const TONES = {
  rose: 'text-rose-300 hover:border-rose-400/50',
  slate: 'text-slate-300 hover:border-white/25',
  sky: 'text-sky-300 hover:border-sky-400/50',
  emerald: 'text-emerald-300 hover:border-emerald-400/50',
};

function ActionButton({ onClick, icon: Icon, label, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-white/5 px-1 py-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400', TONES[tone])}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      {label}
    </button>
  );
}

// "Haven't seen" is remembered on this device only, so the same titles don't come
// back every session. It's a convenience; nothing breaks without it.
function readSkipped() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SKIPPED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function writeSkipped(set) {
  try {
    localStorage.setItem(SKIPPED_KEY, JSON.stringify([...set].slice(-2000)));
  } catch {
    // storage unavailable: skipping still works for this session
  }
}
