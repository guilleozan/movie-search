import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { toast } from '@/components/ui/use-toast';

/**
 * @typedef {Object} WatchlistItem
 * @property {string} id
 * @property {number} tmdb_id
 * @property {'want_to_watch' | 'watched'} status
 * @property {number | null} rating 1-5
 * @property {'loved' | 'fine' | 'not_for_me' | null} reaction
 * @property {string | null} notes
 * @property {string} added_at
 * @property {string | null} watched_at
 */

export const REACTIONS = [
  { value: 'loved', label: 'Loved it' },
  { value: 'fine', label: 'It was fine' },
  { value: 'not_for_me', label: 'Not for me' },
];

const COLUMNS = 'id, tmdb_id, status, rating, reaction, notes, added_at, watched_at';

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

/** The row for one movie, or undefined when it isn't in the watchlist. */
export function useWatchlistItem(tmdbId) {
  const { data } = useWatchlist();
  return data?.find((item) => item.tmdb_id === tmdbId);
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
 * Add a movie or change its row. Upsert on (user_id, tmdb_id), so a double click
 * never creates duplicates. Moving back to "want to watch" clears rating and reaction.
 *
 * Variables: { tmdb_id, status?, rating?, reaction?, notes? }
 */
export function useSaveWatchlistItem() {
  return useOptimisticMutation(
    async ({ tmdb_id, ...fields }) => {
      const { data, error } = await supabase
        .from('watchlist_items')
        .upsert({ tmdb_id, ...normalise(fields) }, { onConflict: 'user_id,tmdb_id' })
        .select(COLUMNS)
        .single();
      if (error) throw error;
      return data;
    },
    (items, { tmdb_id, ...fields }) => {
      const existing = items.find((i) => i.tmdb_id === tmdb_id);
      const now = new Date().toISOString();
      const next = {
        id: existing?.id ?? `optimistic-${tmdb_id}`,
        status: 'want_to_watch',
        rating: null,
        reaction: null,
        notes: null,
        added_at: now,
        watched_at: null,
        ...existing,
        tmdb_id,
        ...normalise(fields),
      };
      return existing ? items.map((i) => (i.tmdb_id === tmdb_id ? next : i)) : [next, ...items];
    },
    "Couldn't update your watchlist"
  );
}

/** Variables: { tmdb_id } */
export function useRemoveWatchlistItem() {
  return useOptimisticMutation(
    async ({ tmdb_id }) => {
      const { error } = await supabase.from('watchlist_items').delete().eq('tmdb_id', tmdb_id);
      if (error) throw error;
    },
    (items, { tmdb_id }) => items.filter((i) => i.tmdb_id !== tmdb_id),
    "Couldn't remove it from your watchlist"
  );
}

function normalise(fields) {
  if (fields.status === 'want_to_watch') return { ...fields, rating: null, reaction: null };
  return fields;
}
