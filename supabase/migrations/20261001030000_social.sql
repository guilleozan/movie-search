-- Social: shared lists and movie nights.
-- Membership checks go through security definer functions so policies on member
-- tables don't recurse. Joining uses a share token checked by an RPC, never a
-- public insert.

-- ---------- shared lists ----------

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text check (char_length(description) <= 300),
  -- Role given to people who join with the share link.
  invite_role text not null default 'editor' check (invite_role in ('editor', 'viewer')),
  share_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now()
);

create table public.list_members (
  list_id uuid not null references public.lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create index list_members_user_idx on public.list_members (user_id);

-- The caller's role in a list, or null.
create function public.list_role(p_list uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.list_members where list_id = p_list and user_id = (select auth.uid());
$$;


create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  tmdb_id integer not null check (tmdb_id > 0),
  media_type text not null default 'movie' check (media_type in ('movie', 'tv')),
  added_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (list_id, media_type, tmdb_id)
);

alter table public.lists enable row level security;
alter table public.list_members enable row level security;
alter table public.list_items enable row level security;

-- The share token is only for the owner (read through list_share_token()).
revoke select on public.lists from authenticated, anon;
grant select (id, owner_id, name, description, invite_role, created_at) on public.lists to authenticated;

create policy "lists_select_members" on public.lists for select to authenticated
  using (public.list_role(id) is not null);
create policy "lists_insert_own" on public.lists for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "lists_update_owner" on public.lists for update to authenticated
  using (public.list_role(id) = 'owner') with check (owner_id = (select auth.uid()));
create policy "lists_delete_owner" on public.lists for delete to authenticated
  using (public.list_role(id) = 'owner');

create policy "list_members_select_members" on public.list_members for select to authenticated
  using (public.list_role(list_id) is not null);
-- The owner changes roles (never to or from owner); anyone can leave; the owner
-- can remove others. Joining goes through join_list().
create policy "list_members_update_owner" on public.list_members for update to authenticated
  using (public.list_role(list_id) = 'owner' and role <> 'owner')
  with check (role in ('editor', 'viewer'));
create policy "list_members_delete" on public.list_members for delete to authenticated
  using ((user_id = (select auth.uid()) and role <> 'owner') or (public.list_role(list_id) = 'owner' and role <> 'owner'));

create policy "list_items_select_members" on public.list_items for select to authenticated
  using (public.list_role(list_id) is not null);
create policy "list_items_insert_editors" on public.list_items for insert to authenticated
  with check (public.list_role(list_id) in ('owner', 'editor') and added_by = (select auth.uid()));
create policy "list_items_delete_editors" on public.list_items for delete to authenticated
  using (public.list_role(list_id) in ('owner', 'editor'));

-- The creator becomes the owner.
create function public.add_list_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.list_members (list_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger lists_add_owner after insert on public.lists
  for each row execute function public.add_list_owner();

create function public.list_share_token(p_list uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select share_token from public.lists where id = p_list and public.list_role(p_list) = 'owner';
$$;

-- Join with a share link. Returns the list id; existing members keep their role.
create function public.join_list(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.lists;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;
  select * into target from public.lists where share_token = p_token;
  if not found then
    raise exception 'This invite link is not valid' using errcode = 'P0002';
  end if;
  insert into public.list_members (list_id, user_id, role)
  values (target.id, (select auth.uid()), target.invite_role)
  on conflict (list_id, user_id) do nothing;
  return target.id;
end;
$$;

-- ---------- movie nights ----------

create table public.movie_nights (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  media_type text not null default 'movie' check (media_type in ('movie', 'tv')),
  list_id uuid references public.lists (id) on delete set null,
  -- lobby: people joining; voting: candidates ready.
  status text not null default 'lobby' check (status in ('lobby', 'voting')),
  share_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now()
);

create table public.movie_night_members (
  movie_night_id uuid not null references public.movie_nights (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (movie_night_id, user_id)
);

create index movie_night_members_user_idx on public.movie_night_members (user_id);

-- The pool everyone votes on, chosen by the `movie-night` Edge Function.
create table public.movie_night_candidates (
  movie_night_id uuid not null references public.movie_nights (id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null check (tmdb_id > 0),
  position smallint not null,
  why text check (char_length(why) <= 200),
  primary key (movie_night_id, media_type, tmdb_id)
);

create table public.movie_night_votes (
  movie_night_id uuid not null references public.movie_nights (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null check (tmdb_id > 0),
  vote boolean not null,
  voted_at timestamptz not null default now(),
  primary key (movie_night_id, user_id, media_type, tmdb_id),
  foreign key (movie_night_id, media_type, tmdb_id)
    references public.movie_night_candidates (movie_night_id, media_type, tmdb_id) on delete cascade
);

create function public.is_night_member(p_night uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.movie_night_members where movie_night_id = p_night and user_id = (select auth.uid()));
$$;

create function public.night_open(p_night uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.movie_nights where id = p_night and expires_at > now());
$$;

alter table public.movie_nights enable row level security;
alter table public.movie_night_members enable row level security;
alter table public.movie_night_candidates enable row level security;
alter table public.movie_night_votes enable row level security;

revoke select on public.movie_nights from authenticated, anon;
grant select (id, host_id, name, media_type, list_id, status, expires_at, created_at) on public.movie_nights to authenticated;

create policy "movie_nights_select_members" on public.movie_nights for select to authenticated
  using (public.is_night_member(id));
create policy "movie_nights_insert_own" on public.movie_nights for insert to authenticated
  with check (host_id = (select auth.uid()) and status = 'lobby' and (list_id is null or public.list_role(list_id) is not null));
create policy "movie_nights_delete_host" on public.movie_nights for delete to authenticated
  using (host_id = (select auth.uid()));

create policy "movie_night_members_select" on public.movie_night_members for select to authenticated
  using (public.is_night_member(movie_night_id));
create policy "movie_night_members_leave" on public.movie_night_members for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "movie_night_candidates_select" on public.movie_night_candidates for select to authenticated
  using (public.is_night_member(movie_night_id));

create policy "movie_night_votes_select" on public.movie_night_votes for select to authenticated
  using (public.is_night_member(movie_night_id));
create policy "movie_night_votes_insert" on public.movie_night_votes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_night_member(movie_night_id) and public.night_open(movie_night_id));
create policy "movie_night_votes_update" on public.movie_night_votes for update to authenticated
  using (user_id = (select auth.uid()) and public.night_open(movie_night_id))
  with check (user_id = (select auth.uid()));

create function public.add_night_host()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.movie_night_members (movie_night_id, user_id) values (new.id, new.host_id);
  return new;
end;
$$;

create trigger movie_nights_add_host after insert on public.movie_nights
  for each row execute function public.add_night_host();

create function public.night_share_token(p_night uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select share_token from public.movie_nights where id = p_night and public.is_night_member(p_night);
$$;

create function public.join_movie_night(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.movie_nights;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;
  select * into target from public.movie_nights where share_token = p_token;
  if not found then
    raise exception 'This invite link is not valid' using errcode = 'P0002';
  end if;
  if target.expires_at <= now() then
    raise exception 'This movie night has ended' using errcode = 'P0001';
  end if;
  insert into public.movie_night_members (movie_night_id, user_id)
  values (target.id, (select auth.uid()))
  on conflict do nothing;
  return target.id;
end;
$$;

revoke execute on function public.join_list(text), public.join_movie_night(text),
  public.list_share_token(uuid), public.night_share_token(uuid) from public, anon;
grant execute on function public.join_list(text), public.join_movie_night(text),
  public.list_share_token(uuid), public.night_share_token(uuid) to authenticated;

-- ---------- names of people you share a list or night with ----------

create function public.shares_group_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.list_members a join public.list_members b using (list_id)
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  ) or exists (
    select 1 from public.movie_night_members a join public.movie_night_members b using (movie_night_id)
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  );
$$;

create policy "profiles_select_group_members" on public.profiles for select to authenticated
  using (public.shares_group_with(id));

-- ---------- realtime ----------

alter publication supabase_realtime add table public.list_items, public.list_members,
  public.movie_night_members, public.movie_night_votes, public.movie_nights;
