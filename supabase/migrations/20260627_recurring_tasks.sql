-- Recurring tasks (Phase 1 MVP)
-- Plan: docs/feature-backlog/2026-06-27-recurring-tasks.md
-- Model: "recurrence rule" as a separate entity. Schedule stored as a structured
-- RRULE subset (daily / weekly-by-weekday / monthly-by-day). Next date computed in
-- plpgsql; pg_cron calls generate_recurring_tasks() directly every 10 minutes
-- (same pattern as dispatch_scheduled_messages / inbox-reconcile). Full RRULE + edge
-- function deferred to Phase 2.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.recurring_task_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  created_by uuid,
  owner_user_id uuid, -- NULL = shared rule, NOT NULL = personal

  -- content snapshot of the generated task (not a live link to a template)
  title text not null,                       -- supports {date} and {project_name}
  description text,
  accent_color text not null default 'blue',
  icon text not null default 'message-square',
  status_id uuid,
  access_type text not null default 'all',
  access_roles text[] default '{}',
  assignee_participant_ids uuid[] not null default '{}',
  member_participant_ids uuid[] not null default '{}',
  initial_message_html text,                 -- reserved, not generated in MVP
  source_template_id uuid,                   -- provenance only

  -- schedule (structured RRULE subset)
  freq text not null default 'weekly' check (freq in ('daily','weekly','monthly')),
  byweekday int[] not null default '{}',     -- ISO dow 1..7 (Mon..Sun), for weekly
  bymonthday int,                            -- 1..31 or -1 (last day of month), for monthly
  fire_time time not null default '09:00',   -- time of day (UI keeps it at :00/:10/.. step)
  timezone text not null default 'Europe/Madrid',

  -- timing of the generated task
  create_lead_days int not null default 0 check (create_lead_days >= 0),
  deadline_offset_days int check (deadline_offset_days >= 0), -- NULL = no deadline

  -- bounds / state
  starts_on date,
  until_date date,
  is_active boolean not null default true,
  occurrences_count int not null default 0,
  next_occurrence_at timestamptz,            -- next target task date (UTC); cron checks this
  last_run_at timestamptz,
  last_generated_thread_id uuid,

  -- soft delete (mirrors project_threads)
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recurring_due
  on public.recurring_task_rules (next_occurrence_at)
  where is_active and not is_deleted;

create index if not exists idx_recurring_workspace
  on public.recurring_task_rules (workspace_id)
  where not is_deleted;

