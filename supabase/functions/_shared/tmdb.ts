// TMDB access shared by the Edge Functions: fetches with the server-side token and
// caches responses in Postgres (movies_cache for details, tmdb_list_cache for lists).
// Series (TMDB "tv") are normalised to the movie shapes below (name -> title,
// first_air_date -> release_date) with media_type: 'tv', so every list and card
// handles both.

import { admin, HttpError } from './http.ts';

// TMDB_API_URL only exists so tests can point at a stub server.
const TMDB_API = Deno.env.get('TMDB_API_URL') ?? 'https://api.themoviedb.org/3';
const TMDB_TOKEN = Deno.env.get('TMDB_READ_TOKEN');

const HOUR = 60 * 60 * 1000;
const DETAILS_TTL = 7 * 24 * HOUR;
export const LIST_TTL = 6 * HOUR;
export const REFERENCE_TTL = 7 * 24 * HOUR; // genres, provider lists

type Params = Record<string, unknown>;

export type Media = 'movie' | 'tv';

// TMDB uses different genre ids for series. Map series genres onto the movie ones
// (taste weights are kept in movie ids) and back (for /discover/tv).
const TV_TO_MOVIE_GENRE: Record<number, number> = { 10759: 28, 10765: 878, 10768: 10752, 10762: 10751 };
const MOVIE_TO_TV_GENRE: Record<number, number> = { 28: 10759, 12: 10759, 878: 10765, 14: 10765, 10752: 10768 };
// Movie genres with no series equivalent: horror, thriller, romance, history, music, TV movie.
const NO_TV_GENRE = new Set([27, 53, 10749, 36, 10402, 10770]);

export const toMovieGenre = (id: number) => TV_TO_MOVIE_GENRE[id] ?? id;
export const toTvGenre = (id: number): number | null => (NO_TV_GENRE.has(id) ? null : MOVIE_TO_TV_GENRE[id] ?? id);

export function requireTmdb() {
  if (!TMDB_TOKEN) throw new HttpError(500, 'TMDB is not configured');
}

export async function tmdbFetch(path: string, query: Params = {}) {
  const url = new URL(TMDB_API + path);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TMDB_TOKEN}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) throw new HttpError(404, 'Not found');
  if (!res.ok) {
    console.error(`TMDB ${res.status} ${path}: ${await res.text()}`);
    throw new HttpError(502, 'Movie data is unavailable right now');
  }
  return res.json();
}

export async function cachedList<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const { data: hit } = await admin
    .from('tmdb_list_cache')
    .select('data, fetched_at')
    .eq('cache_key', key)
    .maybeSingle();
  if (hit && Date.now() - Date.parse(hit.fetched_at) < ttl) return hit.data as T;

  const fresh = await load();
  const { error } = await admin
    .from('tmdb_list_cache')
    .upsert({ cache_key: key, data: fresh, fetched_at: new Date().toISOString() });
  if (error) console.error('tmdb_list_cache write failed:', error.message);
  return fresh;
}

/** Details for several movies or series, in the same order as `ids` (null where TMDB has none). */
export async function getDetails(ids: number[], media: Media = 'movie'): Promise<(MovieDetails | null)[]> {
  const { data: rows } = await admin
    .from('movies_cache')
    .select('tmdb_id, data, fetched_at')
    .eq('media_type', media)
    .in('tmdb_id', ids);
  const found = new Map<number, MovieDetails>();
  for (const row of rows ?? []) {
    if (Date.now() - Date.parse(row.fetched_at) < DETAILS_TTL) found.set(row.tmdb_id, row.data);
  }

  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    const genres = await genreMap(media);
    const fetched: { media_type: Media; tmdb_id: number; data: MovieDetails; fetched_at: string }[] = [];
    // A few at a time to stay well inside TMDB's rate limit.
    for (let i = 0; i < missing.length; i += 8) {
      const batch = await Promise.all(
        missing.slice(i, i + 8).map(async (id) => {
          try {
            if (media === 'tv') {
              const raw = await tmdbFetch(`/tv/${id}`, {
                append_to_response: 'videos,credits,watch/providers,content_ratings,similar,recommendations',
              });
              return compactTv(raw, genres);
            }
            const raw = await tmdbFetch(`/movie/${id}`, {
              append_to_response: 'videos,credits,watch/providers,release_dates,similar,recommendations',
            });
            return compactDetails(raw, genres);
          } catch (err) {
            if (err instanceof HttpError && err.status === 404) return null;
            throw err;
          }
        }),
      );
      for (const details of batch) {
        if (!details) continue;
        found.set(details.id, details);
        fetched.push({ media_type: media, tmdb_id: details.id, data: details, fetched_at: new Date().toISOString() });
      }
    }
    if (fetched.length) {
      const { error } = await admin.from('movies_cache').upsert(fetched);
      if (error) console.error('movies_cache write failed:', error.message);
    }
  }

  return ids.map((id) => found.get(id) ?? null);
}

