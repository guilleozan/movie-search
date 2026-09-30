import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { EyeOff, History, Layers, Loader2, RefreshCw, SlidersHorizontal, Sparkles, Wand2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import MovieCard, { MovieCardSkeleton } from '@/components/MovieCard';
import ErrorBox from '@/components/ErrorBox';
import { useCountry, useMovie } from '@/features/movies/hooks';
import Quiz from '@/features/recommendations/Quiz';
import { CONTEXTS, ERAS, GENRES, MOODS, SERIES_CONTEXTS } from '@/features/recommendations/quiz-options';
import TasteEditor from '@/features/recommendations/TasteEditor';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  useDismissMovie, useQuizAnswers, useRecommendations, useRefreshRecommendations, useSaveQuizAnswers,
} from '@/features/recommendations/hooks';

export default function Home() {
  const quiz = useQuizAnswers();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      {quiz.isPending && <PicksSkeleton />}
      {quiz.isError && <ErrorBox message="Couldn't load your taste profile." onRetry={() => quiz.refetch()} />}
      {quiz.isSuccess && (quiz.data ? <Picks answers={quiz.data.answers} /> : <FirstQuiz />)}
    </div>
  );
}

function FirstQuiz() {
  const save = useSaveQuizAnswers();
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-10 text-center"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> AI taste quiz
        </div>
        <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Find your next favorite film
        </h1>
        <p className="mx-auto mt-3 max-w-md text-slate-400">
          Answer a few questions about your taste and get a curated list of films picked just for you.
        </p>
      </motion.div>
      <Quiz
        submitting={save.isPending}
        onSubmit={(answers) =>
          save.mutate(answers, {
            onError: (error) => toast({ variant: 'destructive', title: "Couldn't save your answers", description: error.message }),
          })
        }
      />
    </>
  );
}

