// Placeholder for a paid showtimes API (MovieGlu, International Showtimes, ...).
// The owner picks the vendor after checking NZ coverage: see docs/SHOWTIMES_PROVIDERS.md.
//
// To implement one:
//   1. Copy this file to providers/<vendor>.ts and fill in the three methods,
//      mapping the vendor's responses to the types in ./types.ts.
//   2. Register it in providers/index.ts.
//   3. Set SHOWTIMES_PROVIDER=<vendor> and SHOWTIMES_API_KEY as Supabase secrets.
// Keep the `links` results as a fallback: return `links` alongside real showtimes
// so users still have somewhere to go when the vendor has no data for a cinema.

import { HttpError } from '../../_shared/http.ts';
import type { ShowtimesProvider } from './types.ts';

const notReady = () => Promise.reject(new HttpError(501, 'This showtimes provider is not set up yet'));

export const paidApiStub: ShowtimesProvider = {
  name: 'paid-api-stub',
  getCinemasNear: notReady,
  getShowtimes: notReady,
  getShowtimesForMovie: notReady,
};
