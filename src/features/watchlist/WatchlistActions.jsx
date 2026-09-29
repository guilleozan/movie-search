import React, { useState } from 'react';
import { Bookmark, BookmarkCheck, Eye, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { REACTIONS, useRemoveWatchlistItem, useSaveWatchlistItem, useWatchlistItem } from '@/features/watchlist/hooks';
import { RatingStars } from '@/features/watchlist/RatingInput';
import MarkWatchedDialog from '@/features/watchlist/MarkWatchedDialog';

const pill = 'inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors';

/** Watchlist controls for the movie detail page. */
export default function WatchlistActions({ movie }) {
  const item = useWatchlistItem(movie.id);
  const save = useSaveWatchlistItem();
  const remove = useRemoveWatchlistItem();
  const [dialogOpen, setDialogOpen] = useState(false);

  const saved = !!item;
  const watched = item?.status === 'watched';
  const reaction = REACTIONS.find((r) => r.value === item?.reaction)?.label;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        aria-pressed={saved}
        onClick={() => (saved ? remove.mutate({ tmdb_id: movie.id }) : save.mutate({ tmdb_id: movie.id }))}
        className={cn(
          pill,
          saved ? 'border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20' : 'border-white/10 bg-white/5 text-slate-200 hover:border-white/25'
        )}
      >
        {saved ? <BookmarkCheck className="h-4 w-4" aria-hidden="true" /> : <Bookmark className="h-4 w-4" aria-hidden="true" />}
        {saved ? 'In your watchlist' : 'Add to watchlist'}
      </button>

      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className={cn(pill, 'border-white/10 bg-white/5 text-slate-200 hover:border-white/25')}
      >
        {watched ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        {watched ? 'Edit your rating' : 'Mark as watched'}
      </button>

      {watched && (
        <span className="inline-flex items-center gap-2 text-sm text-slate-300">
          <span className="text-slate-500">Watched</span>
          <RatingStars value={item.rating} />
          {reaction && <span>· {reaction}</span>}
        </span>
      )}

      <MarkWatchedDialog movie={movie} item={item} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
