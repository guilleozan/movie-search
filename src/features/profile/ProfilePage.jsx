import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import ErrorBox from '@/components/ErrorBox';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useProfile } from '@/hooks/use-profile';
import { countryName } from '@/lib/tmdb';
import { useCountry, useMovies } from '@/features/movies/hooks';
import Quiz from '@/features/recommendations/Quiz';
import { ERAS, GENRES, MOODS } from '@/features/recommendations/quiz-options';
import { useQuizAnswers, useSaveQuizAnswers } from '@/features/recommendations/hooks';

// Countries where TMDB has watch-provider data, which is what the country drives.
const COUNTRIES = [
  'AR', 'AT', 'AU', 'BE', 'BR', 'CA', 'CH', 'CL', 'CO', 'CZ', 'DE', 'DK', 'ES', 'FI', 'FR', 'GB', 'HK', 'IE', 'IN',
  'IT', 'JP', 'KR', 'MX', 'NL', 'NO', 'NZ', 'PH', 'PL', 'PT', 'SE', 'SG', 'TW', 'US', 'ZA',
]
  .map((code) => ({ code, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name));

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const profile = useProfile();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Profile</h1>
      <p className="mt-1 truncate text-sm text-slate-400">{user?.email}</p>

      <div className="mt-8 space-y-6">
        {profile.isPending && <div className="h-48 animate-pulse rounded-2xl bg-white/5" />}
        {profile.isError && <ErrorBox message="Couldn't load your profile." onRetry={() => profile.refetch()} />}
        {profile.isSuccess && <DetailsForm profile={profile.data} />}

        <TasteSection />

        <Button
          variant="ghost"
          onClick={handleSignOut}
          className="text-slate-400 hover:bg-white/5 hover:text-slate-100"
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sign out
        </Button>
      </div>
    </div>
  );
}

function DetailsForm({ profile }) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [country, setCountry] = useState(profile.country_code);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() || null, country_code: country })
        .eq('id', profile.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['profile', profile.id], data);
      // Country changes what's in cinemas and where to watch.
      if (data.country_code !== profile.country_code) {
        queryClient.removeQueries({ queryKey: ['recommendations'] });
        queryClient.invalidateQueries({ queryKey: ['tmdb'] });
      }
      toast({ title: 'Profile saved' });
    },
    onError: (error) => toast({ variant: 'destructive', title: "Couldn't save your profile", description: error.message }),
  });

  const dirty = (displayName.trim() || null) !== (profile.display_name ?? null) || country !== profile.country_code;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 sm:p-6"
    >
      <h2 className="font-display text-lg font-semibold text-white">Your details</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-200">
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
            className="h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-normal text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-200">
          Country
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="h-10 rounded-lg border border-white/10 bg-slate-900 px-2 text-sm font-normal text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            {!COUNTRIES.some((c) => c.code === country) && <option value={country}>{countryName(country)}</option>}
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <span className="text-xs font-normal text-slate-500">Used for what's in cinemas, release dates and where to watch.</span>
        </label>
      </div>
      <div className="mt-5 flex justify-end">
        <Button type="submit" disabled={!dirty || save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  );
}

function TasteSection() {
  const quiz = useQuizAnswers();
  const save = useSaveQuizAnswers();
  const [editing, setEditing] = useState(false);
  const answers = quiz.data?.answers;

  // Open the quiz straight away when there are no answers yet.
  useEffect(() => {
    if (quiz.isSuccess && !quiz.data) setEditing(true);
  }, [quiz.isSuccess, quiz.data]);

  const onSubmit = (next) =>
    save.mutate(next, {
      onSuccess: () => {
        setEditing(false);
        toast({ title: 'Taste saved', description: 'Your picks will reflect it next time you open Discover.' });
      },
      onError: (error) => toast({ variant: 'destructive', title: "Couldn't save your answers", description: error.message }),
    });

  return (
    <section id="taste" aria-labelledby="taste-heading" className="scroll-mt-20 rounded-2xl border border-white/5 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="taste-heading" className="font-display text-lg font-semibold text-white">Your taste</h2>
        {answers && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 hover:border-white/20"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-400">Recommendations also learn from your ratings and watchlist.</p>

      {quiz.isPending && <div className="mt-4 h-24 animate-pulse rounded-xl bg-white/5" />}
      {quiz.isError && <div className="mt-4"><ErrorBox message="Couldn't load your answers." onRetry={() => quiz.refetch()} /></div>}

      {quiz.isSuccess && editing && (
        <div className="mt-6">
          <Quiz initialAnswers={answers} onSubmit={onSubmit} submitting={save.isPending} submitLabel="Save taste" />
          {answers && (
            <div className="mt-3 text-center">
              <button type="button" onClick={() => setEditing(false)} className="text-sm text-slate-400 hover:text-slate-100">
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {quiz.isSuccess && answers && !editing && <TasteSummary answers={answers} />}
    </section>
  );
}

function TasteSummary({ answers }) {
  const country = useCountry();
  const favorites = useMovies(answers.favorites ?? [], country);
  const label = (list, id) => list.find((x) => x.id === id)?.label;
  const rows = [
    ['Genres', answers.genres.map((id) => label(GENRES, id)).filter(Boolean).join(', ')],
    ['Mood', label(MOODS, answers.mood)],
    ['Era', label(ERAS, answers.era)],
    ['Favourites', (answers.favorites ?? []).map((id) => favorites.data?.get(id)?.title).filter(Boolean).join(', ') || (answers.favorites?.length ? '…' : 'None yet')],
  ];
  return (
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
      {rows.map(([term, value]) => (
        <React.Fragment key={term}>
          <dt className="text-slate-500">{term}</dt>
          <dd className="-mt-2 text-slate-200 sm:mt-0">{value || '—'}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
