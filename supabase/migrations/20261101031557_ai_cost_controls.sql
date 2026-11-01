-- ============================================================
-- My Lawn — AI cost controls and scan entitlements
-- ============================================================

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table public.scan_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier = 'free'),
  welcome_started_at timestamptz not null default now(),
  welcome_limit integer not null default 3 check (welcome_limit between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_key uuid not null,
  route text not null check (route in ('guest_preview', 'personalized', 'follow_up')),
  allowance_source text not null check (allowance_source in ('guest', 'welcome', 'monthly')),
  status text not null default 'reserved'
    check (status in ('reserved', 'started', 'completed', 'failed', 'unusable', 'unknown')),
  scan_id uuid references public.lawn_scans(id) on delete set null,
  model text,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  thought_tokens integer check (thought_tokens >= 0),
  total_tokens integer check (total_tokens >= 0),
  error_code text,
  started_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_key)
);

create index ai_usage_events_user_created_idx
  on public.ai_usage_events(user_id, created_at desc);

create unique index ai_usage_events_one_inflight_per_user_idx
  on public.ai_usage_events(user_id)
  where status in ('reserved', 'started');

create table private.ai_daily_counters (
  counter_date date primary key,
  total_count integer not null default 0 check (total_count >= 0),
  guest_count integer not null default 0 check (guest_count >= 0),
  updated_at timestamptz not null default now()
);

