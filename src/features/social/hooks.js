import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { invokeFunction } from '@/lib/edge-functions';

/**
 * Refetch `queryKeys` whenever rows change in the given tables (Supabase Realtime;
 * RLS decides which changes this user receives).
 *
 * @param {string} channel unique name, e.g. `list:<id>`
 * @param {{ table: string, filter?: string }[]} tables
 * @param {unknown[][]} queryKeys
 */
export function useLiveRefresh(channel, tables, queryKeys) {
  const queryClient = useQueryClient();
  const key = JSON.stringify([channel, tables, queryKeys]);
  useEffect(() => {
    if (!channel) return undefined;
    let sub = supabase.channel(channel);
    for (const { table, filter } of tables) {
      sub = sub.on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, () =>
        queryKeys.forEach((k) => queryClient.invalidateQueries({ queryKey: k }))
      );
    }
    sub.subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [key]); // `key` captures channel, tables and queryKeys
}

/** Display names for user ids (only people you share a list or night with are visible). */
export function useNames(ids) {
  const sorted = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ['names', sorted],
    enabled: sorted.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', sorted);
      if (error) throw error;
      return new Map(data.map((p) => [p.id, p]));
    },
  });
}

/** An invite link to share, using the Web Share sheet on phones when there is one. */
export async function shareLink(url, title) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}

// ---------- shared lists ----------

const LIST_COLUMNS = 'id, owner_id, name, description, invite_role, created_at';

/** Lists the user belongs to, with their role and item count. */
export function useLists() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['lists', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lists')
        .select(`${LIST_COLUMNS}, list_members!inner(role), list_items(count)`)
        .eq('list_members.user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data.map((l) => ({ ...l, role: l.list_members[0]?.role, count: l.list_items[0]?.count ?? 0 }));
    },
  });
}

export function useCreateList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, description }) => {
      const { data, error } = await supabase.from('lists').insert({ name, description: description || null }).select(LIST_COLUMNS).single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lists'] }),
  });
}

/** One list with its members and items, kept live. */
export function useList(id) {
  const { user } = useAuth();
  const list = useQuery({
    queryKey: ['list', id],
    enabled: !!id && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('lists').select(LIST_COLUMNS).eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const members = useQuery({
    queryKey: ['list-members', id],
    enabled: !!id && !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('list_members').select('user_id, role, joined_at').eq('list_id', id).order('joined_at');
      if (error) throw error;
      return data;
    },
  });
  const items = useQuery({
    queryKey: ['list-items', id],
    enabled: !!id && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('list_items')
        .select('id, tmdb_id, media_type, added_by, added_at')
        .eq('list_id', id)
        .order('added_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  useLiveRefresh(
    id ? `list:${id}` : null,
    [{ table: 'list_items', filter: `list_id=eq.${id}` }, { table: 'list_members', filter: `list_id=eq.${id}` }],
    [['list-items', id], ['list-members', id], ['lists']]
  );
  const role = members.data?.find((m) => m.user_id === user?.id)?.role ?? null;
  return { list, members, items, role };
}

/** Changes to a list; each refreshes the list afterwards (Realtime also covers other people's changes). */
export function useListActions(id) {
  const queryClient = useQueryClient();
  const onSettled = () => {
    queryClient.invalidateQueries({ queryKey: ['list', id] });
    queryClient.invalidateQueries({ queryKey: ['list-items', id] });
    queryClient.invalidateQueries({ queryKey: ['list-members', id] });
    queryClient.invalidateQueries({ queryKey: ['lists'] });
  };
  const check = ({ error }) => {
    if (error) throw error;
  };

  const add = useMutation({
    mutationFn: ({ tmdb_id, media_type }) =>
      supabase
        .from('list_items')
        .upsert({ list_id: id, tmdb_id, media_type }, { onConflict: 'list_id,media_type,tmdb_id', ignoreDuplicates: true })
        .then(check),
    onSettled,
  });
  const removeItem = useMutation({
    mutationFn: (itemId) => supabase.from('list_items').delete().eq('id', itemId).then(check),
    onSettled,
  });
  const setRole = useMutation({
    mutationFn: ({ user_id, role }) => supabase.from('list_members').update({ role }).eq('list_id', id).eq('user_id', user_id).then(check),
    onSettled,
  });
  const removeMember = useMutation({
    mutationFn: (user_id) => supabase.from('list_members').delete().eq('list_id', id).eq('user_id', user_id).then(check),
    onSettled,
  });
  const update = useMutation({
    mutationFn: (fields) => supabase.from('lists').update(fields).eq('id', id).then(check),
    onSettled,
  });
  const deleteList = useMutation({
    mutationFn: () => supabase.from('lists').delete().eq('id', id).then(check),
    onSettled,
  });
  return { add, removeItem, setRole, removeMember, update, deleteList };
}

export async function listShareUrl(id) {
  const { data, error } = await supabase.rpc('list_share_token', { p_list: id });
  if (error) throw error;
  if (!data) throw new Error('Only the owner can share this list');
  return `${window.location.origin}/join/list/${data}`;
}

// ---------- movie nights ----------

const NIGHT_COLUMNS = 'id, host_id, name, media_type, list_id, status, expires_at, created_at';

export function useNights() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['nights', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movie_nights')
        .select(`${NIGHT_COLUMNS}, movie_night_members(count)`)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data.map((n) => ({ ...n, members: n.movie_night_members[0]?.count ?? 1 }));
    },
  });
}

