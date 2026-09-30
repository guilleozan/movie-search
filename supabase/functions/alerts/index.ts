// Alerts: tell users when something on their watchlist becomes available.
//   now_streaming  a title they want is on one of their streaming services
//   in_cinemas     a film they want opens in cinemas in their country this week
//   new_episode    a new episode of a series they're watching is out
//
// Called two ways:
//   POST with header x-alerts-secret: ALERTS_SECRET   -> checks every user (daily cron)
//   POST with a user's JWT                            -> checks that user (when the app opens;
//                                                        at most every 30 minutes)
// The first check for a user only records what's already true, so they aren't told
// about everything at once; later checks announce changes. Email goes out only when
// the user opted in and RESEND_API_KEY / EMAIL_FROM / APP_URL are configured.

import { corsHeaders } from '../_shared/cors.ts';
import { admin, HttpError, json, requireUser } from '../_shared/http.ts';
import { getDetails, type Media, type MovieDetails, requireTmdb } from '../_shared/tmdb.ts';

const SECRET = Deno.env.get('ALERTS_SECRET');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const EMAIL_FROM = Deno.env.get('EMAIL_FROM');
const APP_URL = Deno.env.get('APP_URL');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SELF_CHECK_EVERY = 30 * 60 * 1000;
// Something saved in the last day and a half was probably saved because the user
// already knows where it streams: don't announce that.
const JUST_SAVED = 36 * HOUR;

type Kind = 'now_streaming' | 'in_cinemas' | 'new_episode';
type Draft = {
  kind: Kind;
  media_type: Media;
  tmdb_id: number;
  title: string;
  body: string;
  url: string;
  image_path: string | null;
  dedupe_key: string;
  quiet: boolean; // record as seen, but don't notify
};
type Item = {
  tmdb_id: number;
  media_type: Media;
  status: string;
  added_at: string;
  progress_season: number | null;
  progress_episode: number | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST');
    requireTmdb();
    if (SECRET && req.headers.get('x-alerts-secret') === SECRET) return json(await checkEveryone(), 200);
    const userId = await requireUser(req);
    return json(await checkUser(userId, true), 200);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'Something went wrong' }, 500);
  }
});

async function checkEveryone() {
  const users = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('watchlist_items').select('user_id')
      .neq('status', 'watched').order('user_id').range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) users.add(row.user_id);
    if (!data || data.length < 1000) break;
  }
  let created = 0;
  let failed = 0;
  for (const userId of users) {
    try {
      created += (await checkUser(userId, false)).created;
    } catch (err) {
      failed += 1;
      console.error(`alerts failed for ${userId}:`, err instanceof Error ? err.message : err);
    }
  }
  return { users: users.size, created, failed };
}

