// OpenStreetMap lookups: Nominatim for places, Overpass for cinemas. Both are free
// public services with usage policies: identify the app, stay under ~1 request per
// second, cache results, no autocomplete, and credit "© OpenStreetMap contributors"
// wherever the data is shown. Results are cached in places_cache.

import { admin, HttpError } from '../_shared/http.ts';

// OSM_*_URL only exist so tests can point at stub servers.
const NOMINATIM = Deno.env.get('OSM_NOMINATIM_URL') ?? 'https://nominatim.openstreetmap.org';
const OVERPASS = Deno.env.get('OSM_OVERPASS_URL') ?? 'https://overpass-api.de/api/interpreter';
const USER_AGENT = `CineMatch/1.0 (${Deno.env.get('OSM_CONTACT') || 'https://github.com/guilleozan/movie-search'})`;

const DAY = 24 * 60 * 60 * 1000;

export type Place = { label: string; city: string | null; country_code: string | null; lat: number; lng: number };
export type OsmCinema = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  url: string | null;
};

/** ~1 km precision: enough for "near me", and all that leaves the app. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Towns and cities matching `query` (submit-based search, never autocomplete). */
export function searchPlaces(query: string, country: string | null): Promise<Place[]> {
  const key = `search:${country ?? ''}:${query.toLowerCase()}`;
  return cached(key, 30 * DAY, async () => {
    const results = await osmFetch(`${NOMINATIM}/search`, {
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      featureType: 'settlement',
      limit: '6',
      ...(country ? { countrycodes: country.toLowerCase() } : {}),
    });
    return (Array.isArray(results) ? results : []).map(toPlace);
  });
}

/** The town or city at a point. */
export async function reversePlace(lat: number, lng: number): Promise<Place | null> {
  const [rlat, rlng] = [round2(lat), round2(lng)];
  // Wrapped so "nothing here" can be cached too (the cache column is not null).
  const { place } = await cached(`reverse:${rlat},${rlng}`, 30 * DAY, async () => {
    const result = await osmFetch(`${NOMINATIM}/reverse`, {
      lat: String(rlat),
      lon: String(rlng),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '10',
    });
    return { place: result && !result.error ? { ...toPlace(result), lat: rlat, lng: rlng } : null };
  });
  return place;
}

/** Cinemas (amenity=cinema) within `radiusKm`, nearest first. */
export function cinemasNear(lat: number, lng: number, radiusKm: number): Promise<OsmCinema[]> {
  const [rlat, rlng] = [round2(lat), round2(lng)];
  const r = Math.round(radiusKm * 1000);
  return cached(`cinemas:${rlat},${rlng}:${r}`, 7 * DAY, async () => {
    const query = `[out:json][timeout:20];
(node["amenity"="cinema"](around:${r},${rlat},${rlng});
 way["amenity"="cinema"](around:${r},${rlat},${rlng});
 relation["amenity"="cinema"](around:${r},${rlat},${rlng}););
out center tags 80;`;
    const data = await osmFetch(OVERPASS, { data: query });
    const seen = new Set<string>();
    return ((data?.elements ?? []) as OverpassElement[])
      .map(toCinema)
      .filter((c): c is OsmCinema => !!c && !seen.has(c.name + c.address) && !!seen.add(c.name + c.address));
  });
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// ---------- internals ----------

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function toCinema(e: OverpassElement): OsmCinema | null {
  const t = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (!t.name || lat === undefined || lng === undefined) return null;
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  const address = [street, t['addr:suburb'], t['addr:city']].filter(Boolean).join(', ') || null;
  const url = [t.website, t['contact:website'], t.url].find((u) => u && /^https?:\/\//i.test(u)) ?? null;
  return { id: `${e.type}/${e.id}`, name: t.name, address, lat, lng, url };
}

// deno-lint-ignore no-explicit-any
function toPlace(r: any): Place {
  const a = r.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality ?? r.name ?? null;
  const label = [city, a.state ?? a.county, a.country].filter(Boolean).join(', ') || r.display_name;
  return {
    label,
    city,
    country_code: typeof a.country_code === 'string' ? a.country_code.toUpperCase() : null,
    lat: round2(Number(r.lat)),
    lng: round2(Number(r.lon)),
  };
}

// Stay under Nominatim's 1 request per second (per function instance; the cache
// absorbs repeats).
let lastCall = 0;

async function osmFetch(url: string, params: Record<string, string>) {
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const isOverpass = url === OVERPASS;
  const res = await fetch(isOverpass ? url : `${url}?${new URLSearchParams(params)}`, {
    method: isOverpass ? 'POST' : 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en',
      ...(isOverpass ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: isOverpass ? new URLSearchParams(params) : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    console.error(`OSM ${res.status} ${url}: ${(await res.text()).slice(0, 300)}`);
    throw new HttpError(502, 'Location data is unavailable right now');
  }
  return res.json();
}

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const { data: hit } = await admin.from('places_cache').select('data, fetched_at').eq('cache_key', key).maybeSingle();
  if (hit && Date.now() - Date.parse(hit.fetched_at) < ttl) return hit.data as T;
  const fresh = await load();
  const { error } = await admin.from('places_cache').upsert({ cache_key: key, data: fresh, fetched_at: new Date().toISOString() });
  if (error) console.error('places_cache write failed:', error.message);
  return fresh;
}
