-- ============================================================
-- My Lawn — service-only runtime circuit boundary and usage audit flag
-- ============================================================

alter table public.ai_usage_events
  add column usage_metadata_complete boolean,
  add column response_payload jsonb;

create or replace function public.get_ai_runtime_state()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'circuit_open_until', circuit_open_until,
    'consecutive_failures', consecutive_failures
  )
  from private.ai_runtime_state
  where singleton;
$$;

create or replace function public.evaluate_ai_circuit()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state private.ai_runtime_state%rowtype;
  v_recent_count integer;
  v_recent_failures integer;
  v_should_open boolean;
begin
  select * into v_state
  from private.ai_runtime_state
  where singleton
  for update;

  select count(*)::integer,
         count(*) filter (where status in ('failed', 'unknown'))::integer
    into v_recent_count, v_recent_failures
  from (
    select status
    from public.ai_usage_events
    where status in ('completed', 'failed', 'unusable', 'unknown')
    order by coalesce(finalized_at, updated_at, created_at) desc
    limit 20
  ) recent;

  v_should_open := v_state.consecutive_failures >= 10
    or (v_recent_count = 20 and v_recent_failures > 10);

  if v_should_open then
    update private.ai_runtime_state
    set circuit_open_until = greatest(
          coalesce(circuit_open_until, '-infinity'::timestamptz),
          clock_timestamp() + interval '15 minutes'
        ),
        updated_at = clock_timestamp()
    where singleton
    returning * into v_state;
  end if;

  return jsonb_build_object(
    'opened', v_should_open,
    'circuit_open_until', v_state.circuit_open_until,
    'consecutive_failures', v_state.consecutive_failures,
    'recent_count', v_recent_count,
    'recent_failures', v_recent_failures
  );
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
  v_metadata_complete boolean;
begin
  v_input := (p_usage ->> 'input_tokens')::integer;
  v_output := (p_usage ->> 'output_tokens')::integer;
  v_thought := (p_usage ->> 'thought_tokens')::integer;
  v_total := (p_usage ->> 'total_tokens')::integer;
  -- Older trusted callers did not send this field. Preserve their behavior while
  -- allowing the hardened Edge Function to explicitly flag incomplete metadata.
  v_metadata_complete := coalesce((p_usage ->> 'metadata_complete')::boolean, true);

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
      usage_metadata_complete = v_metadata_complete,
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

revoke all on function public.get_ai_runtime_state()
  from public, anon, authenticated;
revoke all on function public.evaluate_ai_circuit()
  from public, anon, authenticated;

grant execute on function public.get_ai_runtime_state()
  to service_role;
grant execute on function public.evaluate_ai_circuit()
  to service_role;

create or replace function public.reserve_ai_request_v2(
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
  v_result jsonb;
  v_circuit_open_until timestamptz;
  v_response jsonb;
  v_stale_started integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'my-lawn-ai-global-' || (clock_timestamp() at time zone 'UTC')::date::text,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended('my-lawn-ai-user-' || p_user_id::text, 0));

  select circuit_open_until into v_circuit_open_until
  from private.ai_runtime_state
  where singleton;

  if v_circuit_open_until > clock_timestamp() then
    return jsonb_build_object('allowed', false, 'reason', 'circuit_open');
  end if;

  -- A crashed worker must not strand an identity forever. Dispatched attempts
  -- remain globally accounted, explicitly lack usage metadata, and contribute
  -- to circuit pressure. Reserved-only attempts never reached the provider.
  select count(*)::integer into v_stale_started
  from public.ai_usage_events
  where user_id = p_user_id
    and status = 'started'
    and updated_at <= clock_timestamp() - interval '2 minutes';

  update public.ai_usage_events
  set status = 'unknown',
      error_code = 'started_lease_expired',
      usage_metadata_complete = false
  where user_id = p_user_id
    and status = 'started'
    and updated_at <= clock_timestamp() - interval '2 minutes';

  update public.ai_usage_events
  set status = 'unknown',
      error_code = 'reservation_lease_expired'
  where user_id = p_user_id
    and status = 'reserved'
    and updated_at <= clock_timestamp() - interval '2 minutes';

  if v_stale_started > 0 then
    update private.ai_runtime_state
    set consecutive_failures = consecutive_failures + v_stale_started,
        updated_at = clock_timestamp()
    where singleton;
    v_result := public.evaluate_ai_circuit();
    if (v_result ->> 'circuit_open_until')::timestamptz > clock_timestamp() then
      return jsonb_build_object('allowed', false, 'reason', 'circuit_open');
    end if;
  end if;

  v_result := public.reserve_ai_request(
    p_user_id,
    p_is_anonymous,
    p_network_hash,
    p_request_key,
    p_route,
    p_global_limit,
    p_guest_limit,
    p_network_limit
  );

  if (v_result ->> 'duplicate')::boolean
     and v_result ->> 'status' = 'completed' then
    select response_payload into v_response
    from public.ai_usage_events
    where id = (v_result ->> 'event_id')::uuid;
    v_result := v_result || jsonb_build_object('response_payload', v_response);
  end if;

  return v_result;
