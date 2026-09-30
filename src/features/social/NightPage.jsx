import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, Heart, Link2, Loader2, PartyPopper, ThumbsDown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import ErrorBox from '@/components/ErrorBox';
import SwipeCard, { SwipePoster } from '@/components/SwipeCard';
import { useAuth } from '@/lib/AuthContext';
import { releaseYear, titlePath } from '@/lib/tmdb';
import { tmdbImage } from '@/lib/tmdb-images';
import { useCountry, useMovies } from '@/features/movies/hooks';
import { nightShareUrl, shareLink, useNames, useNight, useStartNight, useVote } from '@/features/social/hooks';

/** A movie night: lobby, then everyone votes, with live results and matches. */
export default function NightPage() {
  const { nightId } = useParams();
  const { user } = useAuth();
  const country = useCountry();
  const { night, members, candidates, votes } = useNight(nightId);
  const start = useStartNight(nightId);
  const vote = useVote(nightId);
  const [tab, setTab] = useState('vote');
  const [exit, setExit] = useState(0);

  const memberIds = (members.data ?? []).map((m) => m.user_id);
  const names = useNames(memberIds);
  const nameOf = (id) => (id === user?.id ? 'You' : names.data?.get(id)?.display_name || 'Someone');
  const media = night.data?.media_type ?? 'movie';
  const pool = candidates.data ?? [];
  const details = useMovies(pool.map((c) => c.tmdb_id), country, media);

  if (night.isPending) return <Shell><div className="h-40 animate-pulse rounded-2xl bg-white/5" /></Shell>;
  if (night.isError) return <Shell><ErrorBox message={night.error.message} onRetry={() => night.refetch()} /></Shell>;
  if (!night.data) {
    return (
      <Shell>
        <p className="text-slate-300">This movie night doesn't exist or you haven't joined it.</p>
      </Shell>
    );
  }

  const n = night.data;
  const isHost = n.host_id === user?.id;
  const ended = Date.parse(n.expires_at) <= Date.now();
  const allVotes = votes.data ?? [];
  const mine = new Map(allVotes.filter((v) => v.user_id === user?.id).map((v) => [v.tmdb_id, v.vote]));
  const toVote = pool.filter((c) => !mine.has(c.tmdb_id)).map((c) => ({ ...c, d: details.data?.get(c.tmdb_id) })).filter((c) => c.d);
  const current = toVote[0];

  // Results: yes / no per title; a match is a yes from everyone in the night.
  const results = pool
    .map((c) => {
      const vs = allVotes.filter((v) => v.tmdb_id === c.tmdb_id);
      const yes = vs.filter((v) => v.vote).length;
      return { ...c, d: details.data?.get(c.tmdb_id), yes, no: vs.length - yes, yesBy: vs.filter((v) => v.vote).map((v) => v.user_id) };
    })
    .filter((r) => r.d);
  const matches = results.filter((r) => memberIds.length > 1 && r.yes === memberIds.length);
  const ranked = [...results].filter((r) => r.yes > 0).sort((a, b) => b.yes - a.yes || a.no - b.no);
  const doneVoting = n.status === 'voting' && pool.length > 0 && mine.size >= pool.length;
  const view = ended || doneVoting ? 'results' : tab;

  const cast = (c, yes) => {
    setExit(yes ? 1 : -1);
    vote.mutate(
      { tmdb_id: c.tmdb_id, media_type: c.media_type, vote: yes },
      { onError: (error) => toast({ variant: 'destructive', title: "Couldn't save your vote", description: error.message }) }
    );
  };

  const invite = async () => {
    try {
      if ((await shareLink(await nightShareUrl(nightId), n.name)) === 'copied') toast({ title: 'Invite link copied', description: 'Send it to the people you’re watching with.' });
    } catch (error) {
      toast({ variant: 'destructive', title: "Couldn't create the invite link", description: error.message });
    }
  };

  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">{n.name}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {media === 'tv' ? 'Series' : 'Movies'} · {ended ? 'ended' : `ends ${timeLeft(n.expires_at)}`}
          </p>
        </div>
        {!ended && <Button variant="outline" onClick={invite} className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"><Link2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> Invite</Button>}
      </div>

      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-300">
        <Users className="h-4 w-4 text-slate-500" aria-hidden="true" />
        {memberIds.map((id) => nameOf(id)).join(', ')}
      </p>

      {n.status === 'lobby' && !ended && (
        <div className="mt-6 rounded-2xl border border-white/5 bg-white/[0.03] p-6 text-center">
          <p className="text-slate-200">
            {memberIds.length === 1 ? 'Invite the people you’re watching with.' : `${memberIds.length} people here.`}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {isHost
              ? 'When everyone has joined, start: we’ll pick titles from everyone’s watchlists and tastes that you can watch on your services.'
              : `Waiting for ${nameOf(n.host_id)} to start.`}
          </p>
          {isHost && (
            <Button
              className="mt-4"
              disabled={start.isPending}
              onClick={() => start.mutate(undefined, { onError: (error) => toast({ variant: 'destructive', title: "Couldn't start", description: error.message }) })}
            >
              {start.isPending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> Picking titles…</> : 'Start picking'}
            </Button>
          )}
        </div>
      )}

      {n.status === 'voting' && (
        <>
          {matches.length > 0 && (
            <div className="mt-6 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-4" role="status">
              <p className="flex items-center gap-2 font-semibold text-emerald-200">
                <PartyPopper className="h-5 w-5" aria-hidden="true" /> It's a match{matches.length > 1 ? ` ×${matches.length}` : ''}!
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {matches.map((m) => (
                  <li key={m.tmdb_id}>
                    <Link to={titlePath({ id: m.tmdb_id, media_type: m.media_type })} className="text-sm font-medium text-white underline-offset-2 hover:underline">
                      {m.d.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!ended && !doneVoting && (
            <div className="mt-6 flex w-fit gap-1 rounded-xl border border-white/10 bg-white/5 p-1" role="tablist">
              {[['vote', `Vote (${toVote.length} left)`], ['results', 'Results']].map(([value, label]) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={cn('rounded-lg px-4 py-1.5 text-sm font-medium', tab === value ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-100')}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {view === 'vote' && (
            <div className="mx-auto mt-5 w-full max-w-sm">
              {candidates.isPending || details.isPending ? (
                <div className="mx-auto aspect-[2/3] h-[min(46svh,34rem)] animate-pulse rounded-3xl bg-white/5" />
              ) : current ? (
                <>
                  <div className="relative mx-auto aspect-[2/3] h-[min(46svh,34rem)] max-w-full">
                    {toVote[1] && <SwipePoster title={toVote[1].d} caption={false} className="absolute inset-0 scale-95 opacity-50" />}
                    <AnimatePresence custom={exit}>
                      <SwipeCard
                        key={current.tmdb_id}
                        title={current.d}
                        note={current.why}
                        rightLabel="Yes"
                        leftLabel="No"
                        onSwipe={(dir) => cast(current, dir === 'right')}
                      />
                    </AnimatePresence>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3" role="group" aria-label={`Vote on ${current.d.title}`}>
                    <button type="button" onClick={() => cast(current, false)} className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-3 font-semibold text-rose-300 hover:border-rose-400/50">
                      <ThumbsDown className="h-5 w-5" aria-hidden="true" /> No
                    </button>
                    <button type="button" onClick={() => cast(current, true)} className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-3 font-semibold text-emerald-300 hover:border-emerald-400/50">
                      <Heart className="h-5 w-5" aria-hidden="true" /> Yes
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {view === 'results' && (
            <div className="mt-6">
              {doneVoting && !ended && <p className="mb-3 text-sm text-slate-400">You've voted on everything. Results update as others vote.</p>}
              {ranked.length === 0 ? (
                <p className="rounded-2xl border border-white/5 bg-white/[0.03] px-6 py-10 text-center text-sm text-slate-400">No yes votes yet.</p>
              ) : (
                <ol className="space-y-2">
                  {ranked.map((r) => (
                    <li key={r.tmdb_id}>
                      <Link to={titlePath({ id: r.tmdb_id, media_type: r.media_type })} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-2 hover:border-white/15">
                        {r.d.poster_path ? <img src={tmdbImage(r.d.poster_path, 'w92')} alt="" loading="lazy" className="h-16 w-11 shrink-0 rounded object-cover" /> : <span className="h-16 w-11 shrink-0 rounded bg-white/5" />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-slate-100">{r.d.title} <span className="text-slate-500">{releaseYear(r.d.release_date)}</span></span>
                          <span className="block truncate text-xs text-slate-400">Yes: {r.yesBy.map(nameOf).join(', ')}</span>
                          {r.why && <span className="block truncate text-xs text-slate-500">{r.why}</span>}
                        </span>
                        <span className={cn('shrink-0 rounded-lg px-2 py-1 text-sm font-semibold', r.yes === memberIds.length && memberIds.length > 1 ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/5 text-slate-300')}>
                          {r.yes}/{memberIds.length}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </>
      )}

      {n.status === 'lobby' && ended && <p className="mt-6 text-sm text-slate-400">This movie night ended before it started.</p>}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <Link to="/together" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-100">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Together
      </Link>
      {children}
    </div>
  );
}

/** "in 5 h" / "in 20 min" */
function timeLeft(iso) {
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60000);
  return minutes >= 90 ? `in ${Math.round(minutes / 60)} h` : `in ${Math.max(1, minutes)} min`;
}
