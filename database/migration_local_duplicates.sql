-- Migration: local (non-AI) duplicate detection + own-duplicate safety.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- ===== Admin notification tables (create if missing) =====
create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.issue_groups(id) on delete cascade,
  message text not null,
  category text not null default 'general', -- 'new_report', 'status_change', 'general'
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists admin_notifications_read_idx on public.admin_notifications (read, created_at);

create table if not exists public.admin_notification_reads (
  notification_id uuid not null references public.admin_notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table public.admin_notifications enable row level security;
alter table public.admin_notification_reads enable row level security;

drop policy if exists admin_notif_read on public.admin_notifications;
create policy admin_notif_read on public.admin_notifications for select to authenticated using (public.is_admin());
drop policy if exists admin_notif_update on public.admin_notifications;
create policy admin_notif_update on public.admin_notifications for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_notif_reads_select on public.admin_notification_reads;
create policy admin_notif_reads_select on public.admin_notification_reads for select to authenticated
  using (public.is_admin() and user_id = auth.uid());
drop policy if exists admin_notif_reads_insert on public.admin_notification_reads;
create policy admin_notif_reads_insert on public.admin_notification_reads for insert to authenticated
  with check (public.is_admin() and user_id = auth.uid());
drop policy if exists admin_notif_reads_update on public.admin_notification_reads;
create policy admin_notif_reads_update on public.admin_notification_reads for update to authenticated
  using (public.is_admin() and user_id = auth.uid()) with check (public.is_admin() and user_id = auth.uid());


drop function if exists public.find_nearby_groups(double precision, double precision, text, double precision);

create or replace function public.find_nearby_groups(
  p_lat double precision, p_lng double precision, p_category text, p_radius_m double precision default 50)
returns table (id uuid, cover_image_url text, report_count int, reporter_count int, status text,
               distance_m double precision, reported_by_me boolean)
language sql security definer stable set search_path = public, extensions as $$
  select g.id, g.cover_image_url, g.report_count, g.reporter_count, g.status,
         st_distance(g.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) as distance_m,
         exists (select 1 from public.reports r where r.group_id = g.id and r.user_id = auth.uid()) as reported_by_me
  from public.issue_groups g
  where auth.uid() is not null and g.status <> 'resolved' and g.category = p_category
    and st_dwithin(g.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  order by distance_m limit 3;
$$;

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
  v_merge_id uuid := p_merge_group_id;
  v_dept uuid;
  v_count int;
  v_reporter_count int;
  v_report_id uuid;
  v_merged boolean := false;
  v_already_reported boolean := false;
  v_point geography;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_image_url is null or length(p_image_url) = 0 then raise exception 'image required'; end if;
  if p_note is not null and length(p_note) > 500 then raise exception 'note too long'; end if;
  if p_lat is null or p_lng is null or not (abs(p_lat) <= 90 and abs(p_lng) <= 180) then
    raise exception 'invalid coordinates';
  end if;
  v_point := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  -- idempotency: a double tap returns the same result
  select r.id, r.group_id into v_existing from public.reports r
   where r.user_id = v_uid and r.client_request_id = p_client_request_id;
  if found then
    select report_count, reporter_count into v_count, v_reporter_count
    from public.issue_groups where id = v_existing.group_id;
    if v_count is null then v_count := 1; v_reporter_count := 1; end if;
    return jsonb_build_object('report_id', v_existing.id, 'group_id', v_existing.group_id,
      'merged', v_reporter_count > 1, 'report_count', v_count, 'reporter_count', v_reporter_count,
      'duplicate_submission', true, 'already_reported_by_me', false);
  end if;

  -- server-side local match (same category, within 50 m) if the client did not pass one
  if v_merge_id is null then
    select g.id into v_merge_id from public.issue_groups g
     where g.status <> 'resolved' and g.category = p_category and st_dwithin(g.location, v_point, 50)
     order by st_distance(g.location, v_point) limit 1;
  end if;

  if v_merge_id is not null then
    select g.id into v_group_id from public.issue_groups g
     where g.id = v_merge_id and g.status <> 'resolved' and g.category = p_category
       and st_dwithin(g.location, v_point, 75)
     for update;
    if v_group_id is not null then
      v_already_reported := exists (select 1 from public.reports r where r.user_id = v_uid and r.group_id = v_group_id);
    end if;
  end if;

  if v_group_id is not null then
    -- priority (reporter_count) only rises for a NEW reporter, never for the same user again
    update public.issue_groups
       set report_count = report_count + 1,
           reporter_count = reporter_count + (case when v_already_reported then 0 else 1 end),
           updated_at = now(),
           severity = case when not v_already_reported and public.sev_rank(p_severity) > public.sev_rank(severity)
                           then p_severity else severity end
     where id = v_group_id returning report_count, reporter_count into v_count, v_reporter_count;
    v_merged := not v_already_reported;
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

  -- Admin notification must never block a citizen's report
  if not v_already_reported then
    begin
      insert into public.admin_notifications (group_id, message, category)
      values (v_group_id,
        case when v_merged then 'Another citizen reported an existing ' || p_category || ' issue (' || v_reporter_count || ' reporters)'
             else 'New ' || p_category || ' report submitted' end,
        'new_report');
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object('report_id', v_report_id, 'group_id', v_group_id,
    'merged', v_merged, 'report_count', v_count, 'reporter_count', v_reporter_count,
    'duplicate_submission', false, 'already_reported_by_me', v_already_reported);
end; $$;
