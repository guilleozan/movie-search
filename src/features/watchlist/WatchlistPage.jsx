import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, CalendarClock, Eye, History, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import MovieCard, { MovieCardSkeleton } from '@/components/MovieCard';
import ErrorBox from '@/components/ErrorBox';
import { useCountry, useMovies } from '@/features/movies/hooks';
import { countryName, formatReleaseDate, providersFor, regionalReleaseDate, todayISO } from '@/lib/tmdb';
import { REACTIONS, useWatchlist } from '@/features/watchlist/hooks';
import { RatingStars } from '@/features/watchlist/RatingInput';
import MarkWatchedDialog from '@/features/watchlist/MarkWatchedDialog';

const STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'want_to_watch', label: 'Want to watch' },
  { value: 'watched', label: 'Watched' },
];

const SORTS = [
  { value: 'added', label: 'Recently added' },
  { value: 'release', label: 'Release date' },
  { value: 'rating', label: 'Your rating' },
  { value: 'tmdb', label: 'TMDB rating' },
];

const TYPES = [
  { value: 'all', label: 'Movies & series' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'Series' },
];

const DEFAULT_FILTERS = { genre: '', streaming: '', sort: 'added' };

export default function WatchlistPage() {
  const country = useCountry();
  const watchlist = useWatchlist();
  const items = watchlist.data ?? [];
  // Movie and series ids overlap, so they are fetched and looked up separately.
  const movies = useMovies(items.filter((i) => i.media_type !== 'tv').map((i) => i.tmdb_id), country);
  const series = useMovies(items.filter((i) => i.media_type === 'tv').map((i) => i.tmdb_id), country, 'tv');
  const detailsFor = (item) => (item.media_type === 'tv' ? series.data : movies.data)?.get(item.tmdb_id);

  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [editing, setEditing] = useState(null); // { movie, item } for the dialog

  const today = todayISO();

  // Join rows with TMDB data and precompute what filters and sorting need.
  const entries = useMemo(
    () =>
      items.map((item) => {
        const found = detailsFor(item);
        const movie = found && { ...found, media_type: item.media_type };
        const release = movie ? regionalReleaseDate(movie, country) : null;
        return {
          item,
          movie,
          release,
          stream: movie ? providersFor(movie.watch_providers, country).stream : [],
          upcoming: item.status === 'want_to_watch' && !!release && release > today,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- detailsFor reads these two
    [items, movies.data, series.data, country, today]
  );

  const genreOptions = useMemo(() => uniqueBy(entries.flatMap((e) => e.movie?.genres ?? []), 'id', 'name'), [entries]);
  const providerOptions = useMemo(() => uniqueBy(entries.flatMap((e) => e.stream), 'provider_id', 'provider_name'), [entries]);

  const ofType = (item) => type === 'all' || item.media_type === type;
  const typed = items.filter(ofType);
  const counts = {
    all: typed.length,
    want_to_watch: typed.filter((i) => i.status === 'want_to_watch').length,
    watched: typed.filter((i) => i.status === 'watched').length,
  };

  const comingSoon = status === 'watched'
    ? []
    : entries.filter((e) => e.upcoming && ofType(e.item)).sort((a, b) => a.release.localeCompare(b.release));

  const visible = entries
    .filter((e) => ofType(e.item))
    .filter((e) => status === 'all' || e.item.status === status)
    .filter((e) => !e.upcoming || status === 'watched')
    .filter((e) => !filters.genre || e.movie?.genres.some((g) => String(g.id) === filters.genre))
    .filter((e) => {
      if (!filters.streaming) return true;
      if (filters.streaming === 'any') return e.stream.length > 0;
      return e.stream.some((p) => String(p.provider_id) === filters.streaming);
    })
    .sort(SORTERS[filters.sort]);

  const filtersActive = filters.genre || filters.streaming;
  const hasSeries = items.some((i) => i.media_type === 'tv');
  const loadingMovies =
    (movies.isPending && items.some((i) => i.media_type !== 'tv')) || (series.isPending && hasSeries);
  const detailsError = movies.error ?? series.error;

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto w-full">
      <div className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Watchlist</h1>
            <p className="mt-1 text-sm text-slate-400">Films and series you've saved, and what you've watched.</p>
          </div>
          <Link
            to="/seen"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-white/20"
          >
            <History className="h-3.5 w-3.5" aria-hidden="true" /> Add what you've watched
          </Link>
        </div>
      </div>

      {watchlist.isPending && <GridSkeleton />}

      {watchlist.isError && (
        <ErrorBox message="Couldn't load your watchlist." onRetry={() => watchlist.refetch()} />
      )}

      {watchlist.isSuccess && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-slate-500">
            <Bookmark className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="mt-4 font-medium text-slate-300">Your watchlist is empty</p>
          <p className="mt-1 max-w-xs text-sm text-slate-500">
            Tap the bookmark on any film or series to save it here. Press <kbd className="rounded border border-white/10 px-1">/</kbd> to search.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
            <Link to="/seen" className="text-amber-300 hover:underline">Tell us what you've watched</Link>
            <Link to="/now-showing" className="text-amber-300 hover:underline">Browse what's showing</Link>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <>
          {/* Status tabs */}
          <div role="tablist" aria-label="Filter by status" className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-1 w-fit max-w-full">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                role="tab"
                aria-selected={status === s.value}
                onClick={() => setStatus(s.value)}
                className={cn(
                  'whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  status === s.value ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-100'
                )}
              >
                {s.label} ({counts[s.value]})
              </button>
            ))}
          </div>

          {/* Filters + sort */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            {hasSeries && (
              <FilterSelect label="Type" value={type} onChange={setType}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </FilterSelect>
            )}
            <FilterSelect label="Genre" value={filters.genre} onChange={(genre) => setFilters((f) => ({ ...f, genre }))}>
              <option value="">All genres</option>
              {genreOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </FilterSelect>
            <FilterSelect label={`Streaming in ${countryName(country)}`} value={filters.streaming} onChange={(streaming) => setFilters((f) => ({ ...f, streaming }))}>
              <option value="">Any availability</option>
              <option value="any">On any streaming service</option>
              {providerOptions.map((p) => <option key={p.provider_id} value={p.provider_id}>{p.provider_name}</option>)}
            </FilterSelect>
            <FilterSelect label="Sort by" value={filters.sort} onChange={(sort) => setFilters((f) => ({ ...f, sort }))}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </FilterSelect>
            {filtersActive && (
              <button
                onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort }))}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear filters
              </button>
            )}
          </div>

          {detailsError && (
            <div className="mt-6">
              <ErrorBox message={detailsError.message} onRetry={() => { movies.refetch(); series.refetch(); }} />
            </div>
          )}

          {comingSoon.length > 0 && (
            <section aria-labelledby="coming-soon" className="mt-8">
              <div className="mb-4 flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-sky-300" aria-hidden="true" />
                <h2 id="coming-soon" className="font-display text-xl font-semibold text-white">Coming soon</h2>
                <span className="text-sm text-slate-500">· releases in {countryName(country)}</span>
              </div>
              <Grid>
                {comingSoon.map((e, i) => (
                  <MovieCard key={`${e.item.media_type}:${e.item.tmdb_id}`} movie={e.movie} index={i}>
                    <p className="inline-flex items-center gap-1.5 rounded-md bg-sky-400/15 px-2 py-1 text-xs font-medium text-sky-200">
                      <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Out {formatReleaseDate(e.release)}
                    </p>
                  </MovieCard>
                ))}
              </Grid>
            </section>
          )}

          <section aria-label="Saved films" className="mt-8">
            {comingSoon.length > 0 && visible.length > 0 && (
              <h2 className="mb-4 font-display text-xl font-semibold text-white">Out now</h2>
            )}
            {loadingMovies ? (
              <GridSkeleton count={Math.min(items.length, 10)} />
            ) : visible.length === 0 ? (
              comingSoon.length === 0 && (
                <p className="py-16 text-center text-sm text-slate-500">
                  Nothing here with these filters.
                  {filtersActive && (
                    <button onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort }))} className="ml-1 text-amber-300 hover:underline">
                      Clear filters
                    </button>
                  )}
                </p>
              )
            ) : (
              <Grid>
                {visible.map((e, i) =>
                  e.movie ? (
                    <MovieCard key={`${e.item.media_type}:${e.item.tmdb_id}`} movie={e.movie} index={i}>
                      <StatusControls item={e.item} onEdit={() => setEditing({ movie: e.movie, item: e.item })} />
                    </MovieCard>
                  ) : (
                    <MovieCardSkeleton key={`${e.item.media_type}:${e.item.tmdb_id}`} />
                  )
                )}
              </Grid>
            )}
          </section>
        </>
      )}

      <MarkWatchedDialog
        movie={editing?.movie ?? { id: 0, title: '' }}
        item={editing ? items.find((i) => i.tmdb_id === editing.movie.id && i.media_type === (editing.movie.media_type ?? 'movie')) : undefined}
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </div>
  );
}