function Picks({ answers }) {
  const [editingTaste, setEditingTaste] = useState(false);
  const [params, setParams] = useSearchParams();
  const seedParam = Number(params.get('seed'));
  const seed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : null;
  const media = params.get('media') === 'tv' ? 'tv' : 'movie';
  // Series have no cinema or "short" occasions.
  const contexts = media === 'tv' ? CONTEXTS.filter((c) => SERIES_CONTEXTS.has(c.id)) : CONTEXTS;
  const context = contexts.some((c) => c.id === params.get('context')) ? params.get('context') : 'home';
  const noun = media === 'tv' ? 'series' : 'films';

  const country = useCountry();
  const seedMovie = useMovie(seed ?? 0, country, media);
  const recs = useRecommendations({ media, context, seed });
  const refresh = useRefreshRecommendations({ media, context, seed });
  const { dismiss, undo } = useDismissMovie();

  const items = recs.data?.items ?? [];

  // URL params keep the view on refresh and back/forward: media, context, seed.
  const withMedia = (next) => (media === 'tv' ? { media: 'tv', ...next } : next);
  const setContext = (id) => setParams(withMedia(id === 'home' ? {} : { context: id }));
  const setMedia = (next) => setParams(next === 'tv' ? { media: 'tv' } : {});
  const moreLike = (movie) => {
    setParams(withMedia({ seed: String(movie.id) }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const notInterested = (movie) =>
    dismiss.mutate({ id: movie.id, media }, {
      onSuccess: (_data, _id, dismissed) =>
        toast({
          title: `Hidden ${movie.title}`,
          description: "We won't recommend it again.",
          action: (
            <ToastAction altText="Undo" onClick={() => undo({ id: movie.id, media }, dismissed).catch((error) =>
              toast({ variant: 'destructive', title: "Couldn't undo", description: error.message }))}
            >
              Undo
            </ToastAction>
          ),
        }),
      onError: (error) => toast({ variant: 'destructive', title: "Couldn't hide that title", description: error.message }),
    });
  const onRefresh = () =>
    refresh.mutate(undefined, {
      onError: (error) => toast({ variant: 'destructive', title: "Couldn't refresh your picks", description: error.message }),
    });

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Picked for you
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white">Your picks</h1>
          <p className="mt-1 text-sm text-slate-400">
            {items.length > 0
              ? `${items.length} ${noun} matched to your taste. Tap the bookmark to save.`
              : `${noun === 'films' ? 'Films' : 'Series'} matched to your taste, from real movie data.`}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            <span className="text-slate-400">Your taste:</span> {tasteSummary(answers)}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link to="/swipe" className="inline-flex items-center gap-1 text-amber-300 hover:underline">
              <Layers className="h-3.5 w-3.5" aria-hidden="true" /> Quick rate (2 min)
            </Link>
            <Link to="/seen" className="inline-flex items-center gap-1 text-amber-300 hover:underline">
              <History className="h-3.5 w-3.5" aria-hidden="true" /> Add what you've watched
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditingTaste(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-white/20"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> Adjust taste
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refresh.isPending || recs.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition-colors hover:border-white/20 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refresh.isPending && 'animate-spin')} aria-hidden="true" />
            {refresh.isPending ? 'Refreshing…' : 'New picks'}
          </button>
        </div>
      </div>

      <div className="mb-4 flex w-fit gap-1 rounded-xl border border-white/10 bg-white/5 p-1" role="group" aria-label="Movies or series">
        {[['movie', 'Movies'], ['tv', 'Series']].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={media === value}
            onClick={() => setMedia(value)}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              media === value ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-100'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {seed ? (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
          <p className="min-w-0 text-sm text-amber-100">
            <Wand2 className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden="true" />
            More like <span className="font-semibold">{seedMovie.data?.title ?? '…'}</span>
          </p>
          <button
            type="button"
            onClick={() => setParams(withMedia({}))}
            className="inline-flex shrink-0 items-center gap-1 text-sm text-amber-200 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" /> Back to all picks
          </button>
        </div>
      ) : (
        <div className="-mx-5 mb-6 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="What's the occasion?">
          {contexts.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={context === c.id}
              onClick={() => setContext(c.id)}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
                context === c.id
                  ? 'border-amber-400 bg-amber-400 font-medium text-slate-950'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {recs.isPending && (
        <div aria-busy="true">
          <p className="mb-4 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Curating your picks…
          </p>
          <Grid>{Array.from({ length: 8 }, (_, i) => <MovieCardSkeleton key={i} />)}</Grid>
        </div>
      )}

      {recs.isError && <ErrorBox message={recs.error.message} onRetry={() => recs.refetch()} />}

      {recs.isSuccess && items.length === 0 && (
        <p className="rounded-2xl border border-white/5 bg-white/[0.03] px-6 py-12 text-center text-sm text-slate-400">
          No new picks here right now. Try another occasion, or{' '}
          <button type="button" onClick={() => setEditingTaste(true)} className="text-amber-300 hover:underline">adjust your taste</button>.
        </p>
      )}

      {items.length > 0 && (
        <Grid>
          {items.map((movie, i) => (
            <MovieCard key={`${media}:${movie.id}`} movie={movie} index={i}>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => moreLike(movie)}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/20"
                >
                  <Wand2 className="h-3.5 w-3.5" aria-hidden="true" /> More like this
                </button>
                <button
                  type="button"
                  onClick={() => notInterested(movie)}
                  aria-label={`Not interested in ${movie.title}`}
                  title="Not interested"
                  className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-slate-400 transition-colors hover:border-white/20 hover:text-slate-100"
                >
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </MovieCard>
          ))}
        </Grid>
      )}

      <Sheet open={editingTaste} onOpenChange={setEditingTaste}>
        <SheetContent className="w-full overflow-y-auto border-white/10 bg-slate-950 text-slate-100 sm:max-w-lg">
          <SheetHeader className="mb-6 pr-6 text-left">
            <SheetTitle className="text-white">Adjust your taste</SheetTitle>
            <SheetDescription>Change anything, then save to get fresh picks.</SheetDescription>
          </SheetHeader>
          {/* Remounted on open so it starts from the saved answers. */}
          {editingTaste && (
            <TasteEditor initialAnswers={answers} onSaved={() => setEditingTaste(false)} onCancel={() => setEditingTaste(false)} />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** "Drama, Thriller · Edge-of-seat thrilling · Mix it up" */
function tasteSummary(answers) {
  const label = (list, id) => list.find((x) => x.id === id)?.label;
  return [
    answers.genres.map((id) => label(GENRES, id)).filter(Boolean).join(', '),
    label(MOODS, answers.mood),
    label(ERAS, answers.era),
  ].filter(Boolean).join(' · ');
}

function Grid({ children }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

function PicksSkeleton() {
  return (
    <div aria-busy="true">
      <div className="mb-6 h-20 w-64 animate-pulse rounded-xl bg-white/5" />
      <Grid>{Array.from({ length: 8 }, (_, i) => <MovieCardSkeleton key={i} />)}</Grid>
    </div>
  );
}
