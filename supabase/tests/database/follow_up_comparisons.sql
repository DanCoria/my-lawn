begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

select has_column('public', 'lawn_scans', 'comparison_proposal_status', 'follow-ups persist a separate model proposal');
select has_column('public', 'lawn_scans', 'comparison_evidence', 'follow-ups persist visible comparison evidence');
select has_column('public', 'lawn_scans', 'comparison_confirmed_at', 'follow-ups record owner confirmation time');
select has_function('public', 'confirm_scan_comparison', array['uuid', 'uuid', 'text'], 'confirmation RPC exists');
select ok(has_function_privilege('authenticated', 'public.confirm_scan_comparison(uuid,uuid,text)', 'execute'), 'permanent authenticated users can confirm comparisons');
select ok(not has_function_privilege('anon', 'public.confirm_scan_comparison(uuid,uuid,text)', 'execute'), 'unauthenticated callers cannot confirm comparisons');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'follow-one@example.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'follow-two@example.test', '', now(), '{"provider":"email"}', '{}', now(), now()),
('00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'follow-guest@example.test', '', now(), '{"provider":"anonymous"}', '{}', now(), now());

insert into public.lawn_cases (id, user_id, status, is_primary, title, diagnosis, plan_seed)
values ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000601', 'active', true, 'Heat stress', '{}', '{"steps":[]}');

insert into public.lawn_scans (
  id, user_id, image_url, diagnosis, case_id, purpose, diagnosis_schema_version,
  comparison_proposal_status, comparison_proposal_summary, comparison_evidence
) values
('61000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000601', 'private/one.jpg', '{"schema_version":"follow-up-1"}', '60000000-0000-0000-0000-000000000001', 'follow_up', 2, 'improving', 'Coverage is denser.', '["Less exposed soil"]'),
('61000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000601', 'private/two.jpg', '{"schema_version":"follow-up-1"}', '60000000-0000-0000-0000-000000000001', 'follow_up', 2, 'improving', 'Coverage is uneven.', '["New browning"]'),
('61000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000601', 'private/three.jpg', '{"schema_version":"follow-up-1"}', '60000000-0000-0000-0000-000000000001', 'follow_up', 2, null, null, null),
('61000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000601', 'private/four.jpg', '{"schema_version":"follow-up-1"}', '60000000-0000-0000-0000-000000000001', 'follow_up', 1, 'resolved', 'The affected area is no longer visible.', '["Even green coverage"]');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated","is_anonymous":false}';

select is((select status from public.lawn_cases where id = '60000000-0000-0000-0000-000000000001'), 'active', 'a model proposal alone does not mutate the case');
select lives_ok($$select public.confirm_scan_comparison('60000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'improving')$$, 'the owner can confirm an improving result');
select is((select comparison_status from public.lawn_scans where id = '61000000-0000-0000-0000-000000000001'), 'improving', 'confirmation is persisted separately from the proposal');
select ok((select comparison_confirmed_at is not null from public.lawn_scans where id = '61000000-0000-0000-0000-000000000001'), 'confirmation records its timestamp');
select is((select status from public.lawn_cases where id = '60000000-0000-0000-0000-000000000001'), 'monitoring', 'improving moves the current case to monitoring');
select lives_ok($$select public.confirm_scan_comparison('60000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', 'worsening')$$, 'the owner may correct the model proposal');
select is((select comparison_status from public.lawn_scans where id = '61000000-0000-0000-0000-000000000002'), 'worsening', 'the owner correction is persisted');
select is((select status from public.lawn_cases where id = '60000000-0000-0000-0000-000000000001'), 'active', 'worsening returns the current case to active');
select throws_ok($$select public.confirm_scan_comparison('60000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000003', 'resolved')$$, '22023', null, 'a scan without a model proposal cannot be confirmed');
select lives_ok($$select public.confirm_scan_comparison('60000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000004', 'resolved')$$, 'the owner can confirm resolution');
select ok((select status = 'resolved' and not is_primary and resolved_at is not null from public.lawn_cases where id = '60000000-0000-0000-0000-000000000001'), 'resolution closes the primary case only after confirmation');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000602","role":"authenticated","is_anonymous":false}';
select throws_ok($$select public.confirm_scan_comparison('60000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'resolved')$$, '42501', null, 'cross-owner confirmation is rejected');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000603","role":"authenticated","is_anonymous":true}';
select throws_ok($$select public.confirm_scan_comparison('60000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'resolved')$$, '42501', null, 'anonymous authenticated users cannot confirm comparisons');
select is((select count(*)::integer from public.lawn_scans), 0, 'anonymous authenticated users cannot read permanent scan rows');
select throws_ok($$insert into public.lawn_scans(user_id,image_url,diagnosis) values(auth.uid(),'guest/private.jpg','{}')$$, '42501', null, 'anonymous authenticated users cannot persist scans directly');

reset role;
select * from finish();
rollback;
