-- Primary lawn cases and server-owned plan transitions.

create table public.lawn_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'observation'
    check (status in ('observation', 'active', 'monitoring', 'paused', 'resolved', 'archived')),
  is_primary boolean not null default false,
  title text not null check (length(btrim(title)) between 1 and 160),
  area_label text check (area_label is null or length(btrim(area_label)) between 1 and 120),
  likely_cause text check (likely_cause is null or length(btrim(likely_cause)) between 1 and 240),
  confidence text check (confidence is null or confidence in ('low', 'medium', 'high')),
  diagnosis jsonb not null,
  plan_seed jsonb not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lawn_cases_primary_status_check
    check (not is_primary or status in ('active', 'monitoring')),
  unique (id, user_id)
);

create index lawn_cases_user_updated_idx
  on public.lawn_cases(user_id, updated_at desc);
create unique index lawn_cases_one_primary_idx
  on public.lawn_cases(user_id)
  where is_primary and status in ('active', 'monitoring');

create table public.plan_steps (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  stage text not null default 'recovery' check (length(btrim(stage)) between 1 and 80),
  kind text not null check (kind in ('action', 'check')),
  title text not null check (length(btrim(title)) between 1 and 200),
  rationale text check (rationale is null or length(btrim(rationale)) between 1 and 1000),
  instructions text not null check (length(btrim(instructions)) between 1 and 4000),
  estimated_effort_minutes integer check (estimated_effort_minutes is null or estimated_effort_minutes between 1 and 1440),
  delay_days integer not null default 0 check (delay_days between 0 and 365),
  follow_up_days integer check (follow_up_days is null or follow_up_days between 0 and 365),
  not_before_at timestamptz,
  due_at timestamptz,
  weather_constraints jsonb,
  check_options jsonb,
  status text not null default 'locked'
    check (status in ('locked', 'ready', 'done', 'postponed', 'skipped')),
  result text,
  completed_at timestamptz,
  postponed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_steps_case_owner_fkey foreign key (case_id, user_id)
    references public.lawn_cases(id, user_id) on delete cascade,
  constraint plan_steps_check_options_check check (
    (kind = 'action' and check_options is null)
    or (kind = 'check' and jsonb_typeof(check_options) = 'array' and jsonb_array_length(check_options) > 0)
  ),
  unique (case_id, step_order)
);

create index plan_steps_user_case_order_idx
  on public.plan_steps(user_id, case_id, step_order);
create index plan_steps_case_status_due_idx
  on public.plan_steps(case_id, status, due_at);

alter table public.lawn_scans
  add column case_id uuid references public.lawn_cases(id) on delete set null,
  add column purpose text check (purpose is null or purpose in ('initial', 'follow_up', 'observation')),
  add column diagnosis_schema_version integer check (diagnosis_schema_version is null or diagnosis_schema_version > 0),
  add column comparison_status text check (comparison_status is null or comparison_status in ('improving', 'unchanged', 'worsening', 'resolved', 'unable')),
  add column comparison_summary text check (comparison_summary is null or length(btrim(comparison_summary)) between 1 and 2000);

create index lawn_scans_case_created_idx
  on public.lawn_scans(case_id, created_at desc)
  where case_id is not null;

alter table public.lawn_cases enable row level security;
alter table public.plan_steps enable row level security;

create policy "Permanent users can read own lawn cases"
  on public.lawn_cases for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
create policy "Permanent users can create own lawn cases"
  on public.lawn_cases for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
create policy "Permanent users can update own lawn cases"
  on public.lawn_cases for update to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
create policy "Permanent users can delete own lawn cases"
  on public.lawn_cases for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

create policy "Permanent users can read own plan steps"
  on public.plan_steps for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
create policy "Permanent users can create own plan steps"
  on public.plan_steps for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
create policy "Permanent users can update own plan steps"
  on public.plan_steps for update to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
create policy "Permanent users can delete own plan steps"
  on public.plan_steps for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

revoke all on table public.lawn_cases, public.plan_steps from public, anon, authenticated;
grant select, insert, update, delete on table public.lawn_cases, public.plan_steps to authenticated;
grant all on table public.lawn_cases, public.plan_steps to service_role;

