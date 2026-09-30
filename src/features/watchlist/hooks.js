import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { toast } from '@/components/ui/use-toast';

/**
 * @typedef {Object} WatchlistItem
 * @property {string} id
 * @property {number} tmdb_id
 * @property {'movie' | 'tv'} media_type
 * @property {'want_to_watch' | 'watched'} status
 * @property {number | null} rating 1-5
 * @property {'loved' | 'fine' | 'not_for_me' | null} reaction
 * @property {string | null} notes
 * @property {string} added_at
 * @property {string | null} watched_at
 * @property {string | null} watched_on where they watched it (a service name, 'Cinema', 'Other')
 */

export const REACTIONS = [
  { value: 'loved', label: 'Loved it' },
  { value: 'fine', label: 'It was fine' },
  { value: 'not_for_me', label: 'Not for me' },
];

const COLUMNS = 'id, tmdb_id, media_type, status, rating, reaction, notes, added_at, watched_at, watched_on';

function useWatchlistKey() {
  const { user } = useAuth();
  return ['watchlist', user?.id];
}

/** Every watchlist row for the signed-in user, newest first. */
export function useWatchlist() {
  const { user } = useAuth();
  const queryKey = useWatchlistKey();
  return useQuery({
    queryKey,
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watchlist_items')
        .select(COLUMNS)
        .order('added_at', { ascending: false });
      if (error) throw error;
      return /** @type {WatchlistItem[]} */ (data);
    },
  });
}

const same = (item, tmdbId, media) => item.tmdb_id === tmdbId && item.media_type === media;

/**
 * The row for one movie or series, or undefined when it isn't in the watchlist.
 * @param {number} tmdbId
 * @param {'movie' | 'tv'} [media]
 */
export function useWatchlistItem(tmdbId, media = 'movie') {
  const { data } = useWatchlist();
  return data?.find((item) => same(item, tmdbId, media));
}

/**
 * Shared optimistic-update plumbing: apply `update` to the cached list right away,
 * roll back and show a toast if the request fails, then refetch.
 */
function useOptimisticMutation(mutationFn, update, errorTitle) {
  const queryClient = useQueryClient();
  const queryKey = useWatchlistKey();
  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (items = []) => update(items, variables));
      return { previous };
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      toast({ variant: 'destructive', title: errorTitle, description: error.message });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}

/**
 * Add a title or change its row. Upsert on (user_id, media_type, tmdb_id), so a
 * double click never creates duplicates. Moving back to "want to watch" clears
 * rating and reaction.
 *
 * Variables: { tmdb_id, media_type?, status?, rating?, reaction?, notes?, watched_on? }
 */
export function useSaveWatchlistItem() {
  return useOptimisticMutation(
    async ({ tmdb_id, media_type = 'movie', ...fields }) => {
      const { data, error } = await supabase
        .from('watchlist_items')
        .upsert({ tmdb_id, media_type, ...normalise(fields) }, { onConflict: 'user_id,media_type,tmdb_id' })
        .select(COLUMNS)
        .single();
      if (error) throw error;
      return data;
    },
    (items, { tmdb_id, media_type = 'movie', ...fields }) => {
      const existing = items.find((i) => same(i, tmdb_id, media_type));
      const now = new Date().toISOString();
      const next = {
        id: existing?.id ?? `optimistic-${media_type}-${tmdb_id}`,
        status: 'want_to_watch',
        rating: null,
        reaction: null,
        notes: null,
        watched_on: null,
        added_at: now,
        watched_at: null,
        ...existing,
        tmdb_id,
        media_type,
        ...normalise(fields),
      };
      return existing ? items.map((i) => (same(i, tmdb_id, media_type) ? next : i)) : [next, ...items];
    },
    "Couldn't update your watchlist"
  );
}

/** Variables: { tmdb_id, media_type? } */
export function useRemoveWatchlistItem() {
  return useOptimisticMutation(
    async ({ tmdb_id, media_type = 'movie' }) => {
      const { error } = await supabase.from('watchlist_items').delete().eq('tmdb_id', tmdb_id).eq('media_type', media_type);
      if (error) throw error;
    },
    (items, { tmdb_id, media_type = 'movie' }) => items.filter((i) => !same(i, tmdb_id, media_type)),
    "Couldn't remove it from your watchlist"
  );
}

/**
 * Add many watched titles at once (viewing-history import). Existing rows become
 * "watched" and keep their rating and notes. Rows need identical keys, because a
 * bulk upsert fills missing columns with null.
 *
 * Variables: { rows: { tmdb_id, media_type, watched_on, watched_at }[] }
 */
export function useImportHistory() {
  const queryClient = useQueryClient();
  const queryKey = useWatchlistKey();
  return useMutation({
    mutationFn: async ({ rows }) => {
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100).map(({ tmdb_id, media_type, watched_on = null, watched_at = null }) => ({
          tmdb_id, media_type, status: 'watched', watched_on, watched_at,
        }));
        const { error } = await supabase.from('watchlist_items').upsert(chunk, { onConflict: 'user_id,media_type,tmdb_id' });
        if (error) throw error;
      }
      return rows.length;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.removeQueries({ queryKey: ['recommendations'] });
    },
  });
}

function normalise(fields) {
  if (fields.status === 'want_to_watch') return { ...fields, rating: null, reaction: null };
  return fields;
}
