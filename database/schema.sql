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

create policy departments_read on public.departments for select to authenticated using (true);
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy groups_read on public.issue_groups for select to authenticated using (true);
create policy reports_read on public.reports for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy logs_read on public.status_logs for select to authenticated using (
  public.is_admin() or exists (select 1 from public.reports r where r.group_id = status_logs.group_id and r.user_id = auth.uid())
);
create policy notif_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- No insert/update policies on groups, reports, logs: those writes happen only inside the functions below.

-- ===== RANKED VIEW (priority is computed live, so age keeps counting) =====
create or replace view public.issue_groups_ranked with (security_invoker = true) as
select g.id, g.ticket_no,
  ('CC-' || extract(year from g.created_at)::int || '-' || lpad(g.ticket_no::text, 5, '0')) as ticket_code,
  g.category, g.severity, g.address, g.ward, g.status, g.report_count,
  g.cover_image_url, g.resolution_proof_url, g.resolution_note,
  g.department_id, d.name as department_name,
  g.created_at, g.updated_at, g.resolved_at,
  st_y(g.location::geometry) as lat, st_x(g.location::geometry) as lng,
  greatest(0, floor(extract(epoch from (coalesce(g.resolved_at, now()) - g.created_at)) / 86400))::int as days_open,
  (g.report_count * 3
    + case g.severity when 'low' then 1 when 'medium' then 3 when 'high' then 6 else 15 end
    + greatest(0, floor(extract(epoch from (coalesce(g.resolved_at, now()) - g.created_at)) / 86400))::int) as priority_score
from public.issue_groups g
left join public.departments d on d.id = g.department_id;

-- ===== FUNCTION: nearby open groups (duplicate stage 1) =====
create or replace function public.find_nearby_groups(
  p_lat double precision, p_lng double precision, p_category text, p_radius_m double precision default 50)
returns table (id uuid, cover_image_url text, report_count int, status text, distance_m double precision)
language sql security definer stable set search_path = public, extensions as $$
  select g.id, g.cover_image_url, g.report_count, g.status,
         st_distance(g.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) as distance_m
  from public.issue_groups g
  where auth.uid() is not null and g.status <> 'resolved' and g.category = p_category
    and st_dwithin(g.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  order by distance_m limit 3;
$$;

-- ===== FUNCTION: submit a report (creates a group or merges into one) =====
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
  v_report_id uuid;
  v_merged boolean := false;
  v_point geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_image_url is null or length(p_image_url) = 0 then raise exception 'image required'; end if;
  if p_note is not null and length(p_note) > 500 then raise exception 'note too long'; end if;

  -- idempotency: a double tap returns the same result
  select r.id, r.group_id into v_existing from public.reports r
   where r.user_id = v_uid and r.client_request_id = p_client_request_id;
  if found then
    select report_count into v_count from public.issue_groups where id = v_existing.group_id;
    return jsonb_build_object('report_id', v_existing.id, 'group_id', v_existing.group_id,
      'merged', v_count > 1, 'report_count', v_count, 'duplicate_submission', true);
  end if;

  if p_merge_group_id is not null then
    select id into v_group_id from public.issue_groups
     where id = p_merge_group_id and status <> 'resolved' and category = p_category
       and st_dwithin(location, v_point, 75)
     for update;
  end if;

  if v_group_id is not null then
    update public.issue_groups
       set report_count = report_count + 1, updated_at = now(),
           severity = case when public.sev_rank(p_severity) > public.sev_rank(severity) then p_severity else severity end
     where id = v_group_id returning report_count into v_count;
    v_merged := true;
  else
    select id into v_dept from public.departments where p_category = any(categories) limit 1;
    if v_dept is null then select id into v_dept from public.departments where name = 'General Grievance Cell'; end if;
    insert into public.issue_groups (category, severity, address, ward, location, department_id, cover_image_url)
    values (p_category, p_severity, p_address, p_ward, v_point, v_dept, p_image_url)
    returning id into v_group_id;
    v_count := 1;
    insert into public.status_logs (group_id, from_status, to_status, changed_by, note)
    values (v_group_id, null, 'submitted', v_uid, 'Issue created');
  end if;

  insert into public.reports (user_id, group_id, image_url, ai_category, ai_severity, ai_description, ai_confidence,
    confirmed_category, user_corrected, note, address, location, client_request_id)
  values (v_uid, v_group_id, p_image_url, p_ai_category, p_ai_severity, p_ai_description, p_ai_confidence,
    p_category, coalesce(p_user_corrected, false), p_note, p_address, v_point, p_client_request_id)
  returning id into v_report_id;

  return jsonb_build_object('report_id', v_report_id, 'group_id', v_group_id,
    'merged', v_merged, 'report_count', v_count, 'duplicate_submission', false);
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
  if p_new_status not in ('submitted','processing','resolved') then raise exception 'invalid status'; end if;
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