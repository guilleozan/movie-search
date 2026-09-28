-- TMDB response caches, written only by the `tmdb` Edge Function (service role).

-- Movie details (with videos, credits, providers, release dates, similar and
-- recommendations appended), trimmed to what the app uses. Fresh for 7 days.
create table public.movies_cache (
  tmdb_id integer primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.movies_cache enable row level security;

-- Movie data is public, so anyone may read it. There are no write policies:
-- only the service role (which bypasses RLS) can insert or update.
create policy "movies_cache_select_all"
  on public.movies_cache for select
  to anon, authenticated
  using (true);

-- List responses (search, discover, now_playing, upcoming, genres, providers),
-- keyed by operation + parameters. Fresh for 6 hours (genres/providers: 7 days).
-- Only the Edge Function reads or writes it, so RLS is on with no policies.
create table public.tmdb_list_cache (
  cache_key text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.tmdb_list_cache enable row level security;