-- provenance column on generated tasks
alter table public.project_threads
  add column if not exists recurring_rule_id uuid
    references public.recurring_task_rules(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS (mirrors item_lists: shared vs personal)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.recurring_task_rules enable row level security;

drop policy if exists recurring_task_rules_select on public.recurring_task_rules;
create policy recurring_task_rules_select on public.recurring_task_rules
  for select to public
  using (
    (exists (select 1 from public.participants p
       where p.workspace_id = recurring_task_rules.workspace_id
         and p.user_id = (select auth.uid()) and p.is_deleted = false))
    and (owner_user_id is null or owner_user_id = (select auth.uid()))
  );

drop policy if exists recurring_task_rules_insert on public.recurring_task_rules;
create policy recurring_task_rules_insert on public.recurring_task_rules
  for insert to public
  with check (
    (exists (select 1 from public.participants p
       where p.workspace_id = recurring_task_rules.workspace_id
         and p.user_id = (select auth.uid()) and p.is_deleted = false))
    and created_by = (select auth.uid())
    and (owner_user_id = (select auth.uid())
         or (owner_user_id is null and (public.is_workspace_owner((select auth.uid()), workspace_id)
              or public.has_workspace_permission((select auth.uid()), workspace_id, 'manage_workspace_settings'))))
  );

drop policy if exists recurring_task_rules_update on public.recurring_task_rules;
create policy recurring_task_rules_update on public.recurring_task_rules
  for update to public
  using (
    owner_user_id = (select auth.uid())
    or (owner_user_id is null and (public.is_workspace_owner((select auth.uid()), workspace_id)
         or public.has_workspace_permission((select auth.uid()), workspace_id, 'manage_workspace_settings')))
  )
  with check (
    owner_user_id = (select auth.uid())
    or (owner_user_id is null and (public.is_workspace_owner((select auth.uid()), workspace_id)
         or public.has_workspace_permission((select auth.uid()), workspace_id, 'manage_workspace_settings')))
  );

drop policy if exists recurring_task_rules_delete on public.recurring_task_rules;
create policy recurring_task_rules_delete on public.recurring_task_rules
  for delete to public
  using (
    owner_user_id = (select auth.uid())
    or (owner_user_id is null and (public.is_workspace_owner((select auth.uid()), workspace_id)
         or public.has_workspace_permission((select auth.uid()), workspace_id, 'manage_workspace_settings')))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. updated_at touch trigger
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.recurring_task_rules_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_recurring_touch_updated on public.recurring_task_rules;
create trigger trg_recurring_touch_updated
  before update on public.recurring_task_rules
  for each row execute function public.recurring_task_rules_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Next-occurrence computation (RRULE subset, day-by-day scan up to ~13 months)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.recurring_next_occurrence(
  p_after timestamptz,
  p_freq text,
  p_byweekday int[],
  p_bymonthday int,
  p_fire_time time,
  p_timezone text,
  p_starts_on date
) returns timestamptz
language plpgsql
stable
as $$
declare
  v_base date;
  v_cand date;
  v_last int;
  v_target int;
  v_ts timestamptz;
  i int;
begin
  v_base := (p_after at time zone p_timezone)::date;
  for i in 0..400 loop
    v_cand := v_base + i;
    if p_starts_on is not null and v_cand < p_starts_on then
      continue;
    end if;

    if p_freq = 'daily' then
      null; -- every day matches
    elsif p_freq = 'weekly' then
      if p_byweekday is null or array_length(p_byweekday, 1) is null
         or not (extract(isodow from v_cand)::int = any(p_byweekday)) then
        continue;
      end if;
    elsif p_freq = 'monthly' then
      v_last := extract(day from (date_trunc('month', v_cand::timestamp) + interval '1 month - 1 day'))::int;
      if p_bymonthday = -1 then
        v_target := v_last;
      else
        v_target := least(coalesce(p_bymonthday, 1), v_last); -- clamp e.g. 31 -> last day
      end if;
      if extract(day from v_cand)::int <> v_target then
        continue;
      end if;
    else
      return null;
    end if;

    v_ts := (v_cand + p_fire_time) at time zone p_timezone;
    if v_ts > p_after then
      return v_ts;
    end if;
  end loop;
  return null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Auto-compute next_occurrence_at on insert / schedule change / (re)activation.
--    Does NOT clobber the explicit next_occurrence_at that the generator writes.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.recurring_task_rules_set_next()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.is_active and new.next_occurrence_at is null then
      new.next_occurrence_at := public.recurring_next_occurrence(
        now(), new.freq, new.byweekday, new.bymonthday, new.fire_time, new.timezone, new.starts_on);
    end if;
    return new;
  end if;

  if (new.freq is distinct from old.freq
      or new.byweekday is distinct from old.byweekday
      or new.bymonthday is distinct from old.bymonthday
      or new.fire_time is distinct from old.fire_time
      or new.timezone is distinct from old.timezone
      or new.starts_on is distinct from old.starts_on
      or (new.is_active and not old.is_active))
  then
    new.next_occurrence_at := public.recurring_next_occurrence(
      now(), new.freq, new.byweekday, new.bymonthday, new.fire_time, new.timezone, new.starts_on);
  end if;
  return new;
end $$;

drop trigger if exists trg_recurring_set_next on public.recurring_task_rules;
create trigger trg_recurring_set_next
  before insert or update on public.recurring_task_rules
  for each row execute function public.recurring_task_rules_set_next();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Generator — called by pg_cron every 10 min. Creates one task per due rule,
--    fast-forwards over missed occurrences (create one, jump to future).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.generate_recurring_tasks()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rule record;
  v_thread_id uuid;
  v_name text;
  v_project_name text;
  v_sort int;
  v_deadline timestamptz;
  v_next timestamptz;
  v_pid uuid;
  v_count int := 0;
begin
  for v_rule in
    select * from recurring_task_rules r
    where r.is_active and not r.is_deleted
      and r.next_occurrence_at is not null
      and now() >= r.next_occurrence_at - make_interval(days => r.create_lead_days)
    order by r.next_occurrence_at
    for update skip locked
  loop
    -- past the recurrence limit → deactivate without creating
    if v_rule.until_date is not null
       and (v_rule.next_occurrence_at at time zone v_rule.timezone)::date > v_rule.until_date then
      update recurring_task_rules set is_active = false where id = v_rule.id;
      continue;
    end if;

    v_project_name := null;
    if v_rule.project_id is not null then
      select name into v_project_name from projects where id = v_rule.project_id;
    end if;

    v_name := v_rule.title;
    v_name := replace(v_name, '{project_name}', coalesce(v_project_name, ''));
    v_name := replace(v_name, '{date}',
      to_char((v_rule.next_occurrence_at at time zone v_rule.timezone)::date, 'DD.MM.YYYY'));
    if length(trim(v_name)) = 0 then v_name := 'Задача'; end if;

    if v_rule.project_id is not null then
      select coalesce(max(sort_order), 0) + 10 into v_sort
        from project_threads where project_id = v_rule.project_id and not is_deleted;
    else
      v_sort := 0;
    end if;

    v_deadline := null;
    if v_rule.deadline_offset_days is not null then
      v_deadline := v_rule.next_occurrence_at + make_interval(days => v_rule.deadline_offset_days);
    end if;

    insert into project_threads (
      workspace_id, project_id, name, type, status_id,
      accent_color, icon, access_type, access_roles,
      created_by, owner_user_id, source_template_id, recurring_rule_id,
      deadline, description, sort_order
    ) values (
      v_rule.workspace_id, v_rule.project_id, v_name, 'task', v_rule.status_id,
      v_rule.accent_color, v_rule.icon, v_rule.access_type, coalesce(v_rule.access_roles, '{}'),
      v_rule.created_by, v_rule.owner_user_id, v_rule.source_template_id, v_rule.id,
      v_deadline, v_rule.description, v_sort
    ) returning id into v_thread_id;

    if array_length(v_rule.assignee_participant_ids, 1) is not null then
      foreach v_pid in array v_rule.assignee_participant_ids loop
        insert into task_assignees (thread_id, participant_id)
        values (v_thread_id, v_pid) on conflict do nothing;
      end loop;
    end if;

    if v_rule.access_type = 'custom'
       and array_length(v_rule.member_participant_ids, 1) is not null then
      foreach v_pid in array v_rule.member_participant_ids loop
        insert into project_thread_members (thread_id, participant_id)
        values (v_thread_id, v_pid) on conflict do nothing;
      end loop;
    end if;

    -- advance: create only the current due occurrence, skip any missed ones
    v_next := public.recurring_next_occurrence(
      v_rule.next_occurrence_at, v_rule.freq, v_rule.byweekday, v_rule.bymonthday,
      v_rule.fire_time, v_rule.timezone, v_rule.starts_on);
    while v_next is not null and v_next <= now() loop
      v_next := public.recurring_next_occurrence(
        v_next, v_rule.freq, v_rule.byweekday, v_rule.bymonthday,
        v_rule.fire_time, v_rule.timezone, v_rule.starts_on);
    end loop;

    if v_next is null
       or (v_rule.until_date is not null and (v_next at time zone v_rule.timezone)::date > v_rule.until_date) then
      update recurring_task_rules
        set is_active = false, next_occurrence_at = null,
            occurrences_count = occurrences_count + 1,
            last_run_at = now(), last_generated_thread_id = v_thread_id
        where id = v_rule.id;
    else
      update recurring_task_rules
        set next_occurrence_at = v_next,
            occurrences_count = occurrences_count + 1,
            last_run_at = now(), last_generated_thread_id = v_thread_id
        where id = v_rule.id;
    end if;

    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Grants (generator is service_role only; next-occurrence used by triggers)
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public.generate_recurring_tasks() from public;
grant execute on function public.generate_recurring_tasks() to service_role;

revoke all on function public.recurring_next_occurrence(timestamptz, text, int[], int, time, text, date) from public;
grant execute on function public.recurring_next_occurrence(timestamptz, text, int[], int, time, text, date)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Cron — every 10 minutes
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'generate-recurring-tasks';
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  perform cron.schedule('generate-recurring-tasks', '*/10 * * * *',
    $cron$ select public.generate_recurring_tasks(); $cron$);
end $$;
