begin;

create extension if not exists pgtap with schema extensions;

select plan(43);

select has_table('public', 'scan_entitlements', 'scan entitlements exist');
select has_table('public', 'ai_usage_events', 'AI usage events exist');
select has_table('private', 'ai_daily_counters', 'daily counters are private');
select has_table('private', 'ai_network_attempts', 'network attempts are private');
select has_table('private', 'ai_runtime_state', 'runtime state is private');

select has_function(
    'public',
    'reserve_ai_request',
    array['uuid', 'boolean', 'text', 'uuid', 'text', 'integer', 'integer', 'integer'],
    'reservation RPC exists'
);
select has_function('public', 'mark_ai_request_started', array['uuid'], 'start RPC exists');
select has_function(
    'public',
    'finalize_ai_request',
    array['uuid', 'uuid', 'jsonb'],
    'finalize RPC exists'
);
select has_function(
    'public',
    'fail_ai_request',
    array['uuid', 'text', 'text'],
    'failure RPC exists'
);

select ok(
    not has_function_privilege(
        'anon',
        'public.reserve_ai_request(uuid,boolean,text,uuid,text,integer,integer,integer)',
        'execute'
    ),
    'anon cannot reserve AI requests'
);
select ok(
    not has_function_privilege(
        'authenticated',
        'public.reserve_ai_request(uuid,boolean,text,uuid,text,integer,integer,integer)',
        'execute'
    ),
    'authenticated browser users cannot reserve AI requests'
);
select ok(
    not has_function_privilege('anon', 'public.mark_ai_request_started(uuid)', 'execute'),
    'anon cannot start AI requests'
);
select ok(
    not has_function_privilege('authenticated', 'public.mark_ai_request_started(uuid)', 'execute'),
    'authenticated browser users cannot start AI requests'
);
select ok(
    not has_function_privilege('anon', 'public.finalize_ai_request(uuid,uuid,jsonb)', 'execute'),
    'anon cannot finalize AI requests'
);
select ok(
    not has_function_privilege('authenticated', 'public.finalize_ai_request(uuid,uuid,jsonb)', 'execute'),
    'authenticated browser users cannot finalize AI requests'
);
select ok(
    not has_function_privilege('anon', 'public.fail_ai_request(uuid,text,text)', 'execute'),
    'anon cannot fail AI requests'
);
select ok(
    not has_function_privilege('authenticated', 'public.fail_ai_request(uuid,text,text)', 'execute'),
    'authenticated browser users cannot fail AI requests'
);
select ok(
    has_function_privilege(
        'service_role',
        'public.reserve_ai_request(uuid,boolean,text,uuid,text,integer,integer,integer)',
        'execute'
    ),
    'service role can reserve AI requests'
);
select ok(
    has_function_privilege('service_role', 'public.mark_ai_request_started(uuid)', 'execute'),
    'service role can start AI requests'
);
select ok(
    has_function_privilege('service_role', 'public.finalize_ai_request(uuid,uuid,jsonb)', 'execute'),
    'service role can finalize AI requests'
);
select ok(
    has_function_privilege('service_role', 'public.fail_ai_request(uuid,text,text)', 'execute'),
    'service role can fail AI requests'
);
select ok(
    not has_schema_privilege('anon', 'private', 'usage'),
    'anon cannot use the private schema'
);
select ok(
    not has_schema_privilege('authenticated', 'private', 'usage'),
    'authenticated users cannot use the private schema'
);

insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
)
select
    user_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    label || '@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
from (
    values
        ('00000000-0000-0000-0000-000000000101'::uuid, 'guest-one'),
        ('00000000-0000-0000-0000-000000000102'::uuid, 'guest-two'),
        ('00000000-0000-0000-0000-000000000103'::uuid, 'guest-three'),
        ('00000000-0000-0000-0000-000000000104'::uuid, 'guest-four'),
        ('00000000-0000-0000-0000-000000000201'::uuid, 'permanent-one'),
        ('00000000-0000-0000-0000-000000000202'::uuid, 'permanent-two')
) as users(user_id, label)
on conflict (id) do nothing;

create temporary table ai_test_state (
    key text primary key,
    payload jsonb not null
) on commit drop;

