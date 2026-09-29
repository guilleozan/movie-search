-- Recommendations: quiz answers, the taste profile built from them (plus ratings
-- and the watchlist), dismissed movies, and cached recommendation sets.

-- Latest quiz answers per user: { genres: int[], mood, era, favorites: int[] } (TMDB ids).
create table public.quiz_answers (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 8192),
  updated_at timestamptz not null default now()
);

alter table public.quiz_answers enable row level security;

create policy "quiz_answers_select_own"
  on public.quiz_answers for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "quiz_answers_insert_own"
  on public.quiz_answers for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "quiz_answers_update_own"
  on public.quiz_answers for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "quiz_answers_delete_own"
  on public.quiz_answers for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Keep updated_at honest on every change.
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger quiz_answers_touch_updated_at
  before insert or update on public.quiz_answers
  for each row execute function public.touch_updated_at();

-- Summary built by the `recommend` Edge Function. Users can read theirs; only the
-- function (service role) writes it.
create table public.taste_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  profile jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.taste_profiles enable row level security;

create policy "taste_profiles_select_own"
  on public.taste_profiles for select
  to authenticated
  using (user_id = (select auth.uid()));

-- "Not interested": never recommend these again.
create table public.dismissed_movies (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tmdb_id integer not null check (tmdb_id > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, tmdb_id)
);

alter table public.dismissed_movies enable row level security;

create policy "dismissed_movies_select_own"
  on public.dismissed_movies for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "dismissed_movies_insert_own"
  on public.dismissed_movies for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "dismissed_movies_delete_own"
  on public.dismissed_movies for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Cached results of the `recommend` function, per user and request. `fingerprint`
-- hashes the inputs (quiz answers and ratings), so a change to either skips the cache.
-- Written only by the function; users can read their own.
create table public.recommendation_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  context text not null,
  seed_tmdb_id integer,
  fingerprint text not null,
  ranked_by text not null check (ranked_by in ('llm', 'fallback')),
  items jsonb not null,
  created_at timestamptz not null default now()
);

create index recommendation_sets_user_created_idx on public.recommendation_sets (user_id, created_at desc);

alter table public.recommendation_sets enable row level security;

create policy "recommendation_sets_select_own"
  on public.recommendation_sets for select
  to authenticated
  using (user_id = (select auth.uid()));
