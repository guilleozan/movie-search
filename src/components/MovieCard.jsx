import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bookmark, BookmarkCheck, Star, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tmdbImage, posterSrcSet } from '@/lib/tmdb-images';
import { formatRuntime, releaseYear } from '@/lib/tmdb';

// Matches the grids that use this card (2 / 3 / 4 / 5 columns).
const GRID_SIZES = '(min-width: 1280px) 200px, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw';

/**
 * Poster card linking to the movie page.
 *
 * @param {Object} props
 * @param {import('@/lib/tmdb').MovieSummary & { reason?: string }} props.movie
 * @param {number} [props.index] position in the grid, for the staggered entrance
 * @param {string} [props.sizes] `sizes` for the poster srcset
 * @param {boolean} [props.saved]
 * @param {(movie: object) => void} [props.onToggleSave] shows the bookmark button when set
 */
export default function MovieCard({ movie, index = 0, sizes = GRID_SIZES, saved, onToggleSave }) {
  const year = releaseYear(movie.release_date);
  const runtime = formatRuntime(movie.runtime);
  const genres = movie.genres?.slice(0, 2).map((g) => g.name).join(' · ');

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.4) }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] transition-colors hover:border-white/15"
    >
      <Link
        to={`/movie/${movie.id}`}
        className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-2xl"
      >
        <div className="relative aspect-[2/3] overflow-hidden bg-slate-900">
          {movie.poster_path ? (
            <img
              src={tmdbImage(movie.poster_path, 'w342')}
              srcSet={posterSrcSet(movie.poster_path)}
              sizes={sizes}
              alt={`${movie.title} poster`}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <PosterFallback title={movie.title} genre={movie.genres?.[0]?.name} />
          )}
          {movie.vote_count > 0 && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-slate-950/80 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300 backdrop-blur">
              <Star className="h-3 w-3 fill-amber-300" aria-hidden="true" />
              {movie.vote_average.toFixed(1)}
              <span className="sr-only"> out of 10</span>
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col p-3">
          <h3 className="line-clamp-2 font-display text-sm font-semibold leading-snug text-white">
            {movie.title}
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            {[year, runtime].filter(Boolean).join(' · ')}
          </p>
          {genres && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{genres}</p>}
          {movie.reason && <p className="mt-2 text-xs leading-relaxed text-slate-300">{movie.reason}</p>}
        </div>
      </Link>

      {onToggleSave && (
        <button
          onClick={() => onToggleSave(movie)}
          aria-label={saved ? `Remove ${movie.title} from watchlist` : `Add ${movie.title} to watchlist`}
          aria-pressed={!!saved}
          className={cn(
            'absolute right-2 top-2 rounded-full p-2 backdrop-blur transition-colors',
            saved
              ? 'bg-amber-400 text-slate-950'
              : 'bg-slate-950/70 text-slate-200 hover:bg-slate-950 hover:text-white'
          )}
        >
          {saved ? <BookmarkCheck className="h-4 w-4" aria-hidden="true" /> : <Bookmark className="h-4 w-4" aria-hidden="true" />}
        </button>
      )}
    </motion.div>
  );
}

/** Shown when TMDB has no poster: the old genre accent as a tinted panel. */
function PosterFallback({ title, genre }) {
  const accent = pickAccent(genre);
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center"
      style={{ background: accent.panel }}
      role="img"
      aria-label={`${title} (no poster available)`}
    >
      <Film className="h-8 w-8 text-white/60" aria-hidden="true" />
      <span className="line-clamp-3 font-display text-sm font-semibold text-white/80">{title}</span>
    </div>
  );
}

const accents = [
  { panel: 'linear-gradient(160deg,#78350f,#0f172a)' },
  { panel: 'linear-gradient(160deg,#075985,#0f172a)' },
  { panel: 'linear-gradient(160deg,#5b21b6,#0f172a)' },
  { panel: 'linear-gradient(160deg,#9d174d,#0f172a)' },
  { panel: 'linear-gradient(160deg,#065f46,#0f172a)' },
  { panel: 'linear-gradient(160deg,#9f1239,#0f172a)' },
];

function pickAccent(genre = '') {
  const g = genre.toLowerCase();
  const map = {
    horror: 5, thriller: 5, crime: 0, drama: 0, romance: 3,
    comedy: 4, animation: 4, 'science fiction': 1, fantasy: 2,
    action: 1, adventure: 1, documentary: 4, mystery: 2,
  };
  for (const key of Object.keys(map)) {
    if (g.includes(key)) return accents[map[key]];
  }
  return accents[(genre.length || 0) % accents.length];
}

/** Grid placeholder while cards load. */
export function MovieCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03]" aria-hidden="true">
      <div className="aspect-[2/3] animate-pulse bg-white/5" />
      <div className="space-y-2 p-3">
        <div className="h-3.5 w-4/5 animate-pulse rounded bg-white/10" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-white/5" />
      </div>
    </div>
  );
}
