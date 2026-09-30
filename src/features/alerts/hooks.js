import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { invokeFunction } from '@/lib/edge-functions';

const CHECKED_KEY = 'cinematch.alertsCheckedAt';
const CHECK_EVERY = 6 * 60 * 60 * 1000;

/**
 * @typedef {{ id: string, kind: 'now_streaming' | 'in_cinemas' | 'new_episode', title: string, body: string,
 *   url: string, image_path: string | null, created_at: string, read_at: string | null }} Notification
 */

/** The latest 50 alerts, newest first. */
export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notifications', user?.id],
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, kind, title, body, url, image_path, created_at, read_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return /** @type {Notification[]} */ (data);
    },
  });
}

export function useUnreadCount() {
  const { data } = useNotifications();
  return (data ?? []).filter((n) => !n.read_at).length;
}

export function useMarkAllRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['notifications', user?.id];
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
      if (error) throw error;
    },
    onMutate: () => {
      const now = new Date().toISOString();
      queryClient.setQueryData(key, (list) => list?.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/**
 * Ask the `alerts` function to check this user when the app opens (at most every
 * 6 hours from this device; the server also limits it). The daily job covers
 * everyone else; this makes alerts show up without waiting for it.
 */
export function useAlertsCheck() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!user) return;
    let last = 0;
    try {
      last = Number(localStorage.getItem(`${CHECKED_KEY}:${user.id}`)) || 0;
    } catch {
      // storage unavailable: check anyway
    }
    if (Date.now() - last < CHECK_EVERY) return;
    invokeFunction('alerts', {})
      .then((result) => {
        try {
          localStorage.setItem(`${CHECKED_KEY}:${user.id}`, String(Date.now()));
        } catch {
          // ignore
        }
        if (result?.created) queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
      })
      .catch(() => {
        // Alerts are a nice-to-have; the daily job will catch up.
      });
  }, [user, queryClient]);
}