export function useCreateNight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, media_type, list_id }) => {
      const { data, error } = await supabase
        .from('movie_nights')
        .insert({ name, media_type, list_id: list_id || null })
        .select(NIGHT_COLUMNS)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nights'] }),
  });
}

/** One night with members, candidates and votes, all kept live. */
export function useNight(id) {
  const { user } = useAuth();
  const enabled = !!id && !!user;
  const night = useQuery({
    queryKey: ['night', id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('movie_nights').select(NIGHT_COLUMNS).eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const members = useQuery({
    queryKey: ['night-members', id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('movie_night_members').select('user_id, joined_at').eq('movie_night_id', id).order('joined_at');
      if (error) throw error;
      return data;
    },
  });
  const candidates = useQuery({
    queryKey: ['night-candidates', id],
    enabled: enabled && night.data?.status === 'voting',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movie_night_candidates')
        .select('tmdb_id, media_type, position, why')
        .eq('movie_night_id', id)
        .order('position');
      if (error) throw error;
      return data;
    },
  });
  const votes = useQuery({
    queryKey: ['night-votes', id],
    enabled: enabled && night.data?.status === 'voting',
    queryFn: async () => {
      const { data, error } = await supabase.from('movie_night_votes').select('user_id, tmdb_id, vote').eq('movie_night_id', id);
      if (error) throw error;
      return data;
    },
  });
  useLiveRefresh(
    id ? `night:${id}` : null,
    [
      { table: 'movie_nights', filter: `id=eq.${id}` },
      { table: 'movie_night_members', filter: `movie_night_id=eq.${id}` },
      { table: 'movie_night_votes', filter: `movie_night_id=eq.${id}` },
    ],
    [['night', id], ['night-members', id], ['night-votes', id], ['night-candidates', id]]
  );
  return { night, members, candidates, votes };
}

export function useVote(nightId) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['night-votes', nightId];
  return useMutation({
    mutationFn: async ({ tmdb_id, media_type, vote }) => {
      const { error } = await supabase
        .from('movie_night_votes')
        .upsert({ movie_night_id: nightId, tmdb_id, media_type, vote }, { onConflict: 'movie_night_id,user_id,media_type,tmdb_id' });
      if (error) throw error;
    },
    onMutate: ({ tmdb_id, vote }) => {
      queryClient.setQueryData(key, (list = []) => [
        ...list.filter((v) => !(v.user_id === user.id && v.tmdb_id === tmdb_id)),
        { user_id: user.id, tmdb_id, vote },
      ]);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useStartNight(nightId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invokeFunction('movie-night', { op: 'start', night_id: nightId }, "Couldn't start the movie night."),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['night', nightId] });
      queryClient.invalidateQueries({ queryKey: ['night-candidates', nightId] });
    },
  });
}

export async function nightShareUrl(id) {
  const { data, error } = await supabase.rpc('night_share_token', { p_night: id });
  if (error) throw error;
  return `${window.location.origin}/join/night/${data}`;
}

/** Join a list or night by share token; resolves to its id. */
export async function joinByToken(kind, token) {
  const { data, error } = await supabase.rpc(kind === 'list' ? 'join_list' : 'join_movie_night', { p_token: token });
  if (error) throw new Error(error.message);
  return data;
}
