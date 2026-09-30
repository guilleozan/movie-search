// The common interface every showtimes provider implements. The active one is
// chosen with the SHOWTIMES_PROVIDER secret (see ./index.ts).

export type Cinema = {
  provider: string;
  /** The provider's id for this cinema (OSM element id for `links`). */
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  distance_km: number | null;
  /** The cinema's own website, when known. */
  url: string | null;
};

/** Enough to build links or look a cinema up again. */
export type CinemaRef = Pick<Cinema, 'provider' | 'id' | 'name' | 'url'>;

export type Showtime = {
  cinema_id: string;
  cinema_name: string;
  /** ISO date-time in the cinema's local time zone. */
  starts_at: string;
  /** e.g. "2D", "IMAX", "Dolby Atmos". */
  format: string | null;
  booking_url: string | null;
};

export type ShowtimeLink = { label: string; url: string; kind: 'search' | 'cinema' };

/**
 * Real times when the provider has them, and links either way. The `links`
 * provider only ever returns links.
 */
export type ShowtimesResult = { provider: string; showtimes: Showtime[]; links: ShowtimeLink[] };

export type MovieRef = { tmdbId: number; title: string; year: string | null };

/** Where the user is. `lat`/`lng` are null when they only picked a country. */
export type Where = { lat: number | null; lng: number | null; city: string | null; country: string };

export interface ShowtimesProvider {
  name: string;
  getCinemasNear(lat: number, lng: number, radiusKm: number): Promise<Cinema[]>;
  /** `date` is YYYY-MM-DD in the user's local time. */
  getShowtimes(cinema: CinemaRef, date: string): Promise<ShowtimesResult>;
  getShowtimesForMovie(movie: MovieRef, where: Where, date: string, favourites: CinemaRef[]): Promise<ShowtimesResult>;
}