end;
$$;

create or replace function public.mark_ai_request_started_v2(p_event_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_circuit_open_until timestamptz;
  v_result jsonb;
begin
  select user_id into v_user_id
  from public.ai_usage_events
  where id = p_event_id;

  if v_user_id is null then
    raise exception 'AI usage event not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'my-lawn-ai-global-' || (clock_timestamp() at time zone 'UTC')::date::text,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended('my-lawn-ai-user-' || v_user_id::text, 0));

  select circuit_open_until into v_circuit_open_until
  from private.ai_runtime_state
  where singleton
  for update;

  if v_circuit_open_until > clock_timestamp() then
    update public.ai_usage_events
    set status = 'failed',
        error_code = 'circuit_open_before_start',
        finalized_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_event_id and status = 'reserved';
    return jsonb_build_object('started', false, 'reason', 'circuit_open');
  end if;

  v_result := public.mark_ai_request_started(p_event_id);
  return v_result || jsonb_build_object('started', true);
end;
$$;

create or replace function public.finalize_ai_request_v2(
  p_event_id uuid,
  p_scan_id uuid,
  p_usage jsonb,
  p_response jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_response is null or jsonb_typeof(p_response) <> 'object' then
    raise exception 'invalid AI response payload' using errcode = '22023';
  end if;

  perform public.finalize_ai_request(p_event_id, p_scan_id, p_usage);

  update public.ai_usage_events
  set response_payload = p_response,
      updated_at = clock_timestamp()
  where id = p_event_id and status = 'completed';
end;
$$;

create or replace function public.fail_ai_request_v2(
  p_event_id uuid,
  p_status text,
  p_error_code text,
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
  v_metadata_complete boolean;
begin
  perform public.fail_ai_request(p_event_id, p_status, p_error_code);

  if p_usage is not null then
    v_input := (p_usage ->> 'input_tokens')::integer;
    v_output := (p_usage ->> 'output_tokens')::integer;
    v_thought := (p_usage ->> 'thought_tokens')::integer;
    v_total := (p_usage ->> 'total_tokens')::integer;
    v_metadata_complete := coalesce((p_usage ->> 'metadata_complete')::boolean, false);

    if p_usage ->> 'model' is null
       or least(v_input, v_output, v_thought, v_total) < 0 then
      raise exception 'invalid AI usage metadata' using errcode = '22023';
    end if;

    update public.ai_usage_events
    set model = p_usage ->> 'model',
        input_tokens = v_input,
        output_tokens = v_output,
        thought_tokens = v_thought,
        total_tokens = v_total,
        usage_metadata_complete = v_metadata_complete,
        updated_at = clock_timestamp()
    where id = p_event_id;
  else
    update public.ai_usage_events
    set usage_metadata_complete = false,
        updated_at = clock_timestamp()
    where id = p_event_id;
  end if;
end;
$$;

revoke all on function public.reserve_ai_request_v2(uuid, boolean, text, uuid, text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.mark_ai_request_started_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.finalize_ai_request_v2(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.fail_ai_request_v2(uuid, text, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.reserve_ai_request_v2(uuid, boolean, text, uuid, text, integer, integer, integer)
  to service_role;
grant execute on function public.mark_ai_request_started_v2(uuid)
  to service_role;
grant execute on function public.finalize_ai_request_v2(uuid, uuid, jsonb, jsonb)
  to service_role;
grant execute on function public.fail_ai_request_v2(uuid, text, text, jsonb)
  to service_role;