/** /discover/movie or /discover/tv with already-validated filters. */
export async function discover(query: Params, media: Media = 'movie') {
  // Movie keys keep their original form so existing cache rows stay valid.
  const key = media === 'tv' ? `discover:tv:${stableKey(query)}` : `discover:${stableKey(query)}`;
  return cachedList(key, LIST_TTL, async () => {
    const raw = await tmdbFetch(`/discover/${media}`, { ...query, include_adult: false });
    return listPage(raw, await genreMap(media), media);
  });
}

/** JSON with sorted keys, so equal params always produce the same cache key. */
export function stableKey(obj: Params): string {
  return JSON.stringify(Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined).sort()));
}

export async function genreList(media: Media = 'movie'): Promise<{ id: number; name: string }[]> {
  return cachedList(media === 'tv' ? 'genres:tv' : 'genres', REFERENCE_TTL, async () =>
    (await tmdbFetch(`/genre/${media}/list`)).genres);
}

export async function genreMap(media: Media = 'movie'): Promise<Map<number, string>> {
  return new Map((await genreList(media)).map((g) => [g.id, g.name]));
}

/**
 * now_playing / upcoming for a region. Each movie is enriched from its (cached)
 * details so cards can show runtime and genre names, which lists don't include.
 */
export async function releaseList(kind: 'now_playing' | 'upcoming', listRegion: string, page = 1) {
  return cachedList(`${kind}:${listRegion}:${page}`, LIST_TTL, async () => {
    const raw = await tmdbFetch(`/movie/${kind}`, { region: listRegion, page });
    const ids: number[] = (raw.results ?? []).map((m: any) => m.id);
    const details = await getDetails(ids);
    return {
      page: raw.page,
      total_pages: raw.total_pages,
      total_results: raw.total_results,
      dates: raw.dates ?? null,
      results: details.filter(Boolean).map((d) => toSummary(d!)),
    };
  });
}

// ---------- response shapes ----------

/** Compact movie or series used in every list and card. */
export type MovieSummary = {
  id: number;
  media_type: Media;
  title: string;
  release_date: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  overview: string;
  genres: { id: number; name: string }[];
  /** Minutes; for series, a typical episode. */
  runtime: number | null;
  /** Series only. */
  seasons?: number | null;
};

export type Provider = { provider_id: number; provider_name: string; logo_path: string | null; display_priority: number };

export type MovieDetails = MovieSummary & {
  original_title: string;
  original_language: string;
  tagline: string;
  status: string;
  imdb_id: string | null;
  /** Directors for movies, creators for series. */
  directors: { id: number; name: string }[];
  /** Series only: where it first aired (e.g. HBO). */
  networks?: { id: number; name: string }[];
  cast: { id: number; name: string; character: string; profile_path: string | null }[];
  videos: { key: string; name: string; type: string; official: boolean; published_at: string }[];
  /** By country code: TMDB watch page link plus providers per offer type. */
  watch_providers: Record<string, { link: string; flatrate: Provider[]; free: Provider[]; ads: Provider[]; rent: Provider[]; buy: Provider[] }>;
  /** By country code: certifications and release dates (type 1-6 as defined by TMDB).
   *  Series have one type-3 entry per country: its content rating and first air date. */
  release_dates: Record<string, { certification: string; type: number; release_date: string }[]>;
  recommendations: MovieSummary[];
  similar: MovieSummary[];
};

function listItem(m: any, genres: Map<number, string>, media: Media = 'movie'): MovieSummary {
  return {
    id: m.id,
    media_type: media,
    title: m.title ?? m.name,
    release_date: m.release_date || m.first_air_date || null,
    poster_path: m.poster_path ?? null,
    backdrop_path: m.backdrop_path ?? null,
    vote_average: m.vote_average ?? 0,
    vote_count: m.vote_count ?? 0,
    overview: m.overview ?? '',
    genres: (m.genre_ids ?? []).filter((id: number) => genres.has(id)).map((id: number) => ({ id, name: genres.get(id)! })),
    runtime: null,
  };
}

export function listPage(raw: any, genres: Map<number, string>, media: Media = 'movie') {
  return {
    page: raw.page,
    total_pages: raw.total_pages,
    total_results: raw.total_results,
    results: (raw.results ?? []).map((m: any) => listItem(m, genres, media)),
  };
}

/** A /search/multi page: movies and series only (people are dropped). */
export function multiPage(raw: any, movieGenres: Map<number, string>, tvGenres: Map<number, string>) {
  return {
    page: raw.page,
    total_pages: raw.total_pages,
    total_results: raw.total_results,
    results: (raw.results ?? [])
      .filter((m: any) => m.media_type === 'movie' || m.media_type === 'tv')
      .map((m: any) => listItem(m, m.media_type === 'tv' ? tvGenres : movieGenres, m.media_type)),
  };
}

