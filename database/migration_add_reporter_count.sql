-- Migration: Add reporter_count to track unique users instead of total reports
-- This ensures priority only increases when different people report the same issue
-- Also adds additional validation and error handling to RPC functions

-- Add reporter_count column to issue_groups
alter table public.issue_groups add column if not exists reporter_count int not null default 1;

-- Backfill existing data: count unique users per group
update public.issue_groups
set reporter_count = (
  select count(distinct user_id)
  from public.reports r
  where r.group_id = issue_groups.id
);

-- Update submit_report function to check if user already reported this group
-- Includes additional validation for coordinates and null safety
create or replace function public.submit_report(
  p_client_request_id uuid, p_image_url text, p_lat double precision, p_lng double precision,
  p_address text, p_ward text, p_category text, p_severity text,
  p_ai_category text, p_ai_severity text, p_ai_description text, p_ai_confidence numeric,
  p_user_corrected boolean, p_note text, p_merge_group_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_existing record;
  v_group_id uuid;
  v_dept uuid;
  v_count int;
  v_reporter_count int;
  v_report_id uuid;
  v_merged boolean := false;
  v_already_reported boolean := false;
  v_point geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_image_url is null or length(p_image_url) = 0 then raise exception 'image required'; end if;
  if p_note is not null and length(p_note) > 500 then raise exception 'note too long'; end if;

  -- idempotency: a double tap returns the same result
  select r.id, r.group_id into v_existing from public.reports r
   where r.user_id = v_uid and r.client_request_id = p_client_request_id;
  if found then
    select report_count, reporter_count into v_count, v_reporter_count
    from public.issue_groups where id = v_existing.group_id;
    -- Handle case where group might have been deleted
    if v_count is null then
      v_count := 1;
      v_reporter_count := 1;
    end if;
    return jsonb_build_object('report_id', v_existing.id, 'group_id', v_existing.group_id,
      'merged', v_reporter_count > 1, 'report_count', v_count, 'reporter_count', v_reporter_count, 'duplicate_submission', true);
  end if;

  if p_merge_group_id is not null then
    -- Check if this user already reported this group
    select id into v_existing from public.reports
     where user_id = v_uid and group_id = p_merge_group_id;
    if found then
      v_already_reported := true;
    end if;

    -- Only merge if user hasn't reported this group yet
    if not v_already_reported then
      select id into v_group_id from public.issue_groups
       where id = p_merge_group_id and status <> 'resolved' and category = p_category
         and st_dwithin(location, v_point, 75)
       for update;
    end if;
  end if;

  -- Validate coordinates are finite numbers
  if not (abs(p_lat) <= 90 and abs(p_lng) <= 180) then
    raise exception 'invalid coordinates';
  end if;

  if v_group_id is not null then
    -- Increment both report_count and reporter_count
    update public.issue_groups
       set report_count = report_count + 1,
           reporter_count = reporter_count + 1,
           updated_at = now(),
           severity = case when public.sev_rank(p_severity) > public.sev_rank(severity) then p_severity else severity end
     where id = v_group_id returning report_count, reporter_count into v_count, v_reporter_count;
    v_merged := true;
  else
    select id into v_dept from public.departments where p_category = any(categories) limit 1;
    if v_dept is null then select id into v_dept from public.departments where name = 'General Grievance Cell'; end if;
    insert into public.issue_groups (category, severity, address, ward, location, department_id, cover_image_url, report_count, reporter_count)
    values (p_category, p_severity, p_address, p_ward, v_point, v_dept, p_image_url, 1, 1)
    returning id into v_group_id;
    v_count := 1;
    v_reporter_count := 1;
    insert into public.status_logs (group_id, from_status, to_status, changed_by, note)
    values (v_group_id, null, 'submitted', v_uid, 'Issue created');
  end if;

  insert into public.reports (user_id, group_id, image_url, ai_category, ai_severity, ai_description, ai_confidence,
    confirmed_category, user_corrected, note, address, location, client_request_id)
  values (v_uid, v_group_id, p_image_url, p_ai_category, p_ai_severity, p_ai_description, p_ai_confidence,
    p_category, coalesce(p_user_corrected, false), p_note, p_address, v_point, p_client_request_id)
  returning id into v_report_id;

  return jsonb_build_object('report_id', v_report_id, 'group_id', v_group_id,
    'merged', v_merged, 'report_count', v_count, 'reporter_count', v_reporter_count, 'duplicate_submission', false);
end; $$;

-- Update admin_update_status function with additional validation and error handling
create or replace function public.admin_update_status(
  p_group_id uuid, p_new_status text, p_note text default null, p_proof_url text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old text;
  v_rank_old int;
  v_rank_new int;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_group_id is null then raise exception 'group_id required'; end if;
  if p_new_status not in ('submitted','processing','resolved') then raise exception 'invalid status'; end if;
  if p_note is not null and length(p_note) > 500 then raise exception 'note too long'; end if;
  if p_proof_url is not null and length(trim(p_proof_url)) > 2000 then raise exception 'proof_url too long'; end if;

  select status into v_old from public.issue_groups where id = p_group_id for update;
  if v_old is null then raise exception 'issue not found'; end if;

  v_rank_old := case v_old when 'submitted' then 1 when 'processing' then 2 else 3 end;
  v_rank_new := case p_new_status when 'submitted' then 1 when 'processing' then 2 else 3 end;
  if v_rank_new <= v_rank_old then raise exception 'status can only move forward'; end if;

  if p_new_status = 'resolved' and (p_proof_url is null or length(trim(p_proof_url)) = 0) then
    raise exception 'proof photo is required to resolve an issue';
  end if;

  update public.issue_groups set status = p_new_status, updated_at = now(),
    resolved_at = case when p_new_status = 'resolved' then now() else resolved_at end,
    resolution_proof_url = case when p_new_status = 'resolved' then p_proof_url else resolution_proof_url end,
    resolution_note = case when p_new_status = 'resolved' then p_note else resolution_note end
  where id = p_group_id;

  insert into public.status_logs (group_id, from_status, to_status, changed_by, note, proof_url)
  values (p_group_id, v_old, p_new_status, auth.uid(), p_note, p_proof_url);

  insert into public.notifications (user_id, group_id, message)
  select distinct r.user_id, p_group_id, 'Your reported issue is now ' || p_new_status || '.'
  from public.reports r where r.group_id = p_group_id;
exception
  when others then
    raise exception 'Failed to update status: %', sqlerrm;
end; $$;

-- Drop and recreate issue_groups_ranked view to include reporter_count and use it in priority
drop view if exists public.issue_groups_ranked;

create view public.issue_groups_ranked with (security_invoker = true) as
select g.id, g.ticket_no,
  ('CC-' || extract(year from g.created_at)::int || '-' || lpad(g.ticket_no::text, 5, '0')) as ticket_code,
  g.category, g.severity, g.address, g.ward, g.status, g.report_count, g.reporter_count,
  g.cover_image_url, g.resolution_proof_url, g.resolution_note,
  g.department_id, d.name as department_name,
  g.created_at, g.updated_at, g.resolved_at,
  st_y(g.location::geometry) as lat, st_x(g.location::geometry) as lng,
  greatest(0, floor(extract(epoch from (coalesce(g.resolved_at, now()) - g.created_at)) / 86400))::int as days_open,
  (g.reporter_count * 3
    + case g.severity when 'low' then 1 when 'medium' then 3 when 'high' then 6 else 15 end
    + greatest(0, floor(extract(epoch from (coalesce(g.resolved_at, now()) - g.created_at)) / 86400))::int) as priority_score
from public.issue_groups g
left join public.departments d on d.id = g.department_id;
