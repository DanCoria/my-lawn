begin;

create extension if not exists pgtap with schema extensions;
select plan(55);

select has_table('public', 'lawn_cases', 'lawn cases exist');
select has_table('public', 'plan_steps', 'plan steps exist');
select has_column('public', 'lawn_scans', 'case_id', 'scans can belong to a case');
select has_column('public', 'lawn_scans', 'purpose', 'scans record their purpose');
select has_column('public', 'lawn_scans', 'diagnosis_schema_version', 'scans record diagnosis schema');
select has_column('public', 'lawn_scans', 'comparison_status', 'follow-ups record comparison state');
select has_column('public', 'lawn_scans', 'comparison_summary', 'follow-ups record comparison summary');

select has_function('public', 'start_plan_from_observation', array['uuid'], 'start-plan RPC exists');
select has_function('public', 'complete_plan_step', array['uuid', 'text'], 'complete-step RPC exists');
select has_function('public', 'postpone_plan_step', array['uuid', 'timestamp with time zone'], 'postpone RPC exists');
select has_function('public', 'switch_primary_case', array['uuid'], 'switch-primary RPC exists');

select ok(has_table_privilege('authenticated', 'public.lawn_cases', 'select'), 'authenticated users can read cases through RLS');
select ok(has_table_privilege('authenticated', 'public.plan_steps', 'select'), 'authenticated users can read steps through RLS');
select ok(has_table_privilege('authenticated', 'public.lawn_cases', 'insert'), 'authenticated users can create owner-scoped observations');
select ok(has_table_privilege('authenticated', 'public.lawn_cases', 'update'), 'authenticated users can update owner-scoped cases');
select ok(has_table_privilege('authenticated', 'public.plan_steps', 'update'), 'authenticated users can update owner-scoped steps');
select ok(not has_table_privilege('anon', 'public.lawn_cases', 'select'), 'unauthenticated API role cannot read cases');
select ok(not has_table_privilege('anon', 'public.plan_steps', 'select'), 'unauthenticated API role cannot read steps');
select ok(has_function_privilege('authenticated', 'public.start_plan_from_observation(uuid)', 'execute'), 'authenticated users can start owned plans');
select ok(has_function_privilege('authenticated', 'public.complete_plan_step(uuid,text)', 'execute'), 'authenticated users can complete owned steps');
select ok(has_function_privilege('authenticated', 'public.postpone_plan_step(uuid,timestamp with time zone)', 'execute'), 'authenticated users can postpone owned steps');
select ok(has_function_privilege('authenticated', 'public.switch_primary_case(uuid)', 'execute'), 'authenticated users can explicitly switch owned plans');
select ok(not has_function_privilege('anon', 'public.start_plan_from_observation(uuid)', 'execute'), 'anon API role cannot start plans');
select ok(not has_function_privilege('anon', 'public.complete_plan_step(uuid,text)', 'execute'), 'anon API role cannot complete steps');
select ok(not has_function_privilege('anon', 'public.postpone_plan_step(uuid,timestamp with time zone)', 'execute'), 'anon API role cannot postpone steps');
select ok(not has_function_privilege('anon', 'public.switch_primary_case(uuid)', 'execute'), 'anon API role cannot switch plans');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plan-one@example.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plan-two@example.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plan-guest@example.test', '', now(), '{"provider":"anonymous"}', '{}', now(), now())
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated","is_anonymous":false}';

insert into public.lawn_cases (id, user_id, status, is_primary, title, diagnosis, plan_seed)
values
('50000000-0000-0000-0000-000000000001', auth.uid(), 'observation', false, 'Brown patch', '{"summary":"dry area"}', '{"summary":"Recovery","steps":[{"order":1,"kind":"action","title":"Check soil","instructions":"Feel two inches down","due_in_days":0},{"order":2,"kind":"check","title":"Is it dry?","instructions":"Report moisture","due_in_days":2,"check_options":[{"value":"dry","label":"Dry","next_order":3},{"value":"moist","label":"Moist","next_order":4},{"value":"not_sure","label":"Not sure","next_order":2}]},{"order":3,"kind":"action","title":"Water deeply","instructions":"Apply water slowly","due_in_days":0},{"order":4,"kind":"action","title":"Monitor","instructions":"Watch the area","due_in_days":3}]}'::jsonb),
('50000000-0000-0000-0000-000000000002', auth.uid(), 'observation', false, 'Thin area', '{"summary":"thin grass"}', '{"summary":"Recovery","steps":[{"order":1,"kind":"action","title":"Inspect","instructions":"Inspect crowns","due_in_days":0}]}'::jsonb);

select lives_ok($$update public.lawn_cases set area_label = 'Front yard' where id = '50000000-0000-0000-0000-000000000001'$$, 'an owner can update their case');
insert into public.lawn_cases (id, user_id, status, is_primary, title, diagnosis, plan_seed)
values ('50000000-0000-0000-0000-000000000099', auth.uid(), 'observation', false, 'Disposable', '{}', '{"steps":[{"order":1,"kind":"action","title":"Inspect","instructions":"Inspect","due_in_days":0}]}'::jsonb);
select lives_ok($$delete from public.lawn_cases where id = '50000000-0000-0000-0000-000000000099'$$, 'an owner can delete their case');