async function checkUser(userId: string, self: boolean) {
  const { data: profile, error } = await admin.from('profiles')
    .select('country_code, streaming_services, email_alerts, alerts_checked_at').eq('id', userId).single();
  if (error) throw error;
  if (self && profile.alerts_checked_at && Date.now() - Date.parse(profile.alerts_checked_at) < SELF_CHECK_EVERY) {
    return { created: 0, skipped: true };
  }
  const firstRun = !profile.alerts_checked_at;

  const [itemsRes, seenRes] = await Promise.all([
    admin.from('watchlist_items').select('tmdb_id, media_type, status, added_at, progress_season, progress_episode')
      .eq('user_id', userId).neq('status', 'watched').order('added_at', { ascending: false }).limit(300),
    admin.from('alert_seen').select('key').eq('user_id', userId),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (seenRes.error) throw seenRes.error;
  const items = (itemsRes.data ?? []) as Item[];
  const seen = new Set((seenRes.data ?? []).map((r) => r.key));

  const country: string = profile.country_code ?? 'NZ';
  const services = new Set<number>(((profile.streaming_services ?? []) as string[]).map(Number).filter(Number.isInteger));
  const drafts = await draftsFor(items, country, services);

  const fresh = drafts.filter((d) => !seen.has(d.dedupe_key));
  const toNotify = firstRun ? [] : fresh.filter((d) => !d.quiet);

  if (fresh.length) {
    const { error: seenError } = await admin.from('alert_seen')
      .upsert(fresh.map((d) => ({ user_id: userId, key: d.dedupe_key })), { onConflict: 'user_id,key', ignoreDuplicates: true });
    if (seenError) throw seenError;
  }
  if (toNotify.length) {
    const rows = toNotify.map(({ quiet: _quiet, ...d }) => ({ ...d, user_id: userId }));
    const { error: insertError } = await admin.from('notifications')
      .upsert(rows, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true });
    if (insertError) throw insertError;
  }
  await admin.from('profiles').update({ alerts_checked_at: new Date().toISOString() }).eq('id', userId);

  if (profile.email_alerts && toNotify.length) {
    await sendEmail(userId, toNotify).catch((err) => console.error('alert email failed:', err instanceof Error ? err.message : err));
  }
  return { created: toNotify.length, first_run: firstRun };
}

async function draftsFor(items: Item[], country: string, services: Set<number>): Promise<Draft[]> {
  const ids = (media: Media) => items.filter((i) => i.media_type === media).map((i) => i.tmdb_id);
  const [movies, series] = await Promise.all([
    ids('movie').length ? getDetails(ids('movie')) : Promise.resolve([]),
    ids('tv').length ? getDetails(ids('tv'), 'tv') : Promise.resolve([]),
  ]);
  const details = new Map<string, MovieDetails>();
  for (const d of movies) if (d) details.set(`movie:${d.id}`, d);
  for (const d of series) if (d) details.set(`tv:${d.id}`, d);

  const today = new Date().toISOString().slice(0, 10);
  const daysFrom = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
  const drafts: Draft[] = [];

  for (const item of items) {
    const d = details.get(`${item.media_type}:${item.tmdb_id}`);
    if (!d) continue;
    const base = {
      media_type: item.media_type,
      tmdb_id: item.tmdb_id,
      url: `/${item.media_type}/${item.tmdb_id}`,
      image_path: d.backdrop_path ?? d.poster_path ?? null,
    };
    const justSaved = Date.now() - Date.parse(item.added_at) < JUST_SAVED;

    // On one of their services (subscription, free or with ads).
    const entry = d.watch_providers?.[country];
    if (entry && services.size) {
      const seenProviders = new Set<number>();
      for (const p of [...entry.flatrate, ...entry.free, ...entry.ads]) {
        if (!services.has(p.provider_id) || seenProviders.has(p.provider_id)) continue;
        seenProviders.add(p.provider_id);
        drafts.push({
          ...base,
          kind: 'now_streaming',
          title: `${d.title} is on ${p.provider_name}`,
          body: `It's streaming now on ${p.provider_name}, one of your services.`,
          dedupe_key: `stream:${item.media_type}:${item.tmdb_id}:${p.provider_id}`,
          quiet: justSaved,
        });
      }
    }

    // Opening in cinemas in their country within the last 6 days or next 3.
    if (item.media_type === 'movie') {
      const theatrical = (d.release_dates?.[country] ?? [])
        .filter((r) => r.type === 2 || r.type === 3)
        .map((r) => r.release_date.slice(0, 10))
        .sort()[0];
      if (theatrical && theatrical >= daysFrom(-6) && theatrical <= daysFrom(3)) {
        drafts.push({
          ...base,
          kind: 'in_cinemas',
          title: theatrical <= today ? `${d.title} is in cinemas` : `${d.title} opens in cinemas soon`,
          body: theatrical <= today ? 'Now showing. Check sessions near you.' : `Opens ${formatDay(theatrical)}.`,
          dedupe_key: `cinema:${item.tmdb_id}`,
          quiet: false,
        });
      }
    }

    // A new episode of a series they're watching, aired in the last 10 days.
    const last = d.last_episode;
    if (item.status === 'watching' && last?.air_date && last.air_date >= daysFrom(-10) && last.air_date <= today) {
      const ahead = !item.progress_season ||
        last.season_number > item.progress_season ||
        (last.season_number === item.progress_season && last.episode_number > (item.progress_episode ?? 0));
      if (ahead) {
        drafts.push({
          ...base,
          kind: 'new_episode',
          title: `New episode of ${d.title}`,
          body: `S${last.season_number} E${last.episode_number}${last.name ? ` “${last.name}”` : ''} is out.`,
          dedupe_key: `episode:${item.tmdb_id}:${last.season_number}:${last.episode_number}`,
          quiet: false,
        });
      }
    }
  }
  return drafts;
}

function formatDay(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** One email per check with everything new. Needs RESEND_API_KEY, EMAIL_FROM and APP_URL. */
async function sendEmail(userId: string, alerts: Draft[]) {
  if (!RESEND_API_KEY || !EMAIL_FROM || !APP_URL) return;
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return;
  const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const list = alerts
    .map((a) => `<li style="margin-bottom:12px"><a href="${APP_URL}${a.url}" style="color:#b45309;font-weight:600">${escape(a.title)}</a><br>${escape(a.body)}</li>`)
    .join('');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: data.user.email,
      subject: alerts.length === 1 ? alerts[0].title : `${alerts.length} updates from your watchlist`,
      html: `<p>News from your CineMatch watchlist:</p><ul>${list}</ul><p style="color:#64748b;font-size:12px">You get these because email alerts are on in your profile. <a href="${APP_URL}/profile">Turn them off</a>.</p>`,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
