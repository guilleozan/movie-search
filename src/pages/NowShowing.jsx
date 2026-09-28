import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clapperboard, CalendarClock, RefreshCw, Film } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import MovieCard from '@/components/MovieCard';

export default function NowShowing() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedIds, setSavedIds] = useState(new Set());
  const [watchlist, setWatchlist] = useState([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('getNowShowing', {});
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    base44.entities.WatchlistItem.list('-created_date', 200).then((items) => {
      setWatchlist(items);
      setSavedIds(new Set(items.map((i) => i.title + '|' + i.year)));
    }).catch(() => {});
    load();
  }, []);

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

  const inTheaters = data?.in_theaters || [];
  const upcoming = data?.upcoming || [];

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
            <Clapperboard className="h-3.5 w-3.5" /> Now showing
          </div>
          <h1 className="mt-4 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            In cinemas & coming soon
          </h1>
          <p className="mt-2 text-slate-400 max-w-md">
            What's playing right now and what's headed to the big screen. Bookmark anything you want to catch.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:border-white/20 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24">
          <Film className="h-10 w-10 text-amber-400 animate-pulse" />
          <p className="mt-5 text-slate-300 font-medium">Checking the box office…</p>
        </div>
      )}

      {error && !loading && (
        <div className="text-center py-20">
          <p className="text-rose-300">{error}</p>
          <button onClick={load} className="mt-4 text-sm text-amber-300 hover:underline">Try again</button>
        </div>
      )}

      {data && !loading && (
        <>
          <Section icon={Clapperboard} title="In theaters now" subtitle={`${inTheaters.length} films currently playing`} movies={inTheaters} savedIds={savedIds} onToggleSave={toggleSave} start={0} />
          <div className="mt-12">
            <Section icon={CalendarClock} title="Coming soon" subtitle={`${upcoming.length} films arriving soon`} movies={upcoming} savedIds={savedIds} onToggleSave={toggleSave} start={inTheaters.length} />
          </div>
        </>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, subtitle, movies, savedIds, onToggleSave, start }) {
  if (!movies.length) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-amber-400" />
        <h2 className="font-display text-xl font-semibold text-white">{title}</h2>
        <span className="text-sm text-slate-500">· {subtitle}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {movies.map((m, i) => (
          <MovieCard
            key={m.title + i}
            movie={m}
            index={start + i}
            saved={savedIds.has(m.title + '|' + m.year)}
            onToggleSave={onToggleSave}
          />
        ))}
      </div>
    </motion.div>
  );
}