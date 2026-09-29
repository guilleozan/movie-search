-- Watchlist: one row per (user, movie). Movie data itself comes from TMDB by tmdb_id.

create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tmdb_id integer not null check (tmdb_id > 0),
  status text not null default 'want_to_watch' check (status in ('want_to_watch', 'watched')),
  rating smallint check (rating between 1 and 5),
  reaction text check (reaction in ('loved', 'fine', 'not_for_me')),
  notes text check (char_length(notes) <= 2000),
  added_at timestamptz not null default now(),
  watched_at timestamptz,
  unique (user_id, tmdb_id),
  -- Ratings and reactions only make sense once the movie has been watched.
  constraint rating_only_when_watched check (status = 'watched' or (rating is null and reaction is null))
);

create index watchlist_items_user_added_idx on public.watchlist_items (user_id, added_at desc);

-- Keep watched_at in sync with status, so clients can't forget or fake it.
create function public.set_watched_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'watched' and (tg_op = 'INSERT' or old.status is distinct from 'watched') then
    new.watched_at := now();
  elsif new.status <> 'watched' then
    new.watched_at := null;
  elsif tg_op = 'UPDATE' then
    new.watched_at := old.watched_at;
  end if;
  return new;
end;
$$;

create trigger watchlist_items_set_watched_at
  before insert or update on public.watchlist_items
  for each row execute function public.set_watched_at();

alter table public.watchlist_items enable row level security;

create policy "watchlist_select_own"
  on public.watchlist_items for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "watchlist_insert_own"
  on public.watchlist_items for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "watchlist_update_own"
  on public.watchlist_items for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "watchlist_delete_own"
  on public.watchlist_items for delete
  to authenticated
  using (user_id = (select auth.uid()));