function StatusControls({ item, onEdit }) {
  if (item.status === 'want_to_watch') {
    return (
      <button
        onClick={onEdit}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/20"
      >
        <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Mark as watched
      </button>
    );
  }
  const reaction = REACTIONS.find((r) => r.value === item.reaction)?.label;
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        {item.rating ? <RatingStars value={item.rating} /> : <span className="text-xs text-slate-500">Watched</span>}
        {reaction && <p className="truncate text-[11px] text-slate-400">{reaction}</p>}
      </div>
      <button onClick={onEdit} aria-label="Edit rating" className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-100">
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-0 rounded-lg border border-white/10 bg-slate-900 px-2 text-sm normal-case tracking-normal text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        {children}
      </select>
    </label>
  );
}

function Grid({ children }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{children}</div>;
}

function GridSkeleton({ count = 10 }) {
  return (
    <Grid>
      {Array.from({ length: count }, (_, i) => <MovieCardSkeleton key={i} />)}
    </Grid>
  );
}

/** Distinct objects by `key`, sorted by `labelKey`. */
function uniqueBy(list, key, labelKey) {
  const map = new Map();
  for (const x of list) if (!map.has(x[key])) map.set(x[key], x);
  return [...map.values()].sort((a, b) => a[labelKey].localeCompare(b[labelKey]));
}

const byAdded = (a, b) => b.item.added_at.localeCompare(a.item.added_at);

const SORTERS = {
  added: byAdded,
  release: (a, b) => (b.release ?? '').localeCompare(a.release ?? '') || byAdded(a, b),
  rating: (a, b) => (b.item.rating ?? 0) - (a.item.rating ?? 0) || (b.movie?.vote_average ?? 0) - (a.movie?.vote_average ?? 0),
  tmdb: (a, b) => (b.movie?.vote_average ?? 0) - (a.movie?.vote_average ?? 0),
};
