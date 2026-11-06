begin;
select plan(34);

select ok(
  exists (
    select 1
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname = 'update_updated_at_column'
      and 'search_path=""' = any(coalesce(pg_proc.proconfig, array[]::text[]))
  ),
  'update_updated_at_column fixes its search_path'
);

select ok(position('( SELECT auth.uid()' in coalesce(qual, with_check, '')) > 0, policyname || ' initializes auth.uid once')
from pg_policies
where schemaname = 'public'
  and tablename = 'activities'
  and policyname in (
    'Users can view their own activities',
    'Users can insert their own activities',
    'Users can delete their own activities'
  )
order by policyname;

select ok(position('( SELECT auth.uid()' in coalesce(qual, with_check, '')) > 0, policyname || ' initializes auth.uid once')
from pg_policies
where schemaname = 'public'
  and tablename = 'task_completions'
  and policyname in (
    'Users can view their own completions',
    'Users can insert their own completions',
    'Users can delete their own completions'
  )
order by policyname;

select ok(position('( SELECT auth.uid()' in coalesce(qual, with_check, '')) > 0, policyname || ' initializes auth.uid once')
from pg_policies
where schemaname = 'public'
  and tablename = 'user_profiles'
  and policyname in (
    'Users can view their own profile',
    'Users can insert their own profile',
    'Users can update their own profile'
  )
order by policyname;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'release-guest@example.test', '', now(), '{"provider":"anonymous"}', '{}', now(), now());

insert into public.user_profiles (id, grass_type, onboarding_completed)
values ('00000000-0000-0000-0000-000000000601', 'bermuda', false);

select ok(has_table_privilege('authenticated', 'public.user_profiles', 'select'), 'authenticated can select profiles through RLS');
select ok(has_table_privilege('authenticated', 'public.user_profiles', 'insert'), 'authenticated can insert profiles through RLS');
select ok(has_table_privilege('authenticated', 'public.user_profiles', 'update'), 'authenticated can update profiles through RLS');
select ok(has_table_privilege('authenticated', 'public.activities', 'select'), 'authenticated can select activities through RLS');
select ok(has_table_privilege('authenticated', 'public.activities', 'insert'), 'authenticated can insert activities through RLS');
select ok(has_table_privilege('authenticated', 'public.activities', 'delete'), 'authenticated can delete activities through RLS');
select ok(has_table_privilege('authenticated', 'public.task_completions', 'select'), 'authenticated can select completions through RLS');
select ok(has_table_privilege('authenticated', 'public.task_completions', 'insert'), 'authenticated can insert completions through RLS');
select ok(has_table_privilege('authenticated', 'public.task_completions', 'delete'), 'authenticated can delete completions through RLS');
select ok(not has_table_privilege('anon', 'public.user_profiles', 'select'), 'unauthenticated callers cannot select profiles');
select ok(not has_table_privilege('anon', 'public.user_profiles', 'insert'), 'unauthenticated callers cannot insert profiles');
select ok(not has_table_privilege('anon', 'public.user_profiles', 'update'), 'unauthenticated callers cannot update profiles');
select ok(not has_table_privilege('anon', 'public.activities', 'select'), 'unauthenticated callers cannot select activities');
select ok(not has_table_privilege('anon', 'public.activities', 'insert'), 'unauthenticated callers cannot insert activities');
select ok(not has_table_privilege('anon', 'public.activities', 'delete'), 'unauthenticated callers cannot delete activities');
select ok(not has_table_privilege('anon', 'public.task_completions', 'select'), 'unauthenticated callers cannot select completions');
select ok(not has_table_privilege('anon', 'public.task_completions', 'insert'), 'unauthenticated callers cannot insert completions');
select ok(not has_table_privilege('anon', 'public.task_completions', 'delete'), 'unauthenticated callers cannot delete completions');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated","is_anonymous":true}';

select is((select count(*)::integer from public.user_profiles), 0, 'anonymous sessions cannot read permanent profiles');
select throws_ok(
  $$insert into public.activities (user_id, type, date) values (auth.uid(), 'mow', current_date)$$,
  '42501',
  null,
  'anonymous sessions cannot write permanent activity history'
);
select throws_ok(
  $$insert into public.task_completions (user_id, task_key, grass_type) values (auth.uid(), 'release-check', 'bermuda')$$,
  '42501',
  null,
  'anonymous sessions cannot write permanent completion history'
);

reset role;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'release-a@example.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000612', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'release-b@example.test', '', now(), '{"provider":"email"}', '{}', now(), now());
insert into public.user_profiles (id, grass_type, onboarding_completed)
values ('00000000-0000-0000-0000-000000000611', 'bermuda', true);
insert into public.activities (user_id, type, date)
values ('00000000-0000-0000-0000-000000000611', 'mow', current_date);
insert into public.task_completions (user_id, task_key, grass_type)
values ('00000000-0000-0000-0000-000000000611', 'owner-a-only', 'bermuda');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000612","role":"authenticated","is_anonymous":false}';
select is((select count(*)::integer from public.user_profiles), 0, 'a permanent user cannot read another owner profile');
select is((select count(*)::integer from public.activities), 0, 'a permanent user cannot read another owner activity');
select is((select count(*)::integer from public.task_completions), 0, 'a permanent user cannot read another owner completion');

select * from finish();
rollback;
