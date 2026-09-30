-- Cinemas: favourite cinemas per user, and a cache for place lookups
-- (OpenStreetMap geocoding and cinema searches) made by the `showtimes` function.

create table public.favourite_cinemas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (char_length(provider) between 1 and 40),
  external_id text not null check (char_length(external_id) between 1 and 200),
  name text not null check (char_length(name) between 1 and 200),
  address text check (char_length(address) <= 400),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  url text check (url ~ '^https?://' and char_length(url) <= 500),
  created_at timestamptz not null default now(),
  unique (user_id, provider, external_id)
);

create index favourite_cinemas_user_idx on public.favourite_cinemas (user_id, created_at);

alter table public.favourite_cinemas enable row level security;

create policy "favourite_cinemas_select_own"
  on public.favourite_cinemas for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "favourite_cinemas_insert_own"
  on public.favourite_cinemas for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "favourite_cinemas_update_own"
  on public.favourite_cinemas for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "favourite_cinemas_delete_own"
  on public.favourite_cinemas for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- OpenStreetMap asks API users to cache results. Only the Edge Function reads or
-- writes this table, so RLS is on with no policies.
create table public.places_cache (
  cache_key text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.places_cache enable row level security;
