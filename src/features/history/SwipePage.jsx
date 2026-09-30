import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import { Bookmark, Film, Heart, SkipForward, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import ErrorBox from '@/components/ErrorBox';
import { callTmdb, releaseYear } from '@/lib/tmdb';
import { retryServerErrors } from '@/lib/edge-functions';
import { tmdbImage, posterSrcSet } from '@/lib/tmdb-images';
import { useSaveWatchlistItem, useWatchlist } from '@/features/watchlist/hooks';

const SWIPE_DISTANCE = 110;
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
        {cards[1] && <Poster title={cards[1]} caption={false} className="absolute inset-0 scale-95 opacity-50" />}
        <AnimatePresence custom={exit}>
          {current && <SwipeCard key={`${media}:${current.id}`} title={current} onAnswer={answer} />}
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

const exitVariants = {
  exit: (direction) => ({ x: direction * 480, y: direction === 0 ? 480 : 0, rotate: direction * 18, opacity: 0, transition: { duration: 0.28 } }),
};

function SwipeCard({ title, onAnswer }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-14, 14]);
  const lovedOpacity = useTransform(x, [30, SWIPE_DISTANCE], [0, 1]);
  const dislikedOpacity = useTransform(x, [-SWIPE_DISTANCE, -30], [1, 0]);

  return (
    <motion.div
      className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.9}
      onDragEnd={(_e, info) => {
        const fling = info.offset.x + info.velocity.x * 0.2;
        if (fling > SWIPE_DISTANCE) onAnswer('loved');
        else if (fling < -SWIPE_DISTANCE) onAnswer('disliked');
      }}
      initial={{ scale: 0.95 }}
      animate={{ scale: 1 }}
      variants={exitVariants}
      exit="exit"
    >
      <Poster title={title} />
      <motion.span style={{ opacity: lovedOpacity }} className="pointer-events-none absolute left-4 top-4 rotate-[-12deg] rounded-lg border-2 border-emerald-400 px-2 py-1 text-lg font-bold uppercase text-emerald-300">
        Loved it
      </motion.span>
      <motion.span style={{ opacity: dislikedOpacity }} className="pointer-events-none absolute right-4 top-4 rotate-[12deg] rounded-lg border-2 border-rose-400 px-2 py-1 text-lg font-bold uppercase text-rose-300">
        Not for me
      </motion.span>
    </motion.div>
  );
}

function Poster({ title, className, caption = true }) {
  return (
    <div className={cn('relative h-full w-full overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl', className)}>
      {title.poster_path ? (
        <img
          src={tmdbImage(title.poster_path, 'w500')}
          srcSet={posterSrcSet(title.poster_path)}
          sizes="(min-width: 448px) 400px, 90vw"
          alt={`${title.title} poster`}
          draggable={false}
          className="h-full w-full select-none object-cover"
        />
      ) : (
        <span className="flex h-full items-center justify-center"><Film className="h-10 w-10 text-slate-600" aria-hidden="true" /></span>
      )}
      {caption && (
        <div className="absolute inset-x-0 bottom-0 rounded-b-3xl bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent p-5 pt-16">
          <p className="font-display text-xl font-semibold text-white">{title.title}</p>
          <p className="mt-0.5 text-sm text-slate-300">
            {[releaseYear(title.release_date), title.genres?.slice(0, 2).map((g) => g.name).join(' · ')].filter(Boolean).join(' · ')}
          </p>
        </div>
      )}
    </div>
  );
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
