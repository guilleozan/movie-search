// The `links` provider: works everywhere with no API. Cinemas come from
// OpenStreetMap; showtimes are links to the country's showtimes site (Flicks,
// Fandango...), a web search and the user's saved cinemas.

import { cinemasNear, distanceKm } from '../osm.ts';
import type { CinemaRef, ShowtimeLink, ShowtimesProvider } from './types.ts';

const search = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

// The main showtimes site per country, searched by title (checked working 2026-09-30).
// Countries not listed get the web search only.
const LOCAL_SITES: Record<string, { name: string; search: (title: string) => string }> = {
  NZ: { name: 'Flicks', search: (t) => `https://www.flicks.co.nz/search/?q=${encodeURIComponent(t)}` },
  AU: { name: 'Flicks', search: (t) => `https://www.flicks.com.au/search/?q=${encodeURIComponent(t)}` },
  US: { name: 'Fandango', search: (t) => `https://www.fandango.com/search?q=${encodeURIComponent(t)}&mode=all` },
};

export const linksProvider: ShowtimesProvider = {
  name: 'links',

  async getCinemasNear(lat, lng, radiusKm) {
    const cinemas = await cinemasNear(lat, lng, radiusKm);
    return cinemas
      .map((c) => ({
        provider: 'links',
        id: c.id,
        name: c.name,
        address: c.address,
        lat: c.lat,
        lng: c.lng,
        url: c.url,
        distance_km: Math.round(distanceKm(lat, lng, c.lat, c.lng) * 10) / 10,
      }))
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, 30);
  },

  getShowtimes(cinema) {
    return Promise.resolve({ provider: 'links', showtimes: [], links: cinemaLinks(cinema) });
  },

  getShowtimesForMovie(movie, where, _date, favourites) {
    const place = where.city ?? '';
    const site = LOCAL_SITES[where.country];
    const links: ShowtimeLink[] = [
      ...(site ? [{ kind: 'search' as const, label: `See sessions on ${site.name}`, url: site.search(movie.title) }] : []),
      {
        kind: 'search',
        label: where.city ? `Find showtimes near ${where.city}` : 'Find showtimes',
        url: search(`${movie.title} ${movie.year ?? ''} showtimes ${place}`.replace(/\s+/g, ' ').trim()),
      },
      ...favourites.map((cinema) => ({
        kind: 'cinema' as const,
        label: cinema.name,
        url: cinema.url ?? search(`${cinema.name} ${movie.title} showtimes`),
      })),
    ];
    return Promise.resolve({ provider: 'links', showtimes: [], links });
  },
};

function cinemaLinks(cinema: CinemaRef): ShowtimeLink[] {
  return [
    ...(cinema.url ? [{ kind: 'cinema' as const, label: `${cinema.name} website`, url: cinema.url }] : []),
    { kind: 'search', label: `${cinema.name} showtimes`, url: search(`${cinema.name} showtimes`) },
  ];
}
