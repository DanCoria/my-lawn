begin;

select plan(41);

create temporary table runtime_test_state (
  key text primary key,
  payload jsonb not null
) on commit drop;
grant all on table runtime_test_state to service_role;

select has_column(
  'public', 'ai_usage_events', 'usage_metadata_complete',
  'usage events record whether provider metadata was complete'
);
select has_column(
  'public', 'ai_usage_events', 'response_payload',
  'usage events can recover a completed idempotent response'
);

select has_function(
  'public', 'get_ai_runtime_state', array[]::text[],
  'runtime state has a narrow RPC boundary'
);
select has_function('public', 'reserve_ai_request_v2', array['uuid','boolean','text','uuid','text','integer','integer','integer'], 'hardened reservation RPC exists');
select has_function('public', 'mark_ai_request_started_v2', array['uuid'], 'atomic start RPC exists');
select has_function('public', 'finalize_ai_request_v2', array['uuid','uuid','jsonb','jsonb'], 'hardened finalization RPC exists');
select has_function('public', 'fail_ai_request_v2', array['uuid','text','text','jsonb'], 'hardened failure RPC exists');

select ok(not has_function_privilege('anon', 'public.reserve_ai_request_v2(uuid,boolean,text,uuid,text,integer,integer,integer)', 'execute'), 'anon cannot reserve through service RPC');
select ok(not has_function_privilege('authenticated', 'public.reserve_ai_request_v2(uuid,boolean,text,uuid,text,integer,integer,integer)', 'execute'), 'authenticated cannot reserve through service RPC');
select ok(has_function_privilege('service_role', 'public.reserve_ai_request_v2(uuid,boolean,text,uuid,text,integer,integer,integer)', 'execute'), 'service role can reserve through service RPC');
select ok(not has_function_privilege('anon', 'public.mark_ai_request_started_v2(uuid)', 'execute'), 'anon cannot start through service RPC');
select ok(not has_function_privilege('authenticated', 'public.mark_ai_request_started_v2(uuid)', 'execute'), 'authenticated cannot start through service RPC');
select ok(has_function_privilege('service_role', 'public.mark_ai_request_started_v2(uuid)', 'execute'), 'service role can atomically start a request');
select ok(not has_function_privilege('anon', 'public.finalize_ai_request_v2(uuid,uuid,jsonb,jsonb)', 'execute'), 'anon cannot finalize through service RPC');
select ok(not has_function_privilege('authenticated', 'public.finalize_ai_request_v2(uuid,uuid,jsonb,jsonb)', 'execute'), 'authenticated cannot finalize through service RPC');
select ok(has_function_privilege('service_role', 'public.finalize_ai_request_v2(uuid,uuid,jsonb,jsonb)', 'execute'), 'service role can finalize through service RPC');
select ok(not has_function_privilege('anon', 'public.fail_ai_request_v2(uuid,text,text,jsonb)', 'execute'), 'anon cannot record failures through service RPC');
select ok(not has_function_privilege('authenticated', 'public.fail_ai_request_v2(uuid,text,text,jsonb)', 'execute'), 'authenticated cannot record failures through service RPC');
select ok(has_function_privilege('service_role', 'public.fail_ai_request_v2(uuid,text,text,jsonb)', 'execute'), 'service role can record failures through service RPC');
select has_function(
  'public', 'evaluate_ai_circuit', array[]::text[],
  'circuit evaluation has a narrow RPC boundary'
);

select ok(
  not has_function_privilege('anon', 'public.get_ai_runtime_state()', 'execute'),
  'anonymous callers cannot read runtime state'
);
select ok(
  not has_function_privilege('authenticated', 'public.get_ai_runtime_state()', 'execute'),
  'authenticated callers cannot read runtime state'
);
select ok(
  has_function_privilege('service_role', 'public.get_ai_runtime_state()', 'execute'),
  'service role can read runtime state'
);
select ok(
  not has_function_privilege('anon', 'public.evaluate_ai_circuit()', 'execute'),
  'anonymous callers cannot evaluate the circuit'
);
select ok(
  not has_function_privilege('authenticated', 'public.evaluate_ai_circuit()', 'execute'),
  'authenticated callers cannot evaluate the circuit'
);
select ok(
  has_function_privilege('service_role', 'public.evaluate_ai_circuit()', 'execute'),
  'service role can evaluate the circuit'
);

set local role service_role;

select is(
  public.get_ai_runtime_state() ->> 'circuit_open_until',
  null,
  'runtime RPC reports a closed circuit'
);

update private.ai_runtime_state
set consecutive_failures = 9,
    circuit_open_until = null;

select is(
  public.evaluate_ai_circuit() ->> 'opened',
  'false',
  'nine consecutive failures do not open the circuit'
);

update private.ai_runtime_state
set consecutive_failures = 10;

select is(
  public.evaluate_ai_circuit() ->> 'opened',
  'true',
  'ten consecutive failures open the circuit'
);
select ok(
  (public.get_ai_runtime_state() ->> 'circuit_open_until')::timestamptz > clock_timestamp() + interval '14 minutes',
  'opened circuit remains active for approximately fifteen minutes'
);

update private.ai_runtime_state
set consecutive_failures = 0,
    circuit_open_until = null;

reset role;

insert into auth.users(id, aud, role, email, encrypted_password)
values ('00000000-0000-4000-8000-000000000099', 'authenticated', 'authenticated', 'circuit@example.test', 'x');

