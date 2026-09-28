import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * @typedef {Object} MovieSummary
 * @property {number} id TMDB id
 * @property {string} title
 * @property {string | null} release_date YYYY-MM-DD
 * @property {string | null} poster_path
 * @property {string | null} backdrop_path
 * @property {number} vote_average 0-10
 * @property {number} vote_count
 * @property {string} overview
 * @property {{ id: number, name: string }[]} genres
 * @property {number | null} runtime minutes, null when unknown
 */

/**
 * @typedef {{ provider_id: number, provider_name: string, logo_path: string | null, display_priority: number }} Provider
 * @typedef {{ link: string, flatrate: Provider[], free: Provider[], ads: Provider[], rent: Provider[], buy: Provider[] }} CountryProviders
 */

/**
 * @typedef {MovieSummary & {
 *   tagline: string,
 *   directors: { id: number, name: string }[],
 *   cast: { id: number, name: string, character: string, profile_path: string | null }[],
 *   videos: { key: string, name: string, type: string, official: boolean, published_at: string }[],
 *   watch_providers: Record<string, CountryProviders>,
 *   release_dates: Record<string, { certification: string, type: number, release_date: string }[]>,
 *   recommendations: MovieSummary[],
 *   similar: MovieSummary[],
 * }} MovieDetails
 */

/**
 * Call the `tmdb` Edge Function. Throws an Error with `.status` on failure.
 *
 * @param {'search'|'movie'|'discover'|'now_playing'|'upcoming'|'genres'|'providers'} op
 * @param {Record<string, unknown>} [params]
 */
export async function callTmdb(op, params = {}) {
  const { data, error } = await supabase.functions.invoke('tmdb', { body: { op, params } });
  if (error) {
    let message = 'Movie data is unavailable right now';
    let status;
    if (error instanceof FunctionsHttpError) {
      status = error.context.status;
      try {
        message = (await error.context.json()).error || message;
      } catch {
        // keep the default message
      }
    }
    const err = new Error(message);
    err.status = status;
    throw err;
  }
  return data;
}

/** @param {string | null | undefined} date */
export function releaseYear(date) {
  return date ? date.slice(0, 4) : '';
}

/** 142 -> "2h 22m" */
export function formatRuntime(minutes) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

/**
 * Best YouTube trailer: official trailers first, then any trailer, then other
 * videos; newest first within each group.
 *
 * @param {MovieDetails['videos']} videos
 */
export function pickTrailer(videos = []) {
  const score = (v) => (v.type === 'Trailer' ? 2 : 0) + (v.official ? 1 : 0);
  return (
    [...videos].sort(
      (a, b) => score(b) - score(a) || String(b.published_at).localeCompare(String(a.published_at))
    )[0] ?? null
  );
}

/**
 * Age rating for a country, e.g. "M" or "R16" in NZ. Prefers the theatrical
 * release (type 3), then any release with a rating.
 *
 * @param {MovieDetails['release_dates']} releaseDates
 * @param {string} country ISO 3166-1 code
 */
export function certificationFor(releaseDates, country) {
  const rated = (releaseDates?.[country] ?? []).filter((r) => r.certification);
  return (rated.find((r) => r.type === 3) ?? rated[0])?.certification ?? '';
}

/**
 * Watch options in a country, grouped the way the UI shows them. Free and
 * ad-supported services count as streaming.
 *
 * @param {MovieDetails['watch_providers']} watchProviders
 * @param {string} country
 */
export function providersFor(watchProviders, country) {
  const entry = watchProviders?.[country];
  if (!entry) return { link: null, stream: [], rent: [], buy: [] };
  const seen = new Set();
  const stream = [...entry.flatrate, ...entry.free, ...entry.ads]
    .filter((p) => !seen.has(p.provider_id) && seen.add(p.provider_id))
    .sort((a, b) => a.display_priority - b.display_priority);
  return { link: entry.link, stream, rent: entry.rent, buy: entry.buy };
}

/** "New Zealand" for "NZ", falling back to the code. */
export function countryName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
