import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { callTmdb } from '@/lib/tmdb';
import { useProfile } from '@/hooks/use-profile';

const HOUR = 60 * 60 * 1000;

/** The user's country for TMDB region, certifications and providers. Defaults to NZ. */
export function useCountry() {
  const { data: profile } = useProfile();
  return profile?.country_code ?? 'NZ';
}

// Don't retry "not found" or bad requests, only server/network failures.
const retryServerErrors = (count, error) => !(error?.status < 500) && count < 1;

/**
 * Movie details with watch providers and certifications for `country` only.
 * @param {number} id
 * @param {string} country
 */
export function useMovie(id, country) {
  return useQuery({
    queryKey: ['tmdb', 'movie', id, country],
    queryFn: () => callTmdb('movie', { id, region: country }),
    enabled: Number.isInteger(id) && id > 0,
    staleTime: HOUR,
    retry: retryServerErrors,
  });
}

/** Search results for a (debounced) query; idle below 2 characters. */
export function useMovieSearch(query) {
  const q = query.trim();
  return useQuery({
    queryKey: ['tmdb', 'search', q.toLowerCase()],
    queryFn: () => callTmdb('search', { query: q }),
    enabled: q.length >= 2,
    staleTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    retry: retryServerErrors,
  });
}

/** @param {'now_playing'|'upcoming'} kind @param {string} region */
export function useReleaseList(kind, region) {
  return useQuery({
    queryKey: ['tmdb', kind, region],
    queryFn: () => callTmdb(kind, { region }),
    staleTime: HOUR,
    retry: retryServerErrors,
  });
}
