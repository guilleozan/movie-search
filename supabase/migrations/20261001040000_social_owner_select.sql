-- insert ... returning checks the select policy before the after-insert trigger
-- adds the creator as a member, so owners and hosts can always read their own row.

drop policy "lists_select_members" on public.lists;
create policy "lists_select_members" on public.lists for select to authenticated
  using (owner_id = (select auth.uid()) or public.list_role(id) is not null);

drop policy "movie_nights_select_members" on public.movie_nights;
create policy "movie_nights_select_members" on public.movie_nights for select to authenticated
  using (host_id = (select auth.uid()) or public.is_night_member(id));
