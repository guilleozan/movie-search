import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Clapperboard, Loader2, Search, X } from 'lucide-react';
import SearchResults, { useSearchResults } from '@/features/movies/SearchResults';
import { titlePath } from '@/lib/tmdb';

const EASE = [0.32, 0.72, 0, 1];

/**
 * Mobile top bar: the logo, and a search icon that expands into a search field
 * across the bar, with results in a panel below it.
 */
export default function MobileTopBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const search = useSearchResults(query);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const close = () => {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  // Close when the page changes (e.g. after picking a result or going back).
  useEffect(() => {
    setOpen(false);
    setQuery('');
  }, [pathname]);

  const expand = () => {
    setOpen(true);
    // Focus inside the tap itself, or iOS won't show the keyboard.
    inputRef.current?.focus();
  };

  const openMovie = (movie) => {
    close();
    navigate(titlePath(movie));
  };

  return (
    <>
      <div className="md:hidden fixed inset-x-0 top-0 z-50 h-14 border-b border-white/5 bg-slate-950/90 backdrop-blur">
        <motion.div
          initial={false}
          animate={{ opacity: open ? 0 : 1, x: open ? -12 : 0 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="absolute inset-y-0 left-4 flex items-center"
          aria-hidden={open}
        >
          <Link to="/" tabIndex={open ? -1 : 0} className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-slate-950">
              <Clapperboard className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="font-display text-base font-semibold tracking-tight">CineMatch</span>
          </Link>
        </motion.div>

        {/* A CSS transition, not framer-motion: it can interpolate rem -> calc(%). */}
        <form
          role="search"
          style={{ width: open ? 'calc(100% - 2rem)' : '2.25rem' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (search.results[0]) openMovie(search.results[0]);
          }}
          onKeyDown={(e) => e.key === 'Escape' && close()}
          className={`absolute right-4 top-2.5 flex h-9 items-center overflow-hidden rounded-lg border transition-[width,background-color,border-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
            open ? 'border-white/15 bg-white/10' : 'border-transparent bg-transparent'
          }`}
        >
          <button
            type="button"
            onClick={expand}
            aria-label="Search movies"
            aria-expanded={open}
            tabIndex={open ? -1 : 0}
            className="flex h-9 w-9 shrink-0 items-center justify-center text-slate-300 transition-colors hover:text-white"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies & series…"
            aria-label="Search movies"
            tabIndex={open ? 0 : -1}
            aria-hidden={!open}
            className="h-full min-w-0 flex-1 bg-transparent text-base text-slate-100 placeholder:text-slate-500 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {open && search.isFetching && <Loader2 className="mr-1 h-4 w-4 shrink-0 animate-spin text-slate-500" aria-label="Searching" />}
          {open && (
            <button
              type="button"
              onClick={close}
              aria-label="Close search"
              className="flex h-9 w-9 shrink-0 items-center justify-center text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </form>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="md:hidden fixed inset-x-0 bottom-0 top-14 z-50 overflow-y-auto overscroll-contain bg-slate-950/95 backdrop-blur"
          >
            <SearchResults search={search} onOpenMovie={openMovie} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
