-- Повторяющиеся задачи: время/диапазон создаваемой задачи вместо «срок через N дней».
-- Модель: дата повтора = дедлайн задачи; fire_time = время задачи на эту дату
-- (дедлайн или начало диапазона). end_time (опц.) → задача-интервал start_at/end_at
-- (попадает в календарь), дедлайн = end_time. «Создавать заранее» (create_lead_minutes)
-- = за сколько до времени задачи её создать. deadline_offset_minutes больше не нужен.
-- Таблица на момент правки пустая → данные не мигрируем.

comment on column public.recurring_task_rules.fire_time is
  'Время задачи на каждую дату повтора (дедлайн или начало диапазона). Создание = это время минус create_lead_minutes.';

alter table public.recurring_task_rules
  add column if not exists end_time time;
alter table public.recurring_task_rules
  drop column if exists deadline_offset_minutes;

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
  v_occ_date date;
  v_deadline timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_next timestamptz;
  v_pid uuid;
  v_count int := 0;
begin
  for v_rule in
    select * from recurring_task_rules r
    where r.is_active and not r.is_deleted
      and r.next_occurrence_at is not null
      and now() >= r.next_occurrence_at - make_interval(mins => r.create_lead_minutes)
    order by r.next_occurrence_at
    for update skip locked
  loop
    if v_rule.until_date is not null
       and (v_rule.next_occurrence_at at time zone v_rule.timezone)::date > v_rule.until_date then
      update recurring_task_rules set is_active = false where id = v_rule.id;
      continue;
    end if;

    v_project_name := null;
    if v_rule.project_id is not null then
      select name into v_project_name from projects where id = v_rule.project_id;
    end if;

    v_occ_date := (v_rule.next_occurrence_at at time zone v_rule.timezone)::date;

    v_name := v_rule.title;
    v_name := replace(v_name, '{project_name}', coalesce(v_project_name, ''));
    v_name := replace(v_name, '{date}', to_char(v_occ_date, 'DD.MM.YYYY'));
    if length(trim(v_name)) = 0 then v_name := 'Задача'; end if;

    if v_rule.project_id is not null then
      select coalesce(max(sort_order), 0) + 10 into v_sort
        from project_threads where project_id = v_rule.project_id and not is_deleted;
    else
      v_sort := 0;
    end if;

    -- Время/диапазон задачи. next_occurrence_at = дата+fire_time = дедлайн (или старт диапазона).
    v_start := null;
    v_end := null;
    if v_rule.end_time is not null then
      v_start := v_rule.next_occurrence_at;
      v_end := (v_occ_date + v_rule.end_time) at time zone v_rule.timezone;
      if v_end <= v_start then v_end := v_end + interval '1 day'; end if; -- овернайт
      v_deadline := v_end; -- триггер sync_thread_deadline_end_at всё равно выровняет
    else
      v_deadline := v_rule.next_occurrence_at;
    end if;

    insert into project_threads (
      workspace_id, project_id, name, type, status_id,
      accent_color, icon, access_type, access_roles,
      created_by, owner_user_id, source_template_id, recurring_rule_id,
      deadline, start_at, end_at, description, sort_order
    ) values (
      v_rule.workspace_id, v_rule.project_id, v_name, 'task', v_rule.status_id,
      v_rule.accent_color, v_rule.icon, v_rule.access_type, coalesce(v_rule.access_roles, '{}'),
      v_rule.created_by, v_rule.owner_user_id, v_rule.source_template_id, v_rule.id,
      v_deadline, v_start, v_end, v_rule.description, v_sort
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

revoke all on function public.generate_recurring_tasks() from public;
grant execute on function public.generate_recurring_tasks() to service_role;
