import React from 'react';
import { Bookmark, BookmarkCheck, Eye, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mediaOf } from '@/lib/tmdb';
import { useRemoveWatchlistItem, useSaveWatchlistItem, useWatchlistItem } from '@/features/watchlist/hooks';

/** Bookmark toggle used on every movie card. Watched movies show an eye instead. */
export default function WatchlistButton({ movie, className }) {
  const media = mediaOf(movie);
  const item = useWatchlistItem(movie.id, media);
  const save = useSaveWatchlistItem();
  const remove = useRemoveWatchlistItem();

  const saved = !!item;
  const watched = item?.status === 'watched';
  const Icon = watched ? Eye : item?.status === 'watching' ? Play : saved ? BookmarkCheck : Bookmark;
  const label = saved ? `Remove ${movie.title} from watchlist` : `Add ${movie.title} to watchlist`;

  return (
    <button
      type="button"
      onClick={() => (saved ? remove.mutate({ tmdb_id: movie.id, media_type: media }) : save.mutate({ tmdb_id: movie.id, media_type: media }))}
      aria-label={label}
      aria-pressed={saved}
      title={watched ? 'Watched' : item?.status === 'watching' ? 'Watching' : saved ? 'In your watchlist' : 'Add to watchlist'}
      className={cn(
        'rounded-full p-2 backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
        saved ? 'bg-amber-400 text-slate-950 hover:bg-amber-300' : 'bg-slate-950/70 text-slate-200 hover:bg-slate-950 hover:text-white',
        className
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
