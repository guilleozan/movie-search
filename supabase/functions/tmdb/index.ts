// TMDB proxy. Keeps TMDB_READ_TOKEN server side, allows only whitelisted
// operations, and caches responses in Postgres.
//
// Request:  POST { op: 'search' | 'movie' | 'tv' | 'discover' | 'now_playing' | 'upcoming' | 'genres' | 'providers' | 'match', params?: {...} }
// Most ops take `media: 'movie' | 'tv'` (search also 'multi'); the default is 'movie'.
// Response: JSON (shapes in ../_shared/tmdb.ts), or { error } with a 4xx/5xx status.

import { HttpError, serveJson } from '../_shared/http.ts';
import {
  cachedList, discover, genreList, genreMap, getDetails, LIST_TTL, listPage, type Media, type MovieSummary,
  multiPage, REFERENCE_TTL, releaseList, requireTmdb, stableKey, tmdbFetch, toSummary,
} from '../_shared/tmdb.ts';

type Params = Record<string, unknown>;

// ---------- request handling ----------

const OPERATIONS: Record<string, (params: Params) => Promise<unknown>> = {
  search: (p) => {
    const media = p.media === 'multi' ? 'multi' : mediaParam(p.media);
    return search(text(p.query, 'query', 100), media, pageParam(p.page), p.year === undefined ? undefined : int(p.year, 'year', 1870, 2100));
  },

  // { id } -> full details. { ids: [...] } (max 50) -> { results } with summaries plus
  // providers and release dates, for lists like the watchlist; unknown ids are skipped.
  movie: (p) => details(p, 'movie'),
  tv: (p) => details(p, 'tv'),

  // { titles: [...] (max 25), media } -> { results: [{ title, match }] }. For importing
  // viewing history: a title matches only when exactly one of TMDB's results has
  // the same normalised title, or several do and one is clearly the most popular.
  match: async (p) => {
    const media = mediaParam(p.media);
    if (!Array.isArray(p.titles) || p.titles.length === 0 || p.titles.length > 25) throw new HttpError(400, 'Invalid titles');
    const titles = p.titles.map((t) => text(t, 'titles', 200));
    const results = [];
    for (let i = 0; i < titles.length; i += 5) {
      results.push(...await Promise.all(titles.slice(i, i + 5).map(async (title) => {
        const page = await search(title, media, 1);
        return { title, match: bestMatch(title, page.results) };
      })));
    }
    return { results };
  },

  discover: (p) => {
    const { media, ...filters } = p;
    return discover(discoverParams(filters), mediaParam(media));
  },

  now_playing: (p) => releaseList('now_playing', region(p.region), pageParam(p.page)),
  upcoming: (p) => releaseList('upcoming', region(p.region), pageParam(p.page)),

  genres: (p) => genreList(mediaParam(p.media)).then((genres) => ({ genres })),

  // Streaming services in a region. media 'all' merges the movie and series lists.
  providers: async (p) => {
    const watchRegion = region(p.region);
    if (p.media === 'all') {
      const [movie, tv] = await Promise.all([providerList('movie', watchRegion), providerList('tv', watchRegion)]);
      const merged = new Map<number, ProviderEntry>();
      for (const x of [...movie, ...tv]) {
        const seen = merged.get(x.provider_id);
        if (!seen || x.display_priority < seen.display_priority) merged.set(x.provider_id, x);
      }
      return { region: watchRegion, providers: [...merged.values()].sort((a, b) => a.display_priority - b.display_priority) };
    }
    return { region: watchRegion, providers: await providerList(mediaParam(p.media), watchRegion) };
  },
};

type ProviderEntry = { provider_id: number; provider_name: string; logo_path: string | null; display_priority: number };