create table private.ai_network_attempts (
  id uuid primary key default gen_random_uuid(),
  network_hash text not null check (length(network_hash) between 16 and 256),
  event_id uuid not null unique references public.ai_usage_events(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index ai_network_attempts_hash_created_idx
  on private.ai_network_attempts(network_hash, created_at desc);

create table private.ai_runtime_state (
  singleton boolean primary key default true check (singleton),
  circuit_open_until timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  updated_at timestamptz not null default now()
);

insert into private.ai_runtime_state(singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.scan_entitlements enable row level security;
alter table public.ai_usage_events enable row level security;

create policy "Permanent users can read their own scan entitlement"
  on public.scan_entitlements
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

create policy "Users can read their own safe AI usage"
  on public.ai_usage_events
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (
      coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
      or route = 'guest_preview'
    )
  );

revoke all on table public.scan_entitlements from public, anon, authenticated;
revoke all on table public.ai_usage_events from public, anon, authenticated;
grant select on table public.scan_entitlements to authenticated;
grant select on table public.ai_usage_events to authenticated;
grant all on table public.scan_entitlements to service_role;
grant all on table public.ai_usage_events to service_role;

revoke all on all tables in schema private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema private to service_role;

create or replace function public.reserve_ai_request(
  p_user_id uuid,
  p_is_anonymous boolean,
  p_network_hash text,
  p_request_key uuid,
  p_route text,
  p_global_limit integer,
  p_guest_limit integer,
  p_network_limit integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_counter_date date := (clock_timestamp() at time zone 'UTC')::date;
  v_existing public.ai_usage_events%rowtype;
  v_entitlement public.scan_entitlements%rowtype;
  v_event_id uuid;
  v_allowance_source text;
  v_personal_used integer;
  v_network_used integer;
  v_period_index integer;
  v_period_start timestamptz;
  v_reset_at timestamptz;
  v_daily private.ai_daily_counters%rowtype;
begin
  if p_user_id is null or p_request_key is null then
    raise exception 'user_id and request_key are required' using errcode = '22023';
  end if;

  if p_route not in ('guest_preview', 'personalized', 'follow_up') then
    raise exception 'invalid AI route' using errcode = '22023';
  end if;

  if p_global_limit < 1 or p_guest_limit < 0 or p_network_limit < 1 then
    raise exception 'AI limits must be positive' using errcode = '22023';
  end if;

  if (p_is_anonymous and p_route <> 'guest_preview')
     or (not p_is_anonymous and p_route = 'guest_preview') then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_session_route');
  end if;

  if p_is_anonymous and (p_network_hash is null or length(p_network_hash) < 16) then
    raise exception 'network hash is required for guest preview' using errcode = '22023';
  end if;

  -- The global lock makes counter and network reservations atomic. The user
  -- lock documents and preserves the per-identity serialization contract.
  perform pg_advisory_xact_lock(hashtextextended('my-lawn-ai-global-' || v_counter_date::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('my-lawn-ai-user-' || p_user_id::text, 0));

  select * into v_existing
  from public.ai_usage_events
  where user_id = p_user_id and request_key = p_request_key;

  if found then
    return jsonb_build_object(
      'allowed', v_existing.status in ('reserved', 'started', 'completed', 'unknown'),
      'duplicate', true,
      'event_id', v_existing.id,
      'status', v_existing.status,
      'allowance_source', v_existing.allowance_source,
      'scan_id', v_existing.scan_id
    );
  end if;

  select * into v_existing
  from public.ai_usage_events
  where user_id = p_user_id
    and status = 'unknown'
  order by updated_at desc
  limit 1;

  if found and v_existing.updated_at > v_now - interval '2 minutes' then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'unknown_cooldown',
      'retry_at', v_existing.updated_at + interval '2 minutes'
    );
  end if;

  if exists (
    select 1 from public.ai_usage_events
    where user_id = p_user_id and status in ('reserved', 'started')
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'request_in_flight');
  end if;

  if p_is_anonymous then
    v_allowance_source := 'guest';
    select count(*)::integer into v_personal_used
    from public.ai_usage_events
    where user_id = p_user_id
      and allowance_source = 'guest'
      and status = 'completed';

    if v_personal_used >= 1 then
      return jsonb_build_object('allowed', false, 'reason', 'personal_allowance_exhausted');
    end if;
  else
    insert into public.scan_entitlements(user_id)
    values (p_user_id)
    on conflict (user_id) do nothing;

    select * into strict v_entitlement
    from public.scan_entitlements
    where user_id = p_user_id;

    if v_now < v_entitlement.welcome_started_at + interval '30 days' then
      v_allowance_source := 'welcome';
      v_reset_at := v_entitlement.welcome_started_at + interval '30 days';

      select count(*)::integer into v_personal_used
      from public.ai_usage_events
      where user_id = p_user_id
        and allowance_source = 'welcome'
        and status = 'completed';

      if v_personal_used >= v_entitlement.welcome_limit then
        return jsonb_build_object(
          'allowed', false,
          'reason', 'personal_allowance_exhausted',
          'reset_at', v_reset_at
        );
      end if;
    else
      v_allowance_source := 'monthly';
      v_period_index := floor(
        extract(epoch from (v_now - v_entitlement.welcome_started_at)) /
        extract(epoch from interval '30 days')
      )::integer;
      v_period_start := v_entitlement.welcome_started_at + (v_period_index * interval '30 days');
      v_reset_at := v_period_start + interval '30 days';

      select count(*)::integer into v_personal_used
      from public.ai_usage_events
      where user_id = p_user_id
        and allowance_source = 'monthly'
        and status = 'completed'
        and created_at >= v_period_start;

      if v_personal_used >= 1 then
        return jsonb_build_object(
          'allowed', false,
          'reason', 'personal_allowance_exhausted',
          'reset_at', v_reset_at
        );
      end if;
    end if;
  end if;

  if p_is_anonymous then
    delete from private.ai_network_attempts
    where created_at <= v_now - interval '24 hours';

    select count(*)::integer into v_network_used
    from private.ai_network_attempts
    where network_hash = p_network_hash
      and created_at > v_now - interval '24 hours';

    if v_network_used >= p_network_limit then
      return jsonb_build_object('allowed', false, 'reason', 'network_limit_exhausted');
    end if;
  end if;

  insert into private.ai_daily_counters(counter_date)
  values (v_counter_date)
  on conflict (counter_date) do nothing;

  select * into strict v_daily
  from private.ai_daily_counters
  where counter_date = v_counter_date
  for update;

  if v_daily.total_count >= p_global_limit then
    return jsonb_build_object('allowed', false, 'reason', 'global_limit_exhausted');
  end if;

  if p_is_anonymous and v_daily.guest_count >= p_guest_limit then
    return jsonb_build_object('allowed', false, 'reason', 'guest_global_limit_exhausted');
  end if;

  insert into public.ai_usage_events(
    user_id,
    request_key,
    route,
    allowance_source,
    status
  ) values (
    p_user_id,
    p_request_key,
    p_route,
    v_allowance_source,
    'reserved'
  )
  returning id into v_event_id;

  update private.ai_daily_counters
  set total_count = total_count + 1,
      guest_count = guest_count + case when p_is_anonymous then 1 else 0 end,
      updated_at = v_now
  where counter_date = v_counter_date;

  if p_is_anonymous then
    insert into private.ai_network_attempts(network_hash, event_id, created_at)
    values (p_network_hash, v_event_id, v_now);
  end if;

  return jsonb_build_object(
    'allowed', true,
    'duplicate', false,
    'event_id', v_event_id,
    'status', 'reserved',
    'allowance_source', v_allowance_source,
    'reset_at', v_reset_at
  );
end;
$$;

create or replace function public.mark_ai_request_started(p_event_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event public.ai_usage_events%rowtype;
begin
  update public.ai_usage_events
  set status = 'started',
      started_at = coalesce(started_at, clock_timestamp()),
      updated_at = clock_timestamp()
  where id = p_event_id and status = 'reserved'
  returning * into v_event;

  if not found then
    select * into v_event from public.ai_usage_events where id = p_event_id;
  end if;

  if v_event.id is null then
    raise exception 'AI usage event not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('event_id', v_event.id, 'status', v_event.status);
end;
$$;

create or replace function public.finalize_ai_request(
  p_event_id uuid,
  p_scan_id uuid,
  p_usage jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_input integer;
  v_output integer;
  v_thought integer;
  v_total integer;
begin
  v_input := (p_usage ->> 'input_tokens')::integer;
  v_output := (p_usage ->> 'output_tokens')::integer;
  v_thought := (p_usage ->> 'thought_tokens')::integer;
  v_total := (p_usage ->> 'total_tokens')::integer;

  if p_usage ->> 'model' is null
     or least(v_input, v_output, v_thought, v_total) < 0 then
    raise exception 'invalid AI usage metadata' using errcode = '22023';
  end if;

  update public.ai_usage_events
  set status = 'completed',
      scan_id = p_scan_id,
      model = p_usage ->> 'model',
      input_tokens = v_input,
      output_tokens = v_output,
      thought_tokens = v_thought,
      total_tokens = v_total,
      finalized_at = clock_timestamp(),
      updated_at = clock_timestamp(),
      error_code = null
  where id = p_event_id and status in ('reserved', 'started');

  if not found then
    raise exception 'AI usage event is not finalizable' using errcode = 'P0002';
  end if;

  update private.ai_runtime_state
  set consecutive_failures = 0,
      updated_at = clock_timestamp()
  where singleton;
end;
$$;

create or replace function public.fail_ai_request(
  p_event_id uuid,
  p_status text,
  p_error_code text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_status not in ('failed', 'unusable', 'unknown') then
    raise exception 'invalid terminal AI status' using errcode = '22023';
  end if;

  update public.ai_usage_events
  set status = p_status,
      error_code = p_error_code,
      finalized_at = case when p_status = 'unknown' then null else clock_timestamp() end,
      updated_at = clock_timestamp()
  where id = p_event_id and status in ('reserved', 'started');

  if not found then
    raise exception 'AI usage event is not fail-able' using errcode = 'P0002';
  end if;

  if p_status in ('failed', 'unknown') then
    update private.ai_runtime_state
    set consecutive_failures = consecutive_failures + 1,
        updated_at = clock_timestamp()
    where singleton;
  end if;
end;
$$;

revoke all on function public.reserve_ai_request(uuid, boolean, text, uuid, text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.mark_ai_request_started(uuid)
  from public, anon, authenticated;
revoke all on function public.finalize_ai_request(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.fail_ai_request(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.reserve_ai_request(uuid, boolean, text, uuid, text, integer, integer, integer)
  to service_role;
grant execute on function public.mark_ai_request_started(uuid)
  to service_role;
grant execute on function public.finalize_ai_request(uuid, uuid, jsonb)
  to service_role;
grant execute on function public.fail_ai_request(uuid, text, text)
  to service_role;
