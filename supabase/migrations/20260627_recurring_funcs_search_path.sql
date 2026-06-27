-- Harden recurring-task functions: pin search_path (advisor function_search_path_mutable).
-- Bodies identical to 20260627_recurring_tasks.sql, only adding `set search_path to 'public'`.
-- Applied to prod via MCP 2026-06-27.

create or replace function public.recurring_task_rules_touch_updated_at()
returns trigger language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  return new;
end $$;

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
set search_path to 'public'
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
      null;
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
        v_target := least(coalesce(p_bymonthday, 1), v_last);
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

create or replace function public.recurring_task_rules_set_next()
returns trigger language plpgsql
set search_path to 'public'
as $$
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
