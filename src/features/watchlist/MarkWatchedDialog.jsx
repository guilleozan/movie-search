import React, { useEffect, useState } from 'react';
import { Heart, Meh, ThumbsDown } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { REACTIONS, useSaveWatchlistItem } from '@/features/watchlist/hooks';
import { RatingInput } from '@/features/watchlist/RatingInput';

const REACTION_ICONS = { loved: Heart, fine: Meh, not_for_me: ThumbsDown };

/**
 * Mark a movie as watched with an optional rating, reaction and notes. When the
 * movie is already watched this edits those, and can move it back to "want to watch".
 *
 * @param {{ movie: { id: number, title: string }, item?: import('./hooks').WatchlistItem, open: boolean, onOpenChange: (open: boolean) => void }} props
 */
export default function MarkWatchedDialog({ movie, item, open, onOpenChange }) {
  const save = useSaveWatchlistItem();
  const [rating, setRating] = useState(null);
  const [reaction, setReaction] = useState(null);
  const [notes, setNotes] = useState('');
  const editing = item?.status === 'watched';

  // Start from the saved values each time the dialog opens.
  useEffect(() => {
    if (open) {
      setRating(item?.rating ?? null);
      setReaction(item?.reaction ?? null);
      setNotes(item?.notes ?? '');
    }
  }, [open, item]);

  const submit = (e) => {
    e.preventDefault();
    save.mutate({ tmdb_id: movie.id, status: 'watched', rating, reaction, notes: notes.trim() || null });
    onOpenChange(false);
  };

  const moveBack = () => {
    save.mutate({ tmdb_id: movie.id, status: 'want_to_watch' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-slate-950">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle className="text-white">{editing ? 'Your take' : 'Mark as watched'}</DialogTitle>
            <DialogDescription>
              {movie.title}. Rating and reaction are optional; they help us recommend better films.
            </DialogDescription>
          </DialogHeader>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-200">Rating</legend>
            <RatingInput value={rating} onChange={setRating} />
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-200">Quick reaction</legend>
            <div className="flex flex-wrap gap-2">
              {REACTIONS.map(({ value, label }) => {
                const Icon = REACTION_ICONS[value];
                const active = reaction === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setReaction(active ? null : value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                      active ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="watch-notes" className="mb-2 block text-sm font-medium text-slate-200">
              Notes <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              id="watch-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Anything you want to remember"
              className="w-full rounded-lg border border-input bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              <Button type="button" variant="ghost" onClick={moveBack} className="text-slate-400 hover:text-slate-100">
                Move back to Want to watch
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit">{editing ? 'Save' : 'Mark as watched'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