insert into ai_test_state values (
    'guest-first',
    public.reserve_ai_request(
        '00000000-0000-0000-0000-000000000101',
        true,
        'network-hash-shared-a',
        '10000000-0000-0000-0000-000000000001',
        'guest_preview',
        100,
        50,
        3
    )
);

select ok(
    (select (payload ->> 'allowed')::boolean and payload ->> 'allowance_source' = 'guest'
     from ai_test_state where key = 'guest-first'),
    'first anonymous reservation uses guest allowance'
);

select public.fail_ai_request(
    (select (payload ->> 'event_id')::uuid from ai_test_state where key = 'guest-first'),
    'failed',
    'provider_error'
);

insert into ai_test_state values (
    'guest-retry',
    public.reserve_ai_request(
        '00000000-0000-0000-0000-000000000101',
        true,
        'network-hash-shared-a',
        '10000000-0000-0000-0000-000000000002',
        'guest_preview',
        100,
        50,
        3
    )
);

select ok(
    (select (payload ->> 'allowed')::boolean from ai_test_state where key = 'guest-retry'),
    'failed guest request does not consume personal allowance'
);

select public.finalize_ai_request(
    (select (payload ->> 'event_id')::uuid from ai_test_state where key = 'guest-retry'),
    null,
    '{"model":"test-model","input_tokens":10,"output_tokens":5,"thought_tokens":0,"total_tokens":15}'
);

insert into ai_test_state values (
    'guest-after-complete',
    public.reserve_ai_request(
        '00000000-0000-0000-0000-000000000101',
        true,
        'network-hash-shared-b',
        '10000000-0000-0000-0000-000000000003',
        'guest_preview',
        100,
        50,
        3
    )
);

select ok(
    not (select (payload ->> 'allowed')::boolean from ai_test_state where key = 'guest-after-complete'),
    'completed guest preview exhausts anonymous allowance'
);

insert into ai_test_state values
(
    'network-third',
    public.reserve_ai_request(
        '00000000-0000-0000-0000-000000000102', true, 'network-hash-shared-a',
        '10000000-0000-0000-0000-000000000004', 'guest_preview', 100, 50, 3
    )
),
(
    'network-fourth',
    public.reserve_ai_request(
        '00000000-0000-0000-0000-000000000103', true, 'network-hash-shared-a',
        '10000000-0000-0000-0000-000000000005', 'guest_preview', 100, 50, 3
    )
);

select ok(
    (select (payload ->> 'allowed')::boolean from ai_test_state where key = 'network-third')
    and not (select (payload ->> 'allowed')::boolean from ai_test_state where key = 'network-fourth'),
    'fourth provider attempt for one network is blocked in rolling 24 hours'
);

update private.ai_network_attempts
set created_at = now() - interval '25 hours'
where event_id = (
    select (payload ->> 'event_id')::uuid
    from ai_test_state
    where key = 'guest-first'
);

insert into ai_test_state values (
    'network-after-retention',
    public.reserve_ai_request(
        '00000000-0000-0000-0000-000000000104', true, 'network-hash-shared-a',
        '10000000-0000-0000-0000-000000000006', 'guest_preview', 100, 50, 3
    )
);

select ok(
    (select (payload ->> 'allowed')::boolean
     from ai_test_state where key = 'network-after-retention')
    and not exists (
        select 1 from private.ai_network_attempts
        where created_at <= now() - interval '24 hours'
    ),
    'expired network hashes are purged after their abuse-prevention window'
);

insert into ai_test_state values (
    'idempotent-first',
    public.reserve_ai_request(
        '00000000-0000-0000-0000-000000000201', false, 'account-network',
        '20000000-0000-0000-0000-000000000001', 'personalized', 100, 50, 3
    )
);
insert into ai_test_state values (
    'idempotent-second',
    public.reserve_ai_request(
        '00000000-0000-0000-0000-000000000201', false, 'account-network',
        '20000000-0000-0000-0000-000000000001', 'personalized', 100, 50, 3
    )
);

select ok(
    (select payload ->> 'event_id' from ai_test_state where key = 'idempotent-first') =
    (select payload ->> 'event_id' from ai_test_state where key = 'idempotent-second')
    and (select (payload ->> 'duplicate')::boolean from ai_test_state where key = 'idempotent-second'),
    'same request key is idempotent'
);

