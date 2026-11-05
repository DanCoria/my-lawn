-- Persist model-proposed follow-up comparisons separately from owner confirmation.

alter table public.lawn_scans
  drop constraint if exists lawn_scans_comparison_status_check;

alter table public.lawn_scans
  add column comparison_proposal_status text
    check (comparison_proposal_status is null or comparison_proposal_status in (
      'improving', 'unchanged', 'worsening', 'resolved', 'unable_to_determine'
    )),
  add column comparison_proposal_summary text
    check (comparison_proposal_summary is null or length(btrim(comparison_proposal_summary)) between 1 and 2000),
  add column comparison_evidence jsonb
    check (comparison_evidence is null or jsonb_typeof(comparison_evidence) = 'array'),
  add column comparison_confirmed_at timestamptz,
  add constraint lawn_scans_comparison_status_check
    check (comparison_status is null or comparison_status in (
      'improving', 'unchanged', 'worsening', 'resolved', 'unable_to_determine'
    ));

drop policy if exists "Users can view their own scans" on public.lawn_scans;
drop policy if exists "Users can insert their own scans" on public.lawn_scans;
drop policy if exists "Users can delete their own scans" on public.lawn_scans;

create policy "Permanent users can view own scans"
  on public.lawn_scans for select to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

create policy "Permanent users can insert own scans"
  on public.lawn_scans for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

create policy "Permanent users can update own follow-up scans"
  on public.lawn_scans for update to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  )
  with check (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

create policy "Permanent users can delete own scans"
  on public.lawn_scans for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

grant select, insert, update, delete on table public.lawn_scans to authenticated;

drop policy if exists "Users can upload their own scan images" on storage.objects;
drop policy if exists "Users can view their own scan images" on storage.objects;
drop policy if exists "Users can delete their own scan images" on storage.objects;

create policy "Permanent users can upload own scan images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lawn-scans'
    and (select auth.uid())::text = (storage.foldername(name))[1]
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
create policy "Permanent users can view own scan images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'lawn-scans'
    and (select auth.uid())::text = (storage.foldername(name))[1]
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );
create policy "Permanent users can delete own scan images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'lawn-scans'
    and (select auth.uid())::text = (storage.foldername(name))[1]
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

create or replace function public.confirm_scan_comparison(
  p_case_id uuid,
  p_scan_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_case public.lawn_cases%rowtype;
  v_scan public.lawn_scans%rowtype;
  v_case_status text;
begin
  if v_user_id is null
     or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'permanent authentication required' using errcode = '42501';
  end if;
  if p_status not in ('improving', 'unchanged', 'worsening', 'resolved', 'unable_to_determine') then
    raise exception 'invalid comparison status' using errcode = '22023';
  end if;

  select * into v_case
  from public.lawn_cases
  where id = p_case_id and user_id = v_user_id
  for update;
  if not found or not v_case.is_primary or v_case.status not in ('active', 'monitoring') then
    raise exception 'current lawn case not found or not owned' using errcode = '42501';
  end if;

  select * into v_scan
  from public.lawn_scans
  where id = p_scan_id
    and user_id = v_user_id
    and case_id = p_case_id
    and purpose = 'follow_up'
  for update;
  if not found then
    raise exception 'follow-up scan not found or not owned' using errcode = '42501';
  end if;
  if v_scan.comparison_proposal_status is null or v_scan.comparison_proposal_summary is null then
    raise exception 'follow-up scan has no comparison proposal' using errcode = '22023';
  end if;

  update public.lawn_scans
  set comparison_status = p_status,
      comparison_summary = v_scan.comparison_proposal_summary,
      comparison_confirmed_at = clock_timestamp()
  where id = p_scan_id and user_id = v_user_id;

  if p_status = 'resolved' then
    update public.lawn_cases
    set status = 'resolved', is_primary = false, resolved_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = p_case_id and user_id = v_user_id
    returning status into v_case_status;
  elsif p_status = 'worsening' then
    update public.lawn_cases
    set status = 'active', updated_at = clock_timestamp()
    where id = p_case_id and user_id = v_user_id
    returning status into v_case_status;
  elsif p_status in ('improving', 'unchanged') then
    update public.lawn_cases
    set status = 'monitoring', updated_at = clock_timestamp()
    where id = p_case_id and user_id = v_user_id
    returning status into v_case_status;
  else
    v_case_status := v_case.status;
  end if;

  return jsonb_build_object('case_status', v_case_status, 'confirmed_status', p_status);
end;
$$;

revoke all on function public.confirm_scan_comparison(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_scan_comparison(uuid, uuid, text) to authenticated;
