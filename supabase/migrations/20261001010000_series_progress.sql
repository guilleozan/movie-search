-- Series progress: a "watching" status and the last episode watched.

alter table public.watchlist_items drop constraint watchlist_items_status_check;
alter table public.watchlist_items
  add constraint watchlist_items_status_check check (status in ('want_to_watch', 'watching', 'watched'));

alter table public.watchlist_items
  -- Last episode watched (season 1+, episode 1+). Series only.
  add column progress_season smallint check (progress_season >= 1),
  add column progress_episode smallint check (progress_episode >= 1),
  add constraint progress_only_for_series check (
    media_type = 'tv' or (progress_season is null and progress_episode is null)
  ),
  add constraint progress_complete check ((progress_season is null) = (progress_episode is null));
