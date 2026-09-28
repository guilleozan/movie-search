// TMDB proxy. Keeps TMDB_READ_TOKEN server side, allows only whitelisted
// operations, and caches responses in Postgres.
//
// Request:  POST { op: 'search' | 'movie' | 'discover' | 'now_playing' | 'upcoming' | 'genres' | 'providers', params?: {...} }
// Response: JSON (shapes below), or { error } with a 4xx/5xx status.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// TMDB_API_URL only exists so tests can point at a stub server.
const TMDB_API = Deno.env.get('TMDB_API_URL') ?? 'https://api.themoviedb.org/3';
const TMDB_TOKEN = Deno.env.get('TMDB_READ_TOKEN');

const HOUR = 60 * 60 * 1000;
const DETAILS_TTL = 7 * 24 * HOUR;
const LIST_TTL = 6 * HOUR;
const REFERENCE_TTL = 7 * 24 * HOUR; // genres, provider lists

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Params = Record<string, unknown>;

// ---------- request handling ----------

const OPERATIONS: Record<string, (params: Params) => Promise<unknown>> = {
  search: async (p) => {
    const query = text(p.query, 'query', 100);
    const page = pageParam(p.page);
    const year = p.year === undefined ? undefined : int(p.year, 'year', 1870, 2100);
    return cachedList(`search:${stableKey({ query: query.toLowerCase(), page, year })}`, LIST_TTL, async () => {
      const raw = await tmdbFetch('/search/movie', { query, page, year, include_adult: false });
      return listPage(raw, await genreMap());
    });
  },

  movie: async (p) => {
    const id = int(p.id, 'id', 1, 1e9);
    const country = region(p.region);
    const [details] = await getDetails([id]);
    if (!details) throw new HttpError(404, 'Movie not found');
    // The cache keeps every country; send only the user's to keep the payload small.
    return {
      ...details,
      watch_providers: pickCountry(details.watch_providers, country),
      release_dates: pickCountry(details.release_dates, country),
    };
  },

  discover: async (p) => {
    const query = discoverParams(p);
    return cachedList(`discover:${stableKey(query)}`, LIST_TTL, async () => {
      const raw = await tmdbFetch('/discover/movie', { ...query, include_adult: false });
      return listPage(raw, await genreMap());
    });
  },

  now_playing: (p) => releaseList('now_playing', p),
  upcoming: (p) => releaseList('upcoming', p),

  genres: () => genreList().then((genres) => ({ genres })),

  providers: async (p) => {
    const watchRegion = region(p.region);
    return cachedList(`providers:${watchRegion}`, REFERENCE_TTL, async () => {
      let raw = await tmdbFetch('/watch/providers/movie', { watch_region: watchRegion });
      // TMDB sometimes returns an empty regional list (e.g. NZ) even though movies
      // have providers there. Fall back to the global list filtered by that region.
      if (!raw.results?.length) {
        const all = await tmdbFetch('/watch/providers/movie');
        raw = { results: (all.results ?? []).filter((x: any) => x.display_priorities?.[watchRegion] !== undefined) };
      }
      const providers = (raw.results ?? [])
        .map((x: any) => ({
          provider_id: x.provider_id,
          provider_name: x.provider_name,
          logo_path: x.logo_path,
          display_priority: x.display_priorities?.[watchRegion] ?? x.display_priority,
        }))
        .sort((a: any, b: any) => a.display_priority - b.display_priority);
      return { region: watchRegion, providers };
    });
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST');
    await requireUser(req);
    if (!TMDB_TOKEN) throw new HttpError(500, 'TMDB is not configured');

    const body = await req.json().catch(() => null);
    const op = body?.op;
    if (typeof op !== 'string' || !Object.hasOwn(OPERATIONS, op)) {
      throw new HttpError(400, 'Unknown operation');
    }
    const params = body.params ?? {};
    if (typeof params !== 'object' || Array.isArray(params)) throw new HttpError(400, 'Invalid params');

    return json(await OPERATIONS[op](params), 200);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'Something went wrong' }, 500);
  }
});

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Only signed-in users may call the proxy (the anon key alone is not enough). */
async function requireUser(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in required');
  const { data, error } = await admin.auth.getClaims(token);
  if (error || data?.claims?.role !== 'authenticated') throw new HttpError(401, 'Sign in required');
}

