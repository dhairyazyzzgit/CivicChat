create extension if not exists postgis with schema extensions;

-- ===== TABLES =====
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  categories text[] not null default '{}',
  contact_email text
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  role text not null default 'citizen' check (role in ('citizen','admin')),
  created_at timestamptz not null default now()
);

create table public.issue_groups (
  id uuid primary key default gen_random_uuid(),
  ticket_no bigint generated always as identity,
  category text not null check (category in ('pothole','garbage','open_drain','waterlogging','electrical_hazard','streetlight','fallen_tree','other')),
  severity text not null check (severity in ('low','medium','high','hazard')),
  address text,
  ward text,
  location geography(Point,4326) not null,
  department_id uuid references public.departments(id),
  status text not null default 'submitted' check (status in ('submitted','processing','resolved')),
  report_count int not null default 1,
  reporter_count int not null default 1,
  reopen_count int not null default 0,
  cover_image_url text,
  resolution_proof_url text,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index issue_groups_location_idx on public.issue_groups using gist (location);
create index issue_groups_status_idx on public.issue_groups (status);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.issue_groups(id) on delete cascade,
  image_url text not null,
  ai_category text, ai_severity text, ai_description text, ai_confidence numeric,
  confirmed_category text not null,
  user_corrected boolean not null default false,
  note text,
  address text,
  location geography(Point,4326) not null,
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_request_id)
);
create index reports_user_idx on public.reports (user_id);
create index reports_group_idx on public.reports (group_id);

create table public.status_logs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.issue_groups(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references auth.users(id),
  note text,
  proof_url text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid references public.issue_groups(id) on delete cascade,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read);

-- Admin notifications table for admin-specific events
create table public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.issue_groups(id) on delete cascade,
  message text not null,
  category text not null default 'general', -- 'new_report', 'status_change', 'general'
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index admin_notifications_read_idx on public.admin_notifications (read, created_at);

create table public.admin_notification_reads (
  notification_id uuid not null references public.admin_notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- ===== HELPERS =====
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.sev_rank(s text) returns int
language sql immutable as $$
  select case s when 'low' then 1 when 'medium' then 2 when 'high' then 3 else 4 end;
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ===== ROW LEVEL SECURITY =====
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.issue_groups enable row level security;
alter table public.reports enable row level security;
alter table public.status_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_notifications enable row level security;
alter table public.admin_notification_reads enable row level security;

create policy departments_read on public.departments for select to authenticated using (true);
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy groups_read on public.issue_groups for select to authenticated using (true);
create policy reports_read on public.reports for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy logs_read on public.status_logs for select to authenticated using (
  public.is_admin() or exists (select 1 from public.reports r where r.group_id = status_logs.group_id and r.user_id = auth.uid())
);
create policy notif_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy admin_notif_reads_select on public.admin_notification_reads for select to authenticated using (public.is_admin() and user_id = auth.uid());
create policy admin_notif_reads_insert on public.admin_notification_reads for insert to authenticated with check (public.is_admin() and user_id = auth.uid());
create policy admin_notif_reads_update on public.admin_notification_reads for update to authenticated using (public.is_admin() and user_id = auth.uid()) with check (public.is_admin() and user_id = auth.uid());
create policy admin_notif_read on public.admin_notifications for select to authenticated using (public.is_admin());
create policy admin_notif_update on public.admin_notifications for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- No insert/update policies on groups, reports, logs: those writes happen only inside the functions below.

-- ===== RANKED VIEW (priority is computed live, so age keeps counting) =====
create or replace view public.issue_groups_ranked with (security_invoker = true) as
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
    + greatest(0, floor(extract(epoch from (coalesce(g.resolved_at, now()) - g.created_at)) / 86400))::int
    + g.reopen_count * 5) as priority_score,
  g.reopen_count
from public.issue_groups g
left join public.departments d on d.id = g.department_id;

-- ===== FUNCTION: nearby open groups (duplicate stage 1) =====
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

-- ===== FUNCTION: admin status change (proof required to resolve) =====
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

-- ===== STORAGE =====
insert into storage.buckets (id, name, public) values
  ('report-images', 'report-images', true), ('proof-images', 'proof-images', true)
on conflict (id) do nothing;

