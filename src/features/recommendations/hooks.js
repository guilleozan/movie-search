import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { invokeFunction, retryServerErrors } from '@/lib/edge-functions';

/**
 * @typedef {Object} QuizAnswers
 * @property {number[]} genres TMDB genre ids
 * @property {string} mood
 * @property {string} era
 * @property {number[]} favorites TMDB movie ids
 */

/**
 * @typedef {Object} RecommendationSet
 * @property {string} id
 * @property {string} context
 * @property {number | null} seed
 * @property {(import('@/lib/tmdb').MovieSummary & { reason: string })[]} items
 * @property {'llm' | 'fallback'} ranked_by
 * @property {string} generated_at
 * @property {boolean} cached
 */

/** The user's saved quiz answers, or null before they've taken the quiz. */
export function useQuizAnswers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['quiz', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('quiz_answers').select('answers, updated_at').maybeSingle();
      if (error) throw error;
      return /** @type {{ answers: QuizAnswers, updated_at: string } | null} */ (data);
    },
  });
}

/** Save quiz answers. New answers make the next recommendations skip the cache. */
export function useSaveQuizAnswers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    /** @param {QuizAnswers} answers */
    mutationFn: async (answers) => {
      const { data, error } = await supabase
        .from('quiz_answers')
        .upsert({ answers }, { onConflict: 'user_id' })
        .select('answers, updated_at')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['quiz', user?.id], data);
      queryClient.removeQueries({ queryKey: ['recommendations', user?.id] });
    },
  });
}

const recommendationsKey = (userId, context, seed) => ['recommendations', userId, seed ? `seed:${seed}` : context];

/**
 * Personal picks from the `recommend` Edge Function (cached server side for a few hours).
 *
 * @param {{ context: string, seed: number | null, enabled?: boolean }} opts
 */
export function useRecommendations({ context, seed, enabled = true }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: recommendationsKey(user?.id, context, seed),
    enabled: !!user && enabled,
    staleTime: 30 * 60 * 1000,
    retry: retryServerErrors,
    queryFn: () => fetchRecommendations({ context, seed }),
  });
}

/** Ask for a fresh set, bypassing the server cache. */
export function useRefreshRecommendations({ context, seed }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchRecommendations({ context, seed, refresh: true }),
    onSuccess: (data) => queryClient.setQueryData(recommendationsKey(user?.id, context, seed), data),
  });
}

/** @returns {Promise<RecommendationSet>} */
function fetchRecommendations({ context, seed, refresh = false }) {
  return invokeFunction(
    'recommend',
    { context, ...(seed ? { seed } : {}), ...(refresh ? { refresh } : {}) },
    "We couldn't put your picks together right now."
  );
}

/**
 * "Not interested": hide a movie from every recommendation list right away and
 * remember it server side. `undo(tmdbId, previous)` puts it back; `previous` is
 * the mutation context (third argument of the per-call onSuccess).
 */
export function useDismissMovie() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['recommendations', user?.id];
  const restore = (previous) => previous.forEach(([k, data]) => queryClient.setQueryData(k, data));

  const dismiss = useMutation({
    mutationFn: async (tmdbId) => {
      const { error } = await supabase.from('dismissed_movies').upsert({ tmdb_id: tmdbId }, { onConflict: 'user_id,tmdb_id' });
      if (error) throw error;
    },
    onMutate: async (tmdbId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueriesData({ queryKey: key });
      queryClient.setQueriesData({ queryKey: key }, (set) =>
        set ? { ...set, items: set.items.filter((m) => m.id !== tmdbId) } : set
      );
      return { previous };
    },
    onError: (_error, _tmdbId, context) => context && restore(context.previous),
  });

  const undo = async (tmdbId, { previous }) => {
    restore(previous);
    const { error } = await supabase.from('dismissed_movies').delete().eq('tmdb_id', tmdbId);
    if (error) throw error;
  };

  return { dismiss, undo };
}
