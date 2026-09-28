import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Film, Star, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMovieSearch } from '@/features/movies/hooks';
import { tmdbImage } from '@/lib/tmdb-images';
import { releaseYear } from '@/lib/tmdb';

const MAX_RESULTS = 10;

/**
 * Movie search across TMDB. Controlled by the Layout, which also opens it with "/".
 *
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void }} props
 */
export default function SearchDialog({ open, onOpenChange }) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 300);
  const { data, isFetching, isError, error } = useMovieSearch(debounced);
  const navigate = useNavigate();

  const active = debounced.trim().length >= 2;
  const results = active ? (data?.results ?? []).slice(0, MAX_RESULTS) : [];

  const openMovie = (id) => {
    onOpenChange(false);
    setQuery('');
    navigate(`/movie/${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[10%] translate-y-0 data-[state=closed]:slide-out-to-top-[5%] data-[state=open]:slide-in-from-top-[5%] max-w-xl gap-0 overflow-hidden border-white/10 bg-slate-950 p-0"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Search movies</DialogTitle>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (results[0]) openMovie(results[0].id);
          }}
          className="flex items-center gap-3 border-b border-white/10 px-4"
        >
          <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies…"
            aria-label="Search movies"
            className="h-14 flex-1 bg-transparent pr-8 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          {isFetching && <Loader2 className="mr-6 h-4 w-4 animate-spin text-slate-500" aria-label="Searching" />}
        </form>

        <div className="max-h-[60vh] overflow-y-auto">
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
                    onClick={() => openMovie(m.id)}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
