// Quiz choices. Genres use TMDB genre ids; mood and era ids must match
// MOODS / ERAS in supabase/functions/recommend/taste.ts.

export const GENRES = [
  { id: 18, label: 'Drama' },
  { id: 53, label: 'Thriller' },
  { id: 878, label: 'Sci-Fi' },
  { id: 35, label: 'Comedy' },
  { id: 10749, label: 'Romance' },
  { id: 27, label: 'Horror' },
  { id: 28, label: 'Action' },
  { id: 80, label: 'Crime' },
  { id: 14, label: 'Fantasy' },
  { id: 16, label: 'Animation' },
  { id: 99, label: 'Documentary' },
  { id: 9648, label: 'Mystery' },
];

export const MOODS = [
  { id: 'cozy', label: 'Cozy & comforting' },
  { id: 'thrilling', label: 'Edge-of-seat thrilling' },
  { id: 'thoughtful', label: 'Slow & thought-provoking' },
  { id: 'funny', label: 'Laugh-out-loud funny' },
  { id: 'dark', label: 'Dark & unsettling' },
  { id: 'uplifting', label: 'Warm & uplifting' },
];

export const ERAS = [
  { id: 'classic', label: 'Classics (pre-1980)' },
  { id: '8090', label: '80s & 90s' },
  { id: '2000s', label: '2000s' },
  { id: 'recent', label: 'Recent (last 10 years)' },
  { id: 'mixed', label: 'Mix it up' },
];

/** Home "context" chips; ids match CONTEXTS in the recommend function. */
export const CONTEXTS = [
  { id: 'home', label: 'Tonight at home' },
  { id: 'cinemas', label: 'In cinemas' },
  { id: 'friends', label: 'With friends' },
  { id: 'short', label: 'Short (< 100 min)' },
];

/** Occasions that apply to series (no cinemas, no "short"). */
export const SERIES_CONTEXTS = new Set(['home', 'friends']);

export const MAX_FAVORITES = 5;
