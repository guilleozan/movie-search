import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useProfile } from '@/hooks/use-profile';
import { invokeFunction, retryServerErrors } from '@/lib/edge-functions';

/**
 * @typedef {{ label: string, city: string | null, country_code: string | null, lat: number, lng: number }} Place
 * @typedef {{ provider: string, id: string, name: string, address: string | null, lat: number, lng: number, distance_km: number | null, url: string | null }} Cinema
 * @typedef {{ label: string, url: string, kind: 'search' | 'cinema' }} ShowtimeLink
 * @typedef {{ cinema_id: string, cinema_name: string, starts_at: string, format: string | null, booking_url: string | null }} Showtime
 */

const DAY = 24 * 60 * 60 * 1000;

function callShowtimes(op, params = {}) {
  return invokeFunction('showtimes', { op, params }, 'Cinema data is unavailable right now');
}

/** Town/city search. Submit-based on purpose: OpenStreetMap forbids autocomplete. */
export function usePlaceSearch() {
  return useMutation({
    /** @param {{ query: string, country?: string }} vars @returns {Promise<Place[]>} */
    mutationFn: (vars) => callShowtimes('place_search', vars).then((r) => r.places),
  });
}

/** The town/city at the browser's position. */
export function useReversePlace() {
  return useMutation({
    /** @param {{ lat: number, lng: number }} vars @returns {Promise<Place | null>} */
    mutationFn: (vars) => callShowtimes('place_reverse', vars).then((r) => r.place),
  });
}

/**
 * Save the user's location (rounded to ~1 km) and country. Country changes what's
 * in cinemas, so dependent caches are cleared.
 */
export function useSaveLocation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    /** @param {Place} place */
    mutationFn: async (place) => {
      const round = (n) => Math.round(n * 100) / 100;
      const { data, error } = await supabase
        .from('profiles')
        .update({
          city: place.city,
          lat: round(place.lat),
          lng: round(place.lng),
          ...(place.country_code ? { country_code: place.country_code } : {}),
        })
        .eq('id', user.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const previous = queryClient.getQueryData(['profile', user.id]);
      queryClient.setQueryData(['profile', user.id], data);
      queryClient.invalidateQueries({ queryKey: ['cinemas'] });
      queryClient.invalidateQueries({ queryKey: ['showtimes'] });
      if (previous?.country_code !== data.country_code) {
        queryClient.removeQueries({ queryKey: ['recommendations'] });
        queryClient.invalidateQueries({ queryKey: ['tmdb'] });
      }
    },
  });
}

/** Cinemas near the saved location; idle until there is one. */
export function useCinemasNear() {
  const { data: profile } = useProfile();
  const hasLocation = profile?.lat != null && profile?.lng != null;
  return useQuery({
    queryKey: ['cinemas', profile?.lat, profile?.lng],
    enabled: hasLocation,
    staleTime: DAY,
    retry: retryServerErrors,
    /** @returns {Promise<{ provider: string, cinemas: Cinema[] }>} */
    queryFn: () => callShowtimes('cinemas', { lat: profile.lat, lng: profile.lng }),
  });
}

/** Showtimes (or links to them) for one movie near the saved location. */
export function useMovieShowtimes(tmdbId, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['showtimes', user?.id, tmdbId],
    enabled: !!user && enabled,
    staleTime: 30 * 60 * 1000,
    retry: retryServerErrors,
    /** @returns {Promise<{ provider: string, city: string | null, showtimes: Showtime[], links: ShowtimeLink[] }>} */
    queryFn: () => callShowtimes('movie', { tmdb_id: tmdbId }),
  });
}

/** Saved cinemas, oldest first. */
export function useFavouriteCinemas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['favourite-cinemas', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('favourite_cinemas')
        .select('id, provider, external_id, name, address, lat, lng, url')
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

/** Add or remove a favourite cinema, updating the list right away. */
export function useToggleFavouriteCinema() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['favourite-cinemas', user?.id];
  return useMutation({
    /** @param {{ cinema: Cinema, favourite: boolean }} vars */
    mutationFn: async ({ cinema, favourite }) => {
      if (favourite) {
        const { error } = await supabase.from('favourite_cinemas').upsert(
          {
            provider: cinema.provider,
            external_id: cinema.id,
            name: cinema.name,
            address: cinema.address,
            lat: cinema.lat,
            lng: cinema.lng,
            url: cinema.url,
          },
          { onConflict: 'user_id,provider,external_id' }
        );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('favourite_cinemas')
          .delete()
          .eq('provider', cinema.provider)
          .eq('external_id', cinema.id);
        if (error) throw error;
      }
    },
    onMutate: async ({ cinema, favourite }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (list = []) =>
        favourite
          ? [...list, { id: `optimistic-${cinema.id}`, provider: cinema.provider, external_id: cinema.id, name: cinema.name, address: cinema.address, lat: cinema.lat, lng: cinema.lng, url: cinema.url }]
          : list.filter((f) => !(f.provider === cinema.provider && f.external_id === cinema.id))
      );
      return { previous };
    },
    onError: (_error, _vars, context) => queryClient.setQueryData(key, context?.previous),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['showtimes'] });
    },
  });
}