select lives_ok($$select public.start_plan_from_observation('50000000-0000-0000-0000-000000000001')$$, 'an observation can start its plan');
select is((select count(*)::integer from public.lawn_cases where is_primary and status = 'active'), 1, 'one primary active case exists');
select is((select count(*)::integer from public.plan_steps where case_id = '50000000-0000-0000-0000-000000000001'), 4, 'starting materializes every validated plan seed step');
select is((select status from public.plan_steps where case_id = '50000000-0000-0000-0000-000000000001' and step_order = 1), 'ready', 'only the first action starts ready');
select lives_ok($$select public.complete_plan_step((select id from public.plan_steps where case_id = '50000000-0000-0000-0000-000000000001' and step_order = 1), 'done')$$, 'an action can be completed');
select is((select status from public.plan_steps where case_id = '50000000-0000-0000-0000-000000000001' and step_order = 2), 'ready', 'action completion unlocks the next check');
select throws_ok($$select public.complete_plan_step((select id from public.plan_steps where case_id = '50000000-0000-0000-0000-000000000001' and step_order = 2), 'invalid')$$, '22023', null, 'an invalid check outcome is rejected');
select lives_ok($$select public.complete_plan_step((select id from public.plan_steps where case_id = '50000000-0000-0000-0000-000000000001' and step_order = 2), 'dry')$$, 'a valid dry branch completes');
select is((select status from public.plan_steps where case_id = '50000000-0000-0000-0000-000000000001' and step_order = 3), 'ready', 'dry branch unlocks its mapped action');
select lives_ok($$select public.postpone_plan_step((select id from public.plan_steps where case_id = '50000000-0000-0000-0000-000000000001' and step_order = 3), now() + interval '1 day')$$, 'a ready action can be postponed');
select ok((select status = 'postponed' and due_at > now() from public.plan_steps where case_id = '50000000-0000-0000-0000-000000000001' and step_order = 3), 'postponement records the future due time');

update public.plan_steps set status = case when step_order = 2 then 'ready' else 'locked' end, result = null, completed_at = null, postponed_at = null
where case_id = '50000000-0000-0000-0000-000000000001' and step_order between 2 and 4;
select lives_ok($$select public.complete_plan_step((select id from public.plan_steps where case_id = '50000000-0000-0000-0000-000000000001' and step_order = 2), 'moist')$$, 'a valid moist branch completes');
select ok((select status = 'skipped' from public.plan_steps where case_id = '50000000-0000-0000-0000-000000000001' and step_order = 3) and (select status = 'ready' from public.plan_steps where case_id = '50000000-0000-0000-0000-000000000001' and step_order = 4), 'moist branch skips the dry action and unlocks monitoring');

update public.plan_steps set status = case when step_order = 2 then 'ready' else 'locked' end, result = null, completed_at = null
where case_id = '50000000-0000-0000-0000-000000000001' and step_order between 2 and 4;
select lives_ok($$select public.complete_plan_step((select id from public.plan_steps where case_id = '50000000-0000-0000-0000-000000000001' and step_order = 2), 'not_sure')$$, 'a not-sure check outcome is accepted');
select is((select status from public.plan_steps where case_id = '50000000-0000-0000-0000-000000000001' and step_order = 2), 'ready', 'not-sure keeps the same check ready instead of inventing progress');

update public.plan_steps set status = case when step_order = 2 then 'done' when step_order = 3 then 'postponed' else 'locked' end,
    result = case when step_order = 2 then 'dry' else result end,
    due_at = case when step_order = 3 then now() + interval '1 day' else due_at end
where case_id = '50000000-0000-0000-0000-000000000001' and step_order between 2 and 4;
select is((select status from public.lawn_cases where id = '50000000-0000-0000-0000-000000000002'), 'observation', 'a conflicting problem remains an observation');
select throws_ok($$select public.start_plan_from_observation('50000000-0000-0000-0000-000000000002')$$, '23505', null, 'a second plan cannot become primary implicitly');
select lives_ok($$select public.switch_primary_case('50000000-0000-0000-0000-000000000002')$$, 'explicit switching is atomic');
select ok((select status = 'paused' and not is_primary from public.lawn_cases where id = '50000000-0000-0000-0000-000000000001') and (select status = 'active' and is_primary from public.lawn_cases where id = '50000000-0000-0000-0000-000000000002'), 'switch pauses the old case and activates only the new one');
select ok((select status = 'postponed' from public.plan_steps where case_id = '50000000-0000-0000-0000-000000000001' and step_order = 3) and (select status = 'locked' from public.plan_steps where case_id = '50000000-0000-0000-0000-000000000001' and step_order = 4), 'switching leaves unfinished steps unchanged');
select lives_ok($$select public.switch_primary_case('50000000-0000-0000-0000-000000000001')$$, 'a paused case can be resumed explicitly');
select ok((select status = 'active' and is_primary from public.lawn_cases where id = '50000000-0000-0000-0000-000000000001'), 'resuming restores the paused case as primary');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated","is_anonymous":false}';
select is((select count(*)::integer from public.lawn_cases), 0, 'RLS hides every other owner case');
select throws_ok($$insert into public.lawn_cases(user_id,status,is_primary,title,diagnosis,plan_seed) values('00000000-0000-0000-0000-000000000501','observation',false,'stolen','{}','{}')$$, '42501', null, 'a user cannot create a case for another owner');
select throws_ok($$select public.switch_primary_case('50000000-0000-0000-0000-000000000001')$$, '42501', null, 'cross-user RPC access is denied');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000503","role":"authenticated","is_anonymous":true}';
select throws_ok($$insert into public.lawn_cases(user_id,status,is_primary,title,diagnosis,plan_seed) values(auth.uid(),'observation',false,'guest','{}','{}')$$, '42501', null, 'anonymous authenticated users cannot create cases');
select throws_ok($$select public.start_plan_from_observation('50000000-0000-0000-0000-000000000001')$$, '42501', null, 'anonymous authenticated users cannot invoke plan transitions');

reset role;
select * from finish();
rollback;
