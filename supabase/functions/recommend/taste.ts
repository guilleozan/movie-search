// Quiz definitions and the taste profile built from quiz answers, ratings,
// reactions and the watchlist (movies and series alike: series genres are mapped
// onto movie genres, so one set of weights serves both).

import { HttpError } from '../_shared/http.ts';
import { getDetails, type Media, type MovieDetails, toMovieGenre } from '../_shared/tmdb.ts';

// TMDB genre ids used below.
const G = {
  action: 28, animation: 16, comedy: 35, crime: 80, documentary: 99, drama: 18, family: 10751,
  fantasy: 14, history: 36, horror: 27, music: 10402, mystery: 9648, romance: 10749, scifi: 878, thriller: 53,
};

/** Quiz moods: the label the LLM sees, genres that fit, and genres that clash. */
export const MOODS: Record<string, { label: string; boost: number[]; avoid: number[] }> = {
  cozy: { label: 'cozy and comforting', boost: [G.comedy, G.romance, G.animation, G.family], avoid: [G.horror] },
  thrilling: { label: 'edge-of-seat thrilling', boost: [G.thriller, G.action, G.scifi, G.crime], avoid: [] },
  thoughtful: { label: 'slow and thought-provoking', boost: [G.drama, G.documentary, G.mystery, G.history], avoid: [] },
  funny: { label: 'laugh-out-loud funny', boost: [G.comedy, G.animation], avoid: [G.horror] },
  dark: { label: 'dark and unsettling', boost: [G.horror, G.thriller, G.crime], avoid: [G.family] },
  uplifting: { label: 'warm and uplifting', boost: [G.comedy, G.romance, G.family, G.music], avoid: [G.horror] },
};

const thisYear = new Date().getUTCFullYear();

/** Quiz eras: the label the LLM sees and the release date range for TMDB discover. */
export const ERAS: Record<string, { label: string; from?: string; to?: string }> = {
  classic: { label: 'classics from before 1980', to: '1979-12-31' },
  '8090': { label: 'the 80s and 90s', from: '1980-01-01', to: '1999-12-31' },
  '2000s': { label: 'the 2000s', from: '2000-01-01', to: '2009-12-31' },
  recent: { label: 'the last 10 years', from: `${thisYear - 10}-01-01` },
  mixed: { label: 'any era' },
};

export type QuizAnswers = { genres: number[]; mood: string | null; era: string | null; favorites: number[] };

export type TasteProfile = {
  genres: { id: number; name: string; weight: number }[];
  disliked_genres: { id: number; name: string }[];
  liked: { id: number; media: Media; title: string; year: string; why: string }[];
  disliked: { id: number; media: Media; title: string; year: string }[];
  mood: string | null;
  era: string | null;
  decades: string[];
  runtime_median: number | null;
  counts: { watched: number; rated: number; want_to_watch: number };
};

export type WatchlistRow = {
  tmdb_id: number;
  media_type: Media;
  status: 'want_to_watch' | 'watched';
  rating: number | null;
  reaction: 'loved' | 'fine' | 'not_for_me' | null;
};

/** Validate stored quiz answers; unknown values are dropped rather than trusted. */
export function parseQuiz(raw: unknown): QuizAnswers | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const ids = (v: unknown, max: number) =>
    Array.isArray(v) ? [...new Set(v.filter((x) => Number.isInteger(x) && x > 0 && x < 1e9))].slice(0, max) as number[] : [];
  return {
    genres: ids(a.genres, 12),
    mood: typeof a.mood === 'string' && Object.hasOwn(MOODS, a.mood) ? a.mood : null,
    era: typeof a.era === 'string' && Object.hasOwn(ERAS, a.era) ? a.era : null,
    favorites: ids(a.favorites, 5),
  };
}

/**
 * How much a watchlist row says the user likes that movie: positive for loved or
 * highly rated, negative for low ratings and "not for me", small for saved ones.
 */
function signal(row: WatchlistRow): number {
  if (row.status === 'want_to_watch') return 0.5;
  let s = row.rating ? row.rating - 3 : 0;
  if (row.reaction === 'loved') s += 1.5;
  if (row.reaction === 'not_for_me') s -= 2;
  if (!row.rating && !row.reaction) s = 0.5;
  return s;
}

const year = (d: MovieDetails) => d.release_date?.slice(0, 4) ?? '';