insert into ai_test_state values (
    'concurrent-second',
    public.reserve_ai_request(
        '00000000-0000-0000-0000-000000000201', false, 'account-network',
        '20000000-0000-0000-0000-000000000002', 'personalized', 100, 50, 3
    )
);

select ok(
    not (select (payload ->> 'allowed')::boolean from ai_test_state where key = 'concurrent-second')
    and (select payload ->> 'reason' from ai_test_state where key = 'concurrent-second') = 'request_in_flight',
    'one identity cannot reserve a second in-flight request'
);

select public.finalize_ai_request(
    (select (payload ->> 'event_id')::uuid from ai_test_state where key = 'idempotent-first'),
    null,
    '{"model":"test-model","input_tokens":10,"output_tokens":5,"thought_tokens":0,"total_tokens":15}'
);

do $$
declare
    attempt integer;
    result jsonb;
begin
    for attempt in 2..3 loop
        result := public.reserve_ai_request(
            '00000000-0000-0000-0000-000000000201', false, 'account-network',
            ('20000000-0000-0000-0000-' || lpad(attempt::text, 12, '0'))::uuid,
            'personalized', 100, 50, 3
        );
        perform public.finalize_ai_request(
            (result ->> 'event_id')::uuid,
            null,
            '{"model":"test-model","input_tokens":10,"output_tokens":5,"thought_tokens":0,"total_tokens":15}'
        );
    end loop;
end;
$$;

select is(
    (select count(*)::integer from public.ai_usage_events
     where user_id = '00000000-0000-0000-0000-000000000201'
       and allowance_source = 'welcome'
       and status = 'completed'),
    3,
    'three personalized welcome scans complete in the first 30 days'
);

insert into ai_test_state values (
    'welcome-fourth',
    public.reserve_ai_request(
        '00000000-0000-0000-0000-000000000201', false, 'account-network',
        '20000000-0000-0000-0000-000000000004', 'personalized', 100, 50, 3
    )
);

select ok(
    not (select (payload ->> 'allowed')::boolean from ai_test_state where key = 'welcome-fourth'),
    'fourth personalized scan is blocked during welcome period'
);
select ok(
    (select (payload ->> 'reset_at')::timestamptz > now()
     from ai_test_state where key = 'welcome-fourth'),
    'welcome exhaustion does not replenish before day 30'
);

update public.scan_entitlements
set welcome_started_at = now() - interval '31 days'
where user_id = '00000000-0000-0000-0000-000000000201';

insert into ai_test_state values (
    'monthly-first',
    public.reserve_ai_request(
        '00000000-0000-0000-0000-000000000201', false, 'account-network',
        '20000000-0000-0000-0000-000000000005', 'personalized', 100, 50, 3
    )
);

select ok(
    (select (payload ->> 'allowed')::boolean and payload ->> 'allowance_source' = 'monthly'
     from ai_test_state where key = 'monthly-first'),
    'monthly allowance begins after the 30-day welcome period'
);
select public.finalize_ai_request(
    (select (payload ->> 'event_id')::uuid from ai_test_state where key = 'monthly-first'),
    null,
    '{"model":"test-model","input_tokens":10,"output_tokens":5,"thought_tokens":0,"total_tokens":15}'
);

insert into ai_test_state values (
    'monthly-second',
    public.reserve_ai_request(
        '00000000-0000-0000-0000-000000000201', false, 'account-network',
        '20000000-0000-0000-0000-000000000006', 'personalized', 100, 50, 3
    )
);
select ok(
    not (select (payload ->> 'allowed')::boolean from ai_test_state where key = 'monthly-second'),
    'only one monthly scan is available per 30-day period'
);

truncate public.ai_usage_events, public.scan_entitlements,
    private.ai_daily_counters, private.ai_network_attempts;

do $$
declare
    attempt integer;
    user_id uuid;
begin
    for attempt in 1..101 loop
        user_id := ('30000000-0000-0000-0000-' || lpad(attempt::text, 12, '0'))::uuid;
        insert into auth.users (
            id, instance_id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) values (
            user_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'global-' || attempt || '@example.test', '', now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now()
        ) on conflict (id) do nothing;

        insert into ai_test_state(key, payload) values (
            'global-' || attempt,
            public.reserve_ai_request(
                user_id, false, 'global-network-' || attempt,
                ('31000000-0000-0000-0000-' || lpad(attempt::text, 12, '0'))::uuid,
                'personalized', 100, 50, 3
            )
        );
    end loop;
