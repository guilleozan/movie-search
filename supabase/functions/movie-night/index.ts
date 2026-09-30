// Movie night: when the host starts, build the pool everyone votes on.
//
// Request:  POST { op: 'start', night_id }   (host only, while in the lobby)
// Response: { count }
//
// The pool blends every member's watchlist and latest picks, plus the attached
// shared list, and prefers titles streaming on any member's service in the host's
// country (or, for films, in cinemas). Titles everyone has already watched, or
// anyone dismissed, are left out.

import { admin, HttpError, serveJson } from '../_shared/http.ts';
import {
  discover, getDetails, type Media, type MovieDetails, releaseList, requireTmdb, toTvGenre,
} from '../_shared/tmdb.ts';

const POOL_SIZE = 25;
const MIN_AVAILABLE = 10;
const MAX_DETAILS = 60;

type Source = { id: number; score: number; why: Set<string> };

serveJson(async (body, userId) => {
  requireTmdb();
  if (body.op !== 'start') throw new HttpError(400, 'Unknown operation');
  const nightId = typeof body.night_id === 'string' && /^[0-9a-f-]{36}$/.test(body.night_id) ? body.night_id : null;
  if (!nightId) throw new HttpError(400, 'Invalid night_id');

  const { data: night, error } = await admin.from('movie_nights')
    .select('id, host_id, media_type, list_id, status, expires_at').eq('id', nightId).maybeSingle();
  if (error) throw error;
  if (!night) throw new HttpError(404, 'Movie night not found');
  if (night.host_id !== userId) throw new HttpError(403, 'Only the host can start');
  if (Date.parse(night.expires_at) <= Date.now()) throw new HttpError(410, 'This movie night has ended');
  if (night.status !== 'lobby') throw new HttpError(409, 'Voting has already started');

  const media = night.media_type as Media;
  const { data: memberRows, error: membersError } = await admin.from('movie_night_members')
    .select('user_id').eq('movie_night_id', nightId);
  if (membersError) throw membersError;
  const members = (memberRows ?? []).map((m) => m.user_id as string);

  const [profilesRes, watchlistRes, dismissedRes, setsRes, tasteRes, listRes] = await Promise.all([
    admin.from('profiles').select('id, display_name, country_code, streaming_services').in('id', members),
    admin.from('watchlist_items').select('user_id, tmdb_id, status').in('user_id', members).eq('media_type', media),
    admin.from('dismissed_movies').select('tmdb_id').in('user_id', members).eq('media_type', media),
    admin.from('recommendation_sets').select('user_id, items, created_at').in('user_id', members)
      .eq('media_type', media).is('seed_tmdb_id', null).order('created_at', { ascending: false }).limit(members.length * 5),
    admin.from('taste_profiles').select('user_id, profile').in('user_id', members),
    night.list_id
      ? admin.from('list_items').select('tmdb_id, list:lists(name)').eq('list_id', night.list_id).eq('media_type', media)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const res of [profilesRes, watchlistRes, dismissedRes, setsRes, tasteRes, listRes]) if (res.error) throw res.error;

  const nameOf = new Map((profilesRes.data ?? []).map((p) => [p.id, p.display_name || 'Someone']));
  const country: string = (profilesRes.data ?? []).find((p) => p.id === night.host_id)?.country_code ?? 'NZ';
  // Which member has which service, for "On Neon (Alice)".
  const serviceOwners = new Map<number, string[]>();
  for (const p of profilesRes.data ?? []) {
    for (const id of (p.streaming_services ?? []) as string[]) {
      const n = Number(id);
      if (Number.isInteger(n)) serviceOwners.set(n, [...(serviceOwners.get(n) ?? []), p.display_name || 'Someone']);
    }
  }

  const pool = new Map<number, Source>();
  const add = (id: number, score: number, why: string) => {
    const s = pool.get(id) ?? { id, score: 0, why: new Set<string>() };
    s.score += score;
    s.why.add(why);
    pool.set(id, s);
  };

  const watchedBy = new Map<number, Set<string>>();
  for (const row of watchlistRes.data ?? []) {
    if (row.status === 'watched') {
      watchedBy.set(row.tmdb_id, (watchedBy.get(row.tmdb_id) ?? new Set()).add(row.user_id));
    } else {
      add(row.tmdb_id, 2, `On ${nameOf.get(row.user_id)}'s watchlist`);
    }
  }
  for (const row of listRes.data ?? []) {
    // deno-lint-ignore no-explicit-any
    add(row.tmdb_id, 2, `In "${(row as any).list?.name ?? 'your list'}"`);
  }
  // Each member's most recent set of picks.
  const seenSets = new Set<string>();
  for (const set of setsRes.data ?? []) {
    if (seenSets.has(set.user_id)) continue;
    seenSets.add(set.user_id);
    for (const item of ((set.items ?? []) as { id: number }[]).slice(0, 12)) add(item.id, 1, `Picked for ${nameOf.get(set.user_id)}`);
  }
  // Too few? Add well-liked titles in the group's favourite genres.
  if (pool.size < POOL_SIZE) {
    const weights = new Map<number, number>();
    for (const t of tasteRes.data ?? []) {
      for (const g of ((t.profile?.genres ?? []) as { id: number; weight: number }[]).slice(0, 4)) {
        const id = media === 'tv' ? toTvGenre(g.id) : g.id;
        if (id !== null) weights.set(id, (weights.get(id) ?? 0) + g.weight);
      }
    }
    const top = [...weights].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id).join('|') || undefined;
    const page = await discover({ sort_by: 'popularity.desc', 'vote_count.gte': media === 'tv' ? 300 : 1000, with_genres: top }, media);
    for (const m of page.results.slice(0, 20)) add(m.id, 0.5, "Popular with your group's taste");
  }

  // Leave out what everyone has seen and anything someone dismissed.
  const dismissed = new Set((dismissedRes.data ?? []).map((d) => d.tmdb_id));
  const everyone = members.length;
  const ranked = [...pool.values()]
    .filter((s) => !dismissed.has(s.id) && (watchedBy.get(s.id)?.size ?? 0) < everyone)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_DETAILS);

  const [details, inCinemas] = await Promise.all([
    getDetails(ranked.map((s) => s.id), media),
    media === 'movie'
      ? Promise.all([releaseList('now_playing', country, 1), releaseList('now_playing', country, 2)])
        .then((pages) => new Set(pages.flatMap((p) => p.results.map((m) => m.id))))
      : Promise.resolve(new Set<number>()),
  ]);

  type Scored = { source: Source; d: MovieDetails; available: boolean };
  const scored: Scored[] = [];
  ranked.forEach((source, i) => {
    const d = details[i];
    if (!d || !d.poster_path) return;
    const entry = d.watch_providers?.[country];
    const onServices = entry
      ? [...entry.flatrate, ...entry.free, ...entry.ads].filter((p, j, all) =>
        serviceOwners.has(p.provider_id) && all.findIndex((q) => q.provider_id === p.provider_id) === j)
      : [];
    for (const p of onServices.slice(0, 2)) {
      source.why.add(`On ${p.provider_name} (${serviceOwners.get(p.provider_id)!.join(', ')})`);
      source.score += 2;
    }
    const cinema = inCinemas.has(d.id);
    if (cinema) {
      source.why.add('In cinemas now');
      source.score += 1.5;
    }
    scored.push({ source, d, available: onServices.length > 0 || cinema });
  });

  const byScore = (a: Scored, b: Scored) => b.source.score - a.source.score || b.d.vote_average - a.d.vote_average;
  const available = scored.filter((s) => s.available).sort(byScore);
  // Prefer what the group can actually watch; top up with the rest if that's too few.
  const chosen = available.length >= MIN_AVAILABLE
    ? available.slice(0, POOL_SIZE)
    : [...available, ...scored.filter((s) => !s.available).sort(byScore)].slice(0, POOL_SIZE);
  if (chosen.length === 0) throw new HttpError(409, 'Not enough titles yet. Ask everyone to save a few to their watchlist first.');

  const rows = chosen.map((s, position) => ({
    movie_night_id: nightId,
    media_type: media,
    tmdb_id: s.d.id,
    position,
    why: [...s.source.why].slice(0, 3).join(' · ').slice(0, 200) || null,
  }));
  const { error: deleteError } = await admin.from('movie_night_candidates').delete().eq('movie_night_id', nightId);
  if (deleteError) throw deleteError;
  const { error: insertError } = await admin.from('movie_night_candidates').insert(rows);
  if (insertError) throw insertError;
  const { error: statusError } = await admin.from('movie_nights').update({ status: 'voting' }).eq('id', nightId);
  if (statusError) throw statusError;

  return { count: rows.length };
});
