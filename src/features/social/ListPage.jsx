import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Link2, Loader2, LogOut, Plus, Popcorn, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import ErrorBox from '@/components/ErrorBox';
import MovieCard, { MovieCardSkeleton } from '@/components/MovieCard';
import { useAuth } from '@/lib/AuthContext';
import { mediaOf, releaseYear } from '@/lib/tmdb';
import { tmdbImage } from '@/lib/tmdb-images';
import { useCountry, useMovies } from '@/features/movies/hooks';
import { useSearchResults } from '@/features/movies/SearchResults';
import { listShareUrl, shareLink, useCreateNight, useList, useListActions, useNames } from '@/features/social/hooks';

const ROLES = { owner: 'Owner', editor: 'Can add', viewer: 'Can view' };

/** A shared list: its titles (with who added them), members and invite link. */
export default function ListPage() {
  const { listId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const country = useCountry();
  const { list, members, items, role } = useList(listId);
  const actions = useListActions(listId);
  const createNight = useCreateNight();
  const names = useNames([...(members.data ?? []).map((m) => m.user_id), ...(items.data ?? []).map((i) => i.added_by)]);
  const nameOf = (id) => (id === user?.id ? 'you' : names.data?.get(id)?.display_name || 'someone');

  const all = items.data ?? [];
  const movies = useMovies(all.filter((i) => i.media_type === 'movie').map((i) => i.tmdb_id), country);
  const series = useMovies(all.filter((i) => i.media_type === 'tv').map((i) => i.tmdb_id), country, 'tv');
  const detailsFor = (i) => (i.media_type === 'tv' ? series.data : movies.data)?.get(i.tmdb_id);
  const canEdit = role === 'owner' || role === 'editor';

  const fail = (title) => (error) => toast({ variant: 'destructive', title, description: error.message });

  const share = async () => {
    try {
      const result = await shareLink(await listShareUrl(listId), list.data?.name);
      if (result === 'copied') toast({ title: 'Invite link copied', description: `People who open it join as "${ROLES[list.data.invite_role]}".` });
    } catch (error) {
      fail("Couldn't create the invite link")(error);
    }
  };

  const startNight = () =>
    createNight.mutate(
      { name: list.data.name, media_type: 'movie', list_id: listId },
      { onSuccess: (night) => navigate(`/nights/${night.id}`), onError: fail("Couldn't create the movie night") }
    );

  if (list.isPending || members.isPending) return <div className="mx-auto max-w-5xl px-5 py-14"><div className="h-40 animate-pulse rounded-2xl bg-white/5" /></div>;
  if (list.isError) return <div className="mx-auto max-w-5xl px-5 py-14"><ErrorBox message={list.error.message} onRetry={() => list.refetch()} /></div>;
  if (!list.data) {
    return (
      <div className="px-5 py-24 text-center">
        <p className="text-slate-300">This list doesn't exist or you're not a member.</p>
        <Link to="/together" className="mt-4 inline-block text-sm text-amber-300 hover:underline">Back to Together</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <Link to="/together" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-100">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Together
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">{list.data.name}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {all.length} title{all.length === 1 ? '' : 's'} · {members.data.length} member{members.data.length === 1 ? '' : 's'} · you {role === 'owner' ? 'own it' : ROLES[role]?.toLowerCase()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={startNight} disabled={createNight.isPending} className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/10">
            <Popcorn className="mr-1.5 h-4 w-4" aria-hidden="true" /> Movie night from this list
          </Button>
          {role === 'owner' && (
            <Button onClick={share}><Link2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> Invite</Button>
          )}
        </div>
      </div>

      <Members
        members={members.data}
        role={role}
        userId={user?.id}
        inviteRole={list.data.invite_role}
        nameOf={nameOf}
        onRole={(user_id, newRole) => actions.setRole.mutate({ user_id, role: newRole }, { onError: fail("Couldn't change the role") })}
        onRemove={(user_id) => actions.removeMember.mutate(user_id, { onError: fail("Couldn't remove them") })}
        onInviteRole={(invite_role) => actions.update.mutate({ invite_role }, { onError: fail("Couldn't save that") })}
        onLeave={() => actions.removeMember.mutate(user.id, { onSuccess: () => navigate('/together'), onError: fail("Couldn't leave the list") })}
        onDelete={() => {
          if (window.confirm(`Delete "${list.data.name}" for everyone?`)) {
            actions.deleteList.mutate(undefined, { onSuccess: () => navigate('/together'), onError: fail("Couldn't delete the list") });
          }
        }}
      />

      {canEdit && <AddTitle onAdd={(t) => actions.add.mutate({ tmdb_id: t.id, media_type: mediaOf(t) }, { onError: fail("Couldn't add it") })} />}

      {items.isError && <div className="mt-6"><ErrorBox message={items.error.message} onRetry={() => items.refetch()} /></div>}
      {items.isSuccess && all.length === 0 && (
        <p className="mt-8 rounded-2xl border border-white/5 bg-white/[0.03] px-6 py-10 text-center text-sm text-slate-400">
          Nothing here yet. {canEdit ? 'Search above to add films and series.' : 'Members who can add will fill it up.'}
        </p>
      )}
      {all.length > 0 && (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {all.map((i, index) => {
            const d = detailsFor(i);
            return (
              <li key={i.id}>
                {d ? (
                  <MovieCard movie={{ ...d, media_type: i.media_type }} index={index}>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                      <span className="truncate">Added by {nameOf(i.added_by)}</span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => actions.removeItem.mutate(i.id, { onError: fail("Couldn't remove it") })}
                          aria-label={`Remove ${d.title} from the list`}
                          className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-white/5 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </MovieCard>
                ) : (
                  <MovieCardSkeleton />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Members({ members, role, userId, inviteRole, nameOf, onRole, onRemove, onInviteRole, onLeave, onDelete }) {
  const owner = role === 'owner';
  return (
    <details className="group mt-6 rounded-2xl border border-white/5 bg-white/[0.03] p-4" open={owner}>
      <summary className="cursor-pointer list-none text-sm font-medium text-slate-200">
        Members ({members.length}) <span className="text-slate-500 group-open:hidden">· show</span>
      </summary>
      <ul className="mt-3 space-y-2">
        {members.map((m) => (
          <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-100">{m.user_id === userId ? 'You' : nameOf(m.user_id)}</span>
            {owner && m.role !== 'owner' ? (
              <span className="flex items-center gap-2">
                <select
                  value={m.role}
                  onChange={(e) => onRole(m.user_id, e.target.value)}
                  aria-label={`Role for ${nameOf(m.user_id)}`}
                  className="h-8 rounded-md border border-white/10 bg-slate-900 px-2 text-xs text-slate-200"
                >
                  <option value="editor">{ROLES.editor}</option>
                  <option value="viewer">{ROLES.viewer}</option>
                </select>
                <button type="button" onClick={() => onRemove(m.user_id)} aria-label={`Remove ${nameOf(m.user_id)}`} className="rounded-md p-1 text-slate-500 hover:text-rose-300">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </span>
            ) : (
              <span className="text-xs text-slate-500">{ROLES[m.role]}</span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3 text-sm">
        {owner ? (
          <>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              People who join with the link
              <select value={inviteRole} onChange={(e) => onInviteRole(e.target.value)} className="h-8 rounded-md border border-white/10 bg-slate-900 px-2 text-xs text-slate-200">
                <option value="editor">{ROLES.editor}</option>
                <option value="viewer">{ROLES.viewer}</option>
              </select>
            </label>
            <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 text-xs text-rose-300 hover:underline">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete list
            </button>
          </>
        ) : (
          <button type="button" onClick={onLeave} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-100">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Leave list
          </button>
        )}
      </div>
    </details>
  );
}

function AddTitle({ onAdd }) {
  const [query, setQuery] = useState('');
  const search = useSearchResults(query);
  return (
    <div className="mt-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add a film or series"
          aria-label="Search a film or series to add"
          className="h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        />
        {search.isFetching && search.active && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" aria-label="Searching" />}
      </div>
      {search.results.length > 0 && (
        <ul className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-slate-950 py-1" aria-label="Search results">
          {search.results.map((m) => (
            <li key={`${mediaOf(m)}:${m.id}`}>
              <button
                type="button"
                onClick={() => {
                  onAdd(m);
                  setQuery('');
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5"
              >
                {m.poster_path ? <img src={tmdbImage(m.poster_path, 'w92')} alt="" className="h-12 w-8 shrink-0 rounded object-cover" /> : <span className="h-12 w-8 shrink-0 rounded bg-white/5" />}
                <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                  {m.title} <span className="text-slate-500">{releaseYear(m.release_date)}{mediaOf(m) === 'tv' ? ' · series' : ''}</span>
                </span>
                <Plus className="h-4 w-4 text-slate-400" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
