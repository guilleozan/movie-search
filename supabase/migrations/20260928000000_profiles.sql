-- Profiles: one row per auth user, created automatically on sign up.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  country_code text not null default 'NZ' check (country_code ~ '^[A-Z]{2}$'),
  city text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  streaming_services text[] not null default '{}',
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read their own profile, and anyone signed in can read public profiles.
create policy "profiles_select_own_or_public"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or is_public);

-- Users can update only their own profile. Rows are inserted by the trigger below
-- and deleted by the cascade from auth.users, so there are no insert/delete policies.
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Create a profile when a user signs up. Google sign-ups carry full_name/avatar_url
-- in the user metadata; email sign-ups fall back to the part of the email before "@".
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
