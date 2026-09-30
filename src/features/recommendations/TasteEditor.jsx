import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Chip } from '@/features/recommendations/Quiz';
import FavoritePicker from '@/features/recommendations/FavoritePicker';
import { ERAS, GENRES, MOODS } from '@/features/recommendations/quiz-options';
import { useSaveQuizAnswers } from '@/features/recommendations/hooks';

/**
 * Every quiz answer on one screen, for changing taste after the first run.
 * Saving clears cached picks, so Discover refreshes straight away.
 *
 * @param {{ initialAnswers: import('./hooks').QuizAnswers, onSaved?: () => void, onCancel?: () => void }} props
 */
export default function TasteEditor({ initialAnswers, onSaved, onCancel }) {
  const save = useSaveQuizAnswers();
  const [genres, setGenres] = useState(initialAnswers.genres ?? []);
  const [mood, setMood] = useState(initialAnswers.mood ?? '');
  const [era, setEra] = useState(initialAnswers.era ?? '');
  const [favorites, setFavorites] = useState(initialAnswers.favorites ?? []);

  const answers = { genres, mood, era, favorites };
  const changed = JSON.stringify(answers) !== JSON.stringify({
    genres: initialAnswers.genres ?? [],
    mood: initialAnswers.mood ?? '',
    era: initialAnswers.era ?? '',
    favorites: initialAnswers.favorites ?? [],
  });
  const valid = genres.length > 0 && !!mood && !!era;

  const toggleGenre = (id) => setGenres((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = (e) => {
    e.preventDefault();
    save.mutate(answers, {
      onSuccess: () => {
        toast({ title: 'Taste updated', description: 'Your picks are being refreshed.' });
        onSaved?.();
      },
      onError: (error) => toast({ variant: 'destructive', title: "Couldn't save your taste", description: error.message }),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset>
        <legend className="text-sm font-medium text-slate-200">Genres</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <Chip key={g.id} active={genres.includes(g.id)} onClick={() => toggleGenre(g.id)}>{g.label}</Chip>
          ))}
        </div>
        {genres.length === 0 && <p className="mt-2 text-xs text-amber-200">Pick at least one genre.</p>}
      </fieldset>

      <ChoiceChips label="Mood" options={MOODS} value={mood} onChange={setMood} />
      <ChoiceChips label="Era" options={ERAS} value={era} onChange={setEra} />

      <fieldset>
        <legend className="text-sm font-medium text-slate-200">
          Favourite films <span className="font-normal text-slate-500">(optional)</span>
        </legend>
        <div className="mt-2">
          <FavoritePicker value={favorites} onChange={setFavorites} />
        </div>
      </fieldset>

      <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-4">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="text-slate-400 hover:bg-white/5 hover:text-slate-100">
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={!changed || !valid || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save and refresh picks'}
        </Button>
      </div>
    </form>
  );
}

/** Single choice as compact chips (a radio group; arrow keys move the selection). */
function ChoiceChips({ label, options, value, onChange }) {
  const index = options.findIndex((o) => o.id === value);
  const onKeyDown = (e) => {
    const delta = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = (Math.max(index, 0) + delta + options.length) % options.length;
    onChange(options[next].id);
    e.currentTarget.querySelectorAll('[role="radio"]')[next]?.focus();
  };
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-200">{label}</legend>
      <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="mt-2 flex flex-wrap gap-2">
        {options.map((o, i) => {
          const active = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active || (index === -1 && i === 0) ? 0 : -1}
              onClick={() => onChange(o.id)}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
                active ? 'border-amber-400 bg-amber-400/15 font-medium text-amber-200' : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