set local role service_role;

insert into public.ai_usage_events(user_id, request_key, route, allowance_source, status, created_at)
select
  '00000000-0000-4000-8000-000000000099',
  ('00000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
  'personalized',
  'monthly',
  case when series <= 11 then 'failed' else 'completed' end,
  clock_timestamp() + make_interval(secs => series)
from generate_series(1, 20) as series;

select is(
  public.evaluate_ai_circuit() ->> 'opened',
  'true',
  'more than half of the latest twenty failures opens the circuit'
);

update private.ai_runtime_state
set consecutive_failures = 0,
    circuit_open_until = null;
update public.ai_usage_events
set status = case when request_key::text < '00000000-0000-4000-8000-000000000010' then 'failed' else 'completed' end;

select is(
  public.evaluate_ai_circuit() ->> 'opened',
  'false',
  'half or fewer failures in the latest twenty keeps the circuit closed'
);

update public.ai_usage_events
set status = 'started',
    model = null,
    input_tokens = null,
    output_tokens = null,
    thought_tokens = null,
    total_tokens = null
where request_key = '00000000-0000-4000-8000-000000000020';

select lives_ok(
  $$select public.finalize_ai_request_v2(
    (select id from public.ai_usage_events where request_key = '00000000-0000-4000-8000-000000000020'),
    null,
    '{"model":"gemini-test","input_tokens":0,"output_tokens":0,"thought_tokens":0,"total_tokens":0,"metadata_complete":false}'::jsonb,
    '{"schema_version":"guest-preview-1"}'::jsonb
  )$$,
  'finalization accepts explicitly incomplete zeroed usage metadata'
);
select is(
  (select usage_metadata_complete from public.ai_usage_events
   where request_key = '00000000-0000-4000-8000-000000000020'),
  false,
  'finalization persists the incomplete metadata flag'
);
select is(
  (public.reserve_ai_request_v2(
    '00000000-0000-4000-8000-000000000099', false, null,
    '00000000-0000-4000-8000-000000000020', 'personalized', 100, 50, 3
  ) -> 'response_payload' ->> 'schema_version'),
  'guest-preview-1',
  'completed duplicate returns its persisted response without another provider call'
);

update private.ai_runtime_state
set circuit_open_until = clock_timestamp() + interval '15 minutes';

select is(
  public.reserve_ai_request_v2(
    '00000000-0000-4000-8000-000000000099', false, null,
    '00000000-0000-4000-8000-000000000100', 'personalized', 100, 50, 3
  ) ->> 'reason',
  'circuit_open',
  'atomic reservation refuses work while the circuit is open'
);

update private.ai_runtime_state set circuit_open_until = null;
insert into public.ai_usage_events(
  user_id, request_key, route, allowance_source, status, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000099',
  '00000000-0000-4000-8000-000000000101',
  'personalized', 'welcome', 'started',
  clock_timestamp() - interval '3 minutes',
  clock_timestamp() - interval '3 minutes'
);

insert into runtime_test_state(key, payload)
values (
  'lease-recovery',
  public.reserve_ai_request_v2(
    '00000000-0000-4000-8000-000000000099', false, null,
    '00000000-0000-4000-8000-000000000102', 'personalized', 100, 50, 3
  )
);

select ok(
  (select (payload ->> 'allowed')::boolean from runtime_test_state where key = 'lease-recovery'),
  'a new manual request is accepted after a stale reservation lease expires'
);
select ok(
  (select status = 'unknown'
      and error_code = 'started_lease_expired'
      and usage_metadata_complete = false
   from public.ai_usage_events
   where request_key = '00000000-0000-4000-8000-000000000101'),
  'stale provider state remains globally accounted as unknown'
);

select public.fail_ai_request_v2(
  (select (payload ->> 'event_id')::uuid from runtime_test_state where key = 'lease-recovery'),
  'unknown',
  'transport_error',
  '{"model":"gemini-test","input_tokens":0,"output_tokens":0,"thought_tokens":0,"total_tokens":0,"metadata_complete":false}'::jsonb
);

select ok(
  (select model = 'gemini-test' and usage_metadata_complete = false
   from public.ai_usage_events
   where request_key = '00000000-0000-4000-8000-000000000102'),
  'ambiguous terminal calls persist an explicit missing-metadata audit record'
);

reset role;
insert into auth.users(id, aud, role, email, encrypted_password)
values ('00000000-0000-4000-8000-000000000098', 'authenticated', 'authenticated', 'atomic-start@example.test', 'x');
set local role service_role;

insert into runtime_test_state(key, payload)
values (
  'atomic-start',
  public.reserve_ai_request_v2(
    '00000000-0000-4000-8000-000000000098', false, null,
    '00000000-0000-4000-8000-000000000103', 'personalized', 100, 50, 3
  )
);
update private.ai_runtime_state
set circuit_open_until = clock_timestamp() + interval '15 minutes';

select is(
  public.mark_ai_request_started_v2(
    (select (payload ->> 'event_id')::uuid from runtime_test_state where key = 'atomic-start')
  ) ->> 'reason',
  'circuit_open',
  'atomic start refuses provider dispatch when the circuit opened after reservation'
);
select is(
  (select status from public.ai_usage_events
   where request_key = '00000000-0000-4000-8000-000000000103'),
  'failed',
  'circuit refusal terminalizes the reservation without a provider call'
);

select * from finish();
rollback;
