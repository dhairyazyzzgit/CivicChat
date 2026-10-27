-- Migration: resolution feedback + reopen. Run once in the Supabase SQL editor (safe to re-run).

-- ===== Resolution feedback: citizens confirm a fix or reopen with a reason =====
alter table public.issue_groups add column if not exists reopen_count int not null default 0;

create table if not exists public.resolution_feedback (
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

drop view if exists public.issue_groups_ranked;
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
