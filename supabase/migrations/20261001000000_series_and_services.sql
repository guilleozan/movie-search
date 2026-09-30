-- Series support, where something was watched, and streaming services.
-- TMDB movie and series ids overlap, so every table keyed by tmdb_id gains media_type.

-- Details cache: one row per (media_type, tmdb_id).
alter table public.movies_cache
  add column media_type text not null default 'movie' check (media_type in ('movie', 'tv'));
alter table public.movies_cache drop constraint movies_cache_pkey;
alter table public.movies_cache add primary key (media_type, tmdb_id);

-- Watchlist / watch history.
alter table public.watchlist_items
  add column media_type text not null default 'movie' check (media_type in ('movie', 'tv')),
  -- Where they watched it: a streaming service name, 'Cinema' or 'Other'.
  add column watched_on text check (char_length(watched_on) between 1 and 60);
alter table public.watchlist_items drop constraint watchlist_items_user_id_tmdb_id_key;
alter table public.watchlist_items add constraint watchlist_items_user_media_tmdb_key unique (user_id, media_type, tmdb_id);

-- Imported history (e.g. Netflix) carries the real watch date, so an insert may
-- set a past watched_at. Otherwise the rules are as before: set when first marked
-- watched, kept on later edits, cleared when moved back to "want to watch".
create or replace function public.set_watched_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'watched' then
    new.watched_at := null;
  elsif tg_op = 'INSERT' then
    if new.watched_at is null or new.watched_at > now() then
      new.watched_at := now();
    end if;
  elsif old.status is distinct from 'watched' then
    new.watched_at := now();
  else
    new.watched_at := old.watched_at;
  end if;
  return new;
end;
$$;

-- Dismissed ("not interested").
alter table public.dismissed_movies
  add column media_type text not null default 'movie' check (media_type in ('movie', 'tv'));
alter table public.dismissed_movies drop constraint dismissed_movies_pkey;
alter table public.dismissed_movies add primary key (user_id, media_type, tmdb_id);

-- Recommendation sets are per media type too.
alter table public.recommendation_sets
  add column media_type text not null default 'movie' check (media_type in ('movie', 'tv'));

-- Streaming services the user pays for: TMDB provider ids (as text, the column's
-- existing type). Bounded so the array can't grow without limit.
alter table public.profiles
  add constraint profiles_streaming_services_size check (cardinality(streaming_services) <= 40);
