import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Eye, Film, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import ErrorBox from '@/components/ErrorBox';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { callTmdb, releaseYear, titlePath } from '@/lib/tmdb';
import { retryServerErrors } from '@/lib/edge-functions';
import { tmdbImage, posterSrcSet } from '@/lib/tmdb-images';
import { useMovieSearch } from '@/features/movies/hooks';
import { useRemoveWatchlistItem, useSaveWatchlistItem, useWatchlist, useWatchlistItem } from '@/features/watchlist/hooks';
import { RatingInput } from '@/features/watchlist/RatingInput';
import PlatformSelect from '@/features/watchlist/PlatformSelect';
import NetflixImport from '@/features/history/NetflixImport';

const CARD_SIZES = '(min-width: 1024px) 200px, (min-width: 640px) 33vw, 50vw';

/**
 * "What you've watched": mark films and series seen on any service, with an
 * optional rating and where, or import Netflix history. Recommendations learn
 * from all of it.
 */
export default function SeenPage() {
  const [media, setMedia] = useState('movie');
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 300);
  const searching = debounced.trim().length >= 2;
  const search = useMovieSearch(debounced, media);
  const popular = usePopular(media, !searching);
  const watchlist = useWatchlist();

  const watchedCount = (watchlist.data ?? []).filter((i) => i.status === 'watched').length;
  const titles = searching ? search.data?.results ?? [] : popular.data?.pages.flatMap((p) => p.results) ?? [];
  const list = searching ? search : popular;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-white">What you've watched</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Mark what you've seen on any service (Netflix, Neon, Disney+, Prime Video, TVNZ+…) or at the cinema. Your picks learn from it,
        and you won't be recommended things you've already watched.
        {watchedCount > 0 && <> You've marked <Link to="/watchlist" className="text-amber-300 hover:underline">{watchedCount}</Link> so far.</>}
      </p>

      <details className="group mt-6 rounded-2xl border border-white/5 bg-white/[0.03] p-5 sm:p-6">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span>
            <span className="block font-display text-lg font-semibold text-white">Import from Netflix</span>
            <span className="block text-sm text-slate-400">Add everything you've watched there in one go.</span>
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-5">
          <NetflixImport />
        </div>
      </details>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex w-fit gap-1 rounded-xl border border-white/10 bg-white/5 p-1" role="group" aria-label="Movies or series">
          {[['movie', 'Movies'], ['tv', 'Series']].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={media === value}
              onClick={() => setMedia(value)}
              className={cn(
                'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
                media === value ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-100'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={media === 'tv' ? 'Search a series you watched' : 'Search a film you watched'}
            aria-label={media === 'tv' ? 'Search series' : 'Search films'}
            className="h-10 w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          />
        </div>
      </div>

      <h2 className="mb-4 mt-6 text-sm font-medium text-slate-400">
        {searching ? `Results for “${debounced.trim()}”` : `Most-watched ${media === 'tv' ? 'series' : 'films'}: tap the ones you've seen`}
      </h2>

      {list.isPending && (searching || !popular.data) && (
        <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</p>
      )}
      {list.isError && <ErrorBox message={list.error.message} onRetry={() => list.refetch()} />}
      {searching && search.isSuccess && titles.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-500">Nothing matches “{debounced.trim()}”.</p>
      )}

      {titles.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {titles.map((t) => (
            <SeenCard key={`${media}:${t.id}`} title={{ ...t, media_type: media }} />
          ))}
        </ul>
      )}

      {!searching && popular.hasNextPage && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => popular.fetchNextPage()}
            disabled={popular.isFetchingNextPage}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:border-white/20 disabled:opacity-50"
          >
            {popular.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Show more
          </button>
        </div>
      )}
    </div>
  );
}

/** All-time most-voted titles: the ones people are most likely to have seen. */
function usePopular(media, enabled) {
  return useInfiniteQuery({
    queryKey: ['tmdb', 'most-watched', media],
    enabled,
    initialPageParam: 1,
    staleTime: 24 * 60 * 60 * 1000,
    retry: retryServerErrors,
    queryFn: ({ pageParam }) => callTmdb('discover', { media, sort_by: 'vote_count.desc', page: pageParam }),
    getNextPageParam: (last) => (last.page < Math.min(last.total_pages, 10) ? last.page + 1 : undefined),
  });
}

function SeenCard({ title }) {
  const media = title.media_type;
  const item = useWatchlistItem(title.id, media);
  const save = useSaveWatchlistItem();
  const remove = useRemoveWatchlistItem();
  const seen = item?.status === 'watched';
  const key = { tmdb_id: title.id, media_type: media };

  const toggleSeen = () => (seen ? remove.mutate(key) : save.mutate({ ...key, status: 'watched' }));

  return (
    <li className={cn('flex flex-col overflow-hidden rounded-2xl border bg-white/[0.03] transition-colors', seen ? 'border-emerald-400/40' : 'border-white/5')}>
      <Link to={titlePath(title)} className="relative block aspect-[2/3] bg-slate-900">
        {title.poster_path ? (
          <img
            src={tmdbImage(title.poster_path, 'w342')}
            srcSet={posterSrcSet(title.poster_path)}
            sizes={CARD_SIZES}
            alt={`${title.title} poster`}
            loading="lazy"
            className={cn('h-full w-full object-cover transition-opacity', seen && 'opacity-60')}
          />
        ) : (
          <span className="flex h-full items-center justify-center"><Film className="h-6 w-6 text-slate-600" aria-hidden="true" /></span>
        )}
        {seen && (
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-emerald-500/90 py-1 text-xs font-semibold text-slate-950">
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Seen
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">
          {title.title} <span className="font-normal text-slate-500">{releaseYear(title.release_date)}</span>
        </p>
        <button
          type="button"
          aria-pressed={seen}
          onClick={toggleSeen}
          className={cn(
            'mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
            seen ? 'border border-white/10 bg-white/5 text-slate-300 hover:border-white/25' : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
          )}
        >
          {seen ? 'Unmark' : <><Eye className="h-3.5 w-3.5" aria-hidden="true" /> Seen it</>}
        </button>
        {seen && (
          <>
            <RatingInput size="sm" value={item.rating} onChange={(rating) => save.mutate({ ...key, status: 'watched', rating })} />
            <PlatformSelect
              value={item.watched_on}
              onChange={(watched_on) => save.mutate({ ...key, status: 'watched', watched_on })}
              className="h-8 w-full rounded-md border border-white/10 bg-slate-900 px-1.5 text-xs text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            />
          </>
        )}
      </div>
    </li>
  );
}
