// Places, cinemas and showtimes behind one adapter (see ./providers).
//
// Request:  POST { op, params }
//   place_search  { query, country? }            -> { places }   towns/cities (OpenStreetMap)
//   place_reverse { lat, lng }                   -> { place }    town/city at a point
//   cinemas       { lat?, lng?, radius_km? }     -> { provider, cinemas }  defaults to the saved location
//   movie         { tmdb_id, date? }             -> ShowtimesResult & { city }
//   cinema        { cinema: CinemaRef, date? }   -> ShowtimesResult
// Response: JSON, or { error } with a 4xx/5xx status.

import { admin, HttpError, serveJson } from '../_shared/http.ts';
import { getDetails, requireTmdb } from '../_shared/tmdb.ts';
import { reversePlace, round2, searchPlaces } from './osm.ts';
import { activeProvider } from './providers/index.ts';
import type { CinemaRef } from './providers/types.ts';

type Params = Record<string, unknown>;

const OPERATIONS: Record<string, (p: Params, userId: string) => Promise<unknown>> = {
  place_search: async (p) => {
    const query = text(p.query, 'query', 100);
    const country = p.country === undefined || p.country === null ? null : countryCode(p.country);
    return { places: await searchPlaces(query, country) };
  },

  place_reverse: async (p) => ({ place: await reversePlace(num(p.lat, 'lat', -90, 90), num(p.lng, 'lng', -180, 180)) }),

  cinemas: async (p, userId) => {
    let lat: number | null = null;
    let lng: number | null = null;
    if (p.lat !== undefined || p.lng !== undefined) {
      lat = num(p.lat, 'lat', -90, 90);
      lng = num(p.lng, 'lng', -180, 180);
    } else {
      const profile = await loadProfile(userId);
      lat = profile.lat;
      lng = profile.lng;
    }
    if (lat === null || lng === null) throw new HttpError(409, 'Set your location first');
    const radius = p.radius_km === undefined ? 15 : num(p.radius_km, 'radius_km', 1, 50);
    const provider = activeProvider();
    return { provider: provider.name, cinemas: await provider.getCinemasNear(round2(lat), round2(lng), radius) };
  },

  movie: async (p, userId) => {
    requireTmdb();
    const tmdbId = num(p.tmdb_id, 'tmdb_id', 1, 1e9);
    if (!Number.isInteger(tmdbId)) throw new HttpError(400, 'Invalid tmdb_id');
    const provider = activeProvider();
    const [[movie], profile, favourites] = await Promise.all([
      getDetails([tmdbId]),
      loadProfile(userId),
      admin.from('favourite_cinemas').select('provider, external_id, name, url')
        .eq('user_id', userId).eq('provider', provider.name).order('created_at'),
    ]);
    if (!movie) throw new HttpError(404, 'Movie not found');
    if (favourites.error) throw favourites.error;

    const result = await provider.getShowtimesForMovie(
      { tmdbId, title: movie.title, year: movie.release_date?.slice(0, 4) ?? null },
      { lat: profile.lat, lng: profile.lng, city: profile.city, country: profile.country_code },
      date(p.date),
      (favourites.data ?? []).map((f) => ({ provider: f.provider, id: f.external_id, name: f.name, url: f.url })),
    );
    return { ...result, city: profile.city };
  },

  cinema: (p) => {
    const c = p.cinema as Record<string, unknown> | undefined;
    if (!c || typeof c !== 'object') throw new HttpError(400, 'Invalid cinema');
    const url = c.url === null || c.url === undefined ? null : text(c.url, 'cinema.url', 500);
    if (url && !/^https?:\/\//i.test(url)) throw new HttpError(400, 'Invalid cinema.url');
    const cinema: CinemaRef = {
      provider: text(c.provider, 'cinema.provider', 40),
      id: text(c.id, 'cinema.id', 200),
      name: text(c.name, 'cinema.name', 200),
      url,
    };
    return activeProvider().getShowtimes(cinema, date(p.date));
  },
};

serveJson((body, userId) => {
  const op = body.op;
  if (typeof op !== 'string' || !Object.hasOwn(OPERATIONS, op)) throw new HttpError(400, 'Unknown operation');
  const params = body.params ?? {};
  if (typeof params !== 'object' || Array.isArray(params)) throw new HttpError(400, 'Invalid params');
  return OPERATIONS[op](params as Params, userId);
});

async function loadProfile(userId: string) {
  const { data, error } = await admin.from('profiles').select('country_code, city, lat, lng').eq('id', userId).single();
  if (error) throw error;
  return data as { country_code: string; city: string | null; lat: number | null; lng: number | null };
}

// ---------- validation ----------

function num(value: unknown, name: string, min: number, max: number): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `Invalid ${name}`);
  return n;
}

function text(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw new HttpError(400, `Invalid ${name}`);
  return value.trim();
}

function countryCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z]{2}$/.test(value)) throw new HttpError(400, 'Invalid country');
  return value;
}

/** YYYY-MM-DD, defaulting to today (UTC; providers treat it as the local day). */
function date(value: unknown): string {
  if (value === undefined || value === null) return new Date().toISOString().slice(0, 10);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, 'Invalid date');
  return value;
}
