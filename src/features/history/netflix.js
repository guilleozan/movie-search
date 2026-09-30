// Parse Netflix's "viewing activity" CSV (Account > Profile > Viewing activity >
// Download all) into unique movies and series. Everything runs in the browser;
// only the titles are sent on for matching.
//
// Two formats exist:
//   NetflixViewingHistory.csv  Title,Date            "Dark: Season 1: Secrets","14/3/24"
//   ViewingActivity.csv        ...,Start Time,...,Title,...  (from a full data request)

// A segment like "Season 2", "Limited Series" or "Part 1" marks a series episode.
const SERIES_MARKER = /^(season|series|part|volume|vol\.|chapter|book|collection|limited series|miniseries|temporada|staffel|saison)\b/i;

/**
 * @typedef {{ key: string, media: 'movie' | 'tv', name: string, alt: string | null, count: number, lastWatched: string | null }} WatchedTitle
 * `alt`: a second name to try when `name` doesn't match. For "Something: Else" with
 * no season marker (a film with a subtitle, or a series episode) it is the part
 * before the colon, tried as a series; for series it is the shortest title.
 */

/**
 * @param {string} text CSV contents
 * @param {string} country the user's country, to read ambiguous dates like 3/4/24
 * @returns {{ titles: WatchedTitle[], rows: number }}
 */
export function parseNetflixCsv(text, country) {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ''));
  if (!header) throw new Error('The file is empty.');
  const col = (name) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const titleCol = col('title');
  const dateCol = col('date') >= 0 ? col('date') : col('start time');
  if (titleCol < 0) throw new Error("This doesn't look like a Netflix viewing history file (no Title column).");

  const byKey = new Map();
  let count = 0;
  for (const row of rows) {
    const raw = row[titleCol]?.trim();
    if (!raw) continue;
    count += 1;
    const { media, name, alt } = classify(raw);
    const key = `${media}:${name.toLowerCase()}`;
    const date = dateCol >= 0 ? parseDate(row[dateCol], country) : null;
    const entry = byKey.get(key);
    if (entry) {
      entry.count += 1;
      if (date && (!entry.lastWatched || date > entry.lastWatched)) entry.lastWatched = date;
    } else {
      byKey.set(key, { key, media, name, alt, count: 1, lastWatched: date });
    }
  }
  // Most recently watched first.
  const titles = [...byKey.values()].sort((a, b) => (b.lastWatched ?? '').localeCompare(a.lastWatched ?? ''));
  return { titles, rows: count };
}

/** @returns {{ media: 'movie' | 'tv', name: string, alt: string | null }} */
export function classify(title) {
  const parts = title.split(': ');
  const marker = parts.findIndex((p, i) => i > 0 && SERIES_MARKER.test(p));
  // "Star Wars: The Clone Wars: Season 1" -> "Star Wars: The Clone Wars"; for
  // "Stranger Things: Stranger Things 4: Chapter One" keep "Stranger Things" as a fallback.
  if (marker > 0) return { media: 'tv', name: parts.slice(0, marker).join(': '), alt: marker > 1 ? parts[0] : null };
  if (parts.length >= 3) return { media: 'tv', name: parts[0], alt: null };
  if (parts.length === 2) return { media: 'movie', name: title, alt: parts[0] };
  return { media: 'movie', name: title, alt: null };
}

/**
 * "14/3/24", "3/14/24", "2024-03-14" or "2024-03-14 20:15:00" -> ISO date-time at noon
 * in the viewer's time zone (so the day doesn't shift when shown), or null if unreadable.
 */
export function parseDate(value, country) {
  const s = value?.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return localNoon(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (!m) return null;
  let [a, b] = [Number(m[1]), Number(m[2])];
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  // Day first unless the numbers say otherwise, or the country writes month first.
  const monthFirst = b > 12 || (a <= 12 && country === 'US');
  const [day, month] = monthFirst ? [b, a] : [a, b];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return localNoon(year, month, day);
}

function localNoon(year, month, day) {
  const date = new Date(year, month - 1, day, 12);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Minimal RFC 4180 CSV: quoted fields, escaped quotes, commas and newlines inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}