export function toSummary(d: MovieDetails): MovieSummary {
  const { id, title, release_date, poster_path, backdrop_path, vote_average, vote_count, overview, genres, runtime } = d;
  // Rows cached before series support have no media_type: they are movies.
  const media_type = d.media_type ?? 'movie';
  return {
    id, media_type, title, release_date, poster_path, backdrop_path, vote_average, vote_count, overview, genres, runtime,
    ...(media_type === 'tv' ? { seasons: d.seasons ?? null } : {}),
  };
}

function compactProviders(list: any[] = []): Provider[] {
  return list.map((p) => ({
    provider_id: p.provider_id,
    provider_name: p.provider_name,
    logo_path: p.logo_path ?? null,
    display_priority: p.display_priority ?? 0,
  }));
}

function compactDetails(m: any, genres: Map<number, string>): MovieDetails {
  const providers = m['watch/providers']?.results ?? {};
  return {
    id: m.id,
    media_type: 'movie',
    title: m.title,
    original_title: m.original_title,
    original_language: m.original_language,
    overview: m.overview ?? '',
    tagline: m.tagline ?? '',
    status: m.status,
    release_date: m.release_date || null,
    runtime: m.runtime || null,
    genres: m.genres ?? [],
    vote_average: m.vote_average ?? 0,
    vote_count: m.vote_count ?? 0,
    poster_path: m.poster_path ?? null,
    backdrop_path: m.backdrop_path ?? null,
    imdb_id: m.imdb_id ?? null,
    directors: (m.credits?.crew ?? [])
      .filter((c: any) => c.job === 'Director')
      .map((c: any) => ({ id: c.id, name: c.name })),
    cast: (m.credits?.cast ?? []).slice(0, 12).map((c: any) => ({
      id: c.id,
      name: c.name,
      character: c.character ?? '',
      profile_path: c.profile_path ?? null,
    })),
    videos: (m.videos?.results ?? [])
      .filter((v: any) => v.site === 'YouTube')
      .map((v: any) => ({ key: v.key, name: v.name, type: v.type, official: !!v.official, published_at: v.published_at })),
    watch_providers: compactWatchProviders(providers),
    release_dates: Object.fromEntries(
      (m.release_dates?.results ?? []).map((r: any) => [
        r.iso_3166_1,
        r.release_dates.map((d: any) => ({ certification: d.certification ?? '', type: d.type, release_date: d.release_date })),
      ]),
    ),
    recommendations: (m.recommendations?.results ?? []).slice(0, 12).map((x: any) => listItem(x, genres)),
    similar: (m.similar?.results ?? []).slice(0, 12).map((x: any) => listItem(x, genres)),
  };
}

function compactWatchProviders(providers: Record<string, any>): MovieDetails['watch_providers'] {
  return Object.fromEntries(
    Object.entries(providers).map(([country, p]: [string, any]) => [
      country,
      {
        link: p.link,
        flatrate: compactProviders(p.flatrate),
        free: compactProviders(p.free),
        ads: compactProviders(p.ads),
        rent: compactProviders(p.rent),
        buy: compactProviders(p.buy),
      },
    ]),
  );
}

function compactTv(m: any, genres: Map<number, string>): MovieDetails {
  const firstAir = m.first_air_date || null;
  return {
    id: m.id,
    media_type: 'tv',
    title: m.name,
    original_title: m.original_name,
    original_language: m.original_language,
    overview: m.overview ?? '',
    tagline: m.tagline ?? '',
    status: m.status,
    release_date: firstAir,
    runtime: m.episode_run_time?.[0] || m.last_episode_to_air?.runtime || null,
    seasons: m.number_of_seasons ?? null,
    genres: m.genres ?? [],
    vote_average: m.vote_average ?? 0,
    vote_count: m.vote_count ?? 0,
    poster_path: m.poster_path ?? null,
    backdrop_path: m.backdrop_path ?? null,
    imdb_id: null,
    directors: (m.created_by ?? []).map((c: any) => ({ id: c.id, name: c.name })),
    networks: (m.networks ?? []).map((n: any) => ({ id: n.id, name: n.name })),
    cast: (m.credits?.cast ?? []).slice(0, 12).map((c: any) => ({
      id: c.id,
      name: c.name,
      character: c.character ?? '',
      profile_path: c.profile_path ?? null,
    })),
    videos: (m.videos?.results ?? [])
      .filter((v: any) => v.site === 'YouTube')
      .map((v: any) => ({ key: v.key, name: v.name, type: v.type, official: !!v.official, published_at: v.published_at })),
    watch_providers: compactWatchProviders(m['watch/providers']?.results ?? {}),
    // Same shape as movies so certification and date helpers work unchanged.
    release_dates: Object.fromEntries(
      (m.content_ratings?.results ?? []).map((r: any) => [
        r.iso_3166_1,
        [{ certification: r.rating ?? '', type: 3, release_date: firstAir ?? '' }],
      ]),
    ),
    recommendations: (m.recommendations?.results ?? []).slice(0, 12).map((x: any) => listItem(x, genres, 'tv')),
    similar: (m.similar?.results ?? []).slice(0, 12).map((x: any) => listItem(x, genres, 'tv')),
  };
}
