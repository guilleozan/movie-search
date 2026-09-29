import React, { useState } from 'react';
import { Film, Loader2, Plus, Search, X } from 'lucide-react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useCountry, useMovieSearch, useMovies } from '@/features/movies/hooks';
import { tmdbImage } from '@/lib/tmdb-images';
import { releaseYear } from '@/lib/tmdb';
import { MAX_FAVORITES } from '@/features/recommendations/quiz-options';

/**
 * Pick up to MAX_FAVORITES real movies by searching TMDB.
 *
 * @param {{ value: number[], onChange: (ids: number[]) => void }} props
 */
export default function FavoritePicker({ value, onChange }) {
  const country = useCountry();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 300);
  const search = useMovieSearch(debounced);
  // Titles for ids chosen earlier (editing saved answers), plus anything picked now.
  const saved = useMovies(value, country);
  const [picked, setPicked] = useState(() => new Map());

  const full = value.length >= MAX_FAVORITES;
  const active = debounced.trim().length >= 2 && !full;
  const results = active ? (search.data?.results ?? []).filter((m) => !value.includes(m.id)).slice(0, 6) : [];
  const movieFor = (id) => picked.get(id) ?? saved.data?.get(id);

  const add = (movie) => {
    setPicked((prev) => new Map(prev).set(movie.id, movie));
    onChange([...value, movie.id]);
    setQuery('');
  };

  return (
    <div>
      {value.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2" aria-label="Your favourites">
          {value.map((id) => {
            const m = movieFor(id);
            return (
              <li key={id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2 pr-3">
                <Poster path={m?.poster_path} />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                  {m ? `${m.title}${m.release_date ? ` (${releaseYear(m.release_date)})` : ''}` : 'Loading…'}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((x) => x !== id))}
                  aria-label={`Remove ${m?.title ?? 'this film'}`}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-100"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {full ? (
        <p className="text-sm text-slate-500">That's {MAX_FAVORITES}. Remove one to add another.</p>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Blade Runner 2049, Parasite, Lady Bird"
            aria-label="Search for a film you love"
            className="h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          />
          {search.isFetching && active && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" aria-label="Searching" />
          )}
        </div>
      )}

      {active && search.isError && <p className="mt-3 text-sm text-rose-300">{search.error.message}</p>}
      {active && search.data && results.length === 0 && !search.isFetching && (
        <p className="mt-3 text-sm text-slate-500">No films match “{debounced.trim()}”.</p>
      )}
      {results.length > 0 && (
        <ul className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-slate-950 py-1" aria-label="Search results">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => add(m)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/5 focus-visible:bg-white/10 focus-visible:outline-none"
              >
                <Poster path={m.poster_path} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-100">{m.title}</span>
                  <span className="block text-xs text-slate-500">{releaseYear(m.release_date)}</span>
                </span>
                <Plus className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="sr-only">Add</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Poster({ path }) {
  return path ? (
    <img src={tmdbImage(path, 'w92')} alt="" loading="lazy" className="h-12 w-8 shrink-0 rounded object-cover" />
  ) : (
    <span className="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-white/5">
      <Film className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
    </span>
  );
}