// ---------- validation ----------

function int(value: unknown, name: string, min: number, max: number): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `Invalid ${name}`);
  }
  return n;
}

function text(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new HttpError(400, `Invalid ${name}`);
  }
  return value.trim();
}

function region(value: unknown): string {
  if (value === undefined) return 'NZ';
  if (typeof value !== 'string' || !/^[A-Z]{2}$/.test(value)) throw new HttpError(400, 'Invalid region');
  return value;
}

function pageParam(value: unknown): number {
  return value === undefined ? 1 : int(value, 'page', 1, 500);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID_LIST = /^\d+([,|]\d+)*$/;

/** Allowed /discover/movie filters and how to validate each one. */
const DISCOVER_RULES: Record<string, (v: unknown) => unknown> = {
  sort_by: (v) => match(v, /^(popularity|vote_average|vote_count|primary_release_date|revenue)\.(asc|desc)$/, 'sort_by'),
  with_genres: (v) => match(v, ID_LIST, 'with_genres'),
  without_genres: (v) => match(v, ID_LIST, 'without_genres'),
  'primary_release_date.gte': (v) => match(v, DATE, 'primary_release_date.gte'),
  'primary_release_date.lte': (v) => match(v, DATE, 'primary_release_date.lte'),
  'vote_count.gte': (v) => int(v, 'vote_count.gte', 0, 1e7),
  'vote_average.gte': (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 10) throw new HttpError(400, 'Invalid vote_average.gte');
    return n;
  },
  'with_runtime.gte': (v) => int(v, 'with_runtime.gte', 0, 1000),
  'with_runtime.lte': (v) => int(v, 'with_runtime.lte', 0, 1000),
  with_original_language: (v) => match(v, /^[a-z]{2}$/, 'with_original_language'),
  with_watch_providers: (v) => match(v, ID_LIST, 'with_watch_providers'),
  with_watch_monetization_types: (v) => match(v, /^(flatrate|free|ads|rent|buy)([,|](flatrate|free|ads|rent|buy))*$/, 'with_watch_monetization_types'),
  watch_region: region,
  region: region,
  page: pageParam,
};

function match(value: unknown, pattern: RegExp, name: string): string {
  if (typeof value !== 'string' || value.length > 200 || !pattern.test(value)) {
    throw new HttpError(400, `Invalid ${name}`);
  }
  return value;
}

function discoverParams(p: Params): Params {
  const out: Params = {};
  for (const [key, value] of Object.entries(p)) {
    if (!Object.hasOwn(DISCOVER_RULES, key)) throw new HttpError(400, `Unsupported filter: ${key}`);
    if (value !== undefined && value !== null && value !== '') out[key] = DISCOVER_RULES[key](value);
  }
  return out;
}

function pickCountry<T>(byCountry: Record<string, T>, country: string): Record<string, T> {
  return byCountry[country] ? { [country]: byCountry[country] } : {};
}

/** JSON with sorted keys, so equal params always produce the same cache key. */
function stableKey(obj: Params): string {
  return JSON.stringify(Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined).sort()));
}

// ---------- TMDB + cache ----------

