// Viewing-history files from other services, detected by their CSV header:
//
//   Netflix     NetflixViewingHistory.csv / ViewingActivity.csv   (see ./netflix.js)
//   Letterboxd  ratings.csv, diary.csv or watched.csv from the export zip:
//               Date,Name,Year,Letterboxd URI[,Rating][,Rewatch,Tags,Watched Date]   rating 0.5-5
//   IMDb        Your ratings -> Export:
//               Const,Your Rating,Date Rated,Title,...,Title Type,...,Year,...       rating 1-10
//
// Every parser returns the same WatchedTitle shape so matching and review are shared.

import { parseCsv, parseDate, parseNetflixCsv } from '@/features/history/netflix';

/**
 * @typedef {import('./netflix').WatchedTitle & { year?: number | null, imdbId?: string | null, rating?: number | null }} ImportTitle
 * @typedef {'netflix' | 'letterboxd' | 'imdb'} ImportSource
 */

export const SOURCES = {
  netflix: { label: 'Netflix', watchedOn: 'Netflix' },
  letterboxd: { label: 'Letterboxd', watchedOn: null },
  imdb: { label: 'IMDb', watchedOn: null },
};

// IMDb title types we import; episodes, games and podcasts are skipped.
const IMDB_TYPES = {
  movie: 'movie', 'tv movie': 'movie', short: 'movie', video: 'movie', 'tv special': 'movie',
  'tv series': 'tv', 'tv mini series': 'tv', 'tv miniseries': 'tv',
};

/**
 * Parse one or more exported files (e.g. Letterboxd's ratings.csv and watched.csv
 * together). Titles found in several files are merged, keeping any rating.
 *
 * @param {string[]} texts
 * @param {string} country
 * @returns {{ source: ImportSource, titles: ImportTitle[], rows: number }}
 */
export function parseHistoryFiles(texts, country) {
  const merged = new Map();
  let source = null;
  let rows = 0;
  for (const text of texts) {
    const result = parseOne(text.replace(/^﻿/, ''), country);
    if (source && result.source !== source) throw new Error('Choose files from one service at a time.');
    source = result.source;
    rows += result.rows;
    for (const t of result.titles) {
      const seen = merged.get(t.key);
      if (!seen) merged.set(t.key, t);
      else {
        seen.count += t.count;
        seen.rating ??= t.rating;
        if (t.lastWatched && (!seen.lastWatched || t.lastWatched > seen.lastWatched)) seen.lastWatched = t.lastWatched;
      }
    }
  }
  const titles = [...merged.values()].sort((a, b) => (b.lastWatched ?? '').localeCompare(a.lastWatched ?? ''));
  return { source, titles, rows };
}

function parseOne(text, country) {
  const firstLine = text.slice(0, text.search(/\r?\n/) >>> 0).toLowerCase();
  if (firstLine.includes('letterboxd uri')) return { source: 'letterboxd', ...parseLetterboxd(text) };
  if (firstLine.includes('const') && firstLine.includes('your rating')) return { source: 'imdb', ...parseImdb(text) };
  if (firstLine.includes('title')) return { source: 'netflix', ...parseNetflixCsv(text, country) };
  throw new Error("That file isn't a Netflix, Letterboxd or IMDb export we recognise.");
}

/** Letterboxd is films only. Ratings go in half stars from 0.5 to 5. */
function parseLetterboxd(text) {
  const { header, rows } = table(text);
  const name = header.indexOf('name');
  const year = header.indexOf('year');
  const rating = header.indexOf('rating');
  const date = header.indexOf('watched date') >= 0 ? header.indexOf('watched date') : header.indexOf('date');
  const titles = rows
    .filter((r) => r[name]?.trim())
    .map((r) => {
      const y = Number(r[year]) || null;
      const title = r[name].trim();
      return {
        key: `movie:${title.toLowerCase()}:${y ?? ''}`,
        media: 'movie',
        name: title,
        alt: null,
        year: y,
        imdbId: null,
        rating: stars(Number(r[rating]), 5),
        count: 1,
        lastWatched: parseDate(r[date], 'NZ'),
      };
    });
  return { titles, rows: rows.length };
}

/** IMDb gives exact ids (matched with TMDB's /find), ratings from 1 to 10. */
function parseImdb(text) {
  const { header, rows } = table(text);
  const id = header.indexOf('const');
  const title = header.indexOf('title');
  const type = header.indexOf('title type');
  const year = header.indexOf('year');
  const rating = header.indexOf('your rating');
  const date = header.indexOf('date rated');
  const titles = [];
  for (const r of rows) {
    const media = IMDB_TYPES[r[type]?.trim().toLowerCase()];
    if (!media || !/^tt\d+$/.test(r[id] ?? '')) continue;
    titles.push({
      key: `${media}:${r[id]}`,
      media,
      name: r[title]?.trim() ?? r[id],
      alt: null,
      year: Number(r[year]) || null,
      imdbId: r[id],
      rating: stars(Number(r[rating]), 10),
      count: 1,
      lastWatched: parseDate(r[date], 'NZ'),
    });
  }
  return { titles, rows: rows.length };
}

/** A rating on a 0-`max` scale -> 1-5 stars, or null when there isn't one. */
function stars(value, max) {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(5, Math.max(1, Math.round((value / max) * 5)));
}

function table(text) {
  const [head = [], ...rows] = parseCsv(text);
  return { header: head.map((h) => h.trim().toLowerCase()), rows };
}
