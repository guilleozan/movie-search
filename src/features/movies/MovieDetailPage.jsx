import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Play, Star, Film, ExternalLink, ArrowLeft, RefreshCw } from 'lucide-react';
import MovieCard from '@/components/MovieCard';
import { tmdbImage, posterSrcSet, backdropSrcSet } from '@/lib/tmdb-images';
import { certificationFor, formatRuntime, pickTrailer, regionalReleaseDate, releaseYear, todayISO } from '@/lib/tmdb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCountry, useMovie } from '@/features/movies/hooks';
import TrailerModal from '@/features/movies/TrailerModal';
import WatchProviders from '@/features/movies/WatchProviders';
import WatchlistActions from '@/features/watchlist/WatchlistActions';
import ShowtimesPanel from '@/features/cinemas/ShowtimesPanel';

// Horizontal "More like this" row: cards are a fixed ~160px wide.
const ROW_CARD_SIZES = '160px';

/** Detail page for a movie (/movie/:id) or a series (/tv/:id, media="tv"). */
export default function MovieDetailPage({ media = 'movie' }) {
  const { tmdbId } = useParams();
  const id = Number(tmdbId);
  const country = useCountry();
  const { data: movie, isPending, isError, error, refetch } = useMovie(id, country, media);
  const isSeries = media === 'tv';
  const [trailerOpen, setTrailerOpen] = useState(false);

  useEffect(() => {
    if (movie) document.title = `${movie.title}${movie.release_date ? ` (${releaseYear(movie.release_date)})` : ''} · CineMatch`;
    return () => {
      document.title = 'CineMatch';
    };
  }, [movie]);

  if (!Number.isInteger(id) || id <= 0 || error?.status === 404 || error?.status === 400) {
    return <NotFound isSeries={isSeries} />;
  }
  if (isError) {
    return (
      <div className="px-5 py-24 text-center">
        <p className="text-rose-300">{error.message}</p>
        <button onClick={() => refetch()} className="mt-4 inline-flex items-center gap-1.5 text-sm text-amber-300 hover:underline">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }
  if (isPending) return <DetailSkeleton />;

  const trailer = pickTrailer(movie.videos);
  const certification = certificationFor(movie.release_dates, country);
  const year = releaseYear(movie.release_date);
  const runtime = isSeries
    ? [movie.seasons && `${movie.seasons} season${movie.seasons > 1 ? 's' : ''}`, movie.runtime && `~${formatRuntime(movie.runtime)} episodes`].filter(Boolean).join(' · ')
    : formatRuntime(movie.runtime);
  const more = movie.recommendations.length ? movie.recommendations : movie.similar;
  const inCinemas = !isSeries && isInCinemas(regionalReleaseDate(movie, country));

  return (
    <article>
      {/* Backdrop */}
      <div className="relative h-56 sm:h-72 lg:h-96 overflow-hidden bg-slate-900">
        {movie.backdrop_path && (
          <img
            src={tmdbImage(movie.backdrop_path, 'w1280')}
            srcSet={backdropSrcSet(movie.backdrop_path)}
            sizes="(min-width: 768px) calc(100vw - 240px), 100vw"
            alt=""
            className="h-full w-full object-cover opacity-60"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
      </div>

      <div className="relative mx-auto -mt-28 sm:-mt-36 max-w-6xl px-5 sm:px-8 lg:px-12 pb-14">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <div className="w-32 sm:w-48 lg:w-56 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
            {movie.poster_path ? (
              <img
                src={tmdbImage(movie.poster_path, 'w342')}
                srcSet={posterSrcSet(movie.poster_path)}
                sizes="(min-width: 1024px) 224px, (min-width: 640px) 192px, 128px"
                alt={`${movie.title} poster`}
                className="aspect-[2/3] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[2/3] items-center justify-center">
                <Film className="h-10 w-10 text-slate-600" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-white">
              {movie.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-300">
              {isSeries && (
                <span className="rounded bg-sky-400/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-200">Series</span>
              )}
              {year && <span>{isSeries && movie.status === 'Ended' ? `${year} · ended` : year}</span>}
              {certification && (
                <span className="rounded border border-white/25 px-1.5 py-px text-xs font-semibold text-slate-200" title={`Rating in ${country}`}>
                  {certification}
                </span>
              )}
              {runtime && <span>{runtime}</span>}
              {movie.vote_count > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <Star className="h-3.5 w-3.5 fill-amber-300" aria-hidden="true" />
                  {movie.vote_average.toFixed(1)}
                  <span className="text-slate-500">({movie.vote_count.toLocaleString()} votes on TMDB)</span>
                </span>
              )}
            </div>
            {movie.genres.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Genres">
                {movie.genres.map((g) => (
                  <li key={g.id} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                    {g.name}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5">
              <WatchlistActions movie={movie} />
            </div>
            {trailer && (
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <button
                  onClick={() => setTrailerOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-300"
                >
                  <Play className="h-4 w-4 fill-slate-950" aria-hidden="true" /> Play trailer
                </button>
                <a
                  href={`https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open on YouTube
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-8">
            <section aria-labelledby="overview">
              <h2 id="overview" className="sr-only">Overview</h2>
              {movie.tagline && <p className="mb-3 italic text-slate-300/80">“{movie.tagline}”</p>}
              <p className="leading-relaxed text-slate-200">{movie.overview || 'No overview available yet.'}</p>
              {movie.directors.length > 0 && (
                <p className="mt-4 text-sm text-slate-400">
                  {isSeries ? 'Created by' : 'Directed by'} <span className="text-slate-200">{movie.directors.map((d) => d.name).join(', ')}</span>
                  {isSeries && movie.networks?.length > 0 && (
                    <> · on <span className="text-slate-200">{movie.networks.map((n) => n.name).join(', ')}</span></>
                  )}
                </p>
              )}
            </section>

            {movie.cast.length > 0 && (
              <section aria-labelledby="cast">
                <h2 id="cast" className="font-display text-lg font-semibold text-white">Top cast</h2>
                <ul className="mt-4 flex gap-4 overflow-x-auto pb-2">
                  {movie.cast.map((person) => (
                    <li key={person.id} className="w-24 shrink-0 text-center">
                      {person.profile_path ? (
                        <img
                          src={tmdbImage(person.profile_path, 'w185')}
                          alt={person.name}
                          loading="lazy"
                          className="mx-auto h-24 w-24 rounded-full object-cover"
                        />
                      ) : (
                        <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-white/5 text-2xl font-semibold text-slate-500" aria-hidden="true">
                          {person.name.charAt(0)}
                        </span>
                      )}
                      <p className="mt-2 line-clamp-2 text-xs font-medium text-slate-200">{person.name}</p>
                      {person.character && <p className="line-clamp-2 text-[11px] text-slate-500">{person.character}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Keyed by title so the default tab resets when moving between titles. */}
          <aside key={`${media}:${movie.id}`} className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 self-start">
            {isSeries ? (
              // Series aren't in cinemas: no showtimes.
              <WatchProviders watchProviders={movie.watch_providers} country={country} />
            ) : (
              <Tabs defaultValue={inCinemas ? 'showtimes' : 'watch'}>
                <TabsList className="grid h-10 w-full grid-cols-2 bg-white/5 text-slate-400">
                  <TabsTrigger value="watch" className="data-[state=active]:bg-white/15 data-[state=active]:text-white">Where to watch</TabsTrigger>
                  <TabsTrigger value="showtimes" className="data-[state=active]:bg-white/15 data-[state=active]:text-white">Showtimes</TabsTrigger>
                </TabsList>
                <TabsContent value="watch" className="mt-5">
                  <WatchProviders watchProviders={movie.watch_providers} country={country} />
                </TabsContent>
                <TabsContent value="showtimes" className="mt-5">
                  <ShowtimesPanel movie={movie} country={country} inCinemas={inCinemas} />
                </TabsContent>
              </Tabs>
            )}
          </aside>
        </div>

        {more.length > 0 && (
          <section aria-labelledby="more-like-this" className="mt-12">
            <h2 id="more-like-this" className="font-display text-lg font-semibold text-white">More like this</h2>
            <ul className="mt-4 flex gap-4 overflow-x-auto pb-2">
              {more.map((m, i) => (
                <li key={m.id} className="w-40 shrink-0">
                  <MovieCard movie={m} index={i} sizes={ROW_CARD_SIZES} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <TrailerModal video={trailer} open={trailerOpen} onOpenChange={setTrailerOpen} />
    </article>
  );
}

/** Released in cinemas in the last ~4 months, or opening within 2 weeks. */
function isInCinemas(releaseDate) {
  if (!releaseDate) return false;
  const day = 24 * 60 * 60 * 1000;
  const today = Date.parse(todayISO());
  const release = Date.parse(releaseDate);
  return release >= today - 120 * day && release <= today + 14 * day;
}

function NotFound({ isSeries }) {
  return (
    <div className="flex flex-col items-center px-5 py-24 text-center">
      <Film className="h-10 w-10 text-slate-600" aria-hidden="true" />
      <h1 className="mt-4 font-display text-2xl font-semibold text-white">{isSeries ? 'Series' : 'Movie'} not found</h1>
      <p className="mt-2 text-sm text-slate-400">We couldn't find that {isSeries ? 'series' : 'movie'} on TMDB.</p>
      <Link to="/now-showing" className="mt-6 inline-flex items-center gap-1.5 text-sm text-amber-300 hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Browse what's showing
      </Link>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading movie">
      <div className="h-56 sm:h-72 lg:h-96 animate-pulse bg-white/5" />
      <div className="relative mx-auto -mt-28 sm:-mt-36 max-w-6xl px-5 sm:px-8 lg:px-12 pb-14">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <div className="aspect-[2/3] w-32 sm:w-48 lg:w-56 animate-pulse rounded-2xl bg-white/10" />
          <div className="flex-1 space-y-3">
            <div className="h-9 w-2/3 animate-pulse rounded bg-white/10" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-white/5" />
            <div className="h-7 w-1/2 animate-pulse rounded bg-white/5" />
          </div>
        </div>
        <div className="mt-10 space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-white/5" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-white/5" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-white/5" />
        </div>
      </div>
    </div>
  );
}
