import React from 'react';
import { Film, Star } from 'lucide-react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMovieSearch } from '@/features/movies/hooks';
import { tmdbImage } from '@/lib/tmdb-images';
import { releaseYear } from '@/lib/tmdb';

const MAX_RESULTS = 10;

/** Debounced TMDB search state for a raw input value. */
export function useSearchResults(query) {
  const debounced = useDebouncedValue(query, 300);
  const search = useMovieSearch(debounced);
  const active = debounced.trim().length >= 2;
  return { ...search, debounced, active, results: active ? (search.data?.results ?? []).slice(0, MAX_RESULTS) : [] };
}

/**
 * The hint / error / results list under a search field. Shared by the desktop
 * search dialog and the mobile top-bar search.
 *
 * @param {{ search: ReturnType<typeof useSearchResults>, onOpenMovie: (id: number) => void }} props
 */
export default function SearchResults({ search, onOpenMovie }) {
  const { active, isError, error, data, results, debounced } = search;
  return (
    <>
      {!active && <p className="px-4 py-8 text-center text-sm text-slate-500">Type at least 2 letters of a movie title.</p>}
      {active && isError && <p className="px-4 py-8 text-center text-sm text-rose-300">{error.message}</p>}
      {active && !isError && data && results.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-slate-500">No movies match “{debounced.trim()}”.</p>
      )}
      {results.length > 0 && (
        <ul className="py-2" aria-label="Search results">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onOpenMovie(m.id)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-white/5 focus-visible:bg-white/10 focus-visible:outline-none"
              >
                {m.poster_path ? (
                  <img src={tmdbImage(m.poster_path, 'w92')} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded object-cover" />
                ) : (
                  <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-white/5">
                    <Film className="h-4 w-4 text-slate-600" aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-100">{m.title}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {[releaseYear(m.release_date), m.genres.slice(0, 2).map((g) => g.name).join(', ')].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {m.vote_count > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-amber-300">
                    <Star className="h-3 w-3 fill-amber-300" aria-hidden="true" /> {m.vote_average.toFixed(1)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
