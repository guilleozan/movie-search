import { invokeFunction } from '@/lib/edge-functions';

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
export function callTmdb(op, params = {}) {
  return invokeFunction('tmdb', { op, params }, 'Movie data is unavailable right now');
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

/**
 * Release date in a country, YYYY-MM-DD: the earliest theatrical release there
 * (TMDB types 2 limited, 3 theatrical), else the earliest of any type, else the
 * movie's primary release date.
 *
 * @param {{ release_date: string | null, release_dates?: MovieDetails['release_dates'] }} movie
 * @param {string} country
 */
export function regionalReleaseDate(movie, country) {
  const entries = movie.release_dates?.[country] ?? [];
  const earliest = (list) => list.map((r) => r.release_date.slice(0, 10)).sort()[0];
  return earliest(entries.filter((r) => r.type === 2 || r.type === 3)) ?? earliest(entries) ?? movie.release_date ?? null;
}

/** Today as YYYY-MM-DD in the viewer's time zone, for comparing with release dates. */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "2026-10-07" -> "7 Oct" (or "7 Oct 2027" when not this year). */
export function formatReleaseDate(isoDate) {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T00:00:00`);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}
