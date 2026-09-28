import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const GENRES = [
  'Drama', 'Thriller', 'Sci-Fi', 'Comedy', 'Romance', 'Horror',
  'Action', 'Crime', 'Fantasy', 'Animation', 'Documentary', 'Mystery',
];
const MOODS = [
  { id: 'cozy', label: 'Cozy & comforting' },
  { id: 'thrilling', label: 'Edge-of-seat thrilling' },
  { id: 'thoughtful', label: 'Slow & thought-provoking' },
  { id: 'funny', label: 'Laugh-out-loud funny' },
  { id: 'dark', label: 'Dark & unsettling' },
  { id: 'uplifting', label: 'Warm & uplifting' },
];
const ERAS = [
  { id: 'classic', label: 'Classics (pre-1980)' },
  { id: '8090', label: '80s & 90s' },
  { id: '2000s', label: '2000s' },
  { id: 'recent', label: 'Recent (last 10 years)' },
  { id: 'mixed', label: 'Mix it up' },
];
const COUNTS = [5, 8, 10];

const steps = ['genres', 'mood', 'era', 'favorites', 'count'];

export default function Quiz({ onComplete, loading }) {
  const [step, setStep] = useState(0);
  const [genres, setGenres] = useState([]);
  const [mood, setMood] = useState('');
  const [era, setEra] = useState('');
  const [favorites, setFavorites] = useState('');
  const [count, setCount] = useState(8);

  const toggleGenre = (g) =>
    setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  const current = steps[step];
  const canAdvance =
    (current === 'genres' && genres.length > 0) ||
    (current === 'mood' && !!mood) ||
    (current === 'era' && !!era) ||
    current === 'favorites' ||
    current === 'count';

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else onComplete({ genres, mood, era, favorites, count });
  };
  const back = () => step > 0 && setStep(step - 1);

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-6 flex items-center gap-2">
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
                    <Chip key={g} active={genres.includes(g)} onClick={() => toggleGenre(g)}>
                      {g}
                    </Chip>
                  ))}
                </div>
              </Step>
            )}
            {current === 'mood' && (
              <Step title="What mood are you after?" hint="Choose the feeling you want.">
                <div className="flex flex-col gap-2">
                  {MOODS.map((m) => (
                    <OptionRow key={m.id} active={mood === m.id} onClick={() => setMood(m.id)}>
                      {m.label}
                    </OptionRow>
                  ))}
                </div>
              </Step>
            )}
            {current === 'era' && (
              <Step title="When should it be from?" hint="Any era preference?">
                <div className="flex flex-col gap-2">
                  {ERAS.map((e) => (
                    <OptionRow key={e.id} active={era === e.id} onClick={() => setEra(e.id)}>
                      {e.label}
                    </OptionRow>
                  ))}
                </div>
              </Step>
            )}
            {current === 'favorites' && (
              <Step title="Films you love" hint="Optional — name a few favorites to sharpen the picks.">
                <Input
                  value={favorites}
                  onChange={(e) => setFavorites(e.target.value)}
                  placeholder="e.g. Blade Runner 2049, Parasite, Lady Bird"
                  className="border-white/10 bg-white/5 text-slate-100 placeholder:text-slate-500"
                />
              </Step>
            )}
            {current === 'count' && (
              <Step title="How many picks?" hint="We'll curate a list for you.">
                <div className="flex gap-3">
                  {COUNTS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCount(c)}
                      className={cn(
                        'flex-1 rounded-xl border py-4 text-lg font-semibold transition-colors',
                        count === c
                          ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
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
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
          </Button>
          <Button
            onClick={next}
            disabled={!canAdvance || loading}
            className="bg-amber-400 text-slate-950 hover:bg-amber-300"
          >
            {step === steps.length - 1 ? (
              loading ? 'Curating…' : (
                <>
                  Get my picks <ArrowRight className="h-4 w-4 ml-1.5" />
                </>
              )
            ) : (
              <>
                Continue <ArrowRight className="h-4 w-4 ml-1.5" />
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
      onClick={onClick}
      className={cn(
        'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-amber-400 bg-amber-400 text-slate-950'
          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
      )}
    >
      {active && <Check className="h-3.5 w-3.5 inline mr-1 -ml-0.5" />}
      {children}
    </button>
  );
}

function OptionRow({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-colors text-left',
        active
          ? 'border-amber-400 bg-amber-400/10 text-amber-200'
          : 'border-white/10 bg-white/5 text-slate-200 hover:border-white/20'
      )}
    >
      {children}
      <span
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded-full border',
          active ? 'border-amber-400 bg-amber-400' : 'border-white/30'
        )}
      >
        {active && <Check className="h-3 w-3 text-slate-950" />}
      </span>
    </button>
  );
}