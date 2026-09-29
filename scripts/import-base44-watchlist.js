#!/usr/bin/env node
// Import a CSV export of the old Base44 WatchlistItem entity into watchlist_items.
//
// Each row is matched to TMDB by title + year. A row is imported only when exactly
// one TMDB movie has the same (normalised) title and the same release year.
// Everything else is written to <file>.unmatched.csv with the reason, never guessed.
//
// Usage:
//   node scripts/import-base44-watchlist.js --file watchlist.csv --user-email you@example.com [--dry-run]
//   node scripts/import-base44-watchlist.js --file watchlist.csv --user-id <uuid>
//
// Environment:
//   SUPABASE_URL                 e.g. http://127.0.0.1:54321 or https://<ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    service role key (bypasses RLS; keep it private)
//   TMDB_READ_TOKEN              falls back to supabase/functions/.env

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = parseArgs(process.argv.slice(2));
if (!args.file || (!args['user-email'] && !args['user-id'])) {
  console.error('Usage: node scripts/import-base44-watchlist.js --file <csv> (--user-email <email> | --user-id <uuid>) [--dry-run]');
  process.exit(1);
}

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const TMDB_TOKEN = process.env.TMDB_READ_TOKEN ?? readFunctionsEnv('TMDB_READ_TOKEN');
if (!TMDB_TOKEN) fail('TMDB_READ_TOKEN is not set (env or supabase/functions/.env)');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const rows = parseCsv(readFileSync(args.file, 'utf8'));
if (!rows.length) fail('The CSV has no data rows');
console.log(`Read ${rows.length} rows from ${args.file}`);

const userId = args['user-id'] ?? (await findUserId(args['user-email']));
console.log(`Importing for user ${userId}${args['dry-run'] ? ' (dry run, nothing will be written)' : ''}\n`);

const matched = [];
const unmatched = [];
const seen = new Set();

for (const [index, row] of rows.entries()) {
  const title = (field(row, 'title') ?? '').trim();
  const year = (field(row, 'year') ?? '').trim().slice(0, 4);
  const line = index + 2; // header is line 1
  const result = await matchRow(title, year);

  if (result.error) {
    unmatched.push({ ...row, import_line: line, import_error: result.error });
    console.log(`  ✗ line ${line}: "${title}" (${year || 'no year'}) - ${result.error}`);
    continue;
  }
  if (seen.has(result.movie.id)) {
    console.log(`  = line ${line}: "${title}" is a duplicate of an earlier row, skipped`);
    continue;
  }
  seen.add(result.movie.id);
  matched.push(toWatchlistRow(row, result.movie, userId));
  console.log(`  ✓ line ${line}: "${title}" (${year}) -> TMDB ${result.movie.id} "${result.movie.title}"`);
}

console.log(`\nMatched ${matched.length}, unmatched ${unmatched.length}, duplicates ${rows.length - matched.length - unmatched.length}`);

if (unmatched.length) {
  const out = `${args.file}.unmatched.csv`;
  writeFileSync(out, toCsv(unmatched));
  console.log(`Unmatched rows written to ${out}. Fix the title/year there and import that file again.`);
}

if (!args['dry-run'] && matched.length) {
  // ignoreDuplicates: movies already in the user's watchlist are left untouched.
  const { data, error } = await supabase
    .from('watchlist_items')
    .upsert(matched, { onConflict: 'user_id,tmdb_id', ignoreDuplicates: true })
    .select('tmdb_id');
  if (error) fail(`Insert failed: ${error.message}`);
  console.log(`Inserted ${data.length} new watchlist items (${matched.length - data.length} were already there).`);
}

// ---------- matching ----------

