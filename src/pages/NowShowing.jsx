import React from 'react';
import { motion } from 'framer-motion';
import { Clapperboard, CalendarClock } from 'lucide-react';
import MovieCard, { MovieCardSkeleton } from '@/components/MovieCard';
import ErrorBox from '@/components/ErrorBox';
import { countryName } from '@/lib/tmdb';
import { useCountry, useReleaseList } from '@/features/movies/hooks';
import CinemasNear from '@/features/cinemas/CinemasNear';

// Cinemas near the user, then TMDB now_playing / upcoming for their country.
export default function NowShowing() {
  const country = useCountry();
  const nowPlaying = useReleaseList('now_playing', country);
  const upcoming = useReleaseList('upcoming', country);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto w-full">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
          <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" /> Now showing in {countryName(country)}
        </div>
        <h1 className="mt-4 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-white">
          In cinemas & coming soon
        </h1>
        <p className="mt-2 text-slate-400 max-w-md">
          Cinemas near you, what's playing right now and what's headed to the big screen. Bookmark anything you want to catch.
        </p>
      </div>

      <CinemasNear />

      <Section id="now-playing" icon={Clapperboard} title="In theaters now" query={nowPlaying} emptyText="No films listed as playing right now." />
      <div className="mt-12">
        <Section id="upcoming" icon={CalendarClock} title="Coming soon" query={upcoming} emptyText="No upcoming releases listed yet." />
      </div>
    </div>
  );
}

function Section({ id, icon: Icon, title, query, emptyText }) {
  const movies = query.data?.results ?? [];

  return (
    <section aria-labelledby={id}>
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-amber-400" aria-hidden="true" />
        <h2 id={id} className="font-display text-xl font-semibold text-white">{title}</h2>
        {query.isSuccess && movies.length > 0 && (
          <span className="text-sm text-slate-500">· {movies.length} films</span>
        )}
      </div>

      {query.isPending && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-busy="true" aria-label={`Loading ${title}`}>
          {Array.from({ length: 10 }, (_, i) => <MovieCardSkeleton key={i} />)}
        </div>
      )}

      {query.isError && <ErrorBox message={query.error.message} onRetry={() => query.refetch()} />}

      {query.isSuccess && movies.length === 0 && <p className="text-sm text-slate-500">{emptyText}</p>}

      {movies.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
          {movies.map((m, i) => (
            <MovieCard key={m.id} movie={m} index={i} />
          ))}
        </motion.div>
      )}
    </section>
  );
}
