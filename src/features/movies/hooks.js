import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { callTmdb } from '@/lib/tmdb';
import { retryServerErrors } from '@/lib/edge-functions';
import { useProfile } from '@/hooks/use-profile';

const HOUR = 60 * 60 * 1000;

/** The user's country for TMDB region, certifications and providers. Defaults to NZ. */
export function useCountry() {
  const { data: profile } = useProfile();
  return profile?.country_code ?? 'NZ';
}

/**
 * Movie or series details with watch providers and certifications for `country` only.
 * @param {number} id
 * @param {string} country
 * @param {'movie' | 'tv'} [media]
 */
export function useMovie(id, country, media = 'movie') {
  return useQuery({
    queryKey: ['tmdb', media, id, country],
    queryFn: () => callTmdb(media, { id, region: country }),
    enabled: Number.isInteger(id) && id > 0,
    staleTime: HOUR,
    retry: retryServerErrors,
  });
}

/**
 * Search results for a (debounced) query; idle below 2 characters.
 * @param {string} query
 * @param {'multi' | 'movie' | 'tv'} [media] 'multi' returns movies and series
 */
export function useMovieSearch(query, media = 'movie') {
  const q = query.trim();
  return useQuery({
    queryKey: ['tmdb', 'search', media, q.toLowerCase()],
    queryFn: () => callTmdb('search', { query: q, ...(media === 'movie' ? {} : { media }) }),
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

/**
 * Summaries (with providers and release dates for `country`) for many movies or
 * series, fetched in batches of 50. Returns a Map by id.
 *
 * @param {number[]} ids
 * @param {string} country
 * @param {'movie' | 'tv'} [media]
 */
export function useMovies(ids, country, media = 'movie') {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  return useQuery({
    queryKey: ['tmdb', media === 'tv' ? 'series-batch' : 'movies', sorted, country],
    enabled: sorted.length > 0,
    staleTime: HOUR,
    placeholderData: keepPreviousData,
    retry: retryServerErrors,
    queryFn: async () => {
      const batches = [];
      for (let i = 0; i < sorted.length; i += 50) batches.push(sorted.slice(i, i + 50));
      const pages = await Promise.all(batches.map((batch) => callTmdb(media, { ids: batch, region: country })));
      return new Map(pages.flatMap((p) => p.results).map((m) => [m.id, m]));
    },
  });
}

/** Streaming services available in a country (movies and series merged). */
export function useStreamingProviders(country) {
  return useQuery({
    queryKey: ['tmdb', 'providers', 'all', country],
    queryFn: () => callTmdb('providers', { region: country, media: 'all' }).then((r) => r.providers),
    staleTime: 24 * HOUR,
    retry: retryServerErrors,
  });
}
