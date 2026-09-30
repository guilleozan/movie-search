import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ListPlus, Popcorn, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import ErrorBox from '@/components/ErrorBox';
import { useCreateList, useCreateNight, useLists, useNights } from '@/features/social/hooks';

const inputClass =
  'h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400';

/** Movie nights and shared lists: everything done with other people. */
export default function TogetherPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Together</h1>
      <p className="mt-1 text-sm text-slate-400">Pick something to watch with friends, or keep lists you share.</p>
      <Nights />
      <Lists />
    </div>
  );
}

function Nights() {
  const nights = useNights();
  const lists = useLists();
  const create = useCreateNight();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [media, setMedia] = useState('movie');
  const [listId, setListId] = useState('');

  const submit = (e) => {
    e.preventDefault();
    create.mutate(
      { name: name.trim() || 'Movie night', media_type: media, list_id: listId },
      {
        onSuccess: (night) => navigate(`/nights/${night.id}`),
        onError: (error) => toast({ variant: 'destructive', title: "Couldn't create the movie night", description: error.message }),
      }
    );
  };

  const now = Date.now();
  const active = (nights.data ?? []).filter((n) => Date.parse(n.expires_at) > now);
  const ended = (nights.data ?? []).filter((n) => Date.parse(n.expires_at) <= now);

  return (
    <section aria-labelledby="nights" className="mt-8">
      <h2 id="nights" className="flex items-center gap-2 font-display text-xl font-semibold text-white">
        <Popcorn className="h-5 w-5 text-amber-300" aria-hidden="true" /> Movie night
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Invite friends, everyone swipes yes or no on titles you can all watch, and you see the matches live. Lasts 24 hours.
      </p>

      <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Friday night" className={inputClass} />
        </label>
        <div className="flex flex-col gap-1 text-xs text-slate-400" role="group" aria-label="Movies or series">
          Watching
          <div className="flex h-10 gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
            {[['movie', 'Movies'], ['tv', 'Series']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={media === value}
                onClick={() => setMedia(value)}
                className={cn('rounded-md px-3 text-sm font-medium', media === value ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-100')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Include a list
          <select value={listId} onChange={(e) => setListId(e.target.value)} className={cn(inputClass, 'bg-slate-900 px-2')}>
            <option value="">None</option>
            {(lists.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <Button type="submit" disabled={create.isPending} className="h-10">{create.isPending ? 'Creating…' : 'Start a movie night'}</Button>
      </form>

      {nights.isError && <div className="mt-4"><ErrorBox message={nights.error.message} onRetry={() => nights.refetch()} /></div>}
      {active.length > 0 && <NightList nights={active} />}
      {ended.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-slate-400 hover:text-slate-200">Past movie nights ({ended.length})</summary>
          <NightList nights={ended} ended />
        </details>
      )}
    </section>
  );
}

function NightList({ nights, ended }) {
  return (
    <ul className="mt-3 space-y-2">
      {nights.map((n) => (
        <li key={n.id}>
          <Link to={`/nights/${n.id}`} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 hover:border-white/15">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-100">{n.name}</span>
              <span className="block text-xs text-slate-500">
                {n.media_type === 'tv' ? 'Series' : 'Movies'} · {n.members} {n.members === 1 ? 'person' : 'people'} ·{' '}
                {ended ? 'ended' : n.status === 'voting' ? 'voting now' : 'waiting to start'}
              </span>
            </span>
            <Users className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Lists() {
  const lists = useLists();
  const create = useCreateList();
  const navigate = useNavigate();
  const [name, setName] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim() },
      {
        onSuccess: (list) => navigate(`/lists/${list.id}`),
        onError: (error) => toast({ variant: 'destructive', title: "Couldn't create the list", description: error.message }),
      }
    );
  };

  return (
    <section aria-labelledby="shared-lists" className="mt-12">
      <h2 id="shared-lists" className="flex items-center gap-2 font-display text-xl font-semibold text-white">
        <ListPlus className="h-5 w-5 text-amber-300" aria-hidden="true" /> Shared lists
      </h2>
      <p className="mt-1 text-sm text-slate-400">"Date night", "Horror October"… Invite people with a link and see who added what.</p>
      <form onSubmit={submit} className="mt-4 flex gap-2">
        <label htmlFor="new-list" className="sr-only">New list name</label>
        <input id="new-list" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="New list name" className={inputClass} />
        <Button type="submit" disabled={!name.trim() || create.isPending} className="h-10 shrink-0">Create</Button>
      </form>

      {lists.isPending && <div className="mt-4 h-16 animate-pulse rounded-xl bg-white/5" />}
      {lists.isError && <div className="mt-4"><ErrorBox message={lists.error.message} onRetry={() => lists.refetch()} /></div>}
      {lists.isSuccess && lists.data.length === 0 && <p className="mt-4 text-sm text-slate-500">No lists yet.</p>}
      {lists.data?.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {lists.data.map((l) => (
            <li key={l.id}>
              <Link to={`/lists/${l.id}`} className="block rounded-xl border border-white/5 bg-white/[0.03] p-3 hover:border-white/15">
                <span className="block truncate font-medium text-slate-100">{l.name}</span>
                <span className="block text-xs text-slate-500">
                  {l.count} title{l.count === 1 ? '' : 's'} · {l.role === 'owner' ? 'yours' : l.role}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