create or replace function public.start_plan_from_observation(p_case_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_case public.lawn_cases%rowtype;
  v_first_order integer;
begin
  if v_user_id is null
     or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'permanent authentication required' using errcode = '42501';
  end if;

  select * into v_case
  from public.lawn_cases
  where id = p_case_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'lawn case not found or not owned' using errcode = '42501';
  end if;
  if v_case.status <> 'observation' then
    raise exception 'only an observation can start a plan' using errcode = '22023';
  end if;
  if jsonb_typeof(v_case.plan_seed -> 'steps') <> 'array'
     or jsonb_array_length(v_case.plan_seed -> 'steps') = 0 then
    raise exception 'case has no valid plan seed' using errcode = '22023';
  end if;

  select min((step ->> 'order')::integer) into v_first_order
  from jsonb_array_elements(v_case.plan_seed -> 'steps') step;

  update public.lawn_cases
  set status = 'active', is_primary = true, updated_at = clock_timestamp()
  where id = v_case.id;

  insert into public.plan_steps (
    case_id, user_id, step_order, stage, kind, title, rationale, instructions,
    estimated_effort_minutes, delay_days, follow_up_days, not_before_at, due_at,
    weather_constraints, check_options, status
  )
  select
    v_case.id,
    v_user_id,
    (step ->> 'order')::integer,
    coalesce(nullif(step ->> 'stage', ''), 'recovery'),
    step ->> 'kind',
    step ->> 'title',
    nullif(step ->> 'rationale', ''),
    step ->> 'instructions',
    case when step ? 'estimated_effort_minutes' then (step ->> 'estimated_effort_minutes')::integer end,
    coalesce((step ->> 'due_in_days')::integer, 0),
    case when step ? 'follow_up_in_days' then (step ->> 'follow_up_in_days')::integer end,
    case when (step ->> 'order')::integer = v_first_order then clock_timestamp() + (coalesce((step ->> 'due_in_days')::integer, 0) * interval '1 day') end,
    case when (step ->> 'order')::integer = v_first_order then clock_timestamp() + (coalesce((step ->> 'due_in_days')::integer, 0) * interval '1 day') end,
    step -> 'weather_constraints',
    case when step ->> 'kind' = 'check' then step -> 'check_options' end,
    case when (step ->> 'order')::integer = v_first_order then 'ready' else 'locked' end
  from jsonb_array_elements(v_case.plan_seed -> 'steps') step
  on conflict (case_id, step_order) do nothing;

  return v_case.id;
end;
$$;

create or replace function public.complete_plan_step(p_step_id uuid, p_result text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_step public.plan_steps%rowtype;
  v_next_order integer;
  v_next_id uuid;
  v_case_status text;
begin
  if v_user_id is null
     or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'permanent authentication required' using errcode = '42501';
  end if;

  select * into v_step
  from public.plan_steps
  where id = p_step_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'plan step not found or not owned' using errcode = '42501';
  end if;
  if v_step.status <> 'ready'
     and not (v_step.status = 'postponed' and v_step.due_at <= clock_timestamp()) then
    raise exception 'plan step is not ready' using errcode = '22023';
  end if;

  if v_step.kind = 'check' then
    select (option ->> 'next_order')::integer into v_next_order
    from jsonb_array_elements(v_step.check_options) option
    where option ->> 'value' = p_result;
    if not found then
      raise exception 'invalid check outcome' using errcode = '22023';
    end if;
    if v_next_order = v_step.step_order then
      update public.plan_steps
      set status = 'ready', result = p_result, completed_at = null, updated_at = clock_timestamp()
      where id = v_step.id;
      return jsonb_build_object('case_id', v_step.case_id, 'next_step_id', v_step.id, 'case_status', 'active');
    end if;
  else
    select min(step_order) into v_next_order
    from public.plan_steps
    where case_id = v_step.case_id and step_order > v_step.step_order and status = 'locked';
  end if;

  update public.plan_steps
  set status = 'done', result = p_result, completed_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = v_step.id;

  if v_next_order is not null then
    update public.plan_steps
    set status = 'skipped', updated_at = clock_timestamp()
    where case_id = v_step.case_id
      and step_order > v_step.step_order
      and step_order < v_next_order
      and status = 'locked';

    update public.plan_steps
    set status = 'ready',
        not_before_at = clock_timestamp() + (delay_days * interval '1 day'),
        due_at = clock_timestamp() + (delay_days * interval '1 day'),
        updated_at = clock_timestamp()
    where case_id = v_step.case_id and step_order = v_next_order and status = 'locked'
    returning id into v_next_id;
  end if;

  if v_next_id is null then
    update public.lawn_cases
    set status = 'monitoring', updated_at = clock_timestamp()
    where id = v_step.case_id and user_id = v_user_id
    returning status into v_case_status;
  else
    v_case_status := 'active';
  end if;

  return jsonb_build_object('case_id', v_step.case_id, 'next_step_id', v_next_id, 'case_status', v_case_status);
end;
$$;

create or replace function public.postpone_plan_step(p_step_id uuid, p_due_at timestamptz)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null
     or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'permanent authentication required' using errcode = '42501';
  end if;
  if p_due_at <= clock_timestamp() then
    raise exception 'postponed due time must be in the future' using errcode = '22023';
  end if;

  update public.plan_steps
  set status = 'postponed', due_at = p_due_at, postponed_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = p_step_id and user_id = v_user_id and status = 'ready';
  if not found then
    raise exception 'ready plan step not found or not owned' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.switch_primary_case(p_case_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_case public.lawn_cases%rowtype;
  v_first_order integer;
begin
  if v_user_id is null
     or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'permanent authentication required' using errcode = '42501';
  end if;

  perform id from public.lawn_cases
  where user_id = v_user_id and (id = p_case_id or is_primary)
  order by id
  for update;

  select * into v_case
  from public.lawn_cases
  where id = p_case_id and user_id = v_user_id;
  if not found then
    raise exception 'lawn case not found or not owned' using errcode = '42501';
  end if;
  if v_case.status not in ('observation', 'active', 'monitoring', 'paused') then
    raise exception 'case cannot become primary' using errcode = '22023';
  end if;

  update public.lawn_cases
  set status = 'paused', is_primary = false, updated_at = clock_timestamp()
  where user_id = v_user_id and is_primary and id <> p_case_id;

  if v_case.status = 'observation' and not exists (
    select 1 from public.plan_steps where case_id = v_case.id
  ) then
    if jsonb_typeof(v_case.plan_seed -> 'steps') <> 'array'
       or jsonb_array_length(v_case.plan_seed -> 'steps') = 0 then
      raise exception 'case has no valid plan seed' using errcode = '22023';
    end if;
    select min((step ->> 'order')::integer) into v_first_order
    from jsonb_array_elements(v_case.plan_seed -> 'steps') step;

    insert into public.plan_steps (
      case_id, user_id, step_order, stage, kind, title, rationale, instructions,
      estimated_effort_minutes, delay_days, follow_up_days, not_before_at, due_at,
      weather_constraints, check_options, status
    )
    select
      v_case.id, v_user_id, (step ->> 'order')::integer,
      coalesce(nullif(step ->> 'stage', ''), 'recovery'), step ->> 'kind', step ->> 'title',
      nullif(step ->> 'rationale', ''), step ->> 'instructions',
      case when step ? 'estimated_effort_minutes' then (step ->> 'estimated_effort_minutes')::integer end,
      coalesce((step ->> 'due_in_days')::integer, 0),
      case when step ? 'follow_up_in_days' then (step ->> 'follow_up_in_days')::integer end,
      case when (step ->> 'order')::integer = v_first_order then clock_timestamp() + (coalesce((step ->> 'due_in_days')::integer, 0) * interval '1 day') end,
      case when (step ->> 'order')::integer = v_first_order then clock_timestamp() + (coalesce((step ->> 'due_in_days')::integer, 0) * interval '1 day') end,
      step -> 'weather_constraints',
      case when step ->> 'kind' = 'check' then step -> 'check_options' end,
      case when (step ->> 'order')::integer = v_first_order then 'ready' else 'locked' end
    from jsonb_array_elements(v_case.plan_seed -> 'steps') step;
  end if;

  update public.lawn_cases
  set status = case when v_case.status = 'monitoring' then 'monitoring' else 'active' end,
      is_primary = true,
      updated_at = clock_timestamp()
  where id = p_case_id and user_id = v_user_id;
end;
$$;

revoke all on function public.start_plan_from_observation(uuid) from public, anon, authenticated;
revoke all on function public.complete_plan_step(uuid, text) from public, anon, authenticated;
revoke all on function public.postpone_plan_step(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.switch_primary_case(uuid) from public, anon, authenticated;
grant execute on function public.start_plan_from_observation(uuid) to authenticated;
grant execute on function public.complete_plan_step(uuid, text) to authenticated;
grant execute on function public.postpone_plan_step(uuid, timestamptz) to authenticated;
grant execute on function public.switch_primary_case(uuid) to authenticated;
