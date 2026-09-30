-- Alerts: notifications created by the `alerts` Edge Function (daily, and when the
-- app opens), plus what each user has already been told about.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('now_streaming', 'in_cinemas', 'new_episode')),
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null check (tmdb_id > 0),
  title text not null check (char_length(title) <= 200),
  body text not null check (char_length(body) <= 400),
  -- In-app path to open, e.g. /movie/123.
  url text not null check (url ~ '^/[a-z]'),
  image_path text check (image_path ~ '^/'),
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Users can mark theirs as read (read_at is the only column they may change) and
-- delete them. Only the Edge Function (service role) creates them.
create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "notifications_delete_own"
  on public.notifications for delete
  to authenticated
  using (user_id = (select auth.uid()));

revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

-- Things already known per user (e.g. "on Neon"), so a change is only announced
-- once, and the first check doesn't announce what was already true.
create table public.alert_seen (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.alert_seen enable row level security; -- service role only

alter table public.profiles
  add column email_alerts boolean not null default false,
  add column alerts_checked_at timestamptz;

-- Daily run at 18:00 UTC (early morning in New Zealand). The function URL and
-- shared secret live in Vault, set once per environment (see README):
--   select vault.create_secret('<project url>', 'project_url');
--   select vault.create_secret('<ALERTS_SECRET>', 'alerts_secret');
-- Until they exist the job does nothing.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function public.run_daily_alerts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_secret');
begin
  if base_url is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url := base_url || '/functions/v1/alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-alerts-secret', secret),
    body := '{"all": true}'::jsonb,
    timeout_milliseconds := 300000
  );
end;
$$;

revoke execute on function public.run_daily_alerts() from public, anon, authenticated;

select cron.schedule('daily-alerts', '0 18 * * *', 'select public.run_daily_alerts()');
