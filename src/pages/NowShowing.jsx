import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Clapperboard, CalendarClock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import MovieCard, { MovieCardSkeleton } from '@/components/MovieCard';
import ErrorBox from '@/components/ErrorBox';
import { countryName } from '@/lib/tmdb';
import { useCountry, useReleaseList } from '@/features/movies/hooks';
import CinemasNear from '@/features/cinemas/CinemasNear';
import { matchScore, useQuizAnswers, useRecommendations, useTaste } from '@/features/recommendations/hooks';

// Card width in the "Picked for you" row.
const ROW_CARD_SIZES = '160px';

// Cinemas near the user, picks from what's showing, then TMDB now_playing /
// upcoming for their country ordered by how well each film fits their taste.
export default function NowShowing() {
  const country = useCountry();
  const nowPlaying = useReleaseList('now_playing', country);
  const upcoming = useReleaseList('upcoming', country);
  const quiz = useQuizAnswers();
  const taste = useTaste();
  const [sort, setSort] = useState('match');
  const order = taste ? sort : 'popular';

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

      {quiz.isSuccess && (quiz.data ? <PickedForYou /> : <QuizHint />)}

      {taste && (
        <div className="mb-6 flex items-center justify-end gap-2 text-sm">
          <span className="text-slate-500" id="order-label">Order films by</span>
          <div role="group" aria-labelledby="order-label" className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
            {[['match', 'Best match'], ['popular', 'Popular']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={sort === value}
                onClick={() => setSort(value)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  sort === value ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-100'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <Section id="now-playing" icon={Clapperboard} title="In theaters now" query={nowPlaying} taste={taste} order={order} emptyText="No films listed as playing right now." />
      <div className="mt-12">
        <Section id="upcoming" icon={CalendarClock} title="Coming soon" query={upcoming} taste={taste} order={order} emptyText="No upcoming releases listed yet." />
      </div>
    </div>
  );
}

function Section({ id, icon: Icon, title, query, taste, order, emptyText }) {
  // TMDB's order is by popularity; "Best match" re-sorts by taste (stable, so ties keep it).
  const movies = (query.data?.results ?? []).map((m) => ({ movie: m, match: taste ? matchScore(m, taste) : null }));
  if (order === 'match') movies.sort((a, b) => b.match.score - a.match.score);

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
          {movies.map(({ movie, match }, i) => (
            <MovieCard key={movie.id} movie={movie} index={i}>
              {match?.good && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-400/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  <Sparkles className="h-3 w-3" aria-hidden="true" /> Good match
                </span>
              )}
            </MovieCard>
          ))}
        </motion.div>
      )}
    </section>
  );
}

/** The recommend function's "In cinemas" picks: what's showing, ranked for this user, with reasons. */
function PickedForYou() {
  const recs = useRecommendations({ context: 'cinemas', seed: null });
  const items = (recs.data?.items ?? []).slice(0, 8);
  if (recs.isError || (recs.isSuccess && items.length === 0)) return null;

  return (
    <section aria-labelledby="picked-for-you" className="mb-12">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-400" aria-hidden="true" />
          <h2 id="picked-for-you" className="font-display text-xl font-semibold text-white">Picked for you in cinemas</h2>
        </div>
        <Link to="/?context=cinemas" className="inline-flex items-center gap-1 text-sm text-amber-300 hover:underline">
          See all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      <ul className="-mx-5 flex gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0" aria-busy={recs.isPending}>
        {recs.isPending
          ? Array.from({ length: 5 }, (_, i) => <li key={i} className="w-40 shrink-0"><MovieCardSkeleton /></li>)
          : items.map((m, i) => (
            <li key={m.id} className="w-40 shrink-0">
              <MovieCard movie={m} index={i} sizes={ROW_CARD_SIZES} />
            </li>
          ))}
      </ul>
    </section>
  );
}

function QuizHint() {
  return (
    <p className="mb-10 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-5 py-4 text-sm text-slate-300">
      <Sparkles className="mr-1.5 inline h-4 w-4 align-[-3px] text-amber-300" aria-hidden="true" />
      Take the <Link to="/" className="text-amber-300 hover:underline">taste quiz</Link> to see which of these films suit you.
    </p>
  );
}
