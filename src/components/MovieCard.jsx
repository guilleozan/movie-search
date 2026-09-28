import React from 'react';
import { motion } from 'framer-motion';
import { Bookmark, BookmarkCheck, Star, Clock, Film } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MovieCard({ movie, index = 0, saved, onToggleSave }) {
  const accent = pickAccent(movie.genre);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.4) }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 transition-colors hover:border-white/15"
    >
      <div
        className="absolute inset-x-0 top-0 h-1 opacity-80"
        style={{ background: accent.bar }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
            <span
              className="inline-flex h-2 w-2 rounded-full"
              style={{ background: accent.dot }}
            />
            {movie.genre || 'Film'}
          </div>
          <h3 className="mt-1.5 font-display text-lg font-semibold leading-tight text-white">
            {movie.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            {movie.release_status && movie.release_status !== 'Released' && (
              <span
                className={cn(
                  'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  movie.release_status === 'In theaters'
                    ? 'bg-amber-400/20 text-amber-300'
                    : 'bg-sky-400/20 text-sky-300'
                )}
              >
                {movie.release_status}
              </span>
            )}
            {movie.year && <span>{movie.year}</span>}
            {movie.runtime && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {movie.runtime}
              </span>
            )}
            {movie.rating && movie.rating !== 'N/A' && (
              <span className="inline-flex items-center gap-1 text-amber-300">
                <Star className="h-3 w-3 fill-amber-300" /> {movie.rating}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => onToggleSave(movie)}
          aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'}
          className={cn(
            'shrink-0 rounded-full p-2 transition-colors',
            saved
              ? 'bg-amber-400 text-slate-950'
              : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
          )}
        >
          {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </button>
      </div>

      {movie.tagline && (
        <p className="mt-3 text-sm italic text-slate-300/80">“{movie.tagline}”</p>
      )}
      {movie.director && (
        <p className="mt-2 text-xs text-slate-500">Dir. {movie.director}</p>
      )}
      <p className="mt-3 text-sm leading-relaxed text-slate-300">{movie.reason}</p>
    </motion.div>
  );
}

const accents = [
  { dot: '#f59e0b', bar: 'linear-gradient(90deg,#f59e0b,#fbbf24)' },
  { dot: '#38bdf8', bar: 'linear-gradient(90deg,#38bdf8,#0ea5e9)' },
  { dot: '#a78bfa', bar: 'linear-gradient(90deg,#a78bfa,#8b5cf6)' },
  { dot: '#f472b6', bar: 'linear-gradient(90deg,#f472b6,#ec4899)' },
  { dot: '#34d399', bar: 'linear-gradient(90deg,#34d399,#10b981)' },
  { dot: '#fb7185', bar: 'linear-gradient(90deg,#fb7185,#f43f5e)' },
];

function pickAccent(genre = '') {
  const g = genre.toLowerCase();
  const map = {
    horror: 5, thriller: 5, crime: 0, drama: 0, romance: 3,
    comedy: 4, animation: 4, 'sci-fi': 1, 'science fiction': 1, fantasy: 2,
    action: 1, adventure: 1, documentary: 4, mystery: 2,
  };
  for (const key of Object.keys(map)) {
    if (g.includes(key)) return accents[map[key]];
  }
  return accents[(genre.length || 0) % accents.length];
}