async function tmdbFetch(path: string, query: Params = {}) {
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

async function cachedList<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
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

/** Details for several movies, in the same order as `ids` (null where TMDB has no such movie). */
async function getDetails(ids: number[]): Promise<(MovieDetails | null)[]> {
  const { data: rows } = await admin
    .from('movies_cache')
    .select('tmdb_id, data, fetched_at')
    .in('tmdb_id', ids);
  const found = new Map<number, MovieDetails>();
  for (const row of rows ?? []) {
    if (Date.now() - Date.parse(row.fetched_at) < DETAILS_TTL) found.set(row.tmdb_id, row.data);
  }

  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    const genres = await genreMap();
    const fetched: { tmdb_id: number; data: MovieDetails; fetched_at: string }[] = [];
    // A few at a time to stay well inside TMDB's rate limit.
    for (let i = 0; i < missing.length; i += 8) {
      const batch = await Promise.all(
        missing.slice(i, i + 8).map(async (id) => {
          try {
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
        fetched.push({ tmdb_id: details.id, data: details, fetched_at: new Date().toISOString() });
      }
    }
    if (fetched.length) {
      const { error } = await admin.from('movies_cache').upsert(fetched);
      if (error) console.error('movies_cache write failed:', error.message);
    }
  }

  return ids.map((id) => found.get(id) ?? null);
}

async function genreList(): Promise<{ id: number; name: string }[]> {
  return cachedList('genres', REFERENCE_TTL, async () => (await tmdbFetch('/genre/movie/list')).genres);
}

async function genreMap(): Promise<Map<number, string>> {
  return new Map((await genreList()).map((g) => [g.id, g.name]));
}

/**
 * now_playing / upcoming for a region. Each movie is enriched from its (cached)
 * details so cards can show runtime and genre names, which lists don't include.
 */
async function releaseList(kind: 'now_playing' | 'upcoming', p: Params) {
  const listRegion = region(p.region);
  const page = pageParam(p.page);
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

/** Compact movie used in every list and card. */
type MovieSummary = {
  id: number;
  title: string;
  release_date: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  overview: string;
  genres: { id: number; name: string }[];
  runtime: number | null;
};

type Provider = { provider_id: number; provider_name: string; logo_path: string | null; display_priority: number };

type MovieDetails = MovieSummary & {
  original_title: string;
  original_language: string;
  tagline: string;
  status: string;
  imdb_id: string | null;
  directors: { id: number; name: string }[];
  cast: { id: number; name: string; character: string; profile_path: string | null }[];
  videos: { key: string; name: string; type: string; official: boolean; published_at: string }[];
  /** By country code: TMDB watch page link plus providers per offer type. */
  watch_providers: Record<string, { link: string; flatrate: Provider[]; free: Provider[]; ads: Provider[]; rent: Provider[]; buy: Provider[] }>;
  /** By country code: certifications and release dates (type 1-6 as defined by TMDB). */
  release_dates: Record<string, { certification: string; type: number; release_date: string }[]>;
  recommendations: MovieSummary[];
  similar: MovieSummary[];
};

function listItem(m: any, genres: Map<number, string>): MovieSummary {
  return {
    id: m.id,
    title: m.title,
    release_date: m.release_date || null,
    poster_path: m.poster_path ?? null,
    backdrop_path: m.backdrop_path ?? null,
    vote_average: m.vote_average ?? 0,
    vote_count: m.vote_count ?? 0,
    overview: m.overview ?? '',
    genres: (m.genre_ids ?? []).filter((id: number) => genres.has(id)).map((id: number) => ({ id, name: genres.get(id)! })),
    runtime: null,
  };
}

function listPage(raw: any, genres: Map<number, string>) {
  return {
    page: raw.page,
    total_pages: raw.total_pages,
    total_results: raw.total_results,
    results: (raw.results ?? []).map((m: any) => listItem(m, genres)),
  };
}

function toSummary(d: MovieDetails): MovieSummary {
  const { id, title, release_date, poster_path, backdrop_path, vote_average, vote_count, overview, genres, runtime } = d;
  return { id, title, release_date, poster_path, backdrop_path, vote_average, vote_count, overview, genres, runtime };
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
    watch_providers: Object.fromEntries(
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
    ),
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
