create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop policy if exists "Users can view their own activities" on public.activities;
drop policy if exists "Users can insert their own activities" on public.activities;
drop policy if exists "Users can delete their own activities" on public.activities;

create policy "Users can view their own activities"
  on public.activities for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
create policy "Users can insert their own activities"
  on public.activities for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
create policy "Users can delete their own activities"
  on public.activities for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

drop policy if exists "Users can view their own completions" on public.task_completions;
drop policy if exists "Users can insert their own completions" on public.task_completions;
drop policy if exists "Users can delete their own completions" on public.task_completions;

create policy "Users can view their own completions"
  on public.task_completions for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
create policy "Users can insert their own completions"
  on public.task_completions for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
create policy "Users can delete their own completions"
  on public.task_completions for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

drop policy if exists "Users can view their own profile" on public.user_profiles;
drop policy if exists "Users can insert their own profile" on public.user_profiles;
drop policy if exists "Users can update their own profile" on public.user_profiles;

create policy "Users can view their own profile"
  on public.user_profiles for select to authenticated
  using (
    (select auth.uid()) = id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
create policy "Users can insert their own profile"
  on public.user_profiles for insert to authenticated
  with check (
    (select auth.uid()) = id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
create policy "Users can update their own profile"
  on public.user_profiles for update to authenticated
  using (
    (select auth.uid()) = id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    (select auth.uid()) = id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

grant select, insert, update on table public.user_profiles to authenticated;
grant select, insert, delete on table public.activities to authenticated;
grant select, insert, delete on table public.task_completions to authenticated;

revoke all on table public.user_profiles from anon;
revoke all on table public.activities from anon;
revoke all on table public.task_completions from anon;