end;
$$;

select ok(
    (select (payload ->> 'allowed')::boolean from ai_test_state where key = 'global-100')
    and not (select (payload ->> 'allowed')::boolean from ai_test_state where key = 'global-101'),
    'the 101st total request is blocked for the UTC day'
);

truncate public.ai_usage_events, public.scan_entitlements,
    private.ai_daily_counters, private.ai_network_attempts;

do $$
declare
    attempt integer;
    user_id uuid;
begin
    for attempt in 1..51 loop
        user_id := ('40000000-0000-0000-0000-' || lpad(attempt::text, 12, '0'))::uuid;
        insert into auth.users (
            id, instance_id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) values (
            user_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'guest-limit-' || attempt || '@example.test', '', now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now()
        ) on conflict (id) do nothing;

        insert into ai_test_state(key, payload) values (
            'guest-limit-' || attempt,
            public.reserve_ai_request(
                user_id, true, 'guest-network-hash-' || attempt,
                ('41000000-0000-0000-0000-' || lpad(attempt::text, 12, '0'))::uuid,
                'guest_preview', 100, 50, 3
            )
        );
    end loop;
end;
$$;

select ok(
    (select (payload ->> 'allowed')::boolean from ai_test_state where key = 'guest-limit-50')
    and not (select (payload ->> 'allowed')::boolean from ai_test_state where key = 'guest-limit-51'),
    'the 51st guest request is blocked for the UTC day'
);

select is(
    (select total_count from private.ai_daily_counters where counter_date = current_date),
    50,
    'blocked and failed paths never erase global request accounting'
);

select public.fail_ai_request(
    (select (payload ->> 'event_id')::uuid from ai_test_state where key = 'guest-limit-1'),
    'unknown',
    'provider_timeout'
);
select is(
    (select total_count from private.ai_daily_counters where counter_date = current_date),
    50,
    'unknown provider outcomes remain counted globally'
);

insert into ai_test_state values (
    'unknown-immediate-retry',
    public.reserve_ai_request(
        '40000000-0000-0000-0000-000000000001', true, 'guest-network-retry',
        '42000000-0000-0000-0000-000000000001', 'guest_preview', 100, 50, 3
    )
);
select ok(
    not (select (payload ->> 'allowed')::boolean from ai_test_state where key = 'unknown-immediate-retry')
    and (select payload ->> 'reason' from ai_test_state where key = 'unknown-immediate-retry') = 'unknown_cooldown',
    'unknown outcome blocks immediate automatic retry'
);

update public.ai_usage_events
set updated_at = now() - interval '3 minutes'
where id = (select (payload ->> 'event_id')::uuid from ai_test_state where key = 'guest-limit-1');
update private.ai_daily_counters set guest_count = 0, total_count = 1
where counter_date = current_date;

insert into ai_test_state values (
    'unknown-manual-retry',
    public.reserve_ai_request(
        '40000000-0000-0000-0000-000000000001', true, 'guest-network-retry',
        '42000000-0000-0000-0000-000000000002', 'guest_preview', 100, 50, 3
    )
);
select ok(
    (select (payload ->> 'allowed')::boolean from ai_test_state where key = 'unknown-manual-retry'),
    'unknown outcome permits a new manual request after two minutes'
);

insert into public.scan_entitlements (user_id, welcome_started_at)
values
    ('00000000-0000-0000-0000-000000000201', now()),
    ('00000000-0000-0000-0000-000000000202', now())
on conflict (user_id) do nothing;

set local role authenticated;
set local request.jwt.claims =
    '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated","is_anonymous":false}';

select is(
    (select count(*)::integer from public.scan_entitlements),
    1,
    'permanent user cannot read another account entitlement'
);

reset role;
set local role authenticated;
set local request.jwt.claims =
    '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated","is_anonymous":true}';

select is(
    (select count(*)::integer from public.scan_entitlements),
    0,
    'anonymous user cannot read permanent entitlements'
);

reset role;

select * from finish();
rollback;