function providerList(media: Media, watchRegion: string): Promise<ProviderEntry[]> {
  // Movie keys keep their original form so existing cache rows stay valid.
  const key = media === 'tv' ? `providers:tv:${watchRegion}` : `providers:${watchRegion}`;
  return cachedList(key, REFERENCE_TTL, async () => {
    let raw = await tmdbFetch(`/watch/providers/${media}`, { watch_region: watchRegion });
    // TMDB sometimes returns an empty regional list (e.g. NZ) even though titles
    // have providers there. Fall back to the global list filtered by that region.
    if (!raw.results?.length) {
      const all = await tmdbFetch(`/watch/providers/${media}`);
      raw = { results: (all.results ?? []).filter((x: any) => x.display_priorities?.[watchRegion] !== undefined) };
    }
    return (raw.results ?? [])
      .map((x: any) => ({
        provider_id: x.provider_id,
        provider_name: x.provider_name,
        logo_path: x.logo_path,
        display_priority: x.display_priorities?.[watchRegion] ?? x.display_priority,
      }))
      .sort((a: ProviderEntry, b: ProviderEntry) => a.display_priority - b.display_priority);
  }).then((data) => (Array.isArray(data) ? data : (data as { providers: ProviderEntry[] }).providers));
}

function search(query: string, media: Media | 'multi', page: number, year?: number) {
  // Movie keys keep their original form so existing cache rows stay valid.
  const prefix = media === 'movie' ? 'search' : `search:${media}`;
  return cachedList(`${prefix}:${stableKey({ query: query.toLowerCase(), page, year })}`, LIST_TTL, async () => {
    if (media === 'multi') {
      const raw = await tmdbFetch('/search/multi', { query, page, include_adult: false });
      return multiPage(raw, await genreMap('movie'), await genreMap('tv'));
    }
    const yearKey = media === 'tv' ? 'first_air_date_year' : 'year';
    const raw = await tmdbFetch(`/search/${media}`, { query, page, [yearKey]: year, include_adult: false });
    return listPage(raw, await genreMap(media), media);
  });
}

async function details(p: Params, media: Media) {
  const country = region(p.region);

  if (p.ids !== undefined) {
    if (!Array.isArray(p.ids) || p.ids.length > 50) throw new HttpError(400, 'Invalid ids');
    const ids = [...new Set(p.ids.map((id) => int(id, 'ids', 1, 1e9)))];
    const found = ids.length ? await getDetails(ids, media) : [];
    return {
      results: found.filter(Boolean).map((d) => ({
        ...toSummary(d!),
        watch_providers: pickCountry(d!.watch_providers, country),
        release_dates: pickCountry(d!.release_dates, country),
      })),
    };
  }

  const id = int(p.id, 'id', 1, 1e9);
  const [found] = await getDetails([id], media);
  if (!found) throw new HttpError(404, media === 'tv' ? 'Series not found' : 'Movie not found');
  // The cache keeps every country; send only the user's to keep the payload small.
  return {
    ...found,
    media_type: media,
    watch_providers: pickCountry(found.watch_providers, country),
    release_dates: pickCountry(found.release_dates, country),
  };
}

const normalise = (t: string) =>
  t.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

/** The single confident match for `title`, or null (never a guess between equals). */
function bestMatch(title: string, results: MovieSummary[]): MovieSummary | null {
  const same = results.filter((r) => normalise(r.title) === normalise(title));
  if (same.length === 0) return null;
  const [first, second] = [...same].sort((a, b) => b.vote_count - a.vote_count);
  // Remakes share titles: only pick the most popular when it clearly dominates.
  if (second && first.vote_count < second.vote_count * 3) return null;
  return first;
}

serveJson(async (body) => {
  requireTmdb();
  const op = body.op;
  if (typeof op !== 'string' || !Object.hasOwn(OPERATIONS, op)) throw new HttpError(400, 'Unknown operation');
  const params = body.params ?? {};
  if (typeof params !== 'object' || Array.isArray(params)) throw new HttpError(400, 'Invalid params');
  return OPERATIONS[op](params as Params);
});

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

function mediaParam(value: unknown): Media {
  if (value === undefined || value === 'movie') return 'movie';
  if (value === 'tv') return 'tv';
  throw new HttpError(400, 'Invalid media');
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
  'first_air_date.gte': (v) => match(v, DATE, 'first_air_date.gte'),
  'first_air_date.lte': (v) => match(v, DATE, 'first_air_date.lte'),
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
