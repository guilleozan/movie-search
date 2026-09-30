import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import SearchResults, { useSearchResults } from '@/features/movies/SearchResults';
import { titlePath } from '@/lib/tmdb';

/**
 * Movie search across TMDB (desktop). Controlled by the Layout, which also opens it with "/".
 *
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void }} props
 */
export default function SearchDialog({ open, onOpenChange }) {
  const [query, setQuery] = useState('');
  const search = useSearchResults(query);
  const navigate = useNavigate();

  const openMovie = (movie) => {
    onOpenChange(false);
    setQuery('');
    navigate(titlePath(movie));
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
            if (search.results[0]) openMovie(search.results[0]);
          }}
          className="flex items-center gap-3 border-b border-white/10 px-4"
        >
          <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies & series…"
            aria-label="Search movies"
            className="h-14 flex-1 bg-transparent pr-8 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          {search.isFetching && <Loader2 className="mr-6 h-4 w-4 animate-spin text-slate-500" aria-label="Searching" />}
        </form>

        <div className="max-h-[60vh] overflow-y-auto">
          <SearchResults search={search} onOpenMovie={openMovie} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