create policy report_images_read on storage.objects for select using (bucket_id in ('report-images','proof-images'));
create policy report_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'report-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy proof_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'proof-images' and public.is_admin());

-- ===== SEED DEPARTMENTS =====
insert into public.departments (name, categories) values
  ('Roads & Infrastructure', '{pothole}'),
  ('Sanitation', '{garbage}'),
  ('Drainage & Sewerage', '{open_drain,waterlogging}'),
  ('Electricity', '{electrical_hazard,streetlight}'),
  ('Parks & Horticulture', '{fallen_tree}'),
  ('General Grievance Cell', '{other}')
on conflict (name) do nothing;

-- ===== RESOLUTION FEEDBACK =====
create table public.resolution_feedback (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.issue_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle int not null default 0,              -- issue_groups.reopen_count at the time of feedback
  satisfied boolean not null,
  rating int check (rating between 1 and 5),
  reason text check (reason is null or length(reason) <= 500),
  created_at timestamptz not null default now(),
  unique (group_id, user_id, cycle)
);
create index if not exists resolution_feedback_group_idx on public.resolution_feedback (group_id);
alter table public.resolution_feedback enable row level security;
drop policy if exists feedback_read on public.resolution_feedback;
create policy feedback_read on public.resolution_feedback for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- No insert/update policies: writes happen only inside submit_resolution_feedback().


create or replace function public.submit_resolution_feedback(
  p_group_id uuid, p_satisfied boolean, p_rating int default null, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_reopened boolean := false;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_satisfied is null then raise exception 'satisfied flag required'; end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then raise exception 'rating must be 1 to 5'; end if;

  select id, status, resolved_at, reopen_count, category, ticket_no into v_group
    from public.issue_groups where id = p_group_id for update;
  if not found then raise exception 'issue not found'; end if;

  if not exists (select 1 from public.reports r where r.group_id = p_group_id and r.user_id = v_uid) then
    raise exception 'only people who reported this issue can give feedback';
  end if;
  if v_group.status <> 'resolved' then
    raise exception 'This issue is no longer marked resolved (it may already have been reopened).';
  end if;
  if v_group.resolved_at is not null and v_group.resolved_at < now() - interval '7 days' then
    raise exception 'The 7-day feedback window for this fix has closed. Please file a new report if the problem remains.';
  end if;
  if exists (select 1 from public.resolution_feedback f
              where f.group_id = p_group_id and f.user_id = v_uid and f.cycle = v_group.reopen_count) then
    raise exception 'You have already given feedback for this fix.';
  end if;

  if not p_satisfied then
    if v_reason is null or length(v_reason) < 10 then
      raise exception 'Please tell us what is still wrong (at least 10 characters).';
    end if;
    if length(v_reason) > 500 then raise exception 'reason too long'; end if;
    if v_group.reopen_count >= 2 then
      raise exception 'This issue has already been reopened twice. Please file a new report with fresh photos.';
    end if;
  end if;

  insert into public.resolution_feedback (group_id, user_id, cycle, satisfied, rating, reason)
  values (p_group_id, v_uid, v_group.reopen_count, p_satisfied, p_rating, v_reason);

  if not p_satisfied then
    update public.issue_groups
       set status = 'submitted', resolved_at = null, resolution_proof_url = null, resolution_note = null,
           reopen_count = reopen_count + 1, updated_at = now()
     where id = p_group_id;
    v_reopened := true;

    insert into public.status_logs (group_id, from_status, to_status, changed_by, note)
    values (p_group_id, 'resolved', 'submitted', v_uid, 'Reopened by citizen: ' || v_reason);

    begin
      insert into public.admin_notifications (group_id, message, category)
      values (p_group_id, 'Ticket reopened by a citizen: ' || left(v_reason, 140), 'reopened');
    exception when others then null;
    end;

    begin
      insert into public.notifications (user_id, group_id, message)
      select distinct r.user_id, p_group_id, 'An issue you reported was reopened because the fix was not satisfactory.'
        from public.reports r where r.group_id = p_group_id and r.user_id <> v_uid;
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('ok', true, 'satisfied', p_satisfied, 'reopened', v_reopened,
    'reopen_count', v_group.reopen_count + (case when v_reopened then 1 else 0 end));
end; $$;
