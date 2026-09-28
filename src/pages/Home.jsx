import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Film, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import Quiz from '@/components/Quiz';
import MovieCard from '@/components/MovieCard';

export default function Home() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedIds, setSavedIds] = useState(new Set());
  const [watchlist, setWatchlist] = useState([]);

  useEffect(() => {
    base44.entities.WatchlistItem.list('-created_date', 200).then((items) => {
      setWatchlist(items);
      setSavedIds(new Set(items.map((i) => i.title + '|' + i.year)));
    }).catch(() => {});
  }, []);

  const runQuiz = async (answers) => {
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const res = await base44.functions.invoke('getMovieRecommendations', answers);
      const movies = res.data?.movies || [];
      if (!movies.length) {
        setError('No picks came back — try adjusting your answers.');
      } else {
        setResults(movies);
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSave = async (movie) => {
    const key = movie.title + '|' + movie.year;
    if (savedIds.has(key)) {
      const existing = watchlist.find((i) => i.title + '|' + i.year === key);
      if (existing) {
        await base44.entities.WatchlistItem.delete(existing.id);
        setWatchlist((w) => w.filter((i) => i.id !== existing.id));
      }
      setSavedIds((s) => { const n = new Set(s); n.delete(key); return n; });
    } else {
      const created = await base44.entities.WatchlistItem.create({
        title: movie.title,
        year: movie.year,
        genre: movie.genre,
        director: movie.director,
        runtime: movie.runtime,
        rating: movie.rating,
        reason: movie.reason,
        tagline: movie.tagline,
        release_status: movie.release_status || 'Released',
        release_date: movie.release_date || '',
        status: 'unwatched',
      });
      setWatchlist((w) => [created, ...w]);
      setSavedIds((s) => new Set(s).add(key));
    }
  };

  const reset = () => {
    setResults(null);
    setError('');
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto">
      {!results && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
            <Sparkles className="h-3.5 w-3.5" /> AI taste quiz
          </div>
          <h1 className="mt-5 font-display text-4xl sm:text-5xl font-semibold tracking-tight text-white">
            Find your next favorite film
          </h1>
          <p className="mt-3 text-slate-400 max-w-md mx-auto">
            Answer a few questions about your taste and get a curated list of films picked just for you.
          </p>
        </motion.div>
      )}

      {!results && (
        <Quiz onComplete={runQuiz} loading={loading} />
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="relative">
            <Film className="h-10 w-10 text-amber-400 animate-pulse" />
          </div>
          <p className="mt-5 text-slate-300 font-medium">Curating your picks…</p>
          <p className="mt-1 text-sm text-slate-500">Searching world cinema for matches.</p>
        </div>
      )}

      {error && !loading && (
        <div className="text-center py-20">
          <p className="text-rose-300">{error}</p>
          <button onClick={reset} className="mt-4 text-sm text-amber-300 hover:underline">
            Try again
          </button>
        </div>
      )}

      {results && !loading && (
        <div>
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="font-display text-2xl font-semibold text-white">Your picks</h2>
              <p className="mt-1 text-sm text-slate-400">
                {results.length} films matched to your taste. Tap the bookmark to save.
              </p>
            </div>
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:border-white/20"
            >
              <RefreshCw className="h-3.5 w-3.5" /> New quiz
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((m, i) => (
              <MovieCard
                key={m.title + i}
                movie={m}
                index={i}
                saved={savedIds.has(m.title + '|' + m.year)}
                onToggleSave={toggleSave}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}