/** @returns {Promise<{ movie?: { id: number, title: string }, error?: string }>} */
async function matchRow(title, year) {
  if (!title) return { error: 'missing title' };
  if (!/^\d{4}$/.test(year)) return { error: 'missing or invalid year' };

  const results = await searchTmdb(title, year);
  const wanted = normalise(title);
  const sameTitle = results.filter((m) => normalise(m.title) === wanted || normalise(m.original_title) === wanted);
  const exact = sameTitle.filter((m) => m.release_date?.startsWith(year));

  if (exact.length === 1) return { movie: exact[0] };
  if (exact.length > 1) {
    return { error: `ambiguous: ${exact.map((m) => `${m.id} "${m.title}"`).join(', ')}` };
  }

  // No exact match: search without the year only to suggest a fix, never to import.
  const anyYear = sameTitle.length ? sameTitle : (await searchTmdb(title)).filter(
    (m) => normalise(m.title) === wanted || normalise(m.original_title) === wanted
  );
  if (anyYear.length) {
    const hint = anyYear.slice(0, 3).map((m) => `${m.id} "${m.title}" (${m.release_date?.slice(0, 4) || '?'})`).join(', ');
    return { error: `no ${year} release with this title; did you mean: ${hint}` };
  }
  return { error: 'no TMDB movie with this title' };
}

async function searchTmdb(title, year) {
  // `year` matches any release in that year, which is wider than the primary date.
  const url = new URL('https://api.themoviedb.org/3/search/movie');
  url.searchParams.set('query', title);
  if (year) url.searchParams.set('year', year);
  url.searchParams.set('include_adult', 'false');
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TMDB_TOKEN}`, Accept: 'application/json' } });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) fail(`TMDB search failed (${res.status}) for "${title}"`);
    return (await res.json()).results ?? [];
  }
  fail(`TMDB kept rate-limiting the search for "${title}"`);
}

/** Lowercase, no accents, "&" = "and", only letters and digits. */
function normalise(text = '') {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

function toWatchlistRow(row, movie, userId) {
  const watched = (field(row, 'status') ?? '').trim().toLowerCase() === 'watched';
  const rating = toFiveStars(field(row, 'user_rating'));
  const notes = (field(row, 'notes') ?? '').trim();
  const created = Date.parse(field(row, 'created_date') ?? '');
  return {
    user_id: userId,
    tmdb_id: movie.id,
    status: watched ? 'watched' : 'want_to_watch',
    rating: watched ? rating : null,
    notes: notes ? notes.slice(0, 2000) : null,
    ...(Number.isFinite(created) ? { added_at: new Date(created).toISOString() } : {}),
  };
}

/** Old ratings had no fixed scale: keep 1-5 as is, halve 6-10, ignore anything else. */
function toFiveStars(value) {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0) return null;
  if (n <= 5) return Math.max(1, Math.round(n));
  if (n <= 10) return Math.max(1, Math.round(n / 2));
  return null;
}

// ---------- helpers ----------

async function findUserId(email) {
  const wanted = email.toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`Could not list users: ${error.message}`);
    const user = data.users.find((u) => u.email?.toLowerCase() === wanted);
    if (user) return user.id;
    if (data.users.length < 1000) fail(`No user with email ${email}`);
  }
}

/** Case-insensitive column lookup, so "Title" and "title" both work. */
function field(row, name) {
  const key = Object.keys(row).find((k) => k.trim().toLowerCase() === name);
  return key === undefined ? undefined : row[key];
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

/** RFC 4180 CSV: quoted fields, escaped quotes, commas and newlines inside quotes. */
function parseCsv(text) {
  const records = [];
  let record = [];
  let value = '';
  let quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') quoted = false;
      else value += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { record.push(value); value = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      record.push(value); value = '';
      if (record.some((v) => v !== '')) records.push(record);
      record = [];
    } else value += c;
  }
  record.push(value);
  if (record.some((v) => v !== '')) records.push(record);

  const [header, ...data] = records;
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function toCsv(rows) {
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\n') + '\n';
}

function readFunctionsEnv(name) {
  const path = new URL('../supabase/functions/.env', import.meta.url);
  if (!existsSync(path)) return undefined;
  const line = readFileSync(path, 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) fail(`${name} is not set`);
  return value;
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}
