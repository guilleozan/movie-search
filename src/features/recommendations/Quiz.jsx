import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ERAS, GENRES, MOODS } from '@/features/recommendations/quiz-options';
import FavoritePicker from '@/features/recommendations/FavoritePicker';

const steps = ['genres', 'mood', 'era', 'favorites'];

/**
 * The taste quiz. Used on Home for the first run and on the profile to edit answers.
 *
 * @param {{
 *   initialAnswers?: import('./hooks').QuizAnswers,
 *   onSubmit: (answers: import('./hooks').QuizAnswers) => void,
 *   submitting?: boolean,
 *   submitLabel?: string,
 * }} props
 */
export default function Quiz({ initialAnswers, onSubmit, submitting, submitLabel = 'Get my picks' }) {
  const [step, setStep] = useState(0);
  const [genres, setGenres] = useState(initialAnswers?.genres ?? []);
  const [mood, setMood] = useState(initialAnswers?.mood ?? '');
  const [era, setEra] = useState(initialAnswers?.era ?? '');
  const [favorites, setFavorites] = useState(initialAnswers?.favorites ?? []);

  const toggleGenre = (id) =>
    setGenres((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const current = steps[step];
  const canAdvance =
    (current === 'genres' && genres.length > 0) ||
    (current === 'mood' && !!mood) ||
    (current === 'era' && !!era) ||
    current === 'favorites';

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else onSubmit({ genres, mood, era, favorites });
  };
  const back = () => step > 0 && setStep(step - 1);

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-6 flex items-center gap-2" aria-hidden="true">
        {steps.map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i <= step ? 'bg-amber-400' : 'bg-white/10'
            )}
          />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">Step {step + 1} of {steps.length}</p>

      <div className="rounded-3xl border border-white/5 bg-white/[0.03] p-6 sm:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25 }}
          >
            {current === 'genres' && (
              <Step title="What genres pull you in?" hint="Pick all that speak to you.">
                <div className="flex flex-wrap gap-2">
                  {GENRES.map((g) => (
                    <Chip key={g.id} active={genres.includes(g.id)} onClick={() => toggleGenre(g.id)}>
                      {g.label}
                    </Chip>
                  ))}
                </div>
              </Step>
            )}
            {current === 'mood' && (
              <Step title="What mood are you after?" hint="Choose the feeling you want.">
                <OptionGroup label="Mood" options={MOODS} value={mood} onChange={setMood} />
              </Step>
            )}
            {current === 'era' && (
              <Step title="When should it be from?" hint="Any era preference?">
                <OptionGroup label="Era" options={ERAS} value={era} onChange={setEra} />
              </Step>
            )}
            {current === 'favorites' && (
              <Step title="Films you love" hint="Optional: add up to 5 favourites to sharpen the picks.">
                <FavoritePicker value={favorites} onChange={setFavorites} />
              </Step>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={back}
            disabled={step === 0}
            className="text-slate-400 hover:text-slate-100 hover:bg-white/5"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" /> Back
          </Button>
          <Button
            onClick={next}
            disabled={!canAdvance || submitting}
            className="bg-amber-400 text-slate-950 hover:bg-amber-300"
          >
            {step === steps.length - 1 ? (
              submitting ? 'Saving…' : (
                <>
                  {submitLabel} <ArrowRight className="h-4 w-4 ml-1.5" aria-hidden="true" />
                </>
              )
            ) : (
              <>
                Continue <ArrowRight className="h-4 w-4 ml-1.5" aria-hidden="true" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step({ title, hint, children }) {
  return (
    <div>
      <h2 className="font-display text-xl font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{hint}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
        active
          ? 'border-amber-400 bg-amber-400 text-slate-950'
          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
      )}
    >
      {active && <Check className="h-3.5 w-3.5 inline mr-1 -ml-0.5" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Single choice as a radio group: arrow keys move the selection. */
function OptionGroup({ label, options, value, onChange }) {
  const index = options.findIndex((o) => o.id === value);
  const onKeyDown = (e) => {
    const delta = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const nextIndex = (Math.max(index, 0) + delta + options.length) % options.length;
    onChange(options[nextIndex].id);
    e.currentTarget.querySelectorAll('[role="radio"]')[nextIndex]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="flex flex-col gap-2">
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
              'flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
              active
                ? 'border-amber-400 bg-amber-400/10 text-amber-200'
                : 'border-white/10 bg-white/5 text-slate-200 hover:border-white/20'
            )}
          >
            {o.label}
            <span
              aria-hidden="true"
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-full border',
                active ? 'border-amber-400 bg-amber-400' : 'border-white/30'
              )}
            >
              {active && <Check className="h-3 w-3 text-slate-950" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
