import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, Trash2, Check, Star, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';

const FILTERS = ['all', 'unwatched', 'watched'];

export default function Watchlist() {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    base44.entities.WatchlistItem.list('-created_date', 200)
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  const toggleStatus = async (item) => {
    const next = item.status === 'watched' ? 'unwatched' : 'watched';
    const updated = await base44.entities.WatchlistItem.update(item.id, { status: next });
    setItems((list) => list.map((i) => (i.id === item.id ? updated : i)));
  };

  const remove = async (item) => {
    await base44.entities.WatchlistItem.delete(item.id);
    setItems((list) => list.filter((i) => i.id !== item.id));
  };

  const visible = (items || []).filter((i) =>
    filter === 'all' ? true : i.status === filter
  );
  const counts = {
    all: (items || []).length,
    watched: (items || []).filter((i) => i.status === 'watched').length,
    unwatched: (items || []).filter((i) => i.status === 'unwatched').length,
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Watchlist</h1>
          <p className="mt-1 text-sm text-slate-400">Films you've saved to come back to.</p>
        </div>
        {items && items.length > 0 && (
          <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                  filter === f ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-100'
                )}
              >
                {f} ({counts[f]})
              </button>
            ))}
          </div>
        )}
      </div>

      {items === null && (
        <div className="flex justify-center py-24">
          <div className="w-7 h-7 border-2 border-white/20 border-t-amber-400 rounded-full animate-spin" />
        </div>
      )}

      {items && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-slate-500">
            <Bookmark className="h-7 w-7" />
          </span>
          <p className="mt-4 text-slate-300 font-medium">Your watchlist is empty</p>
          <p className="mt-1 text-sm text-slate-500 max-w-xs">
            Take the quiz on Discover and bookmark the films that catch your eye.
          </p>
        </div>
      )}

      {items && items.length > 0 && visible.length === 0 && (
        <p className="text-center py-20 text-sm text-slate-500">Nothing here in this filter.</p>
      )}

      {items && visible.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {visible.map((item, i) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.3) }}
                className={cn(
                  'flex flex-col rounded-2xl border p-5',
                  item.status === 'watched'
                    ? 'border-amber-400/30 bg-amber-400/[0.04]'
                    : 'border-white/5 bg-white/[0.03]'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-semibold leading-tight text-white">
                      {item.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      {item.release_status && item.release_status !== 'Released' && (
                        <span
                          className={cn(
                            'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                            item.release_status === 'In theaters'
                              ? 'bg-amber-400/20 text-amber-300'
                              : 'bg-sky-400/20 text-sky-300'
                          )}
                        >
                          {item.release_status}
                        </span>
                      )}
                      {item.year && <span>{item.year}</span>}
                      {item.genre && <span className="text-slate-500">·</span>}
                      {item.genre && <span>{item.genre}</span>}
                      {item.runtime && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {item.runtime}
                        </span>
                      )}
                      {item.rating && item.rating !== 'N/A' && (
                        <span className="inline-flex items-center gap-1 text-amber-300">
                          <Star className="h-3 w-3 fill-amber-300" /> {item.rating}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => remove(item)}
                    aria-label="Remove from watchlist"
                    className="shrink-0 rounded-full p-2 text-slate-500 hover:bg-white/5 hover:text-rose-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {item.tagline && (
                  <p className="mt-3 text-sm italic text-slate-300/80">“{item.tagline}”</p>
                )}
                {item.reason && (
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">{item.reason}</p>
                )}

                <button
                  onClick={() => toggleStatus(item)}
                  className={cn(
                    'mt-4 inline-flex items-center gap-1.5 self-start rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    item.status === 'watched'
                      ? 'bg-amber-400 text-slate-950'
                      : 'border border-white/10 bg-white/5 text-slate-200 hover:border-white/20'
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                  {item.status === 'watched' ? 'Watched' : 'Mark as watched'}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}