export async function buildTasteProfile(
  quiz: QuizAnswers | null,
  watchlist: WatchlistRow[],
  genreNames: Map<number, string>,
): Promise<{ profile: TasteProfile; details: Map<string, MovieDetails> }> {
  const watched = watchlist.filter((r) => r.status === 'watched');
  const saved = watchlist.filter((r) => r.status === 'want_to_watch');
  if (!quiz && watchlist.length === 0) throw new HttpError(409, 'Take the quiz first');

  // Bounded so a huge watchlist can't make this slow: recent ratings matter most.
  const favorites = quiz?.favorites ?? [];
  const rows = [...watched.slice(0, 40), ...saved.slice(0, 30)];
  const idsOf = (media: Media) => [...new Set(rows.filter((r) => r.media_type === media).map((r) => r.tmdb_id))];
  const [movies, series] = await Promise.all([
    getDetails([...new Set([...favorites, ...idsOf('movie')])]),
    idsOf('tv').length ? getDetails(idsOf('tv'), 'tv') : Promise.resolve([]),
  ]);
  // Keyed "movie:123" / "tv:456": TMDB movie and series ids overlap.
  const details = new Map<string, MovieDetails>();
  for (const d of movies) if (d) details.set(`movie:${d.id}`, d);
  for (const d of series) if (d) details.set(`tv:${d.id}`, { ...d, media_type: 'tv' });

  const weights = new Map<number, number>();
  const bump = (id: number, by: number) => weights.set(id, (weights.get(id) ?? 0) + by);
  for (const id of quiz?.genres ?? []) bump(id, 3);
  const mood = quiz?.mood ? MOODS[quiz.mood] : null;
  for (const id of mood?.boost ?? []) bump(id, 1);
  for (const id of mood?.avoid ?? []) bump(id, -1.5);

  // [movie, how much they like it, why it counts as liked]
  const scored: [MovieDetails, number, string][] = [];
  for (const id of favorites) {
    const d = details.get(`movie:${id}`);
    if (d) scored.push([d, 2.5, 'one of their favourites']);
  }
  for (const row of rows) {
    const d = details.get(`${row.media_type}:${row.tmdb_id}`);
    if (!d || (row.media_type === 'movie' && favorites.includes(row.tmdb_id))) continue;
    const why = row.status === 'want_to_watch'
      ? 'on their watchlist'
      : [row.rating && `rated ${row.rating}/5`, row.reaction === 'loved' && 'loved it', row.reaction === 'not_for_me' && 'not for them']
        .filter(Boolean).join(', ') || 'watched';
    scored.push([d, signal(row), why]);
  }
  for (const [d, s] of scored) for (const g of d.genres) bump(toMovieGenre(g.id), s * 0.5);

  const liked = scored.filter(([, s]) => s >= 1).sort((a, b) => b[1] - a[1]);
  const disliked = scored.filter(([, s]) => s <= -1).sort((a, b) => a[1] - b[1]);

  const quizGenres = new Set(quiz?.genres ?? []);
  const named = (id: number) => genreNames.get(id) ?? `Genre ${id}`;
  const genres = [...weights]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, w]) => ({ id, name: named(id), weight: Math.round(w * 10) / 10 }));
  const dislikedGenres = [...weights]
    .filter(([id, w]) => w <= -1 && !quizGenres.has(id))
    .map(([id]) => ({ id, name: named(id) }));

  // Decades: from the quiz era, else the two most common among liked movies.
  let decades: string[] = [];
  if (quiz?.era && quiz.era !== 'mixed') {
    decades = [ERAS[quiz.era].label];
  } else {
    const counts = new Map<string, number>();
    for (const [d] of liked) if (year(d)) counts.set(`${year(d).slice(0, 3)}0s`, (counts.get(`${year(d).slice(0, 3)}0s`) ?? 0) + 1);
    decades = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([decade]) => decade);
  }

  // Movies only: episode lengths would drag the typical film runtime down.
  const runtimes = liked.filter(([d]) => d.media_type !== 'tv').map(([d]) => d.runtime).filter((r): r is number => !!r).sort((a, b) => a - b);

  return {
    details,
    profile: {
      genres,
      disliked_genres: dislikedGenres,
      liked: liked.slice(0, 10).map(([d, , why]) => ({ id: d.id, media: d.media_type ?? 'movie', title: d.title, year: year(d), why })),
      disliked: disliked.slice(0, 10).map(([d]) => ({ id: d.id, media: d.media_type ?? 'movie', title: d.title, year: year(d) })),
      mood: quiz?.mood ?? null,
      era: quiz?.era ?? null,
      decades,
      runtime_median: runtimes.length ? runtimes[Math.floor(runtimes.length / 2)] : null,
      counts: { watched: watched.length, rated: watched.filter((r) => r.rating).length, want_to_watch: saved.length },
    },
  };